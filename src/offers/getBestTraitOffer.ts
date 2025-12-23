import { getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { getOfferQuantity } from './utils.js';

/**
 * Gets the best (highest) trait offer for a specific trait
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param traitType The trait type
 * @param traitValue The trait value
 * @param offerer Optional offerer address to filter by
 * @param next Optional pagination token
 * @returns The best trait offer or undefined if none found
 */
export const getBestTraitOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    traitType: string,
    traitValue: string,
    offerer?: string,
    next?: string
): Promise<Offer | undefined> => {
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
        nextOffer = await getBestTraitOffer(
            seaport,
            collectionSlug,
            traitType,
            traitValue,
            offerer,
            offersResp.next
        );
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
