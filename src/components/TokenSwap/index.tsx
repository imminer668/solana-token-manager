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
} from '@solana/spl-token';
import { TokenSelectModal } from './TokenSelectModal';
import { 
    Liquidity,
    Token as RaydiumToken,
    TokenAmount,
    Percent,
    Currency,
    LIQUIDITY_STATE_LAYOUT_V4,
    MARKET_STATE_LAYOUT_V3,
    LiquidityPoolInfo,
    LiquidityPoolKeys,
    LiquidityPoolData,
} from '@raydium-io/raydium-sdk';
import BN from 'bn.js';

interface TokenInfo {
    mint: string;
    symbol: string;
    icon?: string;
    balance?: number;
    decimals: number;
    isNative?: boolean;
}

export const TokenSwap: React.FC = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();
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
    const [slippage, setSlippage] = useState(0.5); // 0.5% 默认滑点
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
            
            // 直接使用已知的池子地址
            const ammId = new PublicKey('');
            const poolAccount = await connection.getAccountInfo(ammId);

            if (!poolAccount) {
                throw new Error('流动性池不存在');
            }

            const poolInfo = LIQUIDITY_STATE_LAYOUT_V4.decode(poolAccount.data);
            console.log("原始池子信息:", {
                baseTokenMint: poolInfo.baseMint.toBase58(),
                quoteTokenMint: poolInfo.quoteMint.toBase58(),
                baseDecimal: poolInfo.baseDecimal.toNumber(),
                quoteDecimal: poolInfo.quoteDecimal.toNumber(),
                baseVault: poolInfo.baseVault.toBase58(),
                quoteVault: poolInfo.quoteVault.toBase58(),
                status: poolInfo.status.toNumber(),
            });

            // 获取储备金信息
            const baseVaultInfo = await getAccount(connection, poolInfo.baseVault);
            const quoteVaultInfo = await getAccount(connection, poolInfo.quoteVault);

            console.log("储备金账户信息:", {
                baseAmount: baseVaultInfo.amount.toString(),
                quoteAmount: quoteVaultInfo.amount.toString(),
            });

            // 验证代币对是否匹配
            const baseTokenMint = poolInfo.baseMint.toBase58();
            const quoteTokenMint = poolInfo.quoteMint.toBase58();
            
            const isMatch = (
                (baseTokenMint === tokenAMint && quoteTokenMint === tokenBMint) ||
                (baseTokenMint === tokenBMint && quoteTokenMint === tokenAMint)
            );

            if (!isMatch) {
                throw new Error('代币对不匹配');
            }

            // 构建池子数据
            const pool: LiquidityPoolData = {
                poolKeys: {
                    id: ammId,
                    baseMint: poolInfo.baseMint,
                    quoteMint: poolInfo.quoteMint,
                    lpMint: poolInfo.lpMint,
                    baseVault: poolInfo.baseVault,
                    quoteVault: poolInfo.quoteVault,
                    marketId: poolInfo.marketId,
                    marketProgramId: poolInfo.marketProgramId,
                    targetOrders: poolInfo.targetOrders,
                    withdrawQueue: poolInfo.withdrawQueue,
                    lpVault: poolInfo.lpVault,
                    owner: poolInfo.owner
                },
                poolInfo: {
                    baseDecimals: poolInfo.baseDecimal,
                    quoteDecimals: poolInfo.quoteDecimal,
                    lpDecimals: poolInfo.lpDecimal,
                    baseReserve: new BN(baseVaultInfo.amount.toString()),
                    quoteReserve: new BN(quoteVaultInfo.amount.toString()),
                    lpSupply: new BN(poolInfo.lpSupply || 0),
                    startTime: new BN(poolInfo.startTime || 0)
                }
            };

            console.log("处理后的池子数据:", {
                baseReserve: pool.poolInfo.baseReserve.toString(),
                quoteReserve: pool.poolInfo.quoteReserve.toString(),
                baseDecimals: pool.poolInfo.baseDecimals.toString(),
                quoteDecimals: pool.poolInfo.quoteDecimals.toString(),
            });

            setPool(pool);
            return pool;
        } catch (error) {
            console.error('获取流动性池信息失败:', error);
            toast({
                title: "错误",
                description: `获取流动性池信息失败: ${error.message}`,
                status: "error",
            });
            return null;
        } finally {
            setIsLoadingRate(false);
        }
    };

    // 计算兑换比率
    const calculateExchangeRate = async (amountIn: string) => {
        if (!pool || !tokenA || !tokenB || !amountIn || Number(amountIn) <= 0) {
            setExchangeRate(null);
            setPriceImpact(null);
            setAmountOut('');
            return;
        }

        if (!tokenA.decimals || !tokenB.decimals) {
            console.error('代币精度未定义:', { tokenA, tokenB });
            toast({
                title: "错误",
                description: "代币信息不完整",
                status: "error",
            });
            return;
        }

        try {
            setIsLoadingRate(true);

            // 获取池子信息中的储备金
            const baseReserve = pool.poolInfo.baseReserve;
            const quoteReserve = pool.poolInfo.quoteReserve;

            console.log('计算参数:', {
                amountIn,
                tokenA: {
                    symbol: tokenA.symbol,
                    decimals: tokenA.decimals,
                    mint: tokenA.mint
                },
                tokenB: {
                    symbol: tokenB.symbol,
                    decimals: tokenB.decimals,
                    mint: tokenB.mint
                },
                baseReserve: baseReserve.toString(),
                quoteReserve: quoteReserve.toString()
            });

            // 计算输入金额（使用 floor 避免舍入误差）
            const amountInBN = new BN(
                (Number(amountIn) * Math.pow(10, tokenA.decimals)).toFixed(0)
            );

            // 确定是否需要反转储备金
            const isBaseToQuote = tokenA.mint === pool.poolKeys.baseMint.toBase58();
            const [reserveIn, reserveOut] = isBaseToQuote 
                ? [baseReserve, quoteReserve]
                : [quoteReserve, baseReserve];

            // 计算输出金额
            const amountOutBN = calculateAmountOut(
                amountInBN,
                reserveIn,
                reserveOut,
                tokenA.decimals,
                tokenB.decimals
            );

            console.log('计算结果:', {
                amountInBN: amountInBN.toString(),
                amountOutBN: amountOutBN.toString(),
                isBaseToQuote
            });

            // 转换为显示金额
            const outputAmount = Number(amountOutBN.toString()) / Math.pow(10, tokenB.decimals);
            
            if (isNaN(outputAmount)) {
                console.error('输出金额计算错误');
                setAmountOut('');
                setExchangeRate(null);
                setPriceImpact(null);
                return;
            }

            setAmountOut(outputAmount.toFixed(tokenB.decimals));

            // 只在有实际输出时计算价格影响
            if (!amountOutBN.isZero()) {
                const impact = calculatePriceImpact(
                    amountInBN,
                    amountOutBN,
                    reserveIn,
                    reserveOut,
                    tokenA.decimals,
                    tokenB.decimals
                );

                setPriceImpact(impact.toFixed(2));

                // 设置兑换比率
                if (outputAmount > 0) {
                    const rate = outputAmount / Number(amountIn);
                    setExchangeRate(
                        `1 ${tokenA.symbol} = ${rate.toFixed(6)} ${tokenB.symbol}`
                    );
                } else {
                    setExchangeRate(null);
                }
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
        amountIn: BN,
        reserveIn: BN,
        reserveOut: BN,
        decimalsIn: number,
        decimalsOut: number
    ): BN => {
        try {
            // 确保所有参数都是 BN 类型
            const _reserveIn = BN.isBN(reserveIn) ? reserveIn : new BN(reserveIn.toString());
            const _reserveOut = BN.isBN(reserveOut) ? reserveOut : new BN(reserveOut.toString());

            // 检查输入值和储备金是否为零
            if (_reserveIn.isZero() || _reserveOut.isZero() || amountIn.isZero()) {
                console.log('输入金额或储备金为零');
                return new BN(0);
            }

            const amountInWithFee = amountIn.muln(997); // 0.3% fee
            const numerator = amountInWithFee.mul(_reserveOut);
            const denominator = _reserveIn.muln(1000).add(amountInWithFee);

            // 检查分母是否为零
            if (denominator.isZero()) {
                console.log('计算分母为零');
                return new BN(0);
            }

            return numerator.div(denominator);
        } catch (error) {
            console.error('计算输出金额时出错:', error);
            return new BN(0);
        }
    };

    // 计算价格影响
    const calculatePriceImpact = (
        amountIn: BN,
        amountOut: BN,
        reserveIn: BN,
        reserveOut: BN,
        decimalsIn: number,
        decimalsOut: number
    ): number => {
        try {
            // 确保所有参数都是 BN 类型
            const _reserveIn = BN.isBN(reserveIn) ? reserveIn : new BN(reserveIn.toString());
            const _reserveOut = BN.isBN(reserveOut) ? reserveOut : new BN(reserveOut.toString());

            // 检查储备金是否为零
            if (_reserveIn.isZero() || _reserveOut.isZero()) {
                console.log('储备金为零，无法计算价格影响');
                return 0;
            }

            // 计算中间价格（使用更大的精度来避免舍入误差）
            const PRECISION = 18;
            const scaleFactor = new BN(10).pow(new BN(PRECISION));
            
            const midPrice = _reserveOut
                .mul(scaleFactor)
                .div(_reserveIn);

            // 检查 midPrice 是否为零
            if (midPrice.isZero()) {
                console.log('中间价格为零，无法计算价格影响');
                return 0;
            }

            // 计算预期输出（使用相同的精度）
            const exactQuote = amountIn
                .mul(midPrice)
                .div(scaleFactor);

            // 检查 exactQuote 是否为零或小于实际输出
            if (exactQuote.isZero() || exactQuote.lt(amountOut)) {
                console.log('预期输出异常，无法计算价格影响');
                return 0;
            }

            try {
                // 计算价格影响（使用更安全的方式）
                const impactBN = exactQuote
                    .sub(amountOut)
                    .mul(new BN(10000))
                    .div(exactQuote);

                const impact = impactBN.toNumber() / 100;
                return Math.min(Math.max(0, impact), 100); // 限制在 0-100% 之间
            } catch (error) {
                console.error('计算最终价格影响时出错:', error);
                return 0;
            }
        } catch (error) {
            console.error('计算价格影响时出错:', error);
            return 0;
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
        calculateExchangeRate(amountIn);
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

        // TODO: 实现兑换逻辑
        toast({
            title: "提示",
            description: "兑换功能开发中",
            status: "info",
        });
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