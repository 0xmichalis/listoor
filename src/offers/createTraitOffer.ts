import { OpenSeaSDK, CollectionOffer } from 'opensea-js';

import { ETH_PAYMENT_TOKEN } from './paymentTokens.js';
import { createOfferBase } from './createOfferBase.js';

/**
 * Creates a new trait-specific offer on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param traitType The trait type (e.g., "Background", "Eyes")
 * @param traitValue The trait value (e.g., "Blue", "Red")
 * @param price The price in wei
 * @param expirationTime The expiration timestamp
 * @param owner The wallet owner address
 * @param quantity The quantity of items to offer for (default: 1)
 * @param paymentTokenAddress The payment token address (ETH or WETH)
 * @param dryRun If true, skip actual offer creation
 * @returns The created CollectionOffer or undefined in dry-run mode
 */
export const createTraitOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    traitType: string,
    traitValue: string,
    price: bigint,
    expirationTime: number,
    owner: string,
    quantity: number = 1,
    paymentTokenAddress: string = ETH_PAYMENT_TOKEN,
    dryRun: boolean = false
): Promise<CollectionOffer | undefined> => {
    return (await createOfferBase(
        seaport,
        { type: 'trait', collectionSlug, traitType, traitValue, quantity },
        price,
        expirationTime,
        owner,
        paymentTokenAddress,
        dryRun
    )) as CollectionOffer | undefined;
};
