import { 
    Box,
    VStack,
    HStack,
    Button,
    Text,
    Input,
    Select,
    NumberInput,
    NumberInputField,
    useToast,
    Icon,
    Stat,
    StatLabel,
    StatNumber,
    Skeleton,
    SkeletonText,
    Popover,
    PopoverTrigger,
    PopoverContent,
    PopoverHeader,
    PopoverBody,
    PopoverArrow,
    PopoverCloseButton,
    Slider,
    SliderTrack,
    SliderFilledTrack,
    SliderThumb,
    IconButton,
    Tooltip,
} from '@chakra-ui/react';
import { FaExchangeAlt } from 'react-icons/fa';
import { FiSettings } from 'react-icons/fi';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useState, useEffect } from 'react';
import { TokenInput } from './TokenInput';
import { PublicKey } from '@solana/web3.js';
import { 
    getAssociatedTokenAddress,
    getAccount,
    TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountInstruction,
    createSyncNativeInstruction,
    createCloseAccountInstruction,
    NATIVE_MINT,
} from '@solana/spl-token';
import { TokenSelectModal } from './TokenSelectModal';
import { 
    Liquidity,
    Token,
    TokenAmount,
    Percent,
    Currency,
    LIQUIDITY_STATE_LAYOUT_V4,
    MARKET_STATE_LAYOUT_V3,
    SPL_ACCOUNT_LAYOUT,
    RAYDIUM_MAINNET,
    ENDPOINT,
    jsonInfo2PoolKeys,
    Market,
    SPL_MINT_LAYOUT
} from '@raydium-io/raydium-sdk';
import { LiquidityPoolData, LiquidityPoolKeys, LiquidityPoolInfo } from './types';
import BN from 'bn.js';
import { SwapConfirmModal } from './SwapConfirmModal';
import { 
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getPoolInfo } from './poolServices';

interface TokenInfo {
    mint: string;
    symbol: string;
    icon?: string;
    balance?: number;
    decimals: number;
    isNative?: boolean;
}

// 添加错误类型
interface SwapError extends Error {
    message: string;
}

interface SwapState {
    tokenA: TokenInfo | null;
    tokenB: TokenInfo | null;
    amountIn: string;
    amountOut: string;
    slippage: number;
    pool: LiquidityPoolData | null;
}

interface SwapComputation {
    amountOut: string;
    minAmountOut: string;
    priceImpact: string;
    exchangeRate: string;
}

