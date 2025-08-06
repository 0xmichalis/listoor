import { Listing } from 'opensea-js';

/**
 * Workaround for OpenSea SDK issue https://github.com/ProjectOpenSea/opensea-js/issues/1682
 * @param listing The listing to patch
 * @returns The patched listing
 */
export const patchOpenSeaSDKIssue = (listing: Listing): Listing => {
    if (!listing.price?.value && (listing.price as any).current) {
        listing.price = (listing.price as any).current;
    }
    return listing;
};

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
