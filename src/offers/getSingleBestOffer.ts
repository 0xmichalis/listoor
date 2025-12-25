import { OpenSeaSDK, Offer, OrderSide } from 'opensea-js';

import { withRateLimitRetry, withRetry } from '../utils/ratelimit.js';
import { orderV2ToOffer } from './orderV2ToOffer.js';
import { getBestOffer } from './getBestOffer.js';

/**
 * Gets the best offer for a specific token
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param tokenAddress The token contract address
 * @param tokenId The token ID
 * @returns The best offer or undefined if none found
 */
export const getSingleBestOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenAddress: string,
    tokenId: string
): Promise<Offer | undefined> => {
    try {
        return await getBestOfferFromOrders(seaport, tokenAddress, tokenId);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.includes('Sorting by price is only supported for a single token')
        ) {
            return await getBestOffer(seaport, collectionSlug, tokenId);
        }

        throw error;
    }
};

// Workaround for broken getBestOffer API: Use getOrders with OFFER side and filter by contract address and token ID
const getBestOfferFromOrders = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string
): Promise<Offer | undefined> => {
    // Wrap with withRetry to handle transient errors like JSON parsing failures,
    // then withRateLimitRetry to handle rate limits
    const orderResp = await withRetry(() =>
        withRateLimitRetry(() =>
            seaport.api.getOrders({
                side: OrderSide.OFFER,
                assetContractAddress: tokenAddress,
                tokenIds: [tokenId],
                // TODO: Handle "Sorting by price is only supported for a single token" error
                // This means that for ERC1155 tokens, we need to get all offers and sort them by price
                // and then pick the highest one.
                orderBy: 'eth_price',
                orderDirection: 'desc',
            })
        )
    );
    if (!orderResp.orders || orderResp.orders.length === 0) {
        return undefined;
    }

    return orderV2ToOffer(orderResp.orders[0], seaport.chain);
};