export const TokenSwap: React.FC = () => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const toast = useToast();

    const [amountIn, setAmountIn] = useState('');
    const [amountOut, setAmountOut] = useState('');
    const [tokenA, setTokenA] = useState<TokenInfo | null>(null);
    const [tokenB, setTokenB] = useState<TokenInfo | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSelectingTokenA, setIsSelectingTokenA] = useState(false);
    const [isSelectingTokenB, setIsSelectingTokenB] = useState(false);
    const [pool, setPool] = useState<LiquidityPoolData | null>(null);
    const [exchangeRate, setExchangeRate] = useState<string | null>(null);
    const [priceImpact, setPriceImpact] = useState<string | null>(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [slippage, setSlippage] = useState<number>(0.5); // 0.5% 默认滑点
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSwapping, setIsSwapping] = useState(false);


    // SOL 代币配置
    const WSOL_MINT = 'So11111111111111111111111111111111111111112';
    const SOL_TOKEN: TokenInfo = {
        mint: WSOL_MINT,
        symbol: 'SOL',
        decimals: 9,
        isNative: true,
    };

    // 初始化时设置 SOL 为默认代币
    useEffect(() => {
        if (!tokenA) {
            fetchSolBalance().then(balance => {
                setTokenA({
                    ...SOL_TOKEN,
                    balance
                });
            });
        }
    }, [publicKey]);

    // 获取 SOL 余额
    const fetchSolBalance = async () => {
        if (!publicKey) return 0;
        try {
            const balance = await connection.getBalance(publicKey);
            return balance / Math.pow(10, 9); // 转换为 SOL 单位
        } catch (error) {
            console.error('获取 SOL 余额失败:', error);
            return 0;
        }
    };

    // 获取代币余额
    const fetchTokenBalance = async (mint: string) => {
        if (!publicKey || !mint) return 0;

        try {
            // 如果是 SOL，直接获取 SOL 余额
            if (mint === WSOL_MINT) {
                return await fetchSolBalance();
            }

            const mintPubkey = new PublicKey(mint);
            const ata = await getAssociatedTokenAddress(
                mintPubkey,
                publicKey
            );

            const account = await getAccount(connection, ata);
            return Number(account.amount) / Math.pow(10, 9); // 假设精度为 9，实际应该使用代币的精度
        } catch (error) {
            console.error('获取代币余额失败:', error);
            return 0;
        }
    };

    // 获取流动性池信息
    const fetchPoolInfo = async (tokenAMint: string, tokenBMint: string) => {
        try {
            setIsLoadingRate(true);
            
            // 使用新的函数
            //const { poolData } = await getPoolInfo(connection, {
            //    tokenPair: [tokenAMint, tokenBMint]
            //});
            const { poolData } = await getPoolInfo(connection, {
                ammId: "自定义"
            });
            
            setPool(poolData);
            return poolData;
        } catch (error) {
            console.error('获取流动性池信息失败:', error);
            toast({
                title: "错误",
                description: `获取流动性池信息失败: ${(error as Error).message}`,
                status: "error",
            });
            return null;
        } finally {
            setIsLoadingRate(false);
        }
    };

    // 计算兑换比率
    const calculateExchangeRate = async () => {
        if (!tokenA || !tokenB || !amountIn || !pool) {
            return;
        }

        try {
            setIsLoadingRate(true);
            
            // 创建代币对象
            const inputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenA.mint), tokenA.decimals);
            
            // 解析输入金额
            const amountNumber = parseFloat(amountIn);
            if (isNaN(amountNumber)) {
                console.error('输入的金额不是有效数字');
                return;
            }

            // 创建 TokenAmount 对象
            const amountInBN = new TokenAmount(
                inputToken,
                amountNumber,
                false
            );
            
            console.log('创建的 TokenAmount 对象:', {
                raw: amountInBN.raw.toString(),
                fixed: amountInBN.toFixed(),
                exact: amountInBN.toExact()
            });

            // 获取储备金
            let baseReserve = pool.poolInfo.baseReserve;
            let quoteReserve = pool.poolInfo.quoteReserve;
            let isBaseToQuote = true;

            // 检查是否需要交换储备金
            if (pool.poolKeys.baseMint.toBase58() !== tokenA.mint) {
                [baseReserve, quoteReserve] = [quoteReserve, baseReserve];
                isBaseToQuote = false;
            }

            console.log('计算参数:', {
                amountIn,
                tokenA,
                tokenB,
                baseReserve: baseReserve.toString(),
                quoteReserve: quoteReserve.toString()
            });

            // 计算输出金额
            const amountOutBN = calculateAmountOut(
                amountInBN,
                baseReserve,
                quoteReserve
            );

            console.log('计算结果:', {
                amountInBN: amountInBN.toFixed(),
                amountOutBN: amountOutBN.toString(),
                isBaseToQuote
            });

            if (!amountOutBN.isZero()) {
                // 格式化输出金额
                const amountOutFormatted = (Number(amountOutBN.toString()) / Math.pow(10, tokenB.decimals)).toFixed(tokenB.decimals);
                setAmountOut(amountOutFormatted);
                
                // 计算价格影响
                const priceImpactValue = calculatePriceImpact(
                    amountInBN,
                    amountOutBN,
                    baseReserve,
                    quoteReserve
                );
                setPriceImpact(priceImpactValue);
                
                // 计算兑换比率
                const inAmount = Number(amountIn);
                const outAmount = Number(amountOutFormatted);
                const rate = (outAmount / inAmount).toFixed(6);
                setExchangeRate(`1 ${tokenA.symbol} = ${rate} ${tokenB.symbol}`);
            } else {
                setPriceImpact(null);
                setExchangeRate(null);
            }
        } catch (error) {
            console.error('计算兑换比率失败:', error);
            toast({
                title: "错误",
                description: "计算兑换比率失败",
                status: "error",
            });
            setExchangeRate(null);
            setPriceImpact(null);
            setAmountOut('');
        } finally {
            setIsLoadingRate(false);
        }
    };

    // 计算输出金额
    const calculateAmountOut = (
        amountIn: TokenAmount,
        reserveIn: BN,
        reserveOut: BN
    ): BN => {
        if (amountIn.raw.isZero() || reserveIn.isZero() || reserveOut.isZero()) {
            console.log('输入金额或储备金为零');
            return new BN(0);
        }

        try {
            // 从 TokenAmount 获取 raw BN 值
            const amountInRaw = amountIn.raw;
            
            // 计算费用 0.25%
            const amountInWithFee = amountInRaw.mul(new BN(9975));
            
            // 计算分子 (amountInWithFee * reserveOut)
            const numerator = amountInWithFee.mul(reserveOut);
            
            // 计算分母 (reserveIn * 10000 + amountInWithFee)
            const denominator = reserveIn.mul(new BN(10000)).add(amountInWithFee);
            
            // 计算输出金额 (numerator / denominator)
            const amountOut = numerator.div(denominator);
            
            return amountOut;
        } catch (error) {
            console.error('计算输出金额时出错:', error);
            return new BN(0);
        }
    };

    // 计算价格影响
    const calculatePriceImpact = (
        amountIn: TokenAmount,
        amountOut: BN,
        reserveIn: BN,
        reserveOut: BN
    ): string => {
        try {
            // 从 TokenAmount 获取 raw BN 值
            const amountInRaw = amountIn.raw;
            
            // 计算确切报价（没有价格影响时将收到的金额）
            const midPrice = reserveOut.mul(new BN(10000)).div(reserveIn);
            const exactQuote = amountInRaw.mul(midPrice).div(new BN(10000));
            
            // 计算价格影响
            if (exactQuote.isZero()) {
                return '0';
            }
            
            const slippage = exactQuote.sub(amountOut).mul(new BN(10000)).div(exactQuote);
            return (slippage.toNumber() / 100).toFixed(2);
        } catch (error) {
            console.error('计算价格影响时出错:', error);
            return '0';
        }
    };

    // 计算最小获得数量
    const calculateMinimumReceived = (amount: string): string => {
        if (!amount) return '0';
        const value = Number(amount);
        const minReceived = value * (1 - slippage / 100);
        return minReceived.toFixed(tokenB?.decimals || 6);
    };

    // 监听输入金额变化
    useEffect(() => {
        calculateExchangeRate();
    }, [amountIn, pool]);

    // 监听代币选择变化
    useEffect(() => {
        if (tokenA && tokenB) {
            console.log('代币信息:', {
                tokenA: {
                    symbol: tokenA.symbol,
                    decimals: tokenA.decimals,
                    mint: tokenA.mint
                },
                tokenB: {
                    symbol: tokenB.symbol,
                    decimals: tokenB.decimals,
                    mint: tokenB.mint
                }
            });
            fetchPoolInfo(tokenA.mint, tokenB.mint);
        }
    }, [tokenA?.mint, tokenB?.mint]);

    // 切换代币位置
    const handleSwitch = () => {
        setTokenA(tokenB);
        setTokenB(tokenA);
        setAmountIn('');
        setAmountOut('');
    };

    // 选择代币A
    const handleTokenASelect = () => {
        setIsSelectingTokenA(true);
    };

    // 选择代币B
    const handleTokenBSelect = () => {
        setIsSelectingTokenB(true);
    };

    // 处理代币选择
    const handleTokenSelect = (token: TokenInfo) => {
        if (!token.decimals) {
            console.error('代币精度未定义:', token);
            toast({
                title: "错误",
                description: "代币信息不完整",
                status: "error",
            });
            return;
        }

        // 检查是否选择了相同的代币
        if (
            (isSelectingTokenA && tokenB?.mint === token.mint) ||
            (isSelectingTokenB && tokenA?.mint === token.mint)
        ) {
            toast({
                title: "错误",
                description: "不能选择相同的代币",
                status: "error",
            });
            return;
        }

        if (isSelectingTokenA) {
            setTokenA(token);
            setIsSelectingTokenA(false);
        } else if (isSelectingTokenB) {
            setTokenB(token);
            setIsSelectingTokenB(false);
        }

        // 重置输入金额
        setAmountIn('');
        setAmountOut('');
    };

    // 处理输入金额变化
    const handleAmountInChange = (value: string) => {
        setAmountIn(value);
        // TODO: 计算输出金额
        // setAmountOut(calculateAmountOut(value));
    };

    // 执行兑换
    const handleSwap = async () => {
        if (!publicKey || !tokenA || !tokenB) {
            toast({
                title: "错误",
                description: "请先选择代币",
                status: "error",
            });
            return;
        }

        setIsConfirmOpen(true);
    };
    const getWalletTokenAccount = async () => {
        const walletTokenAccount = await connection.getTokenAccountsByOwner(publicKey, {
            programId: TOKEN_PROGRAM_ID,
        });
        return walletTokenAccount.value.map((i) => ({
            pubkey: i.pubkey,
            programId: i.account.owner,
            accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
        }));
    }

    // 确认兑换
    const confirmSwap = async () => {
        // 参数验证
        if (!publicKey || !tokenA || !tokenB || !pool || !amountIn || !amountOut) {
            console.error('缺少必要参数:', { publicKey, tokenA, tokenB, pool, amountIn, amountOut });
            toast({
                title: "错误",
                description: "请确保所有参数都已设置",
                status: "error",
            });
            return;
        }

        try {
            console.log('开始兑换...');
            setIsSwapping(true);

            // 获取钱包代币账户
            const tokenAccounts = await getWalletTokenAccount();
            console.log('钱包代币账户:', tokenAccounts);

            // 使用新的函数
            const ammId = "自定义";
            const { poolKeys, poolInfo } = await getPoolInfo(connection, { ammId });
            
            // 创建正确的代币对象
            const inputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenA.mint), tokenA.decimals);
            const outputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenB.mint), tokenB.decimals);

            // 解析输入金额
            const amountNumber = parseFloat(amountIn);
            if (isNaN(amountNumber)) {
                throw new Error('输入的金额不是有效数字');
            }

            // 正确地创建 TokenAmount 对象
            const amountInBN = new TokenAmount(
                inputToken,
                amountNumber,
                false
            );

            console.log('创建的 TokenAmount 对象:', {
                raw: amountInBN.raw.toString(),
                fixed: amountInBN.toFixed(),
                exact: amountInBN.toExact()
            });

            // 确保滑点是一个整数
            const slippageValue = Math.floor(slippage * 100);
            console.log('滑点值 (百分比):', slippageValue / 100);
            
            // 创建滑点对象
            const slippagePercent = new Percent(slippageValue, 10000);
            console.log('滑点对象:', slippagePercent.toSignificant());

            // 计算输出金额
            const { amountOut, minAmountOut } = Liquidity.computeAmountOut({
                poolKeys,
                poolInfo,
                amountIn: amountInBN,
                currencyOut: outputToken,
                slippage: slippagePercent
            });
            
            console.log('计算的输出金额:', amountOut.toFixed());
            console.log('计算的最小输出金额:', minAmountOut.toFixed());

            // 构建兑换指令
            console.log('构建兑换指令...');
            const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
                connection,
                poolKeys,
                userKeys: {
                    tokenAccounts,
                    owner: publicKey
                },
                amountIn: amountInBN,
                amountOut: minAmountOut,
                fixedSide: 'in',
                makeTxVersion: 0
            });

            console.log('构建的 innerTransactions:', innerTransactions);

            // 检查 innerTransactions 是否有效
            if (!innerTransactions || innerTransactions.length === 0) {
                throw new Error('没有生成任何指令');
            }

            // 处理 innerTransactions
            for (let i = 0; i < innerTransactions.length; i++) {
                const innerTx = innerTransactions[i];
                
                // 创建一个新的交易
                const transaction = new Transaction();
                
                // 添加所有指令
                for (const instruction of innerTx.instructions) {
                    transaction.add(instruction);
                }
                
                // 设置最近的区块哈希和付款人
                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = publicKey;
                
                console.log(`发送第 ${i+1}/${innerTransactions.length} 个交易...`);
                
                // 发送交易
                const signature = await sendTransaction(transaction, connection);
                console.log(`交易 ${i+1} 已发送，签名:`, signature);
                
                // 等待确认
                console.log(`等待交易 ${i+1} 确认...`);
                const confirmation = await connection.confirmTransaction(signature, 'confirmed');
                if (confirmation.value.err) {
                    throw new Error(`交易 ${i+1} 确认失败: ${JSON.stringify(confirmation.value.err)}`);
                }
                
                console.log(`交易 ${i+1} 已确认`);
            }
            
            // 处理成功
            console.log('兑换成功，处理成功反馈...');
            toast({
                title: "成功",
                description: "兑换成功",
                status: "success",
            });
            
            // 重置状态和刷新余额
            console.log('重置状态和刷新余额...');
            setAmountIn('');
            setAmountOut('');
            await refreshBalances();

        } catch (err) {
            const error = err as SwapError;
            console.error('兑换失败:', {
                message: error.message,
                stack: error.stack,
                error
            });
            toast({
                title: "错误",
                description: `兑换失败: ${error.message}`,
                status: "error",
            });
        } finally {
            console.log('结束兑换过程...');
            setIsSwapping(false);
            setIsConfirmOpen(false);
        }
    };

    // 添加刷新余额的辅助函数
    const refreshBalances = async () => {
        if (tokenA?.isNative) {
            const newBalance = await fetchSolBalance();
            setTokenA({
                ...tokenA,
                balance: newBalance
            });
        } else if (tokenA) {
            const newBalance = await fetchTokenBalance(tokenA.mint);
            setTokenA({
                ...tokenA,
                balance: newBalance
            });
        }

        if (tokenB?.isNative) {
            const newBalance = await fetchSolBalance();
            setTokenB({
                ...tokenB,
                balance: newBalance
            });
        } else if (tokenB) {
            const newBalance = await fetchTokenBalance(tokenB.mint);
            setTokenB({
                ...tokenB,
                balance: newBalance
            });
        }
    };

    return (
        <Box p={6} maxW="container.sm" mx="auto">
            <VStack spacing={6}>
                <HStack w="full" justify="space-between">
                    <Text fontSize="2xl" fontWeight="bold">
                        代币兑换
                    </Text>
                    <Popover
                        isOpen={isSettingsOpen}
                        onClose={() => setIsSettingsOpen(false)}
                    >
                        <PopoverTrigger>
                            <IconButton
                                aria-label="设置"
                                icon={<FiSettings />}
                                variant="ghost"
                                onClick={() => setIsSettingsOpen(true)}
                            />
                        </PopoverTrigger>
                        <PopoverContent>
                            <PopoverArrow />
                            <PopoverCloseButton />
                            <PopoverHeader>交易设置</PopoverHeader>
                            <PopoverBody>
                                <VStack spacing={4} align="stretch">
                                    <Text>滑点容忍度 ({slippage}%)</Text>
                                    <Slider
                                        value={slippage}
                                        min={0.1}
                                        max={5}
                                        step={0.1}
                                        onChange={(value) => setSlippage(value)}
                                    >
                                        <SliderTrack>
                                            <SliderFilledTrack />
                                        </SliderTrack>
                                        <SliderThumb />
                                    </Slider>
                                    <HStack spacing={2}>
                                        {[0.5, 1, 3].map((value) => (
                                            <Button
                                                key={value}
                                                size="sm"
                                                variant={slippage === value ? "solid" : "outline"}
                                                onClick={() => setSlippage(value)}
                                            >
                                                {value}%
                                            </Button>
                                        ))}
                                    </HStack>
                                </VStack>
                            </PopoverBody>
                        </PopoverContent>
                    </Popover>
                </HStack>

                <TokenInput
                    value={amountIn}
                    onChange={handleAmountInChange}
                    token={tokenA}
                    onTokenSelect={handleTokenASelect}
                    balance={tokenA?.balance}
                />

                <Button 
                    onClick={handleSwitch}
                    size="sm"
                    variant="ghost"
                >
                    <Icon as={FaExchangeAlt} />
                </Button>

                <TokenInput
                    value={amountOut}
                    token={tokenB}
                    onTokenSelect={handleTokenBSelect}
                    balance={tokenB?.balance}
                    isOutput
                />

                <Button
                    colorScheme="blue"
                    onClick={handleSwap}
                    isLoading={isLoading}
                    loadingText="交易中..."
                    w="full"
                    isDisabled={!tokenA || !tokenB || !amountIn}
                >
                    {!tokenA || !tokenB 
                        ? "请选择代币" 
                        : !amountIn 
                            ? "请输入数量"
                            : "确认兑换"}
                </Button>

                {/* 显示兑换详情 */}
                {(isLoadingRate || exchangeRate) && (
                    <Box w="full" px={4}>
                        {isLoadingRate ? (
                            <VStack align="stretch" spacing={2}>
                                <SkeletonText noOfLines={3} />
                            </VStack>
                        ) : (
                            <VStack align="stretch" spacing={1}>
                                <Text fontSize="sm" color="gray.500">
                                    {exchangeRate}
                                </Text>
                                {priceImpact && (
                                    <Text 
                                        fontSize="sm" 
                                        color={Number(priceImpact) > 5 ? "red.500" : "gray.500"}
                                    >
                                        价格影响: {priceImpact}%
                                    </Text>
                                )}
                                {amountOut && (
                                    <Text fontSize="sm" color="gray.500">
                                        最小获得: {calculateMinimumReceived(amountOut)} {tokenB?.symbol}
                                    </Text>
                                )}
                                <Text fontSize="sm" color="gray.500">
                                    滑点设置: {slippage}%
                                </Text>
                            </VStack>
                        )}
                    </Box>
                )}
            </VStack>
            {/* 兑换确认弹窗 */}
            {tokenA && tokenB && (
                <SwapConfirmModal
                    isOpen={isConfirmOpen}
                    onClose={() => setIsConfirmOpen(false)}
                    onConfirm={confirmSwap}
                    tokenA={tokenA}
                    tokenB={tokenB}
                    amountIn={amountIn}
                    amountOut={amountOut}
                    exchangeRate={exchangeRate || ''}
                    priceImpact={priceImpact || '0'}
                    minimumReceived={calculateMinimumReceived(amountOut)}
                    slippage={slippage}
                    isLoading={isSwapping}
                />
            )}

            {/* 代币选择弹窗 */}
            <TokenSelectModal
                isOpen={isSelectingTokenA}
                onClose={() => setIsSelectingTokenA(false)}
                onSelect={handleTokenSelect}
                excludeToken={tokenB?.mint}
            />
            <TokenSelectModal
                isOpen={isSelectingTokenB}
                onClose={() => setIsSelectingTokenB(false)}
                onSelect={handleTokenSelect}
                excludeToken={tokenA?.mint}
            />
        </Box>
    );
}; 