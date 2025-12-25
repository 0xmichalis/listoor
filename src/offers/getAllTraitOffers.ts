import { getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';

/**
 * Gets all trait offers for a specific trait, optionally filtered by offerer
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param traitType The trait type
 * @param traitValue The trait value
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @param accumulatedOffers Accumulated offers from previous pages
 * @returns Array of all matching trait offers
 */
export const getAllTraitOffers = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    traitType: string,
    traitValue: string,
    offerer?: string,
    next?: string,
    accumulatedOffers: Offer[] = []
): Promise<Offer[]> => {
    const offersResp = await withRateLimitRetry(() =>
        seaport.api.getAllOffers(collectionSlug, 100, next)
    );

    // Filter for trait offers matching the specific trait
    const filteredOffers = offersResp.offers.filter((o) => {
        // Trait offers have criteria with type and value
        const matchesTrait =
            o.criteria &&
            o.criteria.trait &&
            o.criteria.trait.type === traitType &&
            o.criteria.trait.value === traitValue;
        const matchesOfferer = offerer
            ? getAddress(o.protocol_data.parameters.offerer).toLowerCase() === offerer.toLowerCase()
            : true;

        const priceValue = o.price.value;
        return priceValue && priceValue !== '0' && matchesTrait && matchesOfferer;
    });

    // Add filtered offers to accumulated list
    accumulatedOffers.push(...filteredOffers);

    // If there are more pages, recursively fetch them
    if (offersResp.next) {
        return await getAllTraitOffers(
            seaport,
            collectionSlug,
            traitType,
            traitValue,
            offerer,
            offersResp.next,
            accumulatedOffers
        );
    }

    return accumulatedOffers;
};
