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
    Flex,
    Divider,
    Card,
    CardBody,
    Badge,
    useColorModeValue,
    Center,
    Spinner,
} from '@chakra-ui/react';
import { FaExchangeAlt, FaChevronDown, FaInfoCircle, FaCog } from 'react-icons/fa';
import { FiSettings } from 'react-icons/fi';
import { RiArrowUpDownLine } from 'react-icons/ri';
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

    // 提前定义所有的颜色变量，而不是在JSX中调用hooks
    const bgColor = useColorModeValue('white', 'gray.800');
    const cardBorderColor = useColorModeValue('gray.200', 'gray.700');
    const accentColor = useColorModeValue('blue.500', 'blue.300');
    const textColor = useColorModeValue('gray.800', 'white');
    const secondaryTextColor = useColorModeValue('gray.600', 'gray.400');
    const detailsBgColor = useColorModeValue('gray.50', 'gray.700');
    const buttonHoverBgColor = useColorModeValue('gray.100', 'gray.600');

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

    // 获取池子信息
    const fetchPoolInfo = async (tokenAMint?: string, tokenBMint?: string) => {
        if (!tokenAMint || !tokenBMint) {
            console.log('获取池子信息失败: 缺少代币铸币地址');
            return;
        }

        try {
            setIsLoadingRate(true);
            console.log('开始获取池子信息:', tokenAMint, tokenBMint);

            // 清除旧的计算结果
            setAmountOut('');
            setPriceImpact(null);
            setExchangeRate(null);

           // 使用新的函数
            //const { poolData } = await getPoolInfo(connection, {
            //    tokenPair: [tokenAMint, tokenBMint]
            //});
            const { poolData } = await getPoolInfo(connection, {
                ammId: "5XsAkLg5scV7SMy7NZ6TaXZ6CcRjhVoxDtFo4TGEz7bW"
            });


            if (poolData) {
                console.log('池子信息获取成功:', {
                    baseTokenMint: poolData.poolKeys.baseMint.toString(),
                    quoteTokenMint: poolData.poolKeys.quoteMint.toString(),
                    baseReserve: poolData.poolInfo.baseReserve.toString(),
                    quoteReserve: poolData.poolInfo.quoteReserve.toString()
                });
                
                // 更新池子信息
                setPool(poolData);
                return poolData;
            } else {
                console.error('获取池子信息失败: 没有找到匹配的池子');
                toast({
                    title: "错误",
                    description: "无法找到这对代币的流动性池",
                    status: "error",
                });
                return null;
            }
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
                false // 这里应该是false，表示不是raw值
            );
            
            console.log('创建的 TokenAmount 对象:', {
                raw: amountInBN.raw.toString(),
                fixed: amountInBN.toFixed(),
                exact: amountInBN.toExact()
            });
            
            // 池子信息
            const baseReserve = pool.poolInfo.baseReserve;
            const quoteReserve = pool.poolInfo.quoteReserve;
            
            // 确定方向
            const isBaseToQuote = tokenA.mint === pool.poolKeys.baseMint.toString();
            
            // 简单日志输出参数
            console.log('Swap参数:', {
                amountIn: amountIn,
                tokenAMint: tokenA.mint,
                tokenBMint: tokenB.mint,
                baseReserveStr: baseReserve.toString(),
                quoteReserveStr: quoteReserve.toString(),
                isBaseToQuote
            });
            
            // 使用SDK计算输出金额
            let amountOutBN;
            if (isBaseToQuote) {
                amountOutBN = Liquidity.computeAmountOut({
                    amountIn: amountInBN,
                    currencyIn: inputToken,
                    currencyOut: new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenB.mint), tokenB.decimals),
                    poolInfo: pool.poolInfo,
                    poolKeys: pool.poolKeys,
                    slippage: new Percent(0)
                }).amountOut;
            } else {
                amountOutBN = Liquidity.computeAmountOut({
                    amountIn: amountInBN,
                    currencyIn: inputToken,
                    currencyOut: new Token(TOKEN_PROGRAM_ID, new PublicKey(tokenB.mint), tokenB.decimals),
                    poolInfo: pool.poolInfo,
                    poolKeys: pool.poolKeys,
                    slippage: new Percent(0)
                }).amountOut;
            }
            
            // 输出计算结果日志
            console.log('计算输出结果:', {
                amountOut: amountOutBN.toExact(),
                amountOutRaw: amountOutBN.raw.toString()
            });
            
            // 更新输出金额状态
            const amountOutFormatted = amountOutBN.toFixed(tokenB.decimals);
            setAmountOut(amountOutFormatted);
            
            // 使用价格影响计算
            const priceImpactValue = calculatePriceImpact(
                amountInBN,
                amountOutBN,
                pool.poolInfo.baseReserve,
                pool.poolInfo.quoteReserve
            );
            setPriceImpact(priceImpactValue);
            
            // 更新兑换比率
            try {
                if (amountInBN && amountOutBN && !amountInBN.raw.isZero()) {
                    // 使用BN库进行精确计算
                    const inAmountRaw = new BN(amountInBN.raw.toString());
                    const outAmountRaw = new BN(amountOutBN.raw.toString());
                    
                    // 考虑代币的小数位数
                    const inDecimals = tokenA.decimals;
                    const outDecimals = tokenB.decimals;
                    
                    console.log('兑换比率计算:', {
                        inAmountRaw: inAmountRaw.toString(),
                        outAmountRaw: outAmountRaw.toString(),
                        inDecimals,
                        outDecimals
                    });
                    
                    // 调整小数位，确保准确计算比率
                    let adjustedRate;
                    
                    // 计算1个代币A的输出量
                    // 首先，计算1个完整单位代币A的原始数量
                    const oneTokenA = new BN(10).pow(new BN(inDecimals));
                    
                    // 然后，计算相应的输出数量：(outAmount / inAmount) * oneTokenA
                    if (!inAmountRaw.isZero()) {
                        // 使用乘法后除法避免精度损失
                        const scaledOutput = outAmountRaw.mul(oneTokenA).div(inAmountRaw);
                        
                        // 转换为人类可读的格式，考虑B代币的小数位
                        adjustedRate = scaledOutput.toNumber() / Math.pow(10, outDecimals);
                        
                        console.log('调整后的比率:', {
                            oneTokenA: oneTokenA.toString(),
                            scaledOutput: scaledOutput.toString(),
                            adjustedRate
                        });
                    }
                    
                    if (adjustedRate !== undefined) {
                        const formattedRate = adjustedRate.toFixed(6);
                        setExchangeRate(`1 ${tokenA.symbol} = ${formattedRate} ${tokenB.symbol}`);
                    } else {
                        setExchangeRate(null);
                    }
                } else {
                    setExchangeRate(null);
                }
            } catch (error) {
                console.error('计算兑换比率时出错:', error);
                setExchangeRate(null);
            }
            
        } catch (error) {
            console.error('计算兑换比率失败:', error);
            toast({
                title: "错误",
                description: "计算兑换比率失败",
                status: "error",
            });
            setAmountOut('');
            setPriceImpact(null);
            setExchangeRate(null);
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
        amountOut: TokenAmount,
        baseReserve: BN,
        quoteReserve: BN
    ): string => {
        try {
            // 基本检查
            if (!pool || !tokenA || !tokenB) return '0.00';
            
            // 确定输入代币是base还是quote
            const isTokenABase = tokenA.mint === pool.poolKeys.baseMint.toString();
            
            // 根据方向确定正确的储备金
            const inputReserve = isTokenABase ? baseReserve : quoteReserve;
            const outputReserve = isTokenABase ? quoteReserve : baseReserve;
            
            console.log('价格影响方向:', {
                tokenAMint: tokenA.mint,
                baseMint: pool.poolKeys.baseMint.toString(),
                isTokenABase
            });
            
            // 获取输入和输出金额的原始值
            const amountInRaw = new BN(amountIn.raw.toString());
            const amountOutRaw = new BN(amountOut.raw.toString());
            
            // 如果金额太小，直接返回最小影响
            if (amountInRaw.isZero() || amountOutRaw.isZero()) {
                return '0.00';
            }
            
            // 1. 计算当前池子的无滑点价格
            const spotPrice = outputReserve.mul(new BN(1000000)).div(inputReserve);
            
            // 2. 计算实际执行价格
            const executionPrice = amountOutRaw.mul(new BN(1000000)).div(amountInRaw);
            
            // 3. 计算价格影响
            let priceImpact;
            if (spotPrice.gt(executionPrice)) {
                // 正常情况：无滑点价格 > 执行价格
                const impact = spotPrice.sub(executionPrice).mul(new BN(10000)).div(spotPrice);
                priceImpact = (impact.toNumber() / 100).toFixed(2);
            } else {
                // 异常情况：可能是数值精度问题
                priceImpact = '0.00';
            }
            
            console.log('价格影响计算:', {
                inputReserve: inputReserve.toString(),
                outputReserve: outputReserve.toString(),
                amountIn: amountInRaw.toString(),
                amountOut: amountOutRaw.toString(),
                spotPrice: spotPrice.toString(),
                executionPrice: executionPrice.toString(),
                priceImpact
            });
            
            return priceImpact;
        } catch (error) {
            console.error('计算价格影响时出错:', error);
            return '0.01';
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
        if (!tokenA || !tokenB) return;
        
        const tempToken = tokenA;
        setTokenA(tokenB);
        setTokenB(tempToken);
        
        // 清空当前输入和计算结果
        setAmountIn('');
        setAmountOut('');
        setPriceImpact(null);
        setExchangeRate(null);
        
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
            const ammId = "5XsAkLg5scV7SMy7NZ6TaXZ6CcRjhVoxDtFo4TGEz7bW";
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
        fetchPoolInfo(tokenA?.mint, tokenB?.mint);
    };

    return (
        <Box
            maxW="450px"
            mx="auto"
            mt={8}
            p={5}
        >
            <Card 
                bg={bgColor} 
                boxShadow="lg" 
                rounded="xl" 
                borderWidth="1px"
                borderColor={cardBorderColor}
            >
                <CardBody p={6}>
                    {/* 标题和设置 */}
                    <Flex justifyContent="space-between" alignItems="center" mb={6}>
                        <Text fontSize="2xl" fontWeight="bold" color={textColor}>
                            代币兑换
                        </Text>
                        <Popover placement="bottom-end">
                            <PopoverTrigger>
                                <IconButton
                                    aria-label="设置"
                                    icon={<FaCog />}
                                    size="md"
                                    variant="ghost"
                                    color={secondaryTextColor}
                                    _hover={{ color: accentColor }}
                                />
                            </PopoverTrigger>
                            <PopoverContent p={4} width="300px">
                                <PopoverArrow />
                                <PopoverCloseButton />
                                <PopoverHeader fontWeight="bold">交易设置</PopoverHeader>
                                <PopoverBody>
                                    <VStack spacing={4} align="stretch">
                                        <Box>
                                            <Flex justify="space-between" mb={2}>
                                                <Text fontWeight="medium">滑点容忍度</Text>
                                                <Text>{slippage}%</Text>
                                            </Flex>
                                            <Slider
                                                aria-label="滑点设置"
                                                value={slippage}
                                                min={0.1}
                                                max={5}
                                                step={0.1}
                                                onChange={setSlippage}
                                                colorScheme="blue"
                                            >
                                                <SliderTrack>
                                                    <SliderFilledTrack />
                                                </SliderTrack>
                                                <SliderThumb boxSize={6} />
                                            </Slider>
                                        </Box>
                                        
                                        <HStack spacing={2} justify="space-between">
                                            <Button 
                                                size="sm" 
                                                onClick={() => setSlippage(0.1)}
                                                colorScheme={slippage === 0.1 ? "blue" : "gray"}
                                                variant={slippage === 0.1 ? "solid" : "outline"}
                                            >
                                                0.1%
                                            </Button>
                                            <Button 
                                                size="sm"
                                                onClick={() => setSlippage(0.5)}
                                                colorScheme={slippage === 0.5 ? "blue" : "gray"}
                                                variant={slippage === 0.5 ? "solid" : "outline"}
                                            >
                                                0.5%
                                            </Button>
                                            <Button 
                                                size="sm"
                                                onClick={() => setSlippage(1.0)}
                                                colorScheme={slippage === 1.0 ? "blue" : "gray"}
                                                variant={slippage === 1.0 ? "solid" : "outline"}
                                            >
                                                1.0%
                                            </Button>
                                            <Button 
                                                size="sm"
                                                onClick={() => setSlippage(3.0)}
                                                colorScheme={slippage === 3.0 ? "blue" : "gray"}
                                                variant={slippage === 3.0 ? "solid" : "outline"}
                                            >
                                                3.0%
                                            </Button>
                                        </HStack>
                                    </VStack>
                                </PopoverBody>
                            </PopoverContent>
                        </Popover>
                    </Flex>

                    {/* 支付代币输入 */}
                    <Box 
                        mb={2}
                        p={4}
                        borderWidth="1px"
                        borderColor={cardBorderColor}
                        borderRadius="xl"
                        bg={detailsBgColor}
                    >
                        <Flex justifyContent="space-between" mb={1}>
                            <Text fontSize="sm" color={secondaryTextColor}>支付数量</Text>
                            <Text fontSize="sm" color={secondaryTextColor}>
                                余额: {tokenA ? tokenA.balance?.toFixed(4) || '0' : '0'}
                            </Text>
                        </Flex>
                        <Flex alignItems="center">
                            <Input
                                variant="unstyled"
                                placeholder="0.0"
                                value={amountIn}
                                onChange={(e) => handleAmountInChange(e.target.value)}
                                fontSize="2xl"
                                fontWeight="bold"
                                flex="1"
                                pr={2}
                            />
                            <Button
                                onClick={() => setIsSelectingTokenA(true)}
                                size="lg"
                                variant="ghost"
                                rightIcon={<FaChevronDown />}
                                px={4}
                                borderRadius="xl"
                                fontWeight="bold"
                                _hover={{ bg: buttonHoverBgColor }}
                            >
                                {tokenA ? (
                                    <HStack>
                                        {tokenA.icon && (
                                            <Box boxSize="24px" borderRadius="full" overflow="hidden">
                                                <img src={tokenA.icon} alt={tokenA.symbol} />
                                            </Box>
                                        )}
                                        <Text>{tokenA.symbol}</Text>
                                    </HStack>
                                ) : (
                                    '选择代币'
                                )}
                            </Button>
                        </Flex>
                    </Box>
                    
                    {/* 交换方向按钮 */}
                    <Center my={-3} zIndex={2} position="relative">
                        <IconButton
                            aria-label="交换代币"
                            icon={<RiArrowUpDownLine />}
                            size="md"
                            isRound
                            colorScheme="blue"
                            onClick={handleSwitch}
                        />
                    </Center>

                    {/* 接收代币输入 */}
                    <Box 
                        mt={2}
                        mb={6}
                        p={4}
                        borderWidth="1px"
                        borderColor={cardBorderColor}
                        borderRadius="xl"
                        bg={detailsBgColor}
                    >
                        <Flex justifyContent="space-between" mb={1}>
                            <Text fontSize="sm" color={secondaryTextColor}>获得数量</Text>
                            <Text fontSize="sm" color={secondaryTextColor}>
                                余额: {tokenB ? tokenB.balance?.toFixed(4) || '0' : '0'}
                            </Text>
                        </Flex>
                        <Flex alignItems="center">
                            <Input
                                variant="unstyled"
                                placeholder="0.0"
                                value={amountOut}
                                readOnly
                                fontSize="2xl"
                                fontWeight="bold"
                                flex="1"
                                pr={2}
                            />
                            <Button
                                onClick={() => setIsSelectingTokenB(true)}
                                size="lg"
                                variant="ghost"
                                rightIcon={<FaChevronDown />}
                                px={4}
                                borderRadius="xl"
                                fontWeight="bold"
                                _hover={{ bg: buttonHoverBgColor }}
                            >
                                {tokenB ? (
                                    <HStack>
                                        {tokenB.icon && (
                                            <Box boxSize="24px" borderRadius="full" overflow="hidden">
                                                <img src={tokenB.icon} alt={tokenB.symbol} />
                                            </Box>
                                        )}
                                        <Text>{tokenB.symbol}</Text>
                                    </HStack>
                                ) : (
                                    '选择代币'
                                )}
                            </Button>
                        </Flex>
                    </Box>

                    {/* 交易详情 */}
                    {exchangeRate && (
                        <Box
                            p={4}
                            mb={6}
                            borderWidth="1px"
                            borderColor={cardBorderColor}
                            borderRadius="xl"
                            bg={detailsBgColor}
                        >
                            <Flex justifyContent="space-between" mb={2}>
                                <Text fontSize="sm" color={secondaryTextColor}>兑换比率</Text>
                                <Text fontSize="sm" fontWeight="medium">{exchangeRate}</Text>
                            </Flex>
                            <Flex justifyContent="space-between">
                                <HStack>
                                    <Text fontSize="sm" color={secondaryTextColor}>价格影响</Text>
                                    <Tooltip label="交易对市场价格的影响百分比">
                                        <Box as="span" color={secondaryTextColor}>
                                            <FaInfoCircle size="0.75em" />
                                        </Box>
                                    </Tooltip>
                                </HStack>
                                <Badge 
                                    colorScheme={
                                        priceImpact && parseFloat(priceImpact) > 5 
                                            ? "red" 
                                            : priceImpact && parseFloat(priceImpact) > 1 
                                                ? "yellow" 
                                                : "green"
                                    }
                                >
                                    {priceImpact ? `${priceImpact}%` : '0.00%'}
                                </Badge>
                            </Flex>
                        </Box>
                    )}

                    {/* 主按钮 */}
                    <Button
                        onClick={handleSwap}
                        isLoading={isSwapping}
                        loadingText="处理中"
                        colorScheme="blue"
                        size="lg"
                        w="full"
                        borderRadius="xl"
                        py={6}
                        isDisabled={!publicKey || !tokenA || !tokenB || !amountIn || !amountOut || isSwapping}
                    >
                        {!publicKey 
                            ? '请连接钱包' 
                            : !tokenA || !tokenB 
                                ? '请选择代币' 
                                : !amountIn || !amountOut 
                                    ? '请输入金额' 
                                    : '确认兑换'}
                    </Button>
                </CardBody>
            </Card>

            {/* 代币选择弹窗 */}
            <TokenSelectModal
                isOpen={isSelectingTokenA || isSelectingTokenB}
                onClose={() => {
                    setIsSelectingTokenA(false);
                    setIsSelectingTokenB(false);
                }}
                onSelect={handleTokenSelect}
                excludeToken={isSelectingTokenA ? tokenB : tokenA}
            />

            <SwapConfirmModal
                isOpen={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                tokenA={tokenA}
                tokenB={tokenB}
                amountIn={amountIn}
                amountOut={amountOut}
                exchangeRate={exchangeRate}
                priceImpact={priceImpact}
                slippage={slippage}
                onConfirm={confirmSwap}
                isSwapping={isSwapping}
            />
        </Box>
    );
}; 