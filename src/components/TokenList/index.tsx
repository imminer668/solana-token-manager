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
    FormControl,
    FormLabel,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    UnorderedList,
    ListItem,
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    TOKEN_PROGRAM_ID,
    getAccount,
    getMint,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    createSetAuthorityInstruction,
    AuthorityType,
} from '@solana/spl-token';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { CopyIcon, RepeatIcon, SettingsIcon } from '@chakra-ui/icons';
import { 
    Metadata, 
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID 
} from '@metaplex-foundation/mpl-token-metadata';
import React from 'react';

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
    metadataUpdateAuthority?: string;
}

interface TokenListProps {
    setMintAddress: (value: string) => void;
    setName: (value: string) => void;
    setSymbol: (value: string) => void;
    setUri: (value: string) => void;
    setMetadataTabIndex: (value: number) => void;
    setMintTokenAddress: (value: string) => void;
}

// 将 TransferModal 抽离为独立组件
const TransferModal = React.memo(({ 
    isOpen,
    onClose,
    selectedToken,
    sendAddress,
    sendAmount,
    setSendAddress,
    setSendAmount,
    isTransferring,
    handleTransferToken
}: {
    isOpen: boolean;
    onClose: () => void;
    selectedToken: TokenAccount | null;
    sendAddress: string;
    sendAmount: string;
    setSendAddress: (value: string) => void;
    setSendAmount: (value: string) => void;
    isTransferring: boolean;
    handleTransferToken: (token: TokenAccount, recipientAddress: string, amount: string) => Promise<void>;
}) => (
    <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
            <ModalHeader>
                转账 {selectedToken?.symbol}
            </ModalHeader>
            <ModalCloseButton />
            <ModalBody>
                <VStack spacing={4}>
                    <FormControl isRequired>
                        <FormLabel>接收地址</FormLabel>
                        <Input 
                            value={sendAddress}
                            onChange={(e) => setSendAddress(e.target.value)}
                            placeholder="输入接收钱包地址"
                        />
                    </FormControl>
                    <FormControl isRequired>
                        <FormLabel>发送数量</FormLabel>
                        <Input
                            type="number"
                            value={sendAmount}
                            onChange={(e) => {
                                const value = e.target.value;
                                if (value === '' || /^\d*\.?\d*$/.test(value)) {
                                    if (selectedToken && Number(value) <= selectedToken.amount) {
                                        setSendAmount(value);
                                    }
                                }
                            }}
                            placeholder={`输入 ${selectedToken?.symbol} 数量`}
                            step="any"
                            min={0}
                            max={selectedToken?.amount}
                        />
                        <Text fontSize="sm" color="gray.500" mt={1}>
                            可用余额: {selectedToken?.amount} {selectedToken?.symbol}
                        </Text>
                    </FormControl>
                </VStack>
            </ModalBody>
            <ModalFooter>
                <Button 
                    colorScheme="blue" 
                    mr={3} 
                    onClick={() => {
                        if (selectedToken) {
                            handleTransferToken(selectedToken, sendAddress, sendAmount);
                        }
                    }}
                    isLoading={isTransferring}
                    loadingText="转账中..."
                    isDisabled={
                        !sendAddress || 
                        !sendAmount || 
                        !selectedToken || 
                        Number(sendAmount) > selectedToken.amount ||
                        selectedToken.amount <= 0
                    }
                >
                    {selectedToken?.amount <= 0 ? "余额不足" : "确认转账"}
                </Button>
                <Button variant="ghost" onClick={onClose}>
                    取消
                </Button>
            </ModalFooter>
        </ModalContent>
    </Modal>
));

