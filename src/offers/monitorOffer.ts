import { formatEther, getAddress, parseEther } from 'ethers';
import { OpenSeaSDK } from 'opensea-js';

import { OfferCollection, inferOfferType } from '../collections/types.js';
import { logger } from '../utils/logger.js';
import {
    getBestOffer,
    getSingleBestOffer,
    getBestCollectionOffer,
    getBestTraitOffer,
    createOffer,
    createCollectionOffer,
    createTraitOffer,
    sumOfferEndAmounts,
    getOfferQuantity,
    deriveExpirationTime,
} from './index.js';
import { isETHOrWETH, getPaymentTokenAddress } from './paymentTokens.js';

const DEFAULT_EXPIRATION_TIME = 5 * 30 * 24 * 60 * 60; // 5 months
const OPENSEA_PRICE_INCREMENT_4_DECIMALS = parseEther('0.0001'); // Default: 4 decimal places (0.0001 ETH increments)

/**
 * Rounds a price down to the nearest 0.0001 ETH increment (OpenSea default requirement)
 * OpenSea typically allows 4 decimal places for collection/trait offers
 * If a collection requires 3 decimals, createOfferBase will automatically retry with 3 decimal precision
 * @param price Price in wei
 * @returns Rounded down price in wei
 */
function roundToFourDecimals(price: bigint): bigint {
    // Round down to increment: (price / increment) * increment
    return (price / OPENSEA_PRICE_INCREMENT_4_DECIMALS) * OPENSEA_PRICE_INCREMENT_4_DECIMALS;
}

/**
 * Monitors a specific NFT collection and creates/updates offers as needed
 * @param c The offer collection configuration
 * @param seaport The OpenSea SDK instance
 * @param chainId The chain ID for the collection
 * @param owner The wallet owner
 * @param dryRun If true, skip actual offer creation
 */
