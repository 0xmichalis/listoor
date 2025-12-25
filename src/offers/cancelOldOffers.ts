import { OpenSeaSDK, Offer } from 'opensea-js';

import { OfferCollection, inferOfferType } from '../collections/types.js';
import { getAllOffers } from './getAllOffers.js';
import { getAllCollectionOffers } from './getAllCollectionOffers.js';
import { getAllTraitOffers } from './getAllTraitOffers.js';
import { cancelOffer } from './cancelOffer.js';
import { getOfferPricePerItem } from './utils.js';

/**
 * Cancels all offers except the latest one for a given offer collection
 * The "latest" offer is determined by the highest price (highest price per item)
 * @param c The offer collection configuration
 * @param seaport The OpenSea SDK instance
 * @param owner The wallet owner address
 * @param dryRun If true, skip actual cancellation
 */
export const cancelOldOffers = async (
    c: OfferCollection,
    seaport: OpenSeaSDK,
    owner: string,
    dryRun: boolean = false
): Promise<void> => {
    // Infer offer type from configuration
    const offerType = inferOfferType(c);

    // Get all offers based on offer type
    let allOffers: Offer[];
    if (offerType === 'collection') {
        allOffers = await getAllCollectionOffers(seaport, c.collectionSlug, owner);
    } else if (offerType === 'trait' && c.trait) {
        allOffers = await getAllTraitOffers(
            seaport,
            c.collectionSlug,
            c.trait.traitType,
            c.trait.value,
            owner
        );
    } else {
        // Single token offer
        if (!c.tokenId) {
            throw new Error(`tokenId is required for single token offers`);
        }
        allOffers = await getAllOffers(seaport, c.collectionSlug, c.tokenId, owner);
    }

    if (allOffers.length <= 1) {
        return;
    }

    // Sort offers by price per item (descending - highest price first)
    // This way, the offer with the highest price is considered the "latest"
    allOffers.sort((a, b) => {
        const priceA = getOfferPricePerItem(a);
        const priceB = getOfferPricePerItem(b);
        return priceA > priceB ? -1 : priceA < priceB ? 1 : 0; // Descending order
    });

    const offersToCancel = allOffers.slice(1);

    // Cancel all offers except the highest price one
    for (const offer of offersToCancel) {
        await cancelOffer(seaport, offer, c.collectionSlug, dryRun);
    }
};
