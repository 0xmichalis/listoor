import { OpenSeaSDK, Listing, OrderSide } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { orderV2ToListing } from './orderV2ToListing.js';

/**
 * Gets the best listing for a specific token
 * @param seaport The OpenSea SDK instance
 * @param tokenAddress The token contract address
 * @param tokenId The token ID
 * @returns The best listing or undefined if none found
 */
export const getSingleBestListing = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string
): Promise<Listing | undefined> => {
    // Workaround for broken getBestListing API: https://github.com/ProjectOpenSea/opensea-js/issues/1735
    // Use getOrders with SELL side and filter by contract address and token ID
    const orders = await withRateLimitRetry(() =>
        seaport.api.getOrders({
            side: OrderSide.LISTING,
            assetContractAddress: tokenAddress,
            tokenId,
            // TODO: Handle "Sorting by price is only supported for a single token" error
            // This means that for ERC1155 tokens, we need to get all listings and sort them by price
            // and then pick the cheapest one.
            orderBy: 'eth_price',
            orderDirection: 'asc',
        })
    );
    if (!orders.orders || orders.orders.length === 0) {
        return undefined;
    }

    let bestListing = orderV2ToListing(orders.orders[0], seaport.chain);

    return bestListing;
};
