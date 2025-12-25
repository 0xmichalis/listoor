import { formatEther, getAddress } from 'ethers';
import { OpenSeaSDK } from 'opensea-js';

import { logger } from '../utils/logger.js';
import { Collection } from './types.js';
import {
    getBestListing,
    getSingleBestListing,
    createListing,
    sumOfferEndAmounts,
} from '../listings/index.js';
import { isETHOrWETH } from '../offers/paymentTokens.js';

const DEFAULT_EXPIRATION_TIME = 5 * 30 * 24 * 60 * 60; // 5 months

/**
 * Monitors a specific NFT collection and creates/updates listings as needed
 * @param c The collection configuration
 * @param seaport The OpenSea SDK instance
 * @param owner The wallet owner
 * @param dryRun If true, skip actual listing creation
 */
export const monitorCollection = async (
    c: Collection,
    seaport: OpenSeaSDK,
    owner: string,
    dryRun: boolean = false
) => {
    logger.debug(`Checking ${c.collectionSlug} (tokenId=${c.tokenId}) ...`);

    const bestListing = c.shouldCompareToRest
        ? await getBestListing(seaport, c.collectionSlug)
        : await getSingleBestListing(seaport, c.collectionSlug, c.tokenAddress, c.tokenId);

    let price: bigint;
    let expirationTime: number;

    if (!bestListing || !bestListing.protocol_data || !bestListing.protocol_data.parameters) {
        logger.debug(`Did not find a listing for ${c.collectionSlug} (tokenId=${c.tokenId}) ...`);
        // If no best listing, create a new listing with the starting price
        price = c.defaultPrice;
        expirationTime = Math.floor(Date.now() / 1000) + DEFAULT_EXPIRATION_TIME;
    } else {
        if (!isETHOrWETH(bestListing.price.current.currency)) {
            // TODO: Handle this case by converting to the price of ETH
            logger.error(
                `Best listing for ${c.collectionSlug} (tokenId=${c.tokenId}) is not in ETH or WETH (currency: ${bestListing.price.current.currency}). Skipping...`
            );
            return;
        }

        price = BigInt(bestListing.price.current.value) / sumOfferEndAmounts(bestListing);

        // TODO: Need to also compare token ids as if we have more than one token ids to be listed
        // in the collection then only one will get listed and the rest will be ignored.
        const lister = getAddress(bestListing.protocol_data.parameters.offerer);
        if (lister.toLowerCase() === owner.toLowerCase()) {
            logger.debug(
                `Already have the lowest listing for ${c.collectionSlug} (tokenId=${c.tokenId}) at price ${formatEther(price)} ETH. Skipping...`
            );
            return;
        }

        logger.debug(
            `Found best listing for ${c.collectionSlug} (tokenId=${c.tokenId}) at ${formatEther(price)} ETH`
        );

        if (price >= c.minPrice) {
            // Subtract 1000 wei from the lowest price. Any lower than 1000 wei and OpenSea will
            // complain about not getting its 250 basis points.
            const newPrice = (price / 1000n) * 1000n - 1000n;
            price = newPrice < c.defaultPrice ? newPrice : c.defaultPrice;
            expirationTime = Number(bestListing.protocol_data.parameters.endTime);
        } else {
            // Use getBestListing with offerer to check if our NFT is listed at min price
            const ourListing = await getBestListing(seaport, c.collectionSlug, c.tokenId, owner);
            const listedPrice = ourListing
                ? BigInt(ourListing.price.current.value) / sumOfferEndAmounts(ourListing)
                : 0n;
            if (
                ourListing &&
                isETHOrWETH(ourListing.price.current.currency) &&
                listedPrice <= c.minPrice
            ) {
                logger.debug(
                    `Our ${c.collectionSlug} NFT (tokenId=${c.tokenId}) is already listed at price ${formatEther(listedPrice)} ETH which is equal or lower than min price ${formatEther(c.minPrice)} ETH. Skipping...`
                );
                return;
            }
            price = c.minPrice;
            expirationTime = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours
        }
    }
    logger.debug(
        `Listing ${c.collectionSlug} (tokenId=${c.tokenId}) at ${formatEther(price)} ETH ...`
    );
    await createListing(seaport, c.tokenAddress, c.tokenId, price, expirationTime, owner, dryRun);
};
