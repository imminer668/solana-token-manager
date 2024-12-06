import React, { useState, useEffect, useMemo } from 'react';
import {
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    Input,
    VStack,
    HStack,
    Text,
    Image,
    Box,
    Flex,
    InputGroup,
    InputLeftElement,
    Divider,
    useColorModeValue,
    Spinner,
    Center
} from '@chakra-ui/react';
import { FaSearch } from 'react-icons/fa';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
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
    const [searchTerm, setSearchTerm] = useState('');
    const [tokens, setTokens] = useState<TokenInfo[]>([]);
    const [filteredTokens, setFilteredTokens] = useState<TokenInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);

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
            setIsLoading(true);
            
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
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchUserTokens();
        }
    }, [isOpen, publicKey]);

    // 搜索过滤逻辑
    useEffect(() => {
        if (!Array.isArray(tokens)) {
            setFilteredTokens([]);
            return;
        }

        if (!searchTerm) {
            setFilteredTokens(
                excludeToken
                    ? tokens.filter(t => t.mint !== excludeToken)
                    : tokens
            );
            return;
        }

        const filtered = tokens.filter(token => {
            const searchable = `${token.symbol} ${token.name} ${token.mint}`.toLowerCase();
            return searchable.includes(searchTerm.toLowerCase());
        });

        setFilteredTokens(
            excludeToken
                ? filtered.filter(t => t.mint !== excludeToken)
                : filtered
        );
    }, [tokens, searchTerm, excludeToken]);

    // 重置搜索
    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    // 颜色模式变量
    const bgColor = useColorModeValue('white', 'gray.800');
    const borderColor = useColorModeValue('gray.200', 'gray.700');
    const searchBgColor = useColorModeValue('gray.50', 'gray.700');
    const hoverBgColor = useColorModeValue('gray.50', 'gray.700');
    const textColor = useColorModeValue('gray.800', 'white');
    const secondaryTextColor = useColorModeValue('gray.600', 'gray.400');

    return (
        <Modal isOpen={isOpen} onClose={onClose} isCentered size="md">
            <ModalOverlay backdropFilter="blur(3px)" />
            <ModalContent 
                bg={bgColor} 
                borderRadius="xl" 
                boxShadow="xl"
                overflow="hidden"
                maxH="85vh"
            >
                <ModalHeader 
                    borderBottomWidth="1px" 
                    borderColor={borderColor}
                    py={4}
                >
                    <Text fontSize="xl" fontWeight="bold" color={textColor}>
                        选择代币
                    </Text>
                </ModalHeader>
                <ModalCloseButton size="lg" top={3} right={3} />
                
                {/* 搜索框区域 */}
                <Box p={4} bg={searchBgColor}>
                    <InputGroup>
                        <InputLeftElement pointerEvents="none" color={secondaryTextColor}>
                            <FaSearch />
                        </InputLeftElement>
                        <Input
                            placeholder="搜索代币名称、符号或地址"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            borderRadius="lg"
                            fontSize="md"
                            _focus={{
                                borderColor: 'blue.400',
                                boxShadow: '0 0 0 1px var(--chakra-colors-blue-400)'
                            }}
                        />
                    </InputGroup>
                </Box>
                
                {/* 代币列表 */}
                <ModalBody p={0} maxH="400px" overflowY="auto">
                    {isLoading ? (
                        <Center py={10}>
                            <VStack spacing={4}>
                                <Spinner 
                                    size="xl" 
                                    thickness="4px"
                                    speed="0.65s"
                                    color="blue.500"
                                />
                                <Text color={secondaryTextColor}>
                                    正在加载代币...
                                </Text>
                            </VStack>
                        </Center>
                    ) : filteredTokens.length > 0 ? (
                        <VStack spacing={0} align="stretch" divider={<Divider />}>
                            {filteredTokens.map((token) => (
                                <Flex
                                    key={token.mint}
                                    py={3}
                                    px={4}
                                    align="center"
                                    justify="space-between"
                                    cursor="pointer"
                                    _hover={{ bg: hoverBgColor }}
                                    onClick={() => onSelect(token)}
                                    transition="background 0.2s"
                                >
                                    <HStack spacing={4}>
                                        {token.icon ? (
                                            <Box 
                                                boxSize="40px" 
                                                borderRadius="full" 
                                                overflow="hidden"
                                                border="1px"
                                                borderColor={borderColor}
                                            >
                                                <Image 
                                                    src={token.icon} 
                                                    alt={token.symbol}
                                                    fallbackSrc="https://via.placeholder.com/40"
                                                    boxSize="100%"
                                                    objectFit="cover"
                                                />
                                            </Box>
                                        ) : (
                                            <Flex
                                                boxSize="40px"
                                                borderRadius="full"
                                                bg={hoverBgColor}
                                                border="1px"
                                                borderColor={borderColor}
                                                justify="center"
                                                align="center"
                                                fontWeight="bold"
                                            >
                                                {token.symbol?.charAt(0) || '?'}
                                            </Flex>
                                        )}
                                        <VStack spacing={0} align="flex-start">
                                            <Text fontWeight="bold" fontSize="md" color={textColor}>
                                                {token.symbol}
                                            </Text>
                                            <Text fontSize="sm" color={secondaryTextColor}>
                                                {token.name || token.symbol}
                                            </Text>
                                            <Text fontSize="xs" color={secondaryTextColor} mt={0.5}>
                                                {token.mint.substring(0, 10)}...{token.mint.substring(token.mint.length - 10)}
                                            </Text>
                                        </VStack>
                                    </HStack>
                                    
                                    <Text fontWeight="medium" fontSize="md" color={textColor}>
                                        {token.balance !== undefined 
                                            ? Number(token.balance).toLocaleString(undefined, { maximumFractionDigits: 6 })
                                            : ''}
                                    </Text>
                                </Flex>
                            ))}
                        </VStack>
                    ) : (
                        <Box p={6} textAlign="center">
                            <Text color={secondaryTextColor}>没有找到匹配的代币</Text>
                        </Box>
                    )}
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}; 