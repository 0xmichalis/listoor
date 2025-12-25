import dotenv from 'dotenv';
import { Wallet } from 'ethers';

import { sleep } from './utils/sleep.js';
import {
    initializeCollections,
    initializeOfferCollections,
    monitorCollection,
} from './collections/index.js';
import { monitorOffer, cancelOldOffers } from './offers/index.js';
import { initializeClients } from './networks/index.js';

dotenv.config();

(function () {
    const originalLog = console.log;
    console.log = (...args: any[]) => {
        const timestamp = new Date().toISOString();
        originalLog(`[${timestamp}]`, ...args);
    };
})();

const RPC_ENDPOINTS = process.env.RPC_ENDPOINTS!.split(',');
const COLLECTION_PATH = process.env.COLLECTION_PATH!;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY!;
const POLLING_INTERVAL_SECONDS = parseInt(process.env.POLLING_INTERVAL_SECONDS || '60');
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
// Default to dry-run mode for safety unless explicitly disabled
// Only disable dry-run if explicitly set to 'false' or '0'
const DRY_RUN = process.env.DRY_RUN !== 'false' && process.env.DRY_RUN !== '0';

const monitorListings = async (
    collections: ReturnType<typeof initializeCollections>,
    openSeaClients: Record<string, any>,
    owner: string,
    dryRun: boolean
) => {
    while (true) {
        for (const collection of collections) {
            try {
                await monitorCollection(
                    collection,
                    openSeaClients[collection.chain],
                    owner,
                    dryRun
                );
            } catch (err) {
                console.error(
                    `Error monitoring listing collection ${collection.collectionSlug}:`,
                    err
                );
            }
        }
        console.log('[Listings] Waiting for next poll ...');
        await sleep(POLLING_INTERVAL_SECONDS);
    }
};

const monitorOffers = async (
    offerCollections: ReturnType<typeof initializeOfferCollections>,
    openSeaClients: Record<string, any>,
    owner: string,
    dryRun: boolean
) => {
    while (true) {
        for (const offerCollection of offerCollections) {
            try {
                await monitorOffer(
                    offerCollection,
                    openSeaClients[offerCollection.chain],
                    owner,
                    dryRun
                );

                await cancelOldOffers(
                    offerCollection,
                    openSeaClients[offerCollection.chain],
                    owner,
                    dryRun
                );
            } catch (err) {
                console.error(
                    `Error monitoring offer collection ${offerCollection.collectionSlug}:`,
                    err
                );
            }
        }
        console.log('[Offers] Waiting for next poll ...');
        await sleep(POLLING_INTERVAL_SECONDS);
    }
};

const main = async () => {
    console.log(
        `Dry-run mode: ${DRY_RUN ? 'ENABLED ⚠️  (No state-changing operations will be executed)' : 'DISABLED (All operations will be executed)'}`
    );

    const owner = new Wallet(PRIVATE_KEY);
    const { providers, openSeaClients } = await initializeClients(
        RPC_ENDPOINTS,
        PRIVATE_KEY,
        OPENSEA_API_KEY
    );
    const collections = initializeCollections(COLLECTION_PATH, providers);
    const offerCollections = initializeOfferCollections(COLLECTION_PATH, providers);

    console.log('Starting listings and offers monitoring...');
    await Promise.all([
        monitorListings(collections, openSeaClients, owner.address, DRY_RUN),
        monitorOffers(offerCollections, openSeaClients, owner.address, DRY_RUN),
    ]);
};

main().catch(console.error);
