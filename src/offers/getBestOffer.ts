import { getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { sumOfferEndAmounts } from './utils.js';

/**
 * Gets the best (highest) offer for a collection
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param tokenId Optional token ID to filter by
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @returns The best offer or undefined if none found
 */
export const getBestOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenId?: string,
    offerer?: string,
    next?: string
): Promise<Offer | undefined> => {
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

    // Pick the highest (best) offer
    filteredOffers.sort((a, b) => {
        const priceA = BigInt(a.price.value) / sumOfferEndAmounts(a);
        const priceB = BigInt(b.price.value) / sumOfferEndAmounts(b);
        return priceA > priceB ? -1 : priceA < priceB ? 1 : 0;
    });
    let offer = filteredOffers[0];

    // If there are more pages, recursively check and compare
    let nextOffer: Offer | undefined;
    if (offersResp.next) {
        nextOffer = await getBestOffer(seaport, collectionSlug, tokenId, offerer, offersResp.next);
        if (
            !offer ||
            (nextOffer &&
                BigInt(nextOffer.price.value) / sumOfferEndAmounts(nextOffer) >
                    BigInt(offer.price.value) / sumOfferEndAmounts(offer))
        ) {
            return nextOffer;
        }
    }
    return offer;
};
