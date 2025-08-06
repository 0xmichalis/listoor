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