// 将 SolTransferForm 抽离为独立组件并使用 React.memo
const SolTransferForm = React.memo(({ 
    solSendAddress,
    solSendAmount,
    setSolSendAddress,
    setSolSendAmount,
    solBalance,
    isSendingSol,
    handleSendSol
}: {
    solSendAddress: string;
    solSendAmount: string;
    setSolSendAddress: (value: string) => void;
    setSolSendAmount: (value: string) => void;
    solBalance: number;
    isSendingSol: boolean;
    handleSendSol: () => Promise<void>;
}) => (
    <Box>
        <FormControl isRequired mb={2}>
            <FormLabel>接收地址</FormLabel>
            <Input 
                placeholder="输入接收钱包地址"
                value={solSendAddress}
                onChange={(e) => setSolSendAddress(e.target.value)}
            />
        </FormControl>
        <FormControl isRequired mb={2}>
            <FormLabel>发送数量</FormLabel>
            <NumberInput
                value={solSendAmount}
                onChange={(valueString) => {
                    // 允许空字符串和有效的数字（包括小数点）
                    if (valueString === '' || /^\d*\.?\d*$/.test(valueString)) {
                        if (valueString === '' || Number(valueString) <= solBalance) {
                            setSolSendAmount(valueString);
                        }
                    }
                }}
                min={0}
                max={solBalance}
                precision={9}  // SOL 最多支持 9 位小数
                step={0.1}
                keepWithinRange={true}
                clampValueOnBlur={true}
            >
                <NumberInputField placeholder="输入 SOL 数量" />
            </NumberInput>
            <Text fontSize="sm" color="gray.500" mt={1}>
                可用余额: {solBalance.toFixed(4)} SOL
            </Text>
        </FormControl>
        <Button 
            colorScheme="blue" 
            width="full"
            onClick={handleSendSol}
            isLoading={isSendingSol}
            loadingText="发送中..."
            isDisabled={!solSendAddress || !solSendAmount || Number(solSendAmount) > solBalance}
        >
            发送 SOL
        </Button>
    </Box>
));

