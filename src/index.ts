import dotenv from 'dotenv';
import { Wallet } from 'ethers';

import { logger } from './utils/logger.js';
import { sleep } from './utils/sleep.js';
import {
    initializeCollections,
    initializeOfferCollections,
    monitorCollection,
} from './collections/index.js';
import { monitorOffer, cancelRedundantOffers } from './offers/index.js';
import { initializeClients } from './networks/index.js';

dotenv.config();

const RPC_ENDPOINTS = process.env.RPC_ENDPOINTS!.split(',');
const COLLECTION_PATH = process.env.COLLECTION_PATH!;
const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY!;
const LISTINGS_POLLING_INTERVAL_SECONDS = parseInt(
    process.env.LISTINGS_POLLING_INTERVAL_SECONDS || '60'
);
const OFFERS_POLLING_INTERVAL_SECONDS = parseInt(
    process.env.OFFERS_POLLING_INTERVAL_SECONDS || '60'
);
const REDUNDANT_OFFERS_POLLING_INTERVAL_SECONDS = parseInt(
    process.env.REDUNDANT_OFFERS_POLLING_INTERVAL_SECONDS || '60'
);
const PRIVATE_KEY = process.env.PRIVATE_KEY!;
// Default to dry-run mode for safety unless explicitly disabled
// Only disable dry-run if explicitly set to 'false' or '0'
const DRY_RUN = process.env.DRY_RUN !== 'false' && process.env.DRY_RUN !== '0';
// Disable offer cancellation by default, enable only if explicitly set to 'true' or '1'
const ENABLE_OFFER_CANCELLATION =
    process.env.ENABLE_OFFER_CANCELLATION === 'true' ||
    process.env.ENABLE_OFFER_CANCELLATION === '1';

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
                logger.error(
                    `Error monitoring listing collection ${collection.collectionSlug}:`,
                    err
                );
            }
        }
        logger.debug('[Listings] Waiting for next poll ...');
        await sleep(LISTINGS_POLLING_INTERVAL_SECONDS);
    }
};

const monitorOffers = async (
    offerCollections: ReturnType<typeof initializeOfferCollections>,
    openSeaClients: Record<string, any>,
    chainIds: Record<string, number>,
    owner: string,
    dryRun: boolean
) => {
    while (true) {
        for (const offerCollection of offerCollections) {
            try {
                await monitorOffer(
                    offerCollection,
                    openSeaClients[offerCollection.chain],
                    chainIds[offerCollection.chain],
                    owner,
                    dryRun
                );
            } catch (err) {
                logger.error(
                    `Error monitoring offer collection ${offerCollection.collectionSlug}:`,
                    err
                );
            }
        }
        logger.debug('[Offers] Waiting for next poll ...');
        await sleep(OFFERS_POLLING_INTERVAL_SECONDS);
    }
};

const cancelStaleOffers = async (
    offerCollections: ReturnType<typeof initializeOfferCollections>,
    openSeaClients: Record<string, any>,
    owner: string,
    dryRun: boolean
) => {
    while (true) {
        try {
            await cancelRedundantOffers(offerCollections, openSeaClients, owner, dryRun);
        } catch (err) {
            logger.error('Error canceling old offers:', err);
        }
        logger.debug('[Offer Cancellation] Waiting for next poll ...');
        await sleep(REDUNDANT_OFFERS_POLLING_INTERVAL_SECONDS);
    }
};

const main = async () => {
    logger.info(
        `Dry-run mode: ${DRY_RUN ? 'ENABLED ⚠️  (No state-changing operations will be executed)' : 'DISABLED (All operations will be executed)'}`
    );
    logger.info(`Offer cancellation: ${ENABLE_OFFER_CANCELLATION ? 'ENABLED' : 'DISABLED'}`);

    const owner = new Wallet(PRIVATE_KEY);
    const { providers, openSeaClients, chainIds } = await initializeClients(
        RPC_ENDPOINTS,
        PRIVATE_KEY,
        OPENSEA_API_KEY
    );
    const collections = initializeCollections(COLLECTION_PATH, providers);
    const offerCollections = initializeOfferCollections(COLLECTION_PATH, providers);

    const tasks = [
        monitorListings(collections, openSeaClients, owner.address, DRY_RUN),
        monitorOffers(offerCollections, openSeaClients, chainIds, owner.address, DRY_RUN),
    ];

    if (ENABLE_OFFER_CANCELLATION) {
        tasks.push(cancelStaleOffers(offerCollections, openSeaClients, owner.address, DRY_RUN));
    }

    await Promise.all(tasks);
};

main().catch((error) => {
    logger.error('Fatal error:', error);
    process.exit(1);
});
