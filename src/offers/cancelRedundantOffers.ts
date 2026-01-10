import { formatEther, getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { logger } from '../utils/logger.js';
import { withRateLimitRetry } from '../utils/ratelimit.js';
import { OfferCollection, inferOfferType } from '../collections/types.js';
import { getAllOffers } from './getAllOffers.js';
import { getAllCollectionOffers } from './getAllCollectionOffers.js';
import { getAllTraitOffers } from './getAllTraitOffers.js';
import { getOfferPricePerItem, getOfferQuantity } from './utils.js';

/**
 * Gets all offers to cancel for a single collection (all except the highest priced one)
 * @param c The offer collection configuration
 * @param seaport The OpenSea SDK instance
 * @param owner The wallet owner address
 * @returns Array of offers that should be canceled
 */
const getOffersToCancelForCollection = async (
    c: OfferCollection,
    seaport: OpenSeaSDK,
    owner: string
): Promise<Array<{ offer: Offer; collectionSlug: string }>> => {
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
        return [];
    }

    // Sort offers by price per item (descending - highest price first)
    // This way, the offer with the highest price is considered the "latest"
    allOffers.sort((a, b) => {
        const priceA = getOfferPricePerItem(a);
        const priceB = getOfferPricePerItem(b);
        return priceA > priceB ? -1 : priceA < priceB ? 1 : 0; // Descending order
    });

    const offersToCancel = allOffers.slice(1);

    // Return offers with their collection slug for tracking
    return offersToCancel.map((offer) => ({ offer, collectionSlug: c.collectionSlug }));
};

/**
 * Cancels all offers except the best one for multiple offer collections
 * The "best" offer is determined by the highest price (highest price per item)
 * Batches cancellations by chain to minimize API calls
 * @param collections Array of offer collection configurations
 * @param openSeaClients Record of OpenSea SDK instances by chain
 * @param owner The wallet owner address
 * @param dryRun If true, skip actual cancellation
 */
export const cancelRedundantOffers = async (
    collections: OfferCollection[],
    openSeaClients: Record<string, OpenSeaSDK>,
    owner: string,
    dryRun: boolean = false
): Promise<void> => {
    // Group collections by chain
    const collectionsByChain = new Map<string, OfferCollection[]>();
    for (const collection of collections) {
        if (!collectionsByChain.has(collection.chain)) {
            collectionsByChain.set(collection.chain, []);
        }
        collectionsByChain.get(collection.chain)!.push(collection);
    }

    // Process each chain separately
    for (const [chain, chainCollections] of collectionsByChain.entries()) {
        const seaport = openSeaClients[chain];
        if (!seaport) {
            logger.warn(`No OpenSea client found for chain ${chain}, skipping`);
            continue;
        }

        try {
            // Get all offers to cancel across all collections on this chain
            const allOffersToCancel: Array<{ offer: Offer; collectionSlug: string }> = [];

            for (const collection of chainCollections) {
                try {
                    const offersToCancel = await getOffersToCancelForCollection(
                        collection,
                        seaport,
                        owner
                    );
                    allOffersToCancel.push(...offersToCancel);
                } catch (err) {
                    logger.error(
                        `Error getting offers to cancel for collection ${collection.collectionSlug}:`,
                        err
                    );
                }
            }

            if (allOffersToCancel.length === 0) {
                continue;
            }

            // Collect order hashes from offers that have them
            const orderHashes: string[] = [];
            const offersWithHashes: Array<{
                offer: Offer;
                collectionSlug: string;
                orderHash: string;
            }> = [];

            for (const { offer, collectionSlug } of allOffersToCancel) {
                if (offer.order_hash) {
                    orderHashes.push(offer.order_hash);
                    offersWithHashes.push({ offer, collectionSlug, orderHash: offer.order_hash });
                }
            }

            if (orderHashes.length === 0) {
                logger.warn(`No offers with order_hash found to cancel for chain ${chain}`);
                continue;
            }

            // Log the cancellation attempt
            const dryRunPrefix = dryRun ? '[DRY-RUN] ' : '';
            logger.info(
                `${dryRunPrefix}Canceling ${orderHashes.length} offer(s) across ${chainCollections.length} collection(s) on chain ${chain}`
            );

            if (dryRun) {
                continue;
            }

            try {
                // Get the account address from the first offer (all should have the same offerer)
                const accountAddress = getAddress(
                    allOffersToCancel[0].offer.protocol_data.parameters.offerer
                );

                // Cancel all offers in a single batch for this chain
                await withRateLimitRetry(() =>
                    seaport.cancelOrders({
                        orderHashes,
                        accountAddress,
                    })
                );

                // Log individual offer details for successful cancellations
                for (const { offer, collectionSlug } of offersWithHashes) {
                    const pricePerItem = getOfferPricePerItem(offer);
                    const quantity = getOfferQuantity(offer);
                    logger.info(
                        `Successfully canceled offer: ${collectionSlug}, price: ${formatEther(pricePerItem)} ${offer.price.currency}, quantity: ${quantity}`
                    );
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                logger.error(`Failed to cancel offers for chain ${chain}: ${errorMessage}`);
            }
        } catch (err) {
            logger.error(`Error processing cancellations for chain ${chain}:`, err);
        }
    }
};
