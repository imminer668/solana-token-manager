import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

let cachedKeypair: Keypair | null = null;

export const getMintAuthority = (): Keypair => {
    if (cachedKeypair) {
        return cachedKeypair;
    }

    // 从环境变量获取私钥
    const privateKeyString = process.env.NEXT_PUBLIC_MINT_AUTHORITY_PRIVATE_KEY;
    if (!privateKeyString) {
        throw new Error('请在环境变量中设置 NEXT_PUBLIC_MINT_AUTHORITY_PRIVATE_KEY');
    }

    try {
        // 解码 base58 格式的私钥
        const privateKeyBytes = new Uint8Array(JSON.parse(privateKeyString));
        cachedKeypair = Keypair.fromSecretKey(privateKeyBytes);
        return cachedKeypair;
    } catch (error) {
        console.error('私钥格式错误:', error);
        throw new Error('私钥格式错误');
    }
}; 