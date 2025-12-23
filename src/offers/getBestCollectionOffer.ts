import { getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { getOfferQuantity } from './utils.js';

/**
 * Gets the best (highest) collection offer
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @returns The best collection offer or undefined if none found
 */
export const getBestCollectionOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    offerer?: string,
    next?: string
): Promise<Offer | undefined> => {
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

    // Pick the highest (best) offer by price per item
    filteredOffers.sort((a, b) => {
        const quantityA = getOfferQuantity(a);
        const quantityB = getOfferQuantity(b);
        const pricePerItemA = BigInt(a.price.value) / BigInt(quantityA);
        const pricePerItemB = BigInt(b.price.value) / BigInt(quantityB);
        return pricePerItemA > pricePerItemB ? -1 : pricePerItemA < pricePerItemB ? 1 : 0;
    });
    let offer = filteredOffers[0];

    // If there are more pages, recursively check and compare
    let nextOffer: Offer | undefined;
    if (offersResp.next) {
        nextOffer = await getBestCollectionOffer(seaport, collectionSlug, offerer, offersResp.next);
        if (nextOffer) {
            const quantity = getOfferQuantity(offer);
            const nextQuantity = getOfferQuantity(nextOffer);
            const pricePerItem = BigInt(offer.price.value) / BigInt(quantity);
            const nextPricePerItem = BigInt(nextOffer.price.value) / BigInt(nextQuantity);
            if (!offer || nextPricePerItem > pricePerItem) {
                return nextOffer;
            }
        }
    }
    return offer;
};
