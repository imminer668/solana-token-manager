import { useState, useEffect } from 'react';
import { 
    Box, 
    VStack,
    HStack, 
    Button, 
    Text,
    Image,
    Flex,
    IconButton,
    useToast,
    Input,
    NumberInput,
    NumberInputField,
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    TOKEN_PROGRAM_ID,
    getAccount,
    getMint,
} from '@solana/spl-token';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { CopyIcon, RepeatIcon } from '@chakra-ui/icons';
import { 
    Metadata, 
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID 
} from '@metaplex-foundation/mpl-token-metadata';

interface TokenMetadataJson {
    name: string;
    symbol: string;
    description: string;
    image: string;
    // 可能还有其他字段
}

interface TokenAccount {
    mint: string;
    amount: number;
    decimals: number;
    symbol?: string;
    name?: string;
    uri?: string;
    image?: string;
}

export const TokenList = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [tokens, setTokens] = useState<TokenAccount[]>([]);
    const [solBalance, setSolBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [sendAddress, setSendAddress] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const toast = useToast();

    const getMetadataAddress = (mintPubkey: PublicKey) => {
        const [metadataAddress] = PublicKey.findProgramAddressSync(
            [
                Buffer.from('metadata'),
                TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                mintPubkey.toBuffer(),
            ],
            TOKEN_METADATA_PROGRAM_ID
        );
        return metadataAddress;
    };

    const fetchMetadataJson = async (uri: string) => {
        try {
            const response = await fetch(uri);
            const json: TokenMetadataJson = await response.json();
            return json;
        } catch (error) {
            console.error("获取元数据 JSON 错误:", error);
            return null;
        }
    };

    const fetchTokens = async () => {
        if (!publicKey) return;

        try {
            setIsLoading(true);

            // 获取 SOL 余额
            const balance = await connection.getBalance(publicKey);
            setSolBalance(balance / LAMPORTS_PER_SOL);

            //得确保你的网络能访问solana的rpc，否则会报错
            // 获取所有代币账户
            const accounts = await connection.getParsedTokenAccountsByOwner(
                publicKey,
                { programId: TOKEN_PROGRAM_ID }
            );

            const tokenAccounts = await Promise.all(accounts.value.map(async account => {
                const parsedInfo = account.account.data.parsed.info;
                const mintPubkey = new PublicKey(parsedInfo.mint);
                
                // 获取元数据地址
                const metadataAddress = getMetadataAddress(mintPubkey);
                
                try {
                    // 获取元数据账户信息
                    const metadataAccount = await connection.getAccountInfo(metadataAddress);
                    let metadata;
                    let metadataJson;
                    if (metadataAccount) {
                        metadata = await Metadata.fromAccountAddress(connection, metadataAddress);
                        if (metadata.data.uri) {
                            metadataJson = await fetchMetadataJson(metadata.data.uri);
                        }
                    }

                    return {
                        mint: parsedInfo.mint,
                        amount: Number(parsedInfo.tokenAmount.amount) / Math.pow(10, parsedInfo.tokenAmount.decimals),
                        decimals: parsedInfo.tokenAmount.decimals,
                        symbol: metadata?.data.symbol || '未知代币',
                        name: metadata?.data.name || '未知名称',
                        uri: metadata?.data.uri,
                        image: metadataJson?.image,
                    };
                } catch (error) {
                    console.error("获取元数据错误:", error);
                    return {
                        mint: parsedInfo.mint,
                        amount: Number(parsedInfo.tokenAmount.amount) / Math.pow(10, parsedInfo.tokenAmount.decimals),
                        decimals: parsedInfo.tokenAmount.decimals,
                        symbol: '未知代币',
                        name: '未知名称',
                    };
                }
            }));

            setTokens(tokenAccounts);

        } catch (error) {
            console.error("获取代币列表错误:", error);
            toast({
                title: "错误",
                description: "获取代币列表失败",
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const copyAddress = (address: string) => {
        navigator.clipboard.writeText(address);
        toast({
            title: "成功",
            description: "地址已复制到剪贴板",
            status: "success",
            duration: 2000,
        });
    };

    useEffect(() => {
        fetchTokens();
    }, [publicKey]);

    return (
        <Box p={4}>
            <VStack spacing={4} align="stretch">
                <HStack justify="space-between">
                    <Text fontSize="xl">SOL余额: {solBalance.toFixed(4)} SOL</Text>
                    <Button
                        leftIcon={<RepeatIcon />}
                        onClick={fetchTokens}
                        isLoading={isLoading}
                        size="sm"
                    >
                        刷新余额
                    </Button>
                </HStack>

                <Box>
                    <Input 
                        placeholder="接收地址"
                        value={sendAddress}
                        onChange={(e) => setSendAddress(e.target.value)}
                        mb={2}
                    />
                    <NumberInput 
                        value={sendAmount}
                        onChange={(value) => setSendAmount(value)}
                        min={0}
                        mb={2}
                    >
                        <NumberInputField placeholder="发送数量" />
                    </NumberInput>
                    <Button colorScheme="blue" width="full">
                        发送 SOL
                    </Button>
                </Box>

                <Text fontSize="xl" mt={4}>代币列表</Text>
                
                {tokens.map((token) => (
                    <Box 
                        key={token.mint}
                        p={4}
                        borderWidth={1}
                        borderRadius="md"
                        _hover={{ bg: "gray.50" }}
                    >
                        <HStack justify="space-between">
                            <HStack spacing={4}>
                                {token.image && (
                                    <Box 
                                        width="40px" 
                                        height="40px" 
                                        borderRadius="full" 
                                        overflow="hidden"
                                    >
                                        <Image
                                            src={token.image}
                                            alt={token.name || "Token image"}
                                            width="100%"
                                            height="100%"
                                            objectFit="cover"
                                            fallback={
                                                <Box 
                                                    width="100%" 
                                                    height="100%" 
                                                    bg="gray.200" 
                                                    display="flex" 
                                                    alignItems="center" 
                                                    justifyContent="center"
                                                >
                                                    <Text fontSize="xs">
                                                        {token.symbol?.[0] || "?"}
                                                    </Text>
                                                </Box>
                                            }
                                        />
                                    </Box>
                                )}
                                <VStack align="start" spacing={1}>
                                    <Text fontWeight="bold">
                                        {token.name} ({token.symbol})
                                    </Text>
                                    <Text fontSize="sm" color="gray.500">
                                        余额: {token.amount}
                                    </Text>
                                    <HStack>
                                        <Text fontSize="xs" color="gray.400" isTruncated maxW="200px">
                                            {token.mint}
                                        </Text>
                                        <IconButton
                                            aria-label="Copy address"
                                            icon={<CopyIcon />}
                                            size="xs"
                                            onClick={() => copyAddress(token.mint)}
                                        />
                                    </HStack>
                                </VStack>
                            </HStack>
                            <HStack>
                                <Button size="sm" colorScheme="blue">
                                    转账
                                </Button>
                                <Button size="sm" colorScheme="green">
                                    铸币
                                </Button>
                            </HStack>
                        </HStack>
                    </Box>
                ))}
            </VStack>
        </Box>
    );
}; 