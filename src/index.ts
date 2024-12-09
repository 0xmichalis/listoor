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
import { OpenSeaSDK, Chain, Listing } from 'opensea-js';

import { sleep } from './utils/sleep.js';

dotenv.config();

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
        openSeaClients[chain] = new OpenSeaSDK(signer, {
            apiKey: OPENSEA_API_KEY,
            chain: getChainFromChainId(chainId),
        });
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
) => {
    try {
        const tx = await seaport.createListing({
            asset: {
                tokenId,
                tokenAddress,
            },
            accountAddress: owner.address,
            startAmount: formatEther(price),
            expirationTime,
        });

        console.log(`Successfully listed ${tokenAddress}:${tokenId} at ${formatEther(price)} ETH`);
        return tx;
    } catch (error) {
        console.error(`Failed to list ${tokenAddress}:${tokenId}:\n`, error);
        return null;
    }
};

const multiAssetErrRegex = /Multiple assets with the token_id/;

const isMultiAssetError = (error: unknown): boolean =>
    error instanceof Error && !!error.message.match(multiAssetErrRegex);

const getListingForTokenId = async (
    seaport: OpenSeaSDK,
    collectionSlug: string,
    tokenId: string,
    next?: string
): Promise<Listing | undefined> => {
    const listingsResp = await seaport.api.getAllListings(collectionSlug, 100, next);
    const listing = listingsResp.listings.find((l) =>
        l.protocol_data.parameters.offer.some((o) => o.identifierOrCriteria == tokenId)
    );
    if (!listing && listingsResp.next) {
        return await getListingForTokenId(seaport, collectionSlug, tokenId, listingsResp.next);
    }
    return listing;
};

// Function to monitor a specific NFT collection
const monitorCollection = async (c: Collection) => {
    console.log(`Checking ${c.collectionSlug} (tokenId=${c.tokenId}) ...`);

    const seaport = openSeaClients[c.chain];

    let bestListing: Listing | undefined;
    try {
        bestListing = await seaport.api.getBestListing(c.collectionSlug, c.tokenId);
    } catch (error) {
        const isMultiAssetErr = isMultiAssetError(error);
        if (!isMultiAssetErr) {
            console.error(
                `Error fetching best listing for ${c.collectionSlug} (tokenId=${c.tokenId}):\n`,
                error
            );
            return;
        }
        if (isMultiAssetErr) {
            // Try to find the listing by fetching all listings
            // This can be optimized by caching responses
            bestListing = await getListingForTokenId(seaport, c.collectionSlug, c.tokenId);
            console.log(bestListing);
        }
    }

    let price: bigint;
    let expirationTime: number;

    if (!bestListing || !bestListing.protocol_data || !bestListing.protocol_data.parameters) {
        // If no best listing, create a new listing with the starting price
        price = c.defaultPrice;
        expirationTime = Math.floor(Date.now() / 1000) + 604800; // one week from now
    } else {
        const lister = getAddress(bestListing.protocol_data.parameters.offerer);
        if (lister === owner.address) {
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

        console.log(
            `Found best listing for ${c.collectionSlug} (tokenId=${c.tokenId}) at ${formatEther(bestListing.price.current.value)} ETH`
        );

        price =
            BigInt(bestListing.price.current.value) /
            BigInt(bestListing.protocol_data.parameters.offer[0].endAmount);
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
            await monitorCollection(collection);
        }
        console.log('Waiting for next poll ...');
        await sleep(POLLING_INTERVAL_SECONDS);
    }
};

main().catch(console.error);
