export type Collection = {
    chain: string;
    collectionSlug: string;
    tokenAddress: string;
    tokenId: string;
    defaultPriceETH: string;
    defaultPrice: bigint;
    minPriceETH: string;
    minPrice: bigint;
    shouldCompareToRest: boolean;
};

export type OfferCollection = {
    chain: string;
    collectionSlug: string;
    tokenAddress: string;
    tokenId?: string; // If set, it's a single token offer
    defaultPriceETH: string;
    defaultPrice: bigint;
    maxPriceETH: string;
    maxPrice: bigint;
    shouldCompareToRest: boolean;
    quantity?: number; // Number of items for collection/trait offers (default: 1)
    trait?: {
        traitType: string;
        value: string;
    }; // If set, it's a trait offer (cannot be set with tokenId)
};

export type OfferType = 'single' | 'collection' | 'trait';

/**
 * Infers the offer type from the collection configuration
 * - If tokenId is set → single offer
 * - If trait is set → trait offer
 * - Otherwise → collection offer (default)
 */
export const inferOfferType = (c: OfferCollection): OfferType => {
    if (c.tokenId !== undefined && c.tokenId !== null && c.tokenId !== '') {
        return 'single';
    }
    if (c.trait) {
        return 'trait';
    }
    return 'collection';
};
