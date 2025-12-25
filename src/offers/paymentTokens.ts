/**
 * Payment token addresses
 */
export const ETH_PAYMENT_TOKEN = '0x0000000000000000000000000000000000000000'; // ETH address

/**
 * WETH payment token addresses by chain ID
 */
const MAINNET_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

export const WETH_PAYMENT_TOKENS: Record<number, string> = {
    1: MAINNET_WETH, // Ethereum mainnet
    10: MAINNET_WETH, // Optimism
    137: MAINNET_WETH, // Polygon
    8453: MAINNET_WETH, // Base
    42161: MAINNET_WETH, // Arbitrum
    7777777: MAINNET_WETH, // Zora
    360: '0x4200000000000000000000000000000000000006', // Shape chain
};

// Legacy constants for backward compatibility
export const WETH_PAYMENT_TOKEN_MAINNET = WETH_PAYMENT_TOKENS[1];
export const WETH_PAYMENT_TOKEN_SHAPE = WETH_PAYMENT_TOKENS[360];

/**
 * Checks if a currency is ETH or WETH
 */
export const isETHOrWETH = (currency: string): boolean => {
    const normalized = currency.toUpperCase();
    return normalized === 'ETH' || normalized === 'WETH';
};

/**
 * Gets the payment token address for a given currency
 * @param currency The currency symbol (ETH or WETH)
 * @param chainId Optional chain ID (defaults to mainnet)
 * @returns The payment token address
 */
export const getPaymentTokenAddress = (currency: string, chainId: number): string => {
    const normalized = currency.toUpperCase();

    if (normalized === 'ETH') {
        return ETH_PAYMENT_TOKEN;
    }

    if (normalized === 'WETH') {
        if (WETH_PAYMENT_TOKENS[chainId]) {
            return WETH_PAYMENT_TOKENS[chainId];
        }

        return MAINNET_WETH;
    }

    throw new Error(`Unsupported payment token: ${currency}`);
};

/**
 * Gets the currency symbol from a payment token address
 */
export const getCurrencyFromAddress = (address: string): string => {
    const normalized = address.toLowerCase();

    if (normalized === ETH_PAYMENT_TOKEN.toLowerCase()) {
        return 'ETH';
    }

    // Check if address matches any WETH token address
    if (Object.values(WETH_PAYMENT_TOKENS).some((addr) => normalized === addr.toLowerCase())) {
        return 'WETH';
    }

    return 'UNKNOWN';
};
