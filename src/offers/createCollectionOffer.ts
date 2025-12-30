import { OpenSeaSDK, CollectionOffer } from 'opensea-js';

import { ETH_PAYMENT_TOKEN } from './paymentTokens.js';
import { createOfferBase } from './createOfferBase.js';

/**
 * Creates a new collection-wide offer on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param price The price in wei (should already be rounded to the appropriate decimal precision)
 * @param expirationTime The expiration timestamp
 * @param owner The wallet owner address
 * @param quantity The quantity of items to offer for (default: 1)
 * @param paymentTokenAddress The payment token address (ETH or WETH)
 * @param dryRun If true, skip actual offer creation
 * @returns The created CollectionOffer or undefined in dry-run mode
 */
export const createCollectionOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    price: bigint,
    expirationTime: number,
    owner: string,
    quantity: number = 1,
    paymentTokenAddress: string = ETH_PAYMENT_TOKEN,
    dryRun: boolean = false
): Promise<CollectionOffer | undefined> => {
    return (await createOfferBase(
        seaport,
        { type: 'collection', collectionSlug, quantity },
        price,
        expirationTime,
        owner,
        paymentTokenAddress,
        dryRun
    )) as CollectionOffer | undefined;
};
