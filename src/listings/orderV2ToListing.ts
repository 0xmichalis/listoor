import { Listing, OrderV2 } from 'opensea-js';

/**
 * Converts an OrderV2 to a Listing type.
 * @param orderV2 The OrderV2 object to convert
 * @param chain The chain the order exists on
 * @returns A Listing object
 */
export function orderV2ToListing(orderV2: OrderV2, chain: string): Listing {
    // Extract currency information from the order
    const currency = getOrderCurrency(orderV2);

    return {
        order_hash: orderV2.orderHash || '',
        chain,
        protocol_data: orderV2.protocolData,
        protocol_address: orderV2.protocolAddress,
        price: {
            currency: currency.symbol,
            decimals: currency.decimals,
            value: orderV2.currentPrice.toString(),
        },
        type: orderV2.orderType,
    };
}

/**
 * Extracts currency information from an OrderV2 by parsing the Seaport protocol data.
 * @param orderV2 The OrderV2 object to extract currency from
 * @returns An object containing currency information including address, symbol, and decimals
 */
function getOrderCurrency(orderV2: OrderV2): {
    address: string;
    symbol: string;
    decimals: number;
} {
    // For Seaport orders, the currency is in the consideration items
    const seaportOrder = orderV2.protocolData as any;

    if (!seaportOrder || !seaportOrder.parameters || !seaportOrder.parameters.consideration) {
        throw new Error('Invalid Seaport order structure');
    }

    // Find currency items in consideration (items that are not NFTs)
    const currencyItems = seaportOrder.parameters.consideration.filter((item: any) => {
        // Currency items typically have itemType 0 (ETH) or 1 (ERC20)
        return item.itemType === 0 || item.itemType === 1;
    });

    if (currencyItems.length === 0) {
        throw new Error('No currency items found in order');
    }

    // Get the first currency item (there might be multiple for fees)
    const currencyItem = currencyItems[0];

    let address: string;
    let symbol: string;
    let decimals: number;

    if (currencyItem.itemType === 0) {
        // ETH
        address = '0x0000000000000000000000000000000000000000';
        symbol = 'ETH';
        decimals = 18;
    } else if (currencyItem.itemType === 1) {
        // ERC20 token
        address = currencyItem.token;
        // Use helper functions to get symbol and decimals
        symbol = getCurrencySymbol(address); // Default to Mainnet, could be enhanced
        decimals = getCurrencyDecimals(address);
    } else {
        throw new Error(`Unsupported currency item type: ${currencyItem.itemType}`);
    }

    return { address, symbol, decimals };
}

/**
 * Gets the currency symbol for a given token address.
 *  TODO: Support chain-specific token symbols
 * @param address The token address
 * @returns The currency symbol
 */
function getCurrencySymbol(address: string): string {
    const normalizedAddress = address.toLowerCase();

    // Common token addresses
    const tokenSymbols: Record<string, string> = {
        '0x0000000000000000000000000000000000000000': 'ETH',
    };

    return tokenSymbols[normalizedAddress] || 'UNKNOWN';
}

/**
 * Gets the currency decimals for a given token address.
 * This is a simplified mapping - in a real implementation, you might want to query the token contract.
 * @param address The token address
 * @returns The number of decimals (defaults to 18 for most tokens)
 */
function getCurrencyDecimals(address: string): number {
    const normalizedAddress = address.toLowerCase();

    // Most ERC20 tokens use 18 decimals, but some use different values
    // eg. USDC has 6 decimals
    const tokenDecimals: Record<string, number> = {
        '0x0000000000000000000000000000000000000000': 18, // ETH
        // Add other tokens with non-standard decimals here if needed
    };

    return tokenDecimals[normalizedAddress] || 18;
}
