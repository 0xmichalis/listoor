import { Listing } from 'opensea-js';

/**
 * Sums up the end amounts of all offer items in a listing
 * @param listing The listing to calculate the sum for
 * @returns The total end amount as a bigint
 */
export function sumOfferEndAmounts(listing: Listing): bigint {
    return listing.protocol_data.parameters.offer.reduce((sum: bigint, offer: any) => {
        return sum + BigInt(offer.endAmount);
    }, 0n);
}
