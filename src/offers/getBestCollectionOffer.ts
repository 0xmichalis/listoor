import { getAddress, formatEther } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { getOfferQuantity } from './utils.js';
import { logger } from '../utils/logger.js';

/**
 * Gets the best (highest) offer for competing with a collection
 * Returns either the best collection offer OR the best single token offer if it's higher
 * @param seaport The OpenSea SDK instance
 * @param collectionSlug The collection slug
 * @param offerer Optional offerer address to filter by
 * @param maxPrice Optional max price - if provided, single token offers above this are ignored
 * @param next Optional pagination token
 * @returns The best offer to compete with, or undefined if none found
 */
export const getBestCollectionOffer = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    offerer?: string,
    maxPrice?: bigint,
    next?: string
): Promise<Offer | undefined> => {
    const offersResp = await withRateLimitRetry(() =>
        seaport.api.getAllOffers(collectionSlug, 100, next)
    );

    // Filter and separate offers
    const validOffers: Offer[] = [];

    offersResp.offers.forEach((o) => {
        const matchesOfferer = offerer
            ? getAddress(o.protocol_data.parameters.offerer).toLowerCase() === offerer.toLowerCase()
            : true;

        const priceValue = o.price.value;
        if (!priceValue || priceValue === '0' || !matchesOfferer) return;

        // Filter by maxPrice if provided
        if (maxPrice) {
            const offerPrice = BigInt(priceValue) / BigInt(getOfferQuantity(o));
            if (offerPrice >= maxPrice) {
                const offerType = !!o.criteria ? 'collection' : 'single token';
                logger.debug(
                    `Found ${offerType} offer at ${formatEther(offerPrice)} WETH, but it's above maxPrice ${formatEther(maxPrice)} WETH - ignoring`
                );
                return;
            }
        }

        validOffers.push(o);
    });

    // Get the best offer from this page (highest price)
    const bestOffer = getBestOfferFromList(validOffers);

    // If there are more pages, recursively check and compare
    if (offersResp.next) {
        const nextOffer = await getBestCollectionOffer(
            seaport,
            collectionSlug,
            offerer,
            maxPrice,
            offersResp.next
        );
        if (nextOffer && bestOffer) {
            const currentPrice =
                BigInt(bestOffer.price.value) / BigInt(getOfferQuantity(bestOffer));
            const nextPrice = BigInt(nextOffer.price.value) / BigInt(getOfferQuantity(nextOffer));
            return nextPrice > currentPrice ? nextOffer : bestOffer;
        }
        return nextOffer || bestOffer;
    }

    return bestOffer;
};

// Helper function to get the best offer from a list
function getBestOfferFromList(offers: Offer[]): Offer | undefined {
    if (offers.length === 0) return undefined;

    const filteredOffers = [...offers];

    // Sort by price per item (highest first)
    filteredOffers.sort((a, b) => {
        const quantityA = getOfferQuantity(a);
        const quantityB = getOfferQuantity(b);
        const pricePerItemA = BigInt(a.price.value) / BigInt(quantityA);
        const pricePerItemB = BigInt(b.price.value) / BigInt(quantityB);
        return pricePerItemA > pricePerItemB ? -1 : pricePerItemA < pricePerItemB ? 1 : 0;
    });

    return filteredOffers[0];
}
