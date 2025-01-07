import dotenv from 'dotenv';
import {
    ethers,
    Network,
    JsonRpcProvider,
    parseEther,
    Wallet,
    formatEther,
    getAddress,
} from 'ethers';
import fs from 'fs';
import { OpenSeaSDK, Chain, Listing, OrderV2 } from 'opensea-js';

import { sleep } from './utils/sleep.js';

dotenv.config();

(function() {
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      const timestamp = new Date().toISOString();
      originalLog(`[${timestamp}]`, ...args);
    };
})();

const DEFAULT_EXPIRATION_TIME = 5 * 30 * 24 * 60 * 60; // 5 months

const RPC_ENDPOINTS = process.env.RPC_ENDPOINTS!.split(',');
const COLLECTION_PATH = process.env.COLLECTION_PATH!;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY!;
const POLLING_INTERVAL_SECONDS = parseInt(process.env.POLLING_INTERVAL_SECONDS || '60');
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

// Cached stuff
const owner: Wallet = new ethers.Wallet(PRIVATE_KEY);
const providers: Record<string, JsonRpcProvider> = {};
const openSeaClients: Record<string, OpenSeaSDK> = {};
type Collection = {
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
const collections: Collection[] = [];

const getChainFromChainId = (chainId: number): Chain => {
    switch (chainId) {
        case 1:
            return Chain.Mainnet;
        case 8453:
            return Chain.Base;
        case 42161:
            return Chain.Arbitrum;
        case 7777777:
            return Chain.Zora;
        case 137:
            return Chain.Polygon;
        default:
            throw new Error(`Unsupported chain ID: ${chainId}`);
    }
};

const initializeClients = async () => {
    for (const rpcEndpoint of RPC_ENDPOINTS) {
        const [chain, url] = rpcEndpoint.split('::');
        const provider = new JsonRpcProvider(url, undefined, {
            staticNetwork: true,
        });

        const chainId = await provider
            .getNetwork()
            .then((network: Network) => Number(network.chainId));

        console.log(`Initializing clients for chain ${chain} (${chainId}) ...`);

        // Cache providers and OpenSeaSDK instances
        providers[chain] = provider;
        const signer: Wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        console.log(`${chain} RPC provider initialized.`);
        openSeaClients[chain] = new OpenSeaSDK(signer, {
            apiKey: OPENSEA_API_KEY,
            chain: getChainFromChainId(chainId),
        });
        console.log(`${chain} OpenSea client initialized.`);
    }
};

const initializeCollections = () => {
    const parsedCollections = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf-8'));

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
};

const listNFT = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string,
    price: bigint,
    expirationTime: number
): Promise<OrderV2> => {
    const tx = await seaport.createListing({
        asset: {
            tokenId,
            tokenAddress,
        },
        accountAddress: owner.address,
        startAmount: formatEther(price),
        expirationTime,
        excludeOptionalCreatorFees: true,
    });

    console.log(`Successfully listed ${tokenAddress}:${tokenId} at ${formatEther(price)} ETH`);
    return tx;
};

const multiAssetErrRegex = /Multiple assets with the token_id/;

const isMultiAssetError = (error: unknown): boolean =>
    error instanceof Error && !!error.message.match(multiAssetErrRegex);

const getBestListing = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenId?: string,
    next?: string
): Promise<Listing | undefined> => {
    const listingsResp = await seaport.api.getAllListings(collectionSlug, 100, next);
    let listing: Listing | undefined;

    if (tokenId) {
        listing = listingsResp.listings.find((l) =>
            l.protocol_data.parameters.offer.some((o) => o.identifierOrCriteria == tokenId)
        );
    } else {
        const validListings = listingsResp.listings.filter(
            (l) => l?.price?.current?.value && l?.price?.current?.value !== '0'
        );
        listing = validListings.reduce((prev, curr) => {
            if (!prev) return curr;
            const prevPrice = BigInt(prev.price.current.value);
            const currPrice = BigInt(curr.price.current.value);
            return prevPrice < currPrice ? prev : curr;
        }, validListings[0]);
    }

    const canReturnUnique = tokenId && listing;
    if (canReturnUnique) return listing;

    let nextListing: Listing | undefined;
    if (listingsResp.next)
        nextListing = await getBestListing(seaport, collectionSlug, tokenId, listingsResp.next);

    if (!tokenId) {
        if (
            !listing ||
            (nextListing &&
                BigInt(nextListing.price.current.value) < BigInt(listing.price.current.value))
        ) {
            return nextListing;
        }
        return listing;
    }

    return nextListing;
};

