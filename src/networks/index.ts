import { ethers, Network, JsonRpcProvider, Wallet } from 'ethers';
import { OpenSeaSDK, Chain } from 'opensea-js';

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
        case 360:
            return Chain.Shape;
        case 10:
            return Chain.Optimism;
        default:
            throw new Error(`Unsupported chain ID: ${chainId}`);
    }
};

export const initializeClients = async (
    rpcEndpoints: string[],
    privateKey: string,
    openSeaApiKey: string
) => {
    const providers: Record<string, JsonRpcProvider> = {};
    const openSeaClients: Record<string, OpenSeaSDK> = {};

    for (const rpcEndpoint of rpcEndpoints) {
        const [chain, url] = rpcEndpoint.split('::');

        console.log(`Initializing clients for chain ${chain} ...`);
        const provider = new JsonRpcProvider(url, undefined, {
            staticNetwork: true,
        });

        console.log(`Fetching chain ID for ${chain} ...`);
        const chainId = await provider
            .getNetwork()
            .then((network: Network) => Number(network.chainId));
        console.log(`Chain ID for ${chain}: ${chainId}`);

        // Cache providers and OpenSeaSDK instances
        providers[chain] = provider;
        const signer: Wallet = new ethers.Wallet(privateKey, provider);
        console.log(`${chain} RPC provider initialized.`);

        openSeaClients[chain] = new OpenSeaSDK(signer, {
            apiKey: openSeaApiKey,
            chain: getChainFromChainId(chainId),
        });
        console.log(`${chain} OpenSea client initialized.`);
    }

    return { providers, openSeaClients };
};
