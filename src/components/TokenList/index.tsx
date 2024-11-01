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
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    Spinner,
    Alert,
    AlertIcon,
    AlertTitle,
    AlertDescription,
    Center,
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    TOKEN_PROGRAM_ID,
    getAccount,
    getMint,
} from '@solana/spl-token';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { CopyIcon, RepeatIcon, SettingsIcon } from '@chakra-ui/icons';
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
    mintAuthority?: string;
    freezeAuthority?: string;
}

interface TokenListProps {
    setMintAddress: (value: string) => void;
    setName: (value: string) => void;
    setSymbol: (value: string) => void;
    setUri: (value: string) => void;
    setMetadataTabIndex: (value: number) => void;
    setMintTokenAddress: (value: string) => void;
}

export const TokenList = ({
    setMintAddress,
    setName,
    setSymbol,
    setUri,
    setMetadataTabIndex,
    setMintTokenAddress
}: TokenListProps) => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
    const [tokens, setTokens] = useState<TokenAccount[]>([]);
    const [solBalance, setSolBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [sendAddress, setSendAddress] = useState('');
    const [sendAmount, setSendAmount] = useState('');
    const toast = useToast();
    const [managedTokens, setManagedTokens] = useState<TokenAccount[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isTimedOut, setIsTimedOut] = useState(false);
    const FETCH_TIMEOUT = 30000; // 30 秒超时

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
            setError(null);
            setIsTimedOut(false);

            // 添加超时处理
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('获取代币列表超时，请检查网络连接后重试'));
                }, FETCH_TIMEOUT);
            });

            // 原有的获取代币逻辑
            const fetchPromise = (async () => {
                const balance = await connection.getBalance(publicKey);
                setSolBalance(balance / LAMPORTS_PER_SOL);

                const accounts = await connection.getParsedTokenAccountsByOwner(
                    publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );

                const tokenAccounts = await Promise.all(accounts.value.map(async account => {
                    const parsedInfo = account.account.data.parsed.info;
                    const mintPubkey = new PublicKey(parsedInfo.mint);
                    
                    // 获取代币铸造账户信息
                    const mintInfo = await getMint(connection, mintPubkey);
                    
                    // 获取元数据地址
                    const metadataAddress = getMetadataAddress(mintPubkey);
                    
                    try {
                        // 获取元数据账户信息
                        const metadataAccount = await connection.getAccountInfo(metadataAddress);
                        let metadata;
                        let metadataJson;
                        if (metadataAccount) {
                            metadata = await Metadata.fromAccountAddress(connection, metadataAddress);
                            if (metadata.data.uri && metadata.data.uri.trim() !== '' && metadata.data.uri.match(/^(https?:\/\/|ipfs:\/\/)/)) {
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
                            mintAuthority: mintInfo.mintAuthority?.toBase58(),
                            freezeAuthority: mintInfo.freezeAuthority?.toBase58(),
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
                
                // 过滤出当前用户有权限管理的代币
                const managed = tokenAccounts.filter(token => 
                    (token.mintAuthority === publicKey.toBase58() || 
                    token.freezeAuthority === publicKey.toBase58())
                );
                setManagedTokens(managed);

            })();

            // 使用 Promise.race 实现超时控制
            await Promise.race([fetchPromise, timeoutPromise]);

        } catch (error) {
            console.error("获取代币列表错误:", error);
            setError((error as Error).message);
            if ((error as Error).message.includes('超时')) {
                setIsTimedOut(true);
            }
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

    const TokenCard = ({ token }: { token: TokenAccount }) => {
        const hasMetadataAuthority = token.mintAuthority === publicKey?.toBase58();

        return (
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
                            <HStack spacing={1}>
                                {token.mintAuthority === publicKey?.toBase58() && (
                                    <Text fontSize="xs" color="green.500">
                                        铸币权限
                                    </Text>
                                )}
                                {token.freezeAuthority === publicKey?.toBase58() && (
                                    <Text fontSize="xs" color="blue.500">
                                        冻结权限
                                    </Text>
                                )}
                            </HStack>
                        </VStack>
                    </HStack>
                    <VStack align="end" spacing={2}>
                        <HStack>
                            <Button size="sm" colorScheme="blue">
                                转账
                            </Button>
                            {token.mintAuthority === publicKey?.toBase58() && (
                                <Button 
                                    size="sm" 
                                    colorScheme="green"
                                    onClick={() => {
                                        // 设置铸币地址
                                        setMintTokenAddress(token.mint);
                                        
                                        // 跳转到铸币标签页
                                        const tabIndex = 3; // 铸币是第四个标签
                                        const tabs = document.querySelectorAll('[role="tab"]');
                                        if (tabs[tabIndex]) {
                                            (tabs[tabIndex] as HTMLElement).click();
                                        }
                                    }}
                                >
                                    铸币
                                </Button>
                            )}
                            {token.freezeAuthority === publicKey?.toBase58() && (
                                <Button 
                                    size="sm" 
                                    colorScheme="purple"
                                    variant="outline"
                                >
                                    冻结
                                </Button>
                            )}
                        </HStack>
                        {hasMetadataAuthority && (
                            <Button 
                                size="sm" 
                                colorScheme="teal"
                                variant="ghost"
                                width="full"
                                leftIcon={<SettingsIcon />}
                                onClick={() => {
                                    // 自动填充代币地址
                                    setMintAddress(token.mint);
                                    setName(token.name && token.name !== '未知名称' ? token.name : '');
                                    setSymbol(token.symbol && token.symbol !== '未知代币' ? token.symbol : '');
                                    setUri(token.uri || '');
                                    
                                    // 根据条件设置标签页
                                    setMetadataTabIndex(token.name && token.name !== '未知名称' ? 1 : 0);
                                    console.log(token.name && token.name !== '未知名称' ? 1 : 0);
                                    
                                    // 跳转到设置元数据标签页
                                    const tabIndex = 2; // 设置元数据是第三个标签
                                    const tabs = document.querySelectorAll('[role="tab"]');
                                    if (tabs[tabIndex]) {
                                        (tabs[tabIndex] as HTMLElement).click();
                                    }
                                }}
                            >
                                设置元数据
                            </Button>
                        )}
                    </VStack>
                </HStack>
            </Box>
        );
    };

    const LoadingOrErrorView = () => {
        if (isLoading) {
            return (
                <Center p={8}>
                    <VStack spacing={4}>
                        <Spinner 
                            thickness="4px"
                            speed="0.65s"
                            emptyColor="gray.200"
                            color="blue.500"
                            size="xl"
                        />
                        <Text color="gray.500">正在加载代币列表...</Text>
                    </VStack>
                </Center>
            );
        }

        if (error) {
            return (
                <Alert
                    status="error"
                    variant="subtle"
                    flexDirection="column"
                    alignItems="center"
                    justifyContent="center"
                    textAlign="center"
                    height="200px"
                    borderRadius="md"
                >
                    <AlertIcon boxSize="40px" mr={0} />
                    <AlertTitle mt={4} mb={1} fontSize="lg">
                        {isTimedOut ? '加载超时' : '加载失败'}
                    </AlertTitle>
                    <AlertDescription maxWidth="sm">
                        {error}
                    </AlertDescription>
                    <Button
                        onClick={fetchTokens}
                        mt={4}
                        colorScheme="blue"
                        leftIcon={<RepeatIcon />}
                    >
                        重试
                    </Button>
                </Alert>
            );
        }

        return null;
    };

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

                <Tabs>
                    <TabList>
                        <Tab>所有代币</Tab>
                        <Tab>我管理的代币</Tab>
                    </TabList>

                    <TabPanels>
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                {isLoading || error ? (
                                    <LoadingOrErrorView />
                                ) : tokens.length > 0 ? (
                                    tokens.map((token) => (
                                        <TokenCard key={token.mint} token={token} />
                                    ))
                                ) : (
                                    <Alert status="info" borderRadius="md">
                                        <AlertIcon />
                                        <AlertTitle>暂无代币</AlertTitle>
                                        <AlertDescription>
                                            您的钱包中还没有任何代币
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </VStack>
                        </TabPanel>
                        <TabPanel>
                            <VStack spacing={4} align="stretch">
                                {isLoading || error ? (
                                    <LoadingOrErrorView />
                                ) : managedTokens.length > 0 ? (
                                    managedTokens.map((token) => (
                                        <TokenCard key={token.mint} token={token} />
                                    ))
                                ) : (
                                    <Alert status="info" borderRadius="md">
                                        <AlertIcon />
                                        <AlertTitle>暂无管理权限</AlertTitle>
                                        <AlertDescription>
                                            没有找到您有权限管理的代币
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </VStack>
                        </TabPanel>
                    </TabPanels>
                </Tabs>
            </VStack>
        </Box>
    );
}; 