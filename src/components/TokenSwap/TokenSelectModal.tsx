import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalBody,
    ModalCloseButton,
    Input,
    VStack,
    HStack,
    Text,
    Image,
    Button,
    Box,
    useToast,
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    getAccount,
} from '@solana/spl-token';
import { TokenInfo } from './types';
import { 
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    Metadata
} from '@metaplex-foundation/mpl-token-metadata';

interface TokenSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (token: TokenInfo) => void;
    excludeToken?: string; // 排除已选择的代币
}

export const TokenSelectModal: React.FC<TokenSelectModalProps> = ({
    isOpen,
    onClose,
    onSelect,
    excludeToken,
}) => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const toast = useToast();
    const [searchText, setSearchText] = useState('');
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [loading, setLoading] = useState(false);

    // SOL 代币配置
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    const SOL_TOKEN: TokenInfo = {
        mint: WSOL_MINT,
        symbol: 'SOL',
        decimals: 9,
        isNative: true,
    };

    // 获取元数据地址
    const getMetadataAddress = (mint: PublicKey): PublicKey => {
        const [metadataAddress] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID
        );
        return metadataAddress;
    };

    // 获取代币元数据
    const fetchTokenMetadata = async (mintAddress: string) => {
        try {
            const mintPubkey = new PublicKey(mintAddress);
            const metadataAddress = getMetadataAddress(mintPubkey);
            const metadataAccount = await connection.getAccountInfo(metadataAddress);
            
            if (metadataAccount) {
                const metadata = Metadata.deserialize(metadataAccount.data)[0];
                
                // 获取 URI 中的图标信息
                let icon: string | undefined;
                try {
                    let uri = metadata.data.uri;
                    if (uri.startsWith('ipfs://')) {
                        uri = `https://ipfs.io/ipfs/${uri.slice(7)}`;
                    } else if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
                        //console.error('Invalid URI format');
                        return;
                    }
                    const response = await fetch(uri);
                    const json = await response.json();
                    icon = json.image;
                } catch (error) {
                    console.error('获取代币图标失败:', error);
                }

                return {
                    symbol: metadata.data.symbol,
                    name: metadata.data.name,
                    icon,
                };
            }
        } catch (error) {
            console.error('获取代币元数据失败:', error);
        }
        return null;
    };

    // 获取用户的代币列表
    const fetchUserTokens = async () => {
        if (!publicKey) return;

        try {
            setLoading(true);

            // 获取 SOL 余额
            const solBalance = await connection.getBalance(publicKey);

            // 获取其他代币
            const accounts = await connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID }
            );

            const tokenList = await Promise.all(
                accounts.value
                    .filter(({ account }) => {
                        const mint = account.data.parsed.info.mint;
                        return mint !== excludeToken && 
                               mint !== WSOL_MINT && 
                               Number(account.data.parsed.info.tokenAmount.amount) > 0;
                    })
                    .map(async ({ account }) => {
                        const mintAddress = account.data.parsed.info.mint;
                        const { amount, decimals } = account.data.parsed.info.tokenAmount;
                        
                        // 获取代币元数据
                        const metadata = await fetchTokenMetadata(mintAddress);
                        
                        return {
                            mint: mintAddress,
                            symbol: metadata?.symbol || mintAddress.slice(0, 6) + '...',
                            name: metadata?.name,
                            icon: metadata?.icon,
                            balance: Number(amount) / Math.pow(10, decimals),
                            decimals: decimals // 使用代币实际的精度
                        } as TokenInfo;
                    })
            );

            // 将 SOL 添加到列表开头
            setTokens([
                {
                    ...SOL_TOKEN,
                    balance: solBalance
                },
                ...tokenList.filter((token): token is TokenInfo => token !== null)
            ]);
        } catch (error) {
            console.error('获取代币列表失败:', error);
            toast({
                title: "错误",
                description: "获取代币列表失败",
                status: "error",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchUserTokens();
        }
    }, [isOpen, publicKey]);

    // 过滤代币
    const filteredTokens = tokens.filter(token => 
        token.symbol.toLowerCase().includes(searchText.toLowerCase()) ||
        token.mint.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered>
            <ModalOverlay />
            <ModalContent>
                <ModalHeader>选择代币</ModalHeader>
                <ModalCloseButton />
                <ModalBody pb={6}>
                    <VStack spacing={4}>
                        <Input
                            placeholder="搜索代币名称、符号或地址"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />

                        <VStack spacing={2} align="stretch" maxH="300px" overflowY="auto">
                            {loading ? (
                                <Text textAlign="center" color="gray.500">
                                    加载中...
                                </Text>
                            ) : filteredTokens.length === 0 ? (
                                <Text textAlign="center" color="gray.500">
                                    未找到代币
                                </Text>
                            ) : (
                                filteredTokens.map((token) => (
                                    <Button
                                        key={token.mint}
                                        variant="ghost"
                                        onClick={() => {
                                            onSelect(token);
                                            onClose();
                                        }}
                                        py={6}
                                    >
                                        <HStack w="full" justify="space-between">
                                            <HStack>
                                                {token.icon ? (
                                                    <Image
                                                        src={token.icon}
                                                        boxSize="24px"
                                                        borderRadius="full"
                                                        fallback={<Box boxSize="24px" bg="gray.200" borderRadius="full" />}
                                                    />
                                                ) : (
                                                    <Box boxSize="24px" bg="gray.200" borderRadius="full" />
                                                )}
                                                <VStack align="start" spacing={0}>
                                                    <Text>{token.symbol}</Text>
                                                    <Text fontSize="xs" color="gray.500">
                                                        {token.mint.slice(0, 8)}...
                                                    </Text>
                                                </VStack>
                                            </HStack>
                                            <Text>{token.balance}</Text>
                                        </HStack>
                                    </Button>
                                ))
                            )}
                        </VStack>
                    </VStack>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}; 