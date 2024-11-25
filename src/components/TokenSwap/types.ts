import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

export interface TokenInfo {
    mint: string;
    symbol: string;
    name?: string;
    icon?: string;
    balance?: number;
    decimals: number;
    isNative?: boolean;
}

export interface LiquidityPoolData {
    poolKeys: {
        id: PublicKey;
        baseMint: PublicKey;
        quoteMint: PublicKey;
        lpMint: PublicKey;
        baseVault: PublicKey;
        quoteVault: PublicKey;
        marketId: PublicKey;
        marketProgramId: PublicKey;
        targetOrders: PublicKey;
        withdrawQueue: PublicKey;
        lpVault: PublicKey;
        owner: PublicKey;
    };
    poolInfo: {
        baseDecimals: BN;
        quoteDecimals: BN;
        lpDecimals: BN;
        baseReserve: BN;
        quoteReserve: BN;
        lpSupply: BN;
        startTime: BN;
    };
} 