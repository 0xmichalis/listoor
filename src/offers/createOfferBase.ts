import { formatEther } from 'ethers';
import { OpenSeaSDK, OrderV2, CollectionOffer } from 'opensea-js';

import { logger } from '../utils/logger.js';
import { withRateLimitRetry } from '../utils/ratelimit.js';
import { ETH_PAYMENT_TOKEN, getCurrencyFromAddress } from './paymentTokens.js';

const MIN_EXPIRATION_TIME_SECONDS = 11 * 60; // 11 minutes

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
        const createParams: Parameters<typeof seaport.createCollectionOffer>[0] = {
            collectionSlug: params.collectionSlug,
            accountAddress: owner,
            amount: formatEther(price),
            quantity: params.quantity || 1,
            expirationTime: adjustedExpirationTime,
            paymentTokenAddress,
        };

        if (params.type === 'trait') {
            createParams.traitType = params.traitType;
            createParams.traitValue = params.traitValue;
        }

        tx = await withRateLimitRetry(() => seaport.createCollectionOffer(createParams));
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
        `Successfully created ${logDescription} at ${formatEther(price)} ${currency}${quantityText}`
    );
    return tx;
};
