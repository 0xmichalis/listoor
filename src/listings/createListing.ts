import { formatEther } from 'ethers';
import { OpenSeaSDK, OrderV2 } from 'opensea-js';

import { withRateLimitRetry } from '../utils/ratelimit.js';

const MIN_EXPIRATION_TIME_SECONDS = 11 * 60; // 11 minutes

/**
 * Creates a new NFT listing on OpenSea
 * @param seaport The OpenSea SDK instance
 * @param tokenAddress The token contract address
 * @param tokenId The token ID
 * @param price The price in wei
 * @param expirationTime The expiration timestamp
 * @param owner The wallet owner address
 * @param dryRun If true, skip actual listing creation
 * @returns The created OrderV2 or undefined in dry-run mode
 */
export const createListing = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string,
    price: bigint,
    expirationTime: number,
    owner: string,
    dryRun: boolean = false
): Promise<OrderV2 | undefined> => {
    // Enforce minimum expiration time of 11 minutes from now
    const currentTime = Math.floor(Date.now() / 1000);
    const minExpirationTime = currentTime + MIN_EXPIRATION_TIME_SECONDS;
    const adjustedExpirationTime = Math.max(expirationTime, minExpirationTime);

    if (dryRun) {
        console.log(
            `[DRY-RUN] Would create listing for ${tokenAddress}:${tokenId} at ${formatEther(price)} ETH (expires: ${new Date(adjustedExpirationTime * 1000).toISOString()})`
        );
        return undefined;
    }

    const tx = await withRateLimitRetry(() =>
        seaport.createListing({
            asset: {
                tokenId,
                tokenAddress,
            },
            accountAddress: owner,
            amount: formatEther(price),
            expirationTime: adjustedExpirationTime,
            includeOptionalCreatorFees: false,
        })
    );

    console.log(`Successfully listed ${tokenAddress}:${tokenId} at ${formatEther(price)} ETH`);
    return tx;
};
