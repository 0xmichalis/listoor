import { Offer } from 'opensea-js';

/**
 * Sums up the end amounts of all offer items (currency being offered) in an offer
 * @param offer The offer to calculate the sum for
 * @returns The total end amount as a bigint
 */
export function sumOfferEndAmounts(offer: Offer): bigint {
    return offer.protocol_data.parameters.offer.reduce((sum: bigint, offerItem: any) => {
        return sum + BigInt(offerItem.endAmount);
    }, 0n);
}

/**
 * Gets the quantity of items from an offer by summing consideration item quantities
 * @param offer The offer to get quantity from
 * @returns The total quantity as a number
 */
export function getOfferQuantity(offer: Offer): number {
    const consideration = offer.protocol_data.parameters.consideration || [];

    // For collection offers, the quantity is typically in the first consideration item
    // which has itemType 4 (criteria/collection item) and its endAmount represents the quantity
    // For single token offers, itemType 2 (ERC721) or 3 (ERC1155) with endAmount = 1

    // First, check for itemType 4 (criteria/collection item) - this is used for collection offers
    const criteriaItem = consideration.find((item: any) => item.itemType === 4);
    if (criteriaItem) {
        const quantity = Number(criteriaItem.endAmount || criteriaItem.startAmount || 1);
        return quantity;
    }

    // Fallback: sum quantities from NFT consideration items (itemType 2 or 3)
    let quantity = consideration.reduce((sum: number, considerationItem: any) => {
        // Consideration items for NFTs typically have itemType 2 (ERC721) or 3 (ERC1155)
        if (considerationItem.itemType === 2 || considerationItem.itemType === 3) {
            const itemQuantity = Number(
                considerationItem.endAmount || considerationItem.startAmount || 1
            );
            return sum + itemQuantity;
        }
        return sum;
    }, 0);

    // Default to 1 if no quantity found
    return quantity || 1;
}
