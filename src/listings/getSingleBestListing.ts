import { OpenSeaSDK, Listing, OrderSide } from 'opensea-js';

import { withRateLimitRetry, withRetry } from '../utils/ratelimit.js';
import { orderV2ToListing } from './orderV2ToListing.js';
import { getBestListing } from './getBestListing.js';

/**
 * Gets the best listing for a specific token
 * @param seaport The OpenSea SDK instance
 * @param tokenAddress The token contract address
 * @param tokenId The token ID
 * @returns The best listing or undefined if none found
 */
export const getSingleBestListing = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenAddress: string,
    tokenId: string
): Promise<Listing | undefined> => {
    try {
        return await getBestListingFromOrders(seaport, tokenAddress, tokenId);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message.includes('Sorting by price is only supported for a single token')
        ) {
            return await getBestListing(seaport, collectionSlug, tokenId);
        }

        throw error;
    }
};

// Workaround for broken getBestListing API: https://github.com/ProjectOpenSea/opensea-js/issues/1735
// Use getOrders with SELL side and filter by contract address and token ID
const getBestListingFromOrders = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string
): Promise<Listing | undefined> => {
    // Wrap with withRetry to handle transient errors like JSON parsing failures,
    // then withRateLimitRetry to handle rate limits
    const orderResp = await withRetry(() =>
        withRateLimitRetry(() =>
            seaport.api.getOrders({
                side: OrderSide.LISTING,
                assetContractAddress: tokenAddress,
                tokenIds: [tokenId],
                // TODO: Handle "Sorting by price is only supported for a single token" error
                // This means that for ERC1155 tokens, we need to get all listings and sort them by price
                // and then pick the cheapest one.
                orderBy: 'eth_price',
                orderDirection: 'asc',
            })
        )
    );
    if (!orderResp.orders || orderResp.orders.length === 0) {
        return undefined;
    }

    return orderV2ToListing(orderResp.orders[0], seaport.chain);
};
