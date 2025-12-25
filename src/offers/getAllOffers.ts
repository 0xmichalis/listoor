import { getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';

/**
 * Gets all offers for a collection, optionally filtered by token ID and offerer
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param tokenId Optional token ID to filter by
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @param accumulatedOffers Accumulated offers from previous pages
 * @returns Array of all matching offers
 */
export const getAllOffers = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenId?: string,
    offerer?: string,
    next?: string,
    accumulatedOffers: Offer[] = []
): Promise<Offer[]> => {
    const offersResp = await withRateLimitRetry(() =>
        seaport.api.getAllOffers(collectionSlug, 100, next)
    );

    // Get all offers matching our criteria
    const filteredOffers = offersResp.offers.filter((o) => {
        const matchesToken = tokenId
            ? o.protocol_data.parameters.consideration.some(
                  (c) => c.identifierOrCriteria == tokenId
              )
            : true;
        const matchesOfferer = offerer
            ? getAddress(o.protocol_data.parameters.offerer).toLowerCase() === offerer.toLowerCase()
            : true;

        const priceValue = o.price.value;
        return priceValue && priceValue !== '0' && matchesToken && matchesOfferer;
    });

    // Add filtered offers to accumulated list
    accumulatedOffers.push(...filteredOffers);

    // If there are more pages, recursively fetch them
    if (offersResp.next) {
        return await getAllOffers(
            seaport,
            collectionSlug,
            tokenId,
            offerer,
            offersResp.next,
            accumulatedOffers
        );
    }

    return accumulatedOffers;
};
