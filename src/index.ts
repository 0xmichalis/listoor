import dotenv from 'dotenv';
import { Wallet } from 'ethers';

import { sleep } from './utils/sleep.js';
import { initializeCollections, monitorCollection } from './collections/index.js';
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

const main = async () => {
    const owner = new Wallet(PRIVATE_KEY);
    const { providers, openSeaClients } = await initializeClients(
        RPC_ENDPOINTS,
        PRIVATE_KEY,
        OPENSEA_API_KEY
    );
    const collections = initializeCollections(COLLECTION_PATH, providers);

    while (true) {
        for (const collection of collections) {
            try {
                await monitorCollection(
                    collection,
                    openSeaClients[collection.chain],
                    owner.address
                );
            } catch (err) {
                console.error(`Error monitoring collection ${collection.collectionSlug}:`, err);
            }
        }
        console.log('Waiting for next poll ...');
        await sleep(POLLING_INTERVAL_SECONDS);
    }
};

main().catch(console.error);
