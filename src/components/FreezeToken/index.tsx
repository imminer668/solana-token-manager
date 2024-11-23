import { 
    Box, 
    VStack, 
    Button, 
    Text, 
    Input, 
    useToast, 
    FormControl,
    FormLabel,
    InputGroup,
    InputLeftElement,
    Alert,
    AlertIcon,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
    Stat,
    StatLabel,
    StatNumber,
    StatHelpText,
    Card,
    CardBody,
    Skeleton,
    SkeletonText,
    InputRightElement,
    HStack,
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useRef } from 'react';
import { 
    TOKEN_PROGRAM_ID,
    createFreezeAccountInstruction,
    createThawAccountInstruction,
    getAssociatedTokenAddress,
    getMint,
    Account,
    getAccount,
    createAssociatedTokenAccountInstruction,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Transaction, PublicKey } from '@solana/web3.js';
import { 
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    Metadata
} from '@metaplex-foundation/mpl-token-metadata';
import { SearchIcon } from '@chakra-ui/icons';

interface FreezeTokenProps {
    mintAddress: string;
}

export const FreezeToken: React.FC<FreezeTokenProps> = ({ mintAddress: defaultMintAddress }) => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const [isFreezing, setIsFreezing] = useState(false);
    const [balance, setBalance] = useState<number | null>(null);
    const [decimals, setDecimals] = useState<number>(0);
    const [tokenSymbol, setTokenSymbol] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingToken, setIsLoadingToken] = useState(false);
    const [hasFreezeAuthority, setHasFreezeAuthority] = useState(false);
    const [isFrozen, setIsFrozen] = useState(false);
    const toast = useToast();
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const [mintAddress, setMintAddress] = useState(defaultMintAddress);
    const [targetAddress, setTargetAddress] = useState('');
    const [isThawing, setIsThawing] = useState(false);
    const [targetAccountInfo, setTargetAccountInfo] = useState<{
        exists: boolean;
        isFrozen: boolean;
    }>({ exists: false, isFrozen: false });

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

    // 获取代币信息
    const fetchTokenInfo = async () => {
        if (!publicKey || !mintAddress) return;

        try {
            setIsLoading(true);
            const mint = await getMint(connection, new PublicKey(mintAddress));
            setDecimals(mint.decimals);
            
            //console.log("mint.freezeAuthority?.toBase58()",mint.freezeAuthority?.toBase58());
            //console.log("publicKey.toBase58()",publicKey.toBase58());
            // 检查是否拥有冻结权限
            setHasFreezeAuthority(mint.freezeAuthority?.toBase58() === publicKey.toBase58());

            const ata = await getAssociatedTokenAddress(
                new PublicKey(mintAddress),
                publicKey
            );

            // 获取账户信息，包括冻结状态
            const account = await getAccount(connection, ata);
            setIsFrozen(account.isFrozen);
            
            const balance = await connection.getTokenAccountBalance(ata);
            setBalance(Number(balance.value.uiAmount));

            // 获取代币符号
            try {
                const metadataAddress = getMetadataAddress(new PublicKey(mintAddress));
                const metadataAccount = await connection.getAccountInfo(metadataAddress);
                
                if (metadataAccount) {
                    const metadata = Metadata.deserialize(metadataAccount.data)[0];
                    setTokenSymbol(metadata.data.symbol);
                }
            } catch (error) {
                console.error('获取代币符号失败:', error);
                setTokenSymbol('');
            }
        } catch (error) {
            console.error('获取代币信息失败:', error);
            toast({
                title: "错误",
                description: "获取代币信息失败",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    // 初始化和监听默认代币地址变化
    useEffect(() => {
        setMintAddress(defaultMintAddress);
        if (defaultMintAddress) {
            fetchTokenInfo();
        }
    }, [defaultMintAddress]);

    // 初始化时执行一次
    useEffect(() => {
        if (mintAddress && publicKey) {
            fetchTokenInfo();
        }
    }, [publicKey]); // 当钱包地址变化时执行

    // 处理代币地址输入
    const handleMintAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMintAddress(e.target.value);
        setBalance(null);
        setTokenSymbol('');
        setHasFreezeAuthority(false);
        setIsFrozen(false);
    };

    // 加载代币信息
    const handleLoadToken = async () => {
        if (!mintAddress || !publicKey) return;

        try {
            setIsLoadingToken(true);
            setBalance(null);
            setTokenSymbol('');
            setHasFreezeAuthority(false);
            setIsFrozen(false);
            
            // 验证地址格式
            try {
                new PublicKey(mintAddress);
            } catch (error) {
                throw new Error('无效的代币地址');
            }

            await fetchTokenInfo();
        } catch (error: any) {
            toast({
                title: "错误",
                description: error.message || "加载代币信息失败",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoadingToken(false);
        }
    };

    // 处理打开确认对话框
    const handleOpenAlert = () => {
        setIsAlertOpen(true);
    };

    // 处理关闭确认对话框
    const handleCloseAlert = () => {
        setIsAlertOpen(false);
    };

    // 检查目标账户状态
    const checkTargetAccount = async () => {
        if (!publicKey || !mintAddress || !targetAddress) return;

        try {
            const targetPubkey = new PublicKey(targetAddress);
            const targetATA = await getAssociatedTokenAddress(
                new PublicKey(mintAddress),
                targetPubkey
            );

            try {
                const account = await getAccount(connection, targetATA);
                console.log("account.balance", account.amount);
                setTargetAccountInfo({
                    exists: true,
                    isFrozen: account.isFrozen
                });
            } catch (error) {
                setTargetAccountInfo({
                    exists: false,
                    isFrozen: false
                });
            }
        } catch (error) {
            setTargetAccountInfo({
                exists: false,
                isFrozen: false
            });
            toast({
                title: "错误",
                description: "无效的账户地址",
                status: "error",
                duration: 3000,
            });
        }
    };

    // 处理目标地址输入
    const handleTargetAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setTargetAddress(e.target.value);
        setTargetAccountInfo({ exists: false, isFrozen: false });
    };

    // 处理冻结操作
    const handleFreeze = async () => {
        handleCloseAlert();
        if (!publicKey || !mintAddress || !targetAddress) return;

        try {
            setIsFreezing(true);

            if (!hasFreezeAuthority) {
                throw new Error('没有冻结权限');
            }

            const targetPubkey = new PublicKey(targetAddress);
            const mintPubkey = new PublicKey(mintAddress);
            const targetATA = await getAssociatedTokenAddress(
                mintPubkey,
                targetPubkey
            );

            // 创建交易
            const transaction = new Transaction();

            // 检查目标账户的 ATA 是否存在
            const targetAccount = await connection.getAccountInfo(targetATA);
            
            // 如果 ATA 不存在，添加创建 ATA 的指令
            if (!targetAccount) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        publicKey,          // 支付账户
                        targetATA,          // ATA 地址
                        targetPubkey,       // 所有者
                        mintPubkey          // 代币地址
                    )
                );
            }

            // 添加冻结指令
            transaction.add(
                createFreezeAccountInstruction(
                    targetATA,
                    mintPubkey,
                    publicKey
                )
            );

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: `已冻结账户 ${targetAddress}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            // 刷新状态
            await checkTargetAccount();

        } catch (error: any) {
            if (error.message === 'User rejected the request.') {
                toast({
                    title: "错误",
                    description: `冻结账户失败，用户拒绝了钱包请求`,
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
            } else {
                console.error('冻结账户错误:', error);
                toast({
                    title: "错误",
                    description: error.message || "冻结账户失败",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } finally {
            setIsFreezing(false);
        }
    };

    // 处理解冻操作
    const handleThaw = async () => {
        if (!publicKey || !mintAddress || !targetAddress) return;

        try {
            setIsThawing(true);

            if (!hasFreezeAuthority) {
                throw new Error('没有解冻权限');
            }

            const targetPubkey = new PublicKey(targetAddress);
            const mintPubkey = new PublicKey(mintAddress);
            const targetATA = await getAssociatedTokenAddress(
                mintPubkey,
                targetPubkey
            );

            // 检查目标账户的 ATA 是否存在
            const targetAccount = await connection.getAccountInfo(targetATA);
            if (!targetAccount) {
                throw new Error('目标账户不存在');
            }

            const transaction = new Transaction().add(
                createThawAccountInstruction(
                    targetATA,
                    mintPubkey,
                    publicKey
                )
            );

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: `已解冻账户 ${targetAddress}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            // 刷新状态
            await checkTargetAccount();

        } catch (error: any) {
            if (error.message === 'User rejected the request.') {
                toast({
                    title: "错误",
                    description: `解冻账户失败，用户拒绝了钱包请求`,
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
            } else {
                toast({
                    title: "错误",
                    description: error.message || "解冻账户失败",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } finally {
            setIsThawing(false);
        }
    };

    return (
        <Box p={6} maxW="container.sm" mx="auto">
            <VStack spacing={6} align="stretch">
                <Text fontSize="2xl" fontWeight="bold">
                    冻结代币
                </Text>

                <Alert status="warning">
                    <AlertIcon />
                    请注意：冻结后该账户将无法进行转账操作，请谨慎使用！
                </Alert>

                <FormControl>
                    <FormLabel>代币地址</FormLabel>
                    <InputGroup>
                        <InputLeftElement
                            pointerEvents="none"
                            children={<SearchIcon color="gray.300" />}
                        />
                        <Input
                            value={mintAddress}
                            onChange={handleMintAddressChange}
                            placeholder="输入代币地址"
                            pr="4.5rem"
                        />
                        <InputRightElement width="4.5rem">
                            <Button
                                h="1.75rem"
                                size="sm"
                                onClick={handleLoadToken}
                                isLoading={isLoadingToken}
                                disabled={!mintAddress || mintAddress.length === 0}
                            >
                                加载
                            </Button>
                        </InputRightElement>
                    </InputGroup>
                </FormControl>

                <FormControl>
                    <FormLabel>目标账户地址</FormLabel>
                    <InputGroup>
                        <InputLeftElement
                            pointerEvents="none"
                        >
                            <SearchIcon color="gray.300" />
                        </InputLeftElement>
                        <Input
                            value={targetAddress}
                            onChange={handleTargetAddressChange}
                            placeholder="输入要冻结/解冻的账户地址"
                            pr="4.5rem"
                        />
                        <InputRightElement width="4.5rem">
                            <Button
                                h="1.75rem"
                                size="sm"
                                onClick={checkTargetAccount}
                                isLoading={isLoadingToken}
                                disabled={!targetAddress || targetAddress.length === 0}
                            >
                                检查
                            </Button>
                        </InputRightElement>
                    </InputGroup>
                    {targetAccountInfo.exists && (
                        <Text fontSize="sm" color={targetAccountInfo.isFrozen ? "red.500" : "green.500"} mt={1}>
                            账户状态: {targetAccountInfo.isFrozen ? '已冻结' : '未冻结'}
                        </Text>
                    )}
                </FormControl>

                <Card>
                    <CardBody>
                        <Stat>
                            <StatLabel>目标账户状态</StatLabel>
                            {isLoading || isLoadingToken ? (
                                <VStack align="stretch" spacing={2}>
                                    <Skeleton height="24px" width="150px" />
                                    <SkeletonText noOfLines={1} width="200px" />
                                </VStack>
                            ) : (
                                <>
                                    <StatNumber>
                                        {!targetAccountInfo.exists ? (
                                            <Text as="span" color="gray.500">账户不存在</Text>
                                        ) : (
                                            <>
                                                <Text 
                                                    as="span" 
                                                    color={targetAccountInfo.isFrozen ? "red.500" : "green.500"}
                                                    fontWeight="bold"
                                                >
                                                    {targetAccountInfo.isFrozen ? '已冻结' : '未冻结'}
                                                </Text>
                                            </>
                                        )}
                                    </StatNumber>
                                    <StatHelpText>
                                        <VStack align="start" spacing={1}>
                                            <Text>代币: {tokenSymbol || '未知代币'}</Text>
                                            <Text>目标账户: {targetAddress || '未输入'}</Text>
                                            {hasFreezeAuthority ? (
                                                <Text color="green.500">✓ 您拥有冻结权限</Text>
                                            ) : (
                                                <Text color="red.500">✗ 您没有冻结权限</Text>
                                            )}
                                        </VStack>
                                    </StatHelpText>
                                </>
                            )}
                        </Stat>
                    </CardBody>
                </Card>

                <HStack spacing={4} justify="center">
                    <Button
                        colorScheme="purple"
                        onClick={handleOpenAlert}
                        isLoading={isFreezing}
                        loadingText="冻结中..."
                        isDisabled={!hasFreezeAuthority || !targetAccountInfo.exists || targetAccountInfo.isFrozen}
                    >
                        {!hasFreezeAuthority 
                            ? "无冻结权限" 
                            : !targetAccountInfo.exists
                                ? "账户不存在"
                                : targetAccountInfo.isFrozen
                                    ? "已冻结"
                                    : "冻结账户"}
                    </Button>

                    <Button
                        colorScheme="blue"
                        onClick={handleThaw}
                        isLoading={isThawing}
                        loadingText="解冻中..."
                        isDisabled={!hasFreezeAuthority || !targetAccountInfo.exists || !targetAccountInfo.isFrozen}
                    >
                        {!hasFreezeAuthority 
                            ? "无解冻权限" 
                            : !targetAccountInfo.exists
                                ? "账户不存在"
                                : !targetAccountInfo.isFrozen
                                    ? "未冻结"
                                    : "解冻账户"}
                    </Button>
                </HStack>
            </VStack>

            <AlertDialog
                isOpen={isAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={handleCloseAlert}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            确认冻结代币账户
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            <Text>您确定要冻结此代币账户吗？</Text>
                            <Text mt={2} fontSize="sm" color="red.500">
                                请注意：冻结后该账户将无法进行转账操作。
                            </Text>
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={handleCloseAlert}>
                                取消
                            </Button>
                            <Button
                                colorScheme="purple"
                                onClick={handleFreeze}
                                ml={3}
                            >
                                确认冻结
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </Box>
    );
}; 