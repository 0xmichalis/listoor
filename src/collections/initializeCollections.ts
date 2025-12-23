import fs from 'fs';
import { parseEther } from 'ethers';

import { Collection, OfferCollection, inferOfferType } from './types.js';

type CollectionsConfig = {
    listings?: Collection[];
    offers?: OfferCollection[];
};

/**
 * Initializes listing collections from the configuration file
 * @param collectionPath Path to the collections configuration file
 * @param providers Record of RPC providers by chain
 * @returns Array of initialized listing collections
 */
export const initializeCollections = (
    collectionPath: string,
    providers: Record<string, any>
): Collection[] => {
    const fileContent = fs.readFileSync(collectionPath, 'utf-8');
    const parsedConfig: CollectionsConfig = JSON.parse(fileContent);

    const listings = parsedConfig.listings || [];
    const collections: Collection[] = [];

    for (let c of listings) {
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

        console.log(
            `Tracking listing ${c.collectionSlug} (tokenId=${c.tokenId}) on ${c.chain} ...`
        );
        collections.push(c);
    }

    console.log(`Tracking ${collections.length} listing collections ...`);

    return collections;
};

/**
 * Initializes offer collections from the configuration file
 * @param collectionPath Path to the collections configuration file
 * @param providers Record of RPC providers by chain
 * @returns Array of initialized offer collections
 */
export const initializeOfferCollections = (
    collectionPath: string,
    providers: Record<string, any>
): OfferCollection[] => {
    const fileContent = fs.readFileSync(collectionPath, 'utf-8');
    const parsedConfig: CollectionsConfig = JSON.parse(fileContent);

    const offers = parsedConfig.offers || [];
    const offerCollections: OfferCollection[] = [];

    for (let c of offers) {
        // Validate against providers
        if (!providers[c.chain]) {
            throw new Error(
                `No RPC provider configured for chain ${c.chain} (needed by ${c.collectionSlug}). Did you run initializeClients()?`
            );
        }

        // Validate: cannot have both tokenId and trait
        if (c.tokenId && c.trait) {
            throw new Error(
                `Cannot specify both tokenId and trait for collection ${c.collectionSlug}. Use tokenId for single offers or trait for trait offers, but not both.`
            );
        }

        // Infer offer type from configuration
        const offerType = inferOfferType(c);

        // Validate trait offers have required fields
        if (offerType === 'trait') {
            if (!c.trait) {
                throw new Error(
                    `trait is required for trait offers in collection ${c.collectionSlug}`
                );
            }
            if (!c.trait.traitType || !c.trait.value) {
                throw new Error(
                    `trait.traitType and trait.value are required for trait offers in collection ${c.collectionSlug}`
                );
            }
        }

        // Validate prices
        const defaultPrice = parseEther(c.defaultPriceETH);
        if (defaultPrice <= 0) {
            throw new Error(
                `Invalid default price for offer collection ${c.collectionSlug}: ${c.defaultPriceETH}`
            );
        }
        c.defaultPrice = defaultPrice;

        const maxPrice = parseEther(c.maxPriceETH);
        if (maxPrice <= 0) {
            throw new Error(
                `Invalid max price for offer collection ${c.collectionSlug}: ${c.maxPriceETH}`
            );
        }
        c.maxPrice = maxPrice;

        if (defaultPrice > maxPrice) {
            throw new Error(
                `Default price must be less than or equal to max price for offer collection ${c.collectionSlug}`
            );
        }

        c.shouldCompareToRest = c.shouldCompareToRest || false;

        // Set quantity (default to 1, only applies to collection/trait offers)
        if (offerType === 'collection' || offerType === 'trait') {
            c.quantity = c.quantity !== undefined && c.quantity !== null ? c.quantity : 1;
            if (c.quantity < 1) {
                throw new Error(
                    `Quantity must be at least 1 for offer collection ${c.collectionSlug}`
                );
            }
        } else {
            // Single token offers always have quantity 1
            c.quantity = 1;
        }

        // Log based on offer type
        if (offerType === 'collection') {
            console.log(
                `Tracking collection offer ${c.collectionSlug} on ${c.chain} (quantity: ${c.quantity}) ...`
            );
        } else if (offerType === 'trait' && c.trait) {
            console.log(
                `Tracking trait offer ${c.collectionSlug} (${c.trait.traitType}: ${c.trait.value}) on ${c.chain} (quantity: ${c.quantity}) ...`
            );
        } else {
            console.log(
                `Tracking single token offer ${c.collectionSlug} (tokenId=${c.tokenId}) on ${c.chain} ...`
            );
        }
        offerCollections.push(c);
    }

    console.log(`Tracking ${offerCollections.length} offer collections ...`);

    return offerCollections;
};
