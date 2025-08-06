import { formatEther } from 'ethers';
import { OpenSeaSDK, OrderV2 } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';

/**
 * Creates a new NFT listing on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param tokenAddress The token contract address
 * @param tokenId The token ID
 * @param price The price in wei
 * @param expirationTime The expiration timestamp
 * @param owner The wallet owner address
 * @returns The created OrderV2
 */
export const createListing = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string,
    price: bigint,
    expirationTime: number,
    owner: string
): Promise<OrderV2> => {
    const tx = await withRateLimitRetry(() =>
        seaport.createListing({
            asset: {
                tokenId,
                tokenAddress,
            },
            accountAddress: owner,
            startAmount: formatEther(price),
            expirationTime,
            excludeOptionalCreatorFees: true,
        })
    );

    console.log(`Successfully listed ${tokenAddress}:${tokenId} at ${formatEther(price)} ETH`);
    return tx;
};
