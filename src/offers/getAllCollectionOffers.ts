import { getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';

/**
 * Gets all collection offers for a collection, optionally filtered by offerer
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @param accumulatedOffers Accumulated offers from previous pages
 * @returns Array of all matching collection offers
 */
export const getAllCollectionOffers = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    offerer?: string,
    next?: string,
    accumulatedOffers: Offer[] = []
): Promise<Offer[]> => {
    const offersResp = await withRateLimitRetry(() =>
        seaport.api.getAllOffers(collectionSlug, 100, next)
    );

    // Filter for collection offers (offers without specific token IDs in consideration)
    const filteredOffers = offersResp.offers.filter((o) => {
        // Collection offers typically have criteria instead of specific token IDs
        const isCollectionOffer = o.criteria !== undefined;
        const matchesOfferer = offerer
            ? getAddress(o.protocol_data.parameters.offerer).toLowerCase() === offerer.toLowerCase()
            : true;

        const priceValue = o.price.value;
        return priceValue && priceValue !== '0' && isCollectionOffer && matchesOfferer;
    });

    // Add filtered offers to accumulated list
    accumulatedOffers.push(...filteredOffers);

    // If there are more pages, recursively fetch them
    if (offersResp.next) {
        return await getAllCollectionOffers(
            seaport,
            collectionSlug,
            offerer,
            offersResp.next,
            accumulatedOffers
        );
    }

    return accumulatedOffers;
};
