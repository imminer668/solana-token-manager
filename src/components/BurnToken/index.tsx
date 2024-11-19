import { 
    Box, 
    VStack, 
    Button, 
    Text, 
    Input, 
    useToast, 
    FormControl,
    FormLabel,
    NumberInput,
    NumberInputField,
    NumberInputStepper,
    InputGroup,
    InputRightElement,
    InputLeftElement,
    Alert,
    AlertIcon,
    HStack,
    Stat,
    StatLabel,
    StatNumber,
    StatHelpText,
    Card,
    CardBody,
    AlertDialog,
    AlertDialogBody,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogContent,
    AlertDialogOverlay,
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect, useRef } from 'react';
import { 
    TOKEN_PROGRAM_ID,
    createBurnInstruction,
    getAssociatedTokenAddress,
    getMint
} from '@solana/spl-token';
import { Transaction, PublicKey } from '@solana/web3.js';
import { 
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
    Metadata
} from '@metaplex-foundation/mpl-token-metadata';
import { SearchIcon } from '@chakra-ui/icons';
import { set } from '@project-serum/anchor/dist/cjs/utils/features';

interface BurnTokenProps {
    mintAddress: string;
}

export const BurnToken: React.FC<BurnTokenProps> = ({ mintAddress: defaultMintAddress }) => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const [amount, setAmount] = useState('');
    const [isBurning, setIsBurning] = useState(false);
    const [balance, setBalance] = useState<number | null>(null);
    const [decimals, setDecimals] = useState<number>(0);
    const [tokenSymbol, setTokenSymbol] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingToken, setIsLoadingToken] = useState(false);
    const toast = useToast();
    const [isAlertOpen, setIsAlertOpen] = useState(false);
    const cancelRef = useRef<HTMLButtonElement>(null);
    const [mintAddress, setMintAddress] = useState(defaultMintAddress);

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

    // 获取代币余额和精度
    const fetchTokenInfo = async () => {
        if (!publicKey || !mintAddress) return;

        try {
            setIsLoading(true);
            const mint = await getMint(connection, new PublicKey(mintAddress));
            setDecimals(mint.decimals);

            const ata = await getAssociatedTokenAddress(
                new PublicKey(mintAddress),
                publicKey
            );
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

    // 监听默认代币地址变化
    useEffect(() => {
        setMintAddress(defaultMintAddress);
        if (defaultMintAddress) {
            fetchTokenInfo();
        }
    }, [defaultMintAddress]);

    // 处理代币地址输入
    const handleMintAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMintAddress(e.target.value);
        setBalance(null);
        setTokenSymbol('');
    };

    // 加载代币信息
    const handleLoadToken = async () => {
        if (!mintAddress || !publicKey) return;

        try {
            setIsLoadingToken(true);
            setBalance(null);
            setTokenSymbol('');
            
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

    // 设置最大值
    const setMaxAmount = () => {
        if (balance !== null) {
            setAmount(balance.toString());
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

    // 处理销毁操作
    const handleBurn = async () => {
        handleCloseAlert(); // 先关闭对话框
        if (!publicKey || !mintAddress || !amount) return;

        try {
            setIsBurning(true);
            const amountToBurn = Number(amount);
            
            if (amountToBurn <= 0) {
                throw new Error('销毁数量必须大于0');
            }

            if (balance && amountToBurn > balance) {
                throw new Error('销毁数量不能大于余额');
            }

            const mintPublicKey = new PublicKey(mintAddress);
            const associatedTokenAddress = await getAssociatedTokenAddress(
                mintPublicKey,
                publicKey
            );

            const burnInstruction = createBurnInstruction(
                associatedTokenAddress,
                mintPublicKey,
                publicKey,
                BigInt(amountToBurn * Math.pow(10, decimals))
            );

            const transaction = new Transaction().add(burnInstruction);
            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: `已销毁 ${amount} 个代币`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

            // 刷新余额
            await fetchTokenInfo();
            setAmount('');

        } catch (error: any) {
            if (error.message === 'User rejected the request.') {
                toast({
                    title: "错误",
                    description: `销毁代币失败，用户拒绝了钱包请求`,
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
            } else {
                toast({
                    title: "错误",
                    description: error.message || "销毁代币失败",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
            }
        } finally {
            setIsBurning(false);
        }
    };

    return (
        <Box p={6} maxW="container.sm" mx="auto">
            <VStack spacing={6} align="stretch">
                <Text fontSize="2xl" fontWeight="bold">
                    销毁代币
                </Text>

                <Alert status="warning">
                    <AlertIcon />
                    请注意：代币销毁后无法恢复，请谨慎操作！
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

                <Card>
                    <CardBody>
                        <Stat>
                            <StatLabel>当前余额</StatLabel>
                            <StatNumber>
                                {isLoading || isLoadingToken ? (
                                    <Text as="span" color="gray.500">加载中...</Text>
                                ) : balance === null ? (
                                    <Text as="span" color="gray.500">未加载</Text>
                                ) : (
                                    `${balance} ${tokenSymbol || '个代币'}`
                                )}
                            </StatNumber>
                            <StatHelpText>
                                代币地址: {mintAddress || '未输入'}
                            </StatHelpText>
                        </Stat>
                    </CardBody>
                </Card>

                <FormControl>
                    <FormLabel>销毁数量</FormLabel>
                    <InputGroup>
                        <NumberInput
                            value={amount}
                            onChange={(value) => setAmount(value)}
                            min={0}
                            max={balance || 0}
                            precision={decimals}
                            width="100%"
                        >
                            <NumberInputField placeholder="输入要销毁的数量" />
                        </NumberInput>
                        <InputRightElement width="4.5rem" mr={1}>
                            <Button 
                                h="1.75rem" 
                                size="sm"
                                onClick={setMaxAmount}
                                disabled={!balance}
                            >
                                最大
                            </Button>
                        </InputRightElement>
                    </InputGroup>
                    {balance !== null && (
                        <Text fontSize="sm" color="gray.500" mt={1}>
                            可销毁数量: {balance} {tokenSymbol || '个代币'}
                        </Text>
                    )}
                </FormControl>

                <Button
                    colorScheme="red"
                    onClick={handleOpenAlert}
                    isLoading={isBurning}
                    loadingText="销毁中..."
                    isDisabled={!amount || !balance || Number(amount) > balance}
                >
                    确认销毁
                </Button>
            </VStack>

            <AlertDialog
                isOpen={isAlertOpen}
                leastDestructiveRef={cancelRef}
                onClose={handleCloseAlert}
            >
                <AlertDialogOverlay>
                    <AlertDialogContent>
                        <AlertDialogHeader fontSize="lg" fontWeight="bold">
                            确认销毁代币
                        </AlertDialogHeader>

                        <AlertDialogBody>
                            <Text>您确定要销毁 {amount} {tokenSymbol || '个代币'} 吗？</Text>
                            <Text mt={2} fontSize="sm" color="red.500">
                                请注意：此操作不可撤销，销毁后代币将永久消失。
                            </Text>
                        </AlertDialogBody>

                        <AlertDialogFooter>
                            <Button ref={cancelRef} onClick={handleCloseAlert}>
                                取消
                            </Button>
                            <Button
                                colorScheme="red"
                                onClick={handleBurn}
                                ml={3}
                            >
                                确认销毁
                            </Button>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialogOverlay>
            </AlertDialog>
        </Box>
    );
}; 