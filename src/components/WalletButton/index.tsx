import dynamic from 'next/dynamic';
import { useWallet } from '@solana/wallet-adapter-react';
import { Button } from '@chakra-ui/react';

const WalletMultiButton = dynamic(
    async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
    { ssr: false }
);

export const WalletButton = () => {
    const { connected, disconnect } = useWallet();

    return (
        <div className="wallet-button">
            {connected ? (
                <Button 
                    colorScheme="red" 
                    onClick={disconnect}
                    size="md"
                >
                    断开连接
                </Button>
            ) : (
                <WalletMultiButton />
            )}
        </div>
    );
}; 