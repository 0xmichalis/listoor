import { OpenSeaSDK, OrderV2 } from 'opensea-js';

import { ETH_PAYMENT_TOKEN } from './paymentTokens.js';
import { createOfferBase } from './createOfferBase.js';

/**
 * Creates a new NFT offer on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param tokenAddress The token contract address
 * @param tokenId The token ID
 * @param price The price in wei (should already be rounded to the appropriate decimal precision)
 * @param expirationTime The expiration timestamp
 * @param owner The wallet owner address
 * @param paymentTokenAddress The payment token address (ETH or WETH)
 * @param dryRun If true, skip actual offer creation
 * @returns The created OrderV2 or undefined in dry-run mode
 */
export const createOffer = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string,
    price: bigint,
    expirationTime: number,
    owner: string,
    paymentTokenAddress: string = ETH_PAYMENT_TOKEN,
    dryRun: boolean = false
): Promise<OrderV2 | undefined> => {
    return (await createOfferBase(
        seaport,
        { type: 'single', tokenAddress, tokenId },
        price,
        expirationTime,
        owner,
        paymentTokenAddress,
        dryRun
    )) as OrderV2 | undefined;
};
