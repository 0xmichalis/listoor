import dotenv from 'dotenv';
import {
    ethers,
    Network,
    JsonRpcProvider,
    formatUnits,
    parseEther,
    Wallet,
    formatEther,
    getAddress,
} from 'ethers';
import { OpenSeaSDK, Chain, Listing } from 'opensea-js';

import { sleep } from './utils/sleep.js';

dotenv.config();

const RPC_ENDPOINTS = process.env.RPC_ENDPOINTS!.split(',');
const COLLECTIONS = process.env.COLLECTIONS!.split(',');
const LISTING_TIME_DELAY_SECONDS = parseInt(process.env.LISTING_TIME_DELAY_SECONDS || '0');
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY!;
const POLLING_INTERVAL_SECONDS = parseInt(process.env.POLLING_INTERVAL_SECONDS || '60');
const PRIVATE_KEY = process.env.PRIVATE_KEY!;

// Cached stuff
const owner: Wallet = new ethers.Wallet(PRIVATE_KEY);
const providers: Record<string, JsonRpcProvider> = {};
const openSeaClients: Record<string, OpenSeaSDK> = {};
type Collection = {
    chain: string;
    slug: string;
    tokenAddress: string;
    tokenId: string;
    defaultPrice: BigInt;
    minPrice: BigInt;
};
const collections: Collection[] = [];

const getChainFromChainId = (chainId: number): Chain => {
    switch (chainId) {
        case 1:
            return Chain.Mainnet;
        case 8453:
            return Chain.Base;
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
        openSeaClients[chain] = new OpenSeaSDK(provider, {
            apiKey: OPENSEA_API_KEY,
            chain: getChainFromChainId(chainId),
        });
    }
};

const initializeCollections = () => {
    for (const collection of COLLECTIONS) {
        const [chain, slug, tokenAddress, tokenId, defaultPriceETH, minPriceETH] =
            collection.split('::');

        // Validate against providers
        if (!providers[chain]) {
            throw new Error(
                `No RPC provider configured for chain ${chain} (needed by ${tokenAddress}:${tokenId}). Did you run initializeClients()?`
            );
        }

        // Validate prices
        const defaultPrice = parseEther(defaultPriceETH);
        if (defaultPrice <= 0) {
            throw new Error(
                `Invalid default price for collection ${tokenAddress}:${tokenId}: ${defaultPriceETH}`
            );
        }
        const minPrice = parseEther(minPriceETH);
        if (minPrice <= 0) {
            throw new Error(
                `Invalid min price for collection ${tokenAddress}:${tokenId}: ${minPriceETH}`
            );
        }
        if (defaultPrice < minPrice) {
            throw new Error(
                `Min price must be less than or equal to default price for collection ${tokenAddress}:${tokenId}`
            );
        }

        collections.push({ chain, slug, tokenAddress, tokenId, defaultPrice, minPrice });
    }
};

const listNFT = async (
    seaport: OpenSeaSDK,
    tokenAddress: string,
    tokenId: string,
    price: BigInt,
    expirationTime: number
) => {
    console.log(
        `Listing NFT ${tokenId} from tokenAddress ${tokenAddress} at price ${formatEther(price.toString())} ETH`
    );
    try {
        const tx = await seaport.createListing({
            asset: {
                tokenId,
                tokenAddress,
            },
            accountAddress: owner.address,
            startAmount: formatUnits(price.toString(), 'wei'),
            expirationTime,
        });

        console.log(
            `Successfully listed NFT ${tokenId} from tokenAddress ${tokenAddress} at price ${formatEther(price.toString())} ETH`
        );
        return tx;
    } catch (error) {
        console.error(`Error listing NFT ${tokenId} from tokenAddress ${tokenAddress}:\n`, error);
        return null;
    }
};

// Function to monitor a specific NFT collection
const monitorCollection = async (c: Collection) => {
    const seaport = openSeaClients[c.chain];

    const bestListing = await seaport.api
        .getBestListing(c.slug, c.tokenId)
        .catch((error: Error) => {
            console.error(
                `Error fetching best listing for token ID ${c.tokenId} for collection ${c.slug}:`,
                error
            );
            return;
        });

    let price: bigint;
    let expirationTime: number;

    if (!bestListing) {
        // If no best listing, create a new listing with the starting price
        price = parseEther(c.defaultPrice.toString());
        expirationTime = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
    } else {
        const lister = getAddress(bestListing.protocol_data.parameters.offerer);
        if (lister === getAddress(owner.address)) {
            console.log(
                `Already have the lowest listing for ${c.slug} (tokenId=${c.tokenId}). Skipping...`
            );
            return;
        }

        if (bestListing.price.current.currency !== 'ETH') {
            // TODO: Handle this case by converting to the price of ETH
            console.error(
                `Best listing for ${c.slug} (tokenId=${c.tokenId}) is not in ETH. Skipping...`
            );
            return;
        }

        price = BigInt(bestListing.price.current.value);
        if (price < parseEther(c.minPrice.toString())) {
            console.log(
                `Best listing for ${c.slug} (tokenId=${c.tokenId}) is already below the min price. Skipping...`
            );
            return;
        };

        // Subtract 1 wei from the lowest price
        price = price - 1n;
        expirationTime = Number(bestListing.protocol_data.parameters.endTime);

        await maybeDelayListing(bestListing);
    }
    await listNFT(seaport, c.tokenAddress, c.tokenId, price, expirationTime);
};

const maybeDelayListing = async (bestListing: Listing) => {
    if (LISTING_TIME_DELAY_SECONDS <= 0) {
        return;
    };

    const listingTime = Number(bestListing.protocol_data.parameters.startTime);
    const delay = Math.min(LISTING_TIME_DELAY_SECONDS, Date.now() / 1000 - listingTime);

    const offer = bestListing.protocol_data.parameters.offer[0];
    console.log(`Waiting ${delay} seconds before listing ${offer.token}:${offer.itemType}...`);
    await sleep(delay);
};

// Main function to run the bot
const main = async () => {
    await initializeClients();
    initializeCollections();

    while (true) {
        for (const collection of collections) {
            await monitorCollection(collection);
        }
        await sleep(POLLING_INTERVAL_SECONDS);
    }
};

main().catch(console.error);
