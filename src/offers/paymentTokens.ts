/**
 * Payment token addresses
 */
export const ETH_PAYMENT_TOKEN = '0x0000000000000000000000000000000000000000'; // ETH address
export const WETH_PAYMENT_TOKEN_MAINNET = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH on Ethereum mainnet
export const WETH_PAYMENT_TOKEN_SEPOLIA = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14'; // WETH on Sepolia

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
export const getPaymentTokenAddress = (currency: string, chainId?: number): string => {
    const normalized = currency.toUpperCase();

    if (normalized === 'ETH') {
        return ETH_PAYMENT_TOKEN;
    }

    if (normalized === 'WETH') {
        // Default to mainnet WETH, but could be extended for other chains
        // For now, assuming mainnet (chainId 1) or undefined means mainnet
        if (chainId === 11155111) {
            // Sepolia testnet
            return WETH_PAYMENT_TOKEN_SEPOLIA;
        }
        return WETH_PAYMENT_TOKEN_MAINNET;
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

    if (
        normalized === WETH_PAYMENT_TOKEN_MAINNET.toLowerCase() ||
        normalized === WETH_PAYMENT_TOKEN_SEPOLIA.toLowerCase()
    ) {
        return 'WETH';
    }

    return 'UNKNOWN';
};
