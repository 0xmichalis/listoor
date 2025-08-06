import { getAddress } from 'ethers';
import { OpenSeaSDK, Listing } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { patchOpenSeaSDKIssue, sumOfferEndAmounts } from './utils.js';

/**
 * Gets the best (cheapest) listing for a collection
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param tokenId Optional token ID to filter by
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @returns The best listing or undefined if none found
 */
export const getBestListing = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenId?: string,
    offerer?: string,
    next?: string
): Promise<Listing | undefined> => {
    const listingsResp = await withRateLimitRetry(() =>
        seaport.api.getAllListings(collectionSlug, 100, next)
    );

    // Get all listings matching our criteria
    const filteredListings = listingsResp.listings.filter((l) => {
        const matchesToken = tokenId
            ? l.protocol_data.parameters.offer.some((o) => o.identifierOrCriteria == tokenId)
            : true;
        const matchesOfferer = offerer
            ? getAddress(l.protocol_data.parameters.offerer).toLowerCase() === offerer.toLowerCase()
            : true;

        const priceValue = patchOpenSeaSDKIssue(l)?.price?.value;
        return priceValue && priceValue !== '0' && matchesToken && matchesOfferer;
    });

    // Pick the cheapest
    filteredListings.sort((a, b) => {
        const priceA = BigInt(a.price.value) / sumOfferEndAmounts(a);
        const priceB = BigInt(b.price.value) / sumOfferEndAmounts(b);
        return priceA < priceB ? -1 : priceA > priceB ? 1 : 0;
    });
    let listing = filteredListings[0];

    // If there are more pages, recursively check and compare
    let nextListing: Listing | undefined;
    if (listingsResp.next) {
        nextListing = await getBestListing(
            seaport,
            collectionSlug,
            tokenId,
            offerer,
            listingsResp.next
        );
        if (
            !listing ||
            (nextListing &&
                BigInt(nextListing.price.value) / sumOfferEndAmounts(nextListing) <
                    BigInt(listing.price.value) / sumOfferEndAmounts(listing))
        ) {
            return nextListing;
        }
    }
    return listing;
};