export const TokenList = ({
    setMintAddress,
    setName,
    setSymbol,
    setUri,
    setMetadataTabIndex,
    setMintTokenAddress
}: TokenListProps) => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const [tokens, setTokens] = useState<TokenAccount[]>([]);
    const [solBalance, setSolBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [solSendAddress, setSolSendAddress] = useState('');
    const [solSendAmount, setSolSendAmount] = useState('');
    const toast = useToast();
    const [managedTokens, setManagedTokens] = useState<TokenAccount[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isTimedOut, setIsTimedOut] = useState(false);
    const FETCH_TIMEOUT = 30000; // 30 秒超时
    const [isSendingSol, setIsSendingSol] = useState(false);
    const [isTransferring, setIsTransferring] = useState(false);
    const [selectedToken, setSelectedToken] = useState<TokenAccount | null>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [tokenSendAddress, setTokenSendAddress] = useState('');
    const [tokenSendAmount, setTokenSendAmount] = useState('');
    const [isDisablingMint, setIsDisablingMint] = useState(false);
    const [isDisablingFreeze, setIsDisablingFreeze] = useState(false);
    const [isDisableMintAlertOpen, setIsDisableMintAlertOpen] = useState(false);
    const [selectedTokenForDisable, setSelectedTokenForDisable] = useState<TokenAccount | null>(null);
    const [isDisableFreezeMintAlertOpen, setIsDisableFreezeAlertOpen] = useState(false);
    const [selectedTokenForDisableFreeze, setSelectedTokenForDisableFreeze] = useState<TokenAccount | null>(null);
    const cancelRef = React.useRef<HTMLButtonElement>(null);

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
                        //获取元数据帐户权限信息
                        const metadataUpdateAuthority = metadata?.updateAuthority;
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
                            metadataUpdateAuthority: metadataUpdateAuthority?.toBase58(),
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

    const handleTransferToken = async (
        token: TokenAccount,
        recipientAddress: string,
        amount: string
    ) => {
        if (!publicKey || !sendTransaction) {
            toast({
                title: "错误",
                description: "请先连接钱包",
                status: "error",
                duration: 3000,
            });
            return;
        }

        try {
            setIsTransferring(true);

            const mintPubkey = new PublicKey(token.mint);
            const recipientPubkey = new PublicKey(recipientAddress);

            // 获取发送者的代币账户
            const senderATA = await getAssociatedTokenAddress(
                mintPubkey,
                publicKey
            );

            // 获取接收者的代币账户
            const recipientATA = await getAssociatedTokenAddress(
                mintPubkey,
                recipientPubkey
            );

            const transaction = new Transaction();

            // 检查接收者的代币账户是否存在
            try {
                await getAccount(connection, recipientATA);
            } catch (error) {
                // 如果账户不存在，添加创建账户的指令
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,
                        recipientATA,
                        recipientPubkey,
                        mintPubkey
                    )
                );
            }

            // 添加转账指令
            const transferAmount = Number(amount) * Math.pow(10, token.decimals);
            transaction.add(
                createTransferInstruction(
                    senderATA,
                    recipientATA,
                    publicKey,
                    transferAmount
                )
            );

            // 获取最新的 blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // 发送交易
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: `成功发送 ${amount} ${token.symbol} 到 ${recipientAddress}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            // 刷新代币列表
            fetchTokens();
            
            // 关闭转账模态框
            setIsTransferModalOpen(false);
            setSelectedToken(null);
            setTokenSendAddress('');
            setTokenSendAmount('');

        } catch (error) {
            console.error("转账代币错误:", error);
            toast({
                title: "错误",
                description: "转账失败: " + (error as Error).message,
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsTransferring(false);
        }
    };

    // 禁用铸币权限
    const handleDisableMint = async (token: TokenAccount) => {
        if (!publicKey || !sendTransaction) {
            toast({
                title: "错误",
                description: "请先连接钱包",
                status: "error",
                duration: 3000,
            });
            return;
        }

        try {
            setIsDisablingMint(true);
            const mintPubkey = new PublicKey(token.mint);

            // 创建禁用铸币权限的指令
            const disableMintingInstruction = createSetAuthorityInstruction(
                mintPubkey,
                publicKey,
                AuthorityType.MintTokens,
                null  // 设置为 null 表示禁用该权限
            );

            // 创建并发送交易
            const transaction = new Transaction().add(disableMintingInstruction);
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: "已禁用铸币权限",
                status: "success",
                duration: 5000,
            });

            // 刷新代币列表
            fetchTokens();

        } catch (error) {
            console.error("禁用铸币权限错误:", error);
            toast({
                title: "错误",
                description: "禁用铸币权限失败: " + (error as Error).message,
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsDisablingMint(false);
        }
    };

    // 禁用冻结权限
    const handleDisableFreeze = async (token: TokenAccount) => {
        if (!publicKey || !sendTransaction) {
            toast({
                title: "错误",
                description: "请先连接钱包",
                status: "error",
                duration: 3000,
            });
            return;
        }

        try {
            setIsDisablingFreeze(true);
            const mintPubkey = new PublicKey(token.mint);

            // 创建禁用冻结权限的指令
            const disableFreezeInstruction = createSetAuthorityInstruction(
                mintPubkey,
                publicKey,
                AuthorityType.FreezeAccount,
                null  // 设置为 null 表示禁用该权限
            );

            // 创建并发送交易
            const transaction = new Transaction().add(disableFreezeInstruction);
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: "已禁用冻结权限",
                status: "success",
                duration: 5000,
            });

            // 刷新代币列表
            fetchTokens();

        } catch (error) {
            console.error("禁用冻结权限错误:", error);
            toast({
                title: "错误",
                description: "禁用冻结权限失败: " + (error as Error).message,
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsDisablingFreeze(false);
        }
    };

    const handleDisableMintClick = (token: TokenAccount) => {
        setSelectedTokenForDisable(token);
        setIsDisableMintAlertOpen(true);
    };

    const handleDisableMintConfirm = async () => {
        if (!selectedTokenForDisable) return;
        
        setIsDisableMintAlertOpen(false);
        await handleDisableMint(selectedTokenForDisable);
        setSelectedTokenForDisable(null);
    };

    const handleDisableFreezeClick = (token: TokenAccount) => {
        setSelectedTokenForDisableFreeze(token);
        setIsDisableFreezeAlertOpen(true);
    };

    const handleDisableFreezeConfirm = async () => {
        if (!selectedTokenForDisableFreeze) return;
        
        setIsDisableFreezeAlertOpen(false);
        await handleDisableFreeze(selectedTokenForDisableFreeze);
        setSelectedTokenForDisableFreeze(null);
    };

    const TokenCard = ({ token }: { token: TokenAccount }) => {
        //const hasMetadataAuthority = token.mintAuthority === publicKey?.toBase58();
        const hasMetadataAuthority = token.mintAuthority === publicKey?.toBase58() || 
            token.metadataUpdateAuthority === publicKey?.toBase58();
        //const hasMetadataUpdateAuthority = token.metadataUpdateAuthority === publicKey?.toBase58();

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
                            <Button 
                                size="sm" 
                                colorScheme="blue"
                                onClick={() => {
                                    setSelectedToken(token);
                                    setIsTransferModalOpen(true);
                                }}
                                isDisabled={token.amount <= 0}
                            >
                                {token.amount <= 0 ? "余额不足" : "转账"}
                            </Button>
                            {token.mintAuthority === publicKey?.toBase58() && (
                                <HStack>
                                    <Button 
                                        size="sm" 
                                        colorScheme="green"
                                        onClick={() => {
                                            setMintTokenAddress(token.mint);
                                            const tabIndex = 3;
                                            const tabs = document.querySelectorAll('[role="tab"]');
                                            if (tabs[tabIndex]) {
                                                (tabs[tabIndex] as HTMLElement).click();
                                            }
                                        }}
                                    >
                                        铸币
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        colorScheme="red"
                                        variant="outline"
                                        onClick={() => handleDisableMintClick(token)}
                                        isLoading={isDisablingMint && selectedTokenForDisable?.mint === token.mint}
                                        loadingText="禁用中..."
                                    >
                                        禁用铸币权限
                                    </Button>
                                </HStack>
                            )}
                            {token.freezeAuthority === publicKey?.toBase58() && (
                                <HStack>
                                    <Button 
                                        size="sm" 
                                        colorScheme="purple"
                                        variant="outline"
                                    >
                                        冻结
                                    </Button>
                                    <Button 
                                        size="sm" 
                                        colorScheme="red"
                                        variant="outline"
                                        onClick={() => handleDisableFreezeClick(token)}
                                        isLoading={isDisablingFreeze && selectedTokenForDisableFreeze?.mint === token.mint}
                                        loadingText="禁用中..."
                                    >
                                        禁用冻结权限
                                    </Button>
                                </HStack>
                            )}
                        </HStack>
                        {hasMetadataAuthority  && (
                            <Button 
                                size="sm" 
                                colorScheme="teal"
                                variant="ghost"
                                width="full"
                                leftIcon={<SettingsIcon />}
                                onClick={() => {
                                    // 自动填充代币地址
                                    setMintAddress(token.mint);
                                    setName(token.name && token.name !== '未知名称' ? token.name.replace(/\0/g, '') : '');
                                    setSymbol(token.symbol && token.symbol !== '未知代币' ? token.symbol.replace(/\0/g, '') : '');
                                    setUri(token.uri? token.uri.replace(/\0/g, '') : '');
                                    
                                    // 根据条件设置标签页
                                    setMetadataTabIndex(token.name && token.name !== '未知名称' ? 1 : 0);
                                    
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

    const handleSendSol = async () => {
        if (!publicKey || !solSendAddress || !solSendAmount || !sendTransaction) {
            toast({
                title: "错误",
                description: "请填写完整的转账信息",
                status: "error",
                duration: 3000,
            });
            return;
        }

        try {
            setIsSendingSol(true);

            // 验证接收地址
            const recipientPubkey = new PublicKey(solSendAddress);

            // 创建转账交易
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: recipientPubkey,
                    lamports: Number(solSendAmount) * LAMPORTS_PER_SOL
                })
            );

            // 获取最新的 blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // 使用 wallet adapter 的 sendTransaction
            const signature = await sendTransaction(transaction, connection);
            
            // 等待交易确认
            await connection.confirmTransaction(signature, 'confirmed');

            // 更新余额
            const newBalance = await connection.getBalance(publicKey);
            setSolBalance(newBalance / LAMPORTS_PER_SOL);

            // 清空输入
            setSolSendAddress('');
            setSolSendAmount('');

            toast({
                title: "成功",
                description: `成功发送 ${solSendAmount} SOL 到 ${solSendAddress}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

        } catch (error) {
            console.error("发送 SOL 错误:", error);
            toast({
                title: "错误",
                description: "发送 SOL 失败: " + (error as Error).message,
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsSendingSol(false);
        }
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

                <SolTransferForm 
                    solSendAddress={solSendAddress}
                    solSendAmount={solSendAmount}
                    setSolSendAddress={setSolSendAddress}
                    setSolSendAmount={setSolSendAmount}
                    solBalance={solBalance}
                    isSendingSol={isSendingSol}
                    handleSendSol={handleSendSol}
                />

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
            <TransferModal 
                isOpen={isTransferModalOpen}
                onClose={() => {
                    setIsTransferModalOpen(false);
                    setSelectedToken(null);
                    setTokenSendAddress('');
                    setTokenSendAmount('');
                }}
                selectedToken={selectedToken}
                sendAddress={tokenSendAddress}
                sendAmount={tokenSendAmount}
                setSendAddress={setTokenSendAddress}
                setSendAmount={setTokenSendAmount}
                isTransferring={isTransferring}
                handleTransferToken={handleTransferToken}
            />
            <AlertDialog
                isOpen={isDisableMintAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={() => {
                    setIsDisableMintAlertOpen(false);
                    setSelectedTokenForDisable(null);
                }}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            确认禁用铸币权限
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            <Text>
                                您确定要禁用 {selectedTokenForDisable?.symbol} 的铸币权限吗？
                            </Text>
                            <Text color="red.500" mt={2} fontWeight="bold">
                                警告：此操作不可逆！
                            </Text>
                            <Text mt={2} mb={2}>
                                禁用后：
                            </Text>
                            <UnorderedList>
                                <ListItem>代币总供应量将永久固定</ListItem>
                                <ListItem>无法再铸造新的代币</ListItem>
                                <ListItem>此操作无法撤销</ListItem>
                            </UnorderedList>
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={() => {
                                setIsDisableMintAlertOpen(false);
                                setSelectedTokenForDisable(null);
                            }}>
                                取消
                            </Button>
                            <Button 
                                colorScheme="red" 
                                onClick={handleDisableMintConfirm} 
                                ml={3}
                                isLoading={isDisablingMint}
                                loadingText="禁用中..."
                            >
                                确认禁用
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
            <AlertDialog
                isOpen={isDisableFreezeMintAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={() => {
                    setIsDisableFreezeAlertOpen(false);
                    setSelectedTokenForDisableFreeze(null);
                }}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            确认禁用冻结权限
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            <Text>
                                您确定要禁用 {selectedTokenForDisableFreeze?.symbol} 的冻结权限吗？
                            </Text>
                            <Text color="red.500" mt={2} fontWeight="bold">
                                警告：此操作不可逆！
                            </Text>
                            <Text mt={2} mb={2}>
                                禁用后：
                            </Text>
                            <UnorderedList>
                                <ListItem>无法冻结任何账户的代币</ListItem>
                                <ListItem>无法解冻已冻结的账户</ListItem>
                                <ListItem>此操作无法撤销</ListItem>
                            </UnorderedList>
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={() => {
                                setIsDisableFreezeAlertOpen(false);
                                setSelectedTokenForDisableFreeze(null);
                            }}>
                                取消
                            </Button>
                            <Button 
                                colorScheme="red" 
                                onClick={handleDisableFreezeConfirm} 
                                ml={3}
                                isLoading={isDisablingFreeze}
                                loadingText="禁用中..."
                            >
                                确认禁用
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </Box>
    );
}; 