const getSingleBestListing = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenId: string
): Promise<Listing | undefined> => {
    let bestListing: Listing | undefined;

    try {
        bestListing = await seaport.api.getBestListing(collectionSlug, tokenId);
    } catch (error) {
        const isMultiAssetErr = isMultiAssetError(error);
        if (!isMultiAssetErr) {
            throw error;
        }
        // Try to find the listing by fetching all listings
        // This can be optimized by caching responses
        bestListing = await getBestListing(seaport, collectionSlug, tokenId);
    }

    return bestListing;
};

// Function to monitor a specific NFT collection
const monitorCollection = async (c: Collection) => {
    console.log(`Checking ${c.collectionSlug} (tokenId=${c.tokenId}) ...`);

    const seaport = openSeaClients[c.chain];
    const bestListing = c.shouldCompareToRest
        ? await getBestListing(seaport, c.collectionSlug)
        : await getSingleBestListing(seaport, c.collectionSlug, c.tokenId);

    let price: bigint;
    let expirationTime: number;

    if (!bestListing || !bestListing.protocol_data || !bestListing.protocol_data.parameters) {
        console.log(`Did not find a listing for ${c.collectionSlug} (tokenId=${c.tokenId}) ...`);
        // If no best listing, create a new listing with the starting price
        price = c.defaultPrice;
        expirationTime = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRATION_TIME;
    } else {
        // TODO: Need to also compare token ids as if we have more than one token ids to be listed
        // in the collection then only one will get listed and the rest will be ignored.
        const lister = getAddress(bestListing.protocol_data.parameters.offerer);
        if (lister.toLowerCase() === owner.address.toLowerCase()) {
            console.log(
                `Already have the lowest listing for ${c.collectionSlug} (tokenId=${c.tokenId}). Skipping...`
            );
            return;
        }

        if (bestListing.price.current.currency !== 'ETH') {
            // TODO: Handle this case by converting to the price of ETH
            console.error(
                `Best listing for ${c.collectionSlug} (tokenId=${c.tokenId}) is not in ETH. Skipping...`
            );
            return;
        }

        price =
            BigInt(bestListing.price.current.value) /
            BigInt(bestListing.protocol_data.parameters.offer[0].endAmount);

        console.log(
            `Found best listing for ${c.collectionSlug} (tokenId=${c.tokenId}) at ${formatEther(price)} ETH`
        );

        if (price < c.minPrice) {
            console.log(
                `Best listing for ${c.collectionSlug} (tokenId=${c.tokenId}) is already below the min price. Skipping...`
            );
            return;
        }

        // Subtract 1000 wei from the lowest price. Any lower than 1000 wei and OpenSea will
        // complain about not getting its 250 basis points.
        const newPrice = price - 1000n;
        price = newPrice < c.defaultPrice ? newPrice : c.defaultPrice;
        expirationTime = Number(bestListing.protocol_data.parameters.endTime);
    }
    console.log(
        `Listing ${c.collectionSlug} (tokenId=${c.tokenId}) at ${formatEther(price)} ETH ...`
    );
    await listNFT(seaport, c.tokenAddress, c.tokenId, price, expirationTime);
};

// Main function to run the bot
const main = async () => {
    await initializeClients();
    initializeCollections();

    while (true) {
        for (const collection of collections) {
            try {
                await monitorCollection(collection);
            } catch (err) {
                console.error(`Error monitoring collection ${collection.collectionSlug}:`, err);
            }
        }
        console.log('Waiting for next poll ...');
        await sleep(POLLING_INTERVAL_SECONDS);
    }
};

main().catch(console.error);
