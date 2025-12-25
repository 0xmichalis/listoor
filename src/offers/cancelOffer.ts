import { formatEther, getAddress } from 'ethers';
import { OpenSeaSDK, Offer } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';
import { getOfferQuantity, getOfferPricePerItem } from './utils.js';

/**
 * Cancels an offer on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param offer The offer to cancel
 * @param collectionSlug Optional collection slug for logging
 * @param dryRun If true, skip actual cancellation
 * @returns True if cancellation was successful, false otherwise
 */
export const cancelOffer = async (
    seaport: OpenSeaSDK,
    offer: Offer,
    collectionSlug?: string,
    dryRun: boolean = false
): Promise<boolean> => {
    // Derive logging information from the offer
    const pricePerItem = getOfferPricePerItem(offer);
    const quantity = getOfferQuantity(offer);

    // Log the cancellation attempt
    const dryRunPrefix = dryRun ? '[DRY-RUN] ' : '';
    console.log(
        `${dryRunPrefix}Canceling offer: ${collectionSlug || 'unknown'}, price: ${formatEther(pricePerItem)} ${offer.price.currency}, quantity: ${quantity}`
    );

    if (dryRun) {
        return true;
    }

    try {
        // Get the account address from the offer
        const accountAddress = getAddress(offer.protocol_data.parameters.offerer);

        // Check if the offer has an order_hash (single token offers)
        if (offer.order_hash) {
            await withRateLimitRetry(() =>
                seaport.cancelOrder({
                    orderHash: offer.order_hash,
                    accountAddress,
                })
            );
            console.log(
                `Successfully canceled offer: ${collectionSlug || 'unknown'}, price: ${formatEther(pricePerItem)} ${offer.price.currency}, quantity: ${quantity}`
            );
            return true;
        } else {
            // The OpenSea SDK might require the full order object
            // This is a fallback - you may need to adjust based on actual SDK API
            throw new Error('Cannot cancel offer without order_hash');
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to cancel offer ${offer.order_hash || 'unknown'}: ${errorMessage}`);
        return false;
    }
};