export const monitorOffer = async (
    c: OfferCollection,
    seaport: OpenSeaSDK,
    chainId: number,
    owner: string,
    dryRun: boolean = false
) => {
    // Infer offer type from configuration
    const offerType = inferOfferType(c);
    const logPrefix =
        offerType === 'collection'
            ? `collection offer for ${c.collectionSlug}`
            : offerType === 'trait' && c.trait
              ? `trait offer for ${c.collectionSlug} (${c.trait.traitType}: ${c.trait.value})`
              : `single token offer for ${c.collectionSlug} (tokenId=${c.tokenId})`;

    logger.debug(`Checking ${logPrefix} ...`);

    // Get the best offer based on offer type
    let bestOffer;
    if (offerType === 'collection') {
        bestOffer = await getBestCollectionOffer(seaport, c.collectionSlug);
    } else if (offerType === 'trait' && c.trait) {
        bestOffer = await getBestTraitOffer(
            seaport,
            c.collectionSlug,
            c.trait.traitType,
            c.trait.value
        );
    } else {
        // Single token offer
        if (!c.tokenId) {
            throw new Error(`tokenId is required for single token offers`);
        }
        bestOffer = c.shouldCompareToRest
            ? await getBestOffer(seaport, c.collectionSlug)
            : await getSingleBestOffer(seaport, c.collectionSlug, c.tokenAddress, c.tokenId);
    }

    let price: bigint;
    let expirationTime: number;
    let paymentCurrency: string = 'WETH'; // Default to WETH (ETH not supported for offers on some chains)

    if (!bestOffer || !bestOffer.protocol_data || !bestOffer.protocol_data.parameters) {
        logger.debug(`Did not find an offer for ${logPrefix} ...`);
        // If no best offer, create a new offer with the starting price
        price = c.defaultPrice;
        expirationTime = deriveExpirationTime(undefined, DEFAULT_EXPIRATION_TIME);
    } else {
        // Use the previous offer's expiration time
        const previousExpirationTime = Number(bestOffer.protocol_data.parameters.endTime);
        expirationTime = deriveExpirationTime(previousExpirationTime, DEFAULT_EXPIRATION_TIME);
        // Check if currency is ETH or WETH
        if (!isETHOrWETH(bestOffer.price.currency)) {
            logger.error(
                `Best offer for ${logPrefix} is not in ETH or WETH (currency: ${bestOffer.price.currency}). Skipping...`
            );
            return;
        }

        // Always use WETH for offers (ETH not supported on some chains)
        // If best offer is in ETH, we'll still use WETH but match the price
        paymentCurrency = 'WETH';

        // Calculate price per item
        // For collection and trait offers, we need to divide total price by quantity
        // For single token offers, we need to divide by sumOfferEndAmounts to account for fees
        let bestOfferQuantity: number = 1;
        if (offerType === 'collection' || offerType === 'trait') {
            bestOfferQuantity = getOfferQuantity(bestOffer);
            const totalPrice = BigInt(bestOffer.price.value);
            price = totalPrice / BigInt(bestOfferQuantity);
        } else {
            price = BigInt(bestOffer.price.value) / sumOfferEndAmounts(bestOffer);
        }

        const offerer = getAddress(bestOffer.protocol_data.parameters.offerer);
        if (offerer.toLowerCase() === owner.toLowerCase()) {
            const quantityText =
                offerType === 'collection' || offerType === 'trait'
                    ? ` (quantity: ${bestOfferQuantity})`
                    : '';
            logger.debug(
                `Already have the highest offer for ${logPrefix} at price ${formatEther(price)} ${paymentCurrency} per item${quantityText}. Skipping...`
            );
            return;
        }

        const quantityText =
            offerType === 'collection' || offerType === 'trait'
                ? ` (quantity: ${bestOfferQuantity})`
                : '';
        logger.debug(
            `Found best offer for ${logPrefix} at ${formatEther(price)} ${paymentCurrency} per item${quantityText}`
        );

        if (price <= c.maxPrice) {
            // Add one increment to beat the offer
            const newPrice = price + OPENSEA_PRICE_INCREMENT_4_DECIMALS;
            price = newPrice > c.defaultPrice ? newPrice : c.defaultPrice;
        } else {
            // Check if our offer is already at max price
            let ourOffer;
            if (offerType === 'collection') {
                ourOffer = await getBestCollectionOffer(seaport, c.collectionSlug, owner);
            } else if (offerType === 'trait' && c.trait) {
                ourOffer = await getBestTraitOffer(
                    seaport,
                    c.collectionSlug,
                    c.trait.traitType,
                    c.trait.value,
                    owner
                );
            } else {
                ourOffer = await getBestOffer(seaport, c.collectionSlug, c.tokenId, owner);
            }

            // Calculate price per item for our offer
            let offeredPrice: bigint;
            if (ourOffer) {
                if (offerType === 'collection' || offerType === 'trait') {
                    const quantity = getOfferQuantity(ourOffer);
                    const totalPrice = BigInt(ourOffer.price.value);
                    offeredPrice = totalPrice / BigInt(quantity);
                } else {
                    offeredPrice = BigInt(ourOffer.price.value) / sumOfferEndAmounts(ourOffer);
                }
            } else {
                offeredPrice = 0n;
            }
            const ourOfferCurrency = ourOffer ? ourOffer.price.currency : paymentCurrency;
            if (
                ourOffer &&
                isETHOrWETH(ourOfferCurrency) &&
                isETHOrWETH(paymentCurrency) &&
                offeredPrice >= c.maxPrice
            ) {
                logger.debug(
                    `Our ${logPrefix} is already at price ${formatEther(offeredPrice)} ${ourOfferCurrency} which is equal or higher than max price ${formatEther(c.maxPrice)} ${paymentCurrency}. Skipping...`
                );
                return;
            }
            price = c.maxPrice;
        }
    }

    // Get payment token address based on currency and chain
    // Use the chain ID to determine the correct payment token
    const paymentTokenAddress = getPaymentTokenAddress(paymentCurrency, chainId);

    // Create the appropriate type of offer
    const quantity = c.quantity || 1; // Default to 1 if not set

    // For collection and trait offers, OpenSea validates the per-unit price
    // So we need to round the per-unit price, then multiply by quantity
    let finalPrice: bigint;
    if (offerType === 'collection' || offerType === 'trait') {
        // Round per-unit price to OpenSea increment
        const perUnitPrice = roundToFourDecimals(price);
        // Multiply by quantity to get total price
        finalPrice = perUnitPrice * BigInt(quantity);
    } else {
        // For single token offers, just round the price
        finalPrice = roundToFourDecimals(price);
    }

    logger.debug(
        `Creating ${logPrefix} at ${formatEther(finalPrice)} ${paymentCurrency}${offerType === 'collection' || offerType === 'trait' ? ` (${formatEther(roundToFourDecimals(price))} per unit × ${quantity})` : ''} ...`
    );

    if (offerType === 'collection') {
        await createCollectionOffer(
            seaport,
            c.collectionSlug,
            finalPrice,
            expirationTime,
            owner,
            quantity,
            paymentTokenAddress,
            dryRun
        );
    } else if (offerType === 'trait' && c.trait) {
        await createTraitOffer(
            seaport,
            c.collectionSlug,
            c.trait.traitType,
            c.trait.value,
            finalPrice,
            expirationTime,
            owner,
            quantity,
            paymentTokenAddress,
            dryRun
        );
    } else {
        // Single token offer
        if (!c.tokenId) {
            throw new Error(`tokenId is required for single token offers`);
        }
        await createOffer(
            seaport,
            c.tokenAddress,
            c.tokenId,
            finalPrice,
            expirationTime,
            owner,
            paymentTokenAddress,
            dryRun
        );
    }
};
