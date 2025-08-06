import fs from 'fs';
import { parseEther } from 'ethers';

import { Collection } from './types.js';

/**
 * Initializes collections from the configuration file
 * @param collectionPath Path to the collections configuration file
 * @param providers Record of RPC providers by chain
 * @returns Array of initialized collections
 */
export const initializeCollections = (
    collectionPath: string,
    providers: Record<string, any>
): Collection[] => {
    const parsedCollections: Collection[] = JSON.parse(fs.readFileSync(collectionPath, 'utf-8'));
    const collections: Collection[] = [];

    for (let c of parsedCollections) {
        // Validate against providers
        if (!providers[c.chain]) {
            throw new Error(
                `No RPC provider configured for chain ${c.chain} (needed by ${c.tokenAddress}:${c.tokenId}). Did you run initializeClients()?`
            );
        }

        // Validate prices
        const defaultPrice = parseEther(c.defaultPriceETH);
        if (defaultPrice <= 0) {
            throw new Error(
                `Invalid default price for collection ${c.tokenAddress}:${c.tokenId}: ${c.defaultPriceETH}`
            );
        }
        c.defaultPrice = defaultPrice;

        const minPrice = parseEther(c.minPriceETH);
        if (minPrice <= 0) {
            throw new Error(
                `Invalid min price for collection ${c.tokenAddress}:${c.tokenId}: ${c.minPriceETH}`
            );
        }
        c.minPrice = minPrice;

        if (defaultPrice < minPrice) {
            throw new Error(
                `Min price must be less than or equal to default price for collection ${c.tokenAddress}:${c.tokenId}`
            );
        }

        c.shouldCompareToRest = c.shouldCompareToRest || false;

        console.log(`Tracking ${c.collectionSlug} (tokenId=${c.tokenId}) on ${c.chain} ...`);
        collections.push(c);
    }

    console.log(`Tracking ${collections.length} collections ...`);

    return collections;
};
