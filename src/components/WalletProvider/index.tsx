import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// 默认样式
require('@solana/wallet-adapter-react-ui/styles.css');

// 使用 dynamic import 禁用 SSR
const WalletConnectionProvider = dynamic(
    () => Promise.resolve(({ children }: { children: React.ReactNode }) => {
        const network = WalletAdapterNetwork.Devnet;
        const endpoint = useMemo(() => clusterApiUrl(network), [network]);
        
        const wallets = useMemo(
            () => [
                new PhantomWalletAdapter(),
            ],
            []
        );

        return (
            <ConnectionProvider endpoint={endpoint}>
                <WalletProvider wallets={wallets} autoConnect>
                    <WalletModalProvider>{children}</WalletModalProvider>
                </WalletProvider>
            </ConnectionProvider>
        );
    }),
    {
        ssr: false
    }
);

export const WalletContextProvider = ({ children }: { children: React.ReactNode }) => {
    return <WalletConnectionProvider>{children}</WalletConnectionProvider>;
}; 