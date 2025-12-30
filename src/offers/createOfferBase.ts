import { formatEther, parseEther } from 'ethers';
import { OpenSeaSDK, OrderV2, CollectionOffer } from 'opensea-js';

import { logger } from '../utils/logger.js';
import { withRateLimitRetry } from '../utils/ratelimit.js';
import { ETH_PAYMENT_TOKEN, getCurrencyFromAddress } from './paymentTokens.js';

const MIN_EXPIRATION_TIME_SECONDS = 11 * 60; // 11 minutes
const OPENSEA_PRICE_INCREMENT_3_DECIMALS = parseEther('0.001'); // Fallback: 3 decimal places (0.001 ETH increments)

/**
 * Rounds a price up to the nearest 0.001 ETH increment.
 *
 * Used as fallback when OpenSea requires 3 decimals instead of 4. We round UP
 * (not down) to avoid losing the slight price differentiation we apply when
 * outbidding competing offers (e.g. +0.0001 ETH). Rounding down to 0.001 can
 * collapse that differentiation and result in the same price as the competitor.
 * @param price Price in wei
 * @returns Rounded up price in wei
 */
function roundUpToThreeDecimals(price: bigint): bigint {
    if (price <= 0n) return price;
    const remainder = price % OPENSEA_PRICE_INCREMENT_3_DECIMALS;
    if (remainder === 0n) return price;
    return price + (OPENSEA_PRICE_INCREMENT_3_DECIMALS - remainder);
}

/**
 * Checks if an error is about OpenSea requiring 3 decimals instead of 4
 * @param error The error to check
 * @returns True if the error is about 3 decimals requirement
 */
function isThreeDecimalsError(error: any): boolean {
    const errorMessage = error?.message || String(error);
    return errorMessage.includes('3 decimals allowed') || errorMessage.includes('3 decimal');
}

/**
 * Retries an offer creation with 3 decimal precision if OpenSea requires it
 * Tries with the original price first, then retries with 3 decimals if needed
 * @param price The original price in wei (4 decimals)
 * @param logDescription Description for logging purposes
 * @param createOffer Function that creates the offer with the given price
 * @returns Object containing the result and the actual price used
 */
async function withThreeDecimalsRetry<T>(
    price: bigint,
    logDescription: string,
    createOffer: (price: bigint) => Promise<T>
): Promise<{ result: T; actualPrice: bigint }> {
    try {
        const result = await createOffer(price);
        return { result, actualPrice: price };
    } catch (error: any) {
        if (isThreeDecimalsError(error)) {
            // Retry with 3 decimals rounding
            logger.debug(
                `OpenSea requires 3 decimals for ${logDescription}, retrying with 3 decimal precision...`
            );
            const price3Decimals = roundUpToThreeDecimals(price);
            const result = await createOffer(price3Decimals);
            return { result, actualPrice: price3Decimals };
        }
        // Re-throw if it's a different error
        throw error;
    }
}

export type OfferCreateParams =
    | {
          type: 'single';
          tokenAddress: string;
          tokenId: string;
      }
    | {
          type: 'collection';
          collectionSlug: string;
          quantity?: number;
      }
    | {
          type: 'trait';
          collectionSlug: string;
          traitType: string;
          traitValue: string;
          quantity?: number;
      };

/**
 * Base function to create any type of offer on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param params Offer parameters (single token, collection, or trait)
 * @param price The price in wei
 * @param expirationTime The expiration timestamp
 * @param owner The wallet owner address
 * @param paymentTokenAddress The payment token address (ETH or WETH)
 * @param dryRun If true, skip actual offer creation
 * @returns The created OrderV2 or CollectionOffer, or undefined in dry-run mode
 */
export const createOfferBase = async (
    seaport: OpenSeaSDK,
    params: OfferCreateParams,
    price: bigint,
    expirationTime: number,
    owner: string,
    paymentTokenAddress: string = ETH_PAYMENT_TOKEN,
    dryRun: boolean = false
): Promise<OrderV2 | CollectionOffer | undefined> => {
    // Enforce minimum expiration time of 11 minutes from now
    const currentTime = Math.floor(Date.now() / 1000);
    const minExpirationTime = currentTime + MIN_EXPIRATION_TIME_SECONDS;
    const adjustedExpirationTime = Math.max(expirationTime, minExpirationTime);
    const currency = getCurrencyFromAddress(paymentTokenAddress);

    // Build log message based on offer type
    let logDescription: string;
    if (params.type === 'single') {
        logDescription = `offer for ${params.tokenAddress}:${params.tokenId}`;
    } else if (params.type === 'collection') {
        logDescription = `collection offer for ${params.collectionSlug}`;
    } else {
        logDescription = `trait offer for ${params.collectionSlug} (${params.traitType}: ${params.traitValue})`;
    }

    if (dryRun) {
        const quantityText =
            params.type !== 'single' ? ` (quantity: ${params.quantity || 1},` : ' (';
        logger.info(
            `[DRY-RUN] Would create ${logDescription} at ${formatEther(price)} ${currency}${quantityText} expires: ${new Date(adjustedExpirationTime * 1000).toISOString()})`
        );
        return undefined;
    }

    let tx: OrderV2 | CollectionOffer | null;
    let actualPrice = price; // Track the actual price used (may be rounded to 3 decimals)

    if (params.type === 'single') {
        // Single token offer
        tx = await withRateLimitRetry(() =>
            seaport.createOffer({
                asset: {
                    tokenId: params.tokenId,
                    tokenAddress: params.tokenAddress,
                },
                accountAddress: owner,
                amount: formatEther(price),
                expirationTime: adjustedExpirationTime,
                paymentTokenAddress,
            })
        );
    } else {
        // Collection or trait offer (both use createCollectionOffer)
        // Try with 4 decimals first, retry with 3 decimals if OpenSea requires it
        const { result, actualPrice: usedPrice } = await withThreeDecimalsRetry(
            price,
            logDescription,
            async (offerPrice: bigint) => {
                const createParams: Parameters<typeof seaport.createCollectionOffer>[0] = {
                    collectionSlug: params.collectionSlug,
                    accountAddress: owner,
                    amount: formatEther(offerPrice),
                    quantity: params.quantity || 1,
                    expirationTime: adjustedExpirationTime,
                    paymentTokenAddress,
                };

                if (params.type === 'trait') {
                    createParams.traitType = params.traitType;
                    createParams.traitValue = params.traitValue;
                }

                return await withRateLimitRetry(() => seaport.createCollectionOffer(createParams));
            }
        );
        tx = result;
        actualPrice = usedPrice;
    }

    if (!tx) {
        const offerTypeName =
            params.type === 'single'
                ? 'offer'
                : params.type === 'collection'
                  ? 'collection offer'
                  : 'trait offer';
        throw new Error(`Failed to create ${offerTypeName}`);
    }

    const quantityText = params.type !== 'single' ? ` (quantity: ${params.quantity || 1})` : '';
    logger.info(
        `Successfully created ${logDescription} at ${formatEther(actualPrice)} ${currency}${quantityText}`
    );
    return tx;
};
