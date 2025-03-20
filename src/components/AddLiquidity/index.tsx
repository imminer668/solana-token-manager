import React, { useState, useEffect } from 'react';
import {
    Box,
    Button,
    Input,
    VStack,
    HStack,
    Text,
    FormControl,
    FormLabel,
    FormHelperText,
    NumberInput,
    NumberInputField,
    Divider,
    useToast,
    Card,
    CardBody,
    CardHeader,
    InputGroup,
    InputRightElement,
    Flex,
    Image,
    Spinner,
    Heading
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey ,Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getPoolInfo } from '../TokenSwap/poolServices';
import { TOKEN_PROGRAM_ID, NATIVE_MINT } from '@solana/spl-token';
import { 
    Liquidity, 
    Token, 
    TokenAmount,
    TxVersion,SPL_ACCOUNT_LAYOUT,jsonInfo2PoolKeys,LiquidityPoolKeys
} from '@raydium-io/raydium-sdk';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { WalletNotConnectedError } from '@solana/wallet-adapter-base';
import { 
    createAssociatedTokenAccountInstruction, 
    getAssociatedTokenAddress, 
    createSyncNativeInstruction 
} from '@solana/spl-token';
import { decodeInstruction } from '@project-serum/serum';
import { struct, u8 } from '@solana/buffer-layout';
import bs58 from 'bs58';

// 定义TokenInfo接口用于存储代币信息
interface TokenInfo {
    mint: string;
    symbol: string;
    name?: string;
    decimals: number;
    icon?: string;
    balance?: number;
}

// 定义PoolInfo接口用于存储池子信息
interface PoolInfo {
    ammId: string;
    tokenA: TokenInfo;
    tokenB: TokenInfo;
    ratio: number;
    lpMint?: string;
}

// 辅助函数: 获取钱包中的代币账户
const getWalletTokenAccounts = async (connection, walletPublicKey) => {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(walletPublicKey, {
        programId: TOKEN_PROGRAM_ID,
    });
    
    return walletTokenAccount.value.map((item) => ({
        pubkey: item.pubkey,
        programId: item.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(item.account.data),
    }));
};

// 添加一个调试辅助函数，用于分析Raydium交易结构
const analyzeRaydiumInstruction = (ix, indexInTx) => {
    console.log(`------ 分析指令 ${indexInTx} ------`);
    console.log("程序ID:", ix.programId?.toString());
    
    // 尝试解码指令数据
    if (ix.data) {
        try {
            const dataArr = bs58.decode(ix.data);
            // 第一个字节通常是指令类型
            const instructionType = dataArr[0];
            console.log("指令类型 (第一个字节):", instructionType);
            console.log("指令数据 (Hex):", Buffer.from(dataArr).toString('hex'));
        } catch (e) {
            console.log("无法解码指令数据:", e);
        }
    }
    
    // 打印所有账户引用
    console.log("账户引用数量:", ix.keys?.length || 0);
    
    if (ix.keys) {
        ix.keys.forEach((keyObj, idx) => {
            console.log(`账户 ${idx}: ${keyObj.pubkey?.toString() || 'undefined'} (isSigner: ${keyObj.isSigner}, isWritable: ${keyObj.isWritable})`);
            
            // 特别关注第13个账户(索引为12)
            if (idx === 12 && !keyObj.pubkey) {
                console.log("发现关键的undefined pubkey!");
            }
        });
    }
    
    // 尝试与已知程序ID匹配
    const knownPrograms = {
        '11111111111111111111111111111111': '系统程序',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': 'SPL 代币程序',
        'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL': 'SPL 关联代币账户程序',
        '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium 流动性池程序 V4',
        'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr': 'Raydium Farm 程序',
        // 可以添加更多已知程序
    };
    
    if (ix.programId) {
        const programIdStr = ix.programId.toString();
        const knownProgram = knownPrograms[programIdStr];
        if (knownProgram) {
            console.log("已知程序:", knownProgram);
        }
    }
    
    console.log("-------------------------");
};

// 修改buildAndSendTx函数，处理交易超时问题
const buildAndSendTx = async (innerTransactions, connection, wallet) => {
    const txids = [];
    
    for (let i = 0; i < innerTransactions.length; i++) {
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount <= maxRetries) {
            try {
                console.log(`处理第 ${i + 1}/${innerTransactions.length} 个交易 (尝试 ${retryCount + 1}/${maxRetries + 1})`);
                
                // 创建新交易
                const transaction = new Transaction();
                
                // 获取最新区块哈希 - 每次重试都获取新的区块哈希
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = wallet.publicKey;
                
                // 添加更高的计算预算
                const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
                    units: 1400000  // 增加计算单元上限
                });
                
                // 添加优先费用
                const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
                    microLamports: 50000  // 添加优先费用提高交易处理速度
                });
                
                transaction.add(modifyComputeUnits);
                transaction.add(addPriorityFee);
                
                // 添加当前批次的所有指令
                for (const instruction of innerTransactions[i].instructions) {
                    transaction.add(instruction);
                }
                
                // 发送交易，使用更宽松的preflightCommitment
                console.log(`发送交易...`);
                const signature = await wallet.sendTransaction(transaction, connection, {
                    skipPreflight: true,
                    preflightCommitment: 'processed'
                });
                
                console.log(`交易已发送，签名:`, signature);
                txids.push(signature);
                
                // 使用更长的超时时间等待交易确认
                console.log(`等待交易确认，最多等待60秒...`);
                const confirmationStatus = await connection.confirmTransaction({
                    blockhash,
                    lastValidBlockHeight,
                    signature
                }, 'processed');
                
                if (confirmationStatus.value.err) {
                    throw new Error(`交易确认出错: ${JSON.stringify(confirmationStatus.value.err)}`);
                }
                
                console.log(`第 ${i + 1} 个交易已确认`);
                
                // 交易间延迟 - 增加延迟确保前一个交易完全处理
                if (i < innerTransactions.length - 1) {
                    console.log(`等待 5 秒后继续...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                
                // 成功则跳出重试循环
                break;
                
            } catch (error) {
                console.error(`交易失败 (尝试 ${retryCount + 1}/${maxRetries + 1}):`, error);
                
                // 检查是否是超时错误
                const isTimeoutError = 
                    error.message?.includes('Transaction was not confirmed') || 
                    error.message?.includes('timeout') ||
                    error.message?.includes('timed out');
                
                // 检查是否已达到最大重试次数
                if (retryCount >= maxRetries || !isTimeoutError) {
                    // 如果是第二个交易，可以继续执行后续交易
                    if (i === 1) {
                        console.log("第2个交易失败，继续执行第3个交易...");
                        break;
                    }
                    
                    // 否则抛出错误中断整个流程
                    throw error;
                }
                
                // 增加重试计数
                retryCount++;
                
                // 指数退避延迟
                const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                console.log(`将在 ${delay/1000} 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    return txids;
};

// 主组件
export const AddLiquidity: React.FC = () => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction, signTransaction } = useWallet();
    const toast = useToast();
    
    // 状态变量
    const [ammId, setAmmId] = useState('');
    const [tokenAAddress, setTokenAAddress] = useState('');
    const [tokenBAddress, setTokenBAddress] = useState('');
    const [isLoadingPool, setIsLoadingPool] = useState(false);
    const [poolInfo, setPoolInfo] = useState<PoolInfo | null>(null);
    const [tokenAAmount, setTokenAAmount] = useState('');
    const [tokenBAmount, setTokenBAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchMode, setSearchMode] = useState<'ammId' | 'tokens'>('ammId');
    
    // 切换搜索模式
    const toggleSearchMode = () => {
        setSearchMode(prev => prev === 'ammId' ? 'tokens' : 'ammId');
        // 重置状态
        setAmmId('');
        setTokenAAddress('');
        setTokenBAddress('');
        setPoolInfo(null);
        setTokenAAmount('');
        setTokenBAmount('');
    };
    
    // 加载池子信息 - 通过池子ID
    const loadPoolByAmmId = async () => {
        if (!ammId) {
            toast({
                title: "输入错误",
                description: "请输入有效的流动性池ID",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        
        try {
            setIsLoadingPool(true);
            
            // 验证ID是有效的PublicKey
            try {
                new PublicKey(ammId);
            } catch {
                throw new Error("无效的流动性池ID格式");
            }
            
            // 获取池子信息
            const { poolData } = await getPoolInfo(connection, { ammId });
            
            if (!poolData) {
                throw new Error("找不到该ID对应的流动性池");
            }
            
            // 获取代币A信息
            const mintA = poolData.poolKeys.baseMint.toString();
            const mintInfoA = await connection.getParsedAccountInfo(new PublicKey(mintA));
            const decimalsA = mintInfoA.value?.data ? (mintInfoA.value.data as any).parsed.info.decimals : 0;
            
            // 获取代币B信息
            const mintB = poolData.poolKeys.quoteMint.toString();
            const mintInfoB = await connection.getParsedAccountInfo(new PublicKey(mintB));
            const decimalsB = mintInfoB.value?.data ? (mintInfoB.value.data as any).parsed.info.decimals : 0;
            
            // 计算比例
            const baseReserve = Number(poolData.poolInfo.baseReserve);
            const quoteReserve = Number(poolData.poolInfo.quoteReserve);
            const ratio = baseReserve > 0 ? quoteReserve / baseReserve : 0;
            
            // 设置池子信息
            setPoolInfo({
                ammId,
                tokenA: {
                    mint: mintA,
                    symbol: `Token A (${mintA.slice(0, 4)}...${mintA.slice(-4)})`,
                    decimals: decimalsA,
                },
                tokenB: {
                    mint: mintB,
                    symbol: `Token B (${mintB.slice(0, 4)}...${mintB.slice(-4)})`,
                    decimals: decimalsB,
                },
                ratio,
                lpMint: poolData.poolKeys.lpMint.toString()
            });
            
            // 可以尝试获取代币余额
            if (publicKey) {
                // 获取代币A余额
                try {
                    // 使用getParsedTokenAccountsByOwner而不是getTokenAccountsByOwner
                    const tokenAAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                        mint: new PublicKey(mintA)
                    });
                    
                    if (tokenAAccounts.value.length > 0) {
                        // 正确访问已解析的代币账户数据
                        const tokenAccount = tokenAAccounts.value[0].account.data.parsed.info;
                        const tokenABalance = tokenAccount.tokenAmount.uiAmount;
                        
                        setPoolInfo(prev => prev ? {
                            ...prev,
                            tokenA: {
                                ...prev.tokenA,
                                balance: tokenABalance
                            }
                        } : null);
                    }
                } catch (error) {
                    console.error("获取代币A余额失败:", error);
                }
                
                // 获取代币B余额
                try {
                    // 使用getParsedTokenAccountsByOwner而不是getTokenAccountsByOwner
                    const tokenBAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
                        mint: new PublicKey(mintB)
                    });
                    
                    if (tokenBAccounts.value.length > 0) {
                        // 正确访问已解析的代币账户数据
                        const tokenAccount = tokenBAccounts.value[0].account.data.parsed.info;
                        const tokenBBalance = tokenAccount.tokenAmount.uiAmount;
                        
                        setPoolInfo(prev => prev ? {
                            ...prev,
                            tokenB: {
                                ...prev.tokenB,
                                balance: tokenBBalance
                            }
                        } : null);
                    }
                } catch (error) {
                    console.error("获取代币B余额失败:", error);
                }
            }
            
            toast({
                title: "成功",
                description: "成功加载流动性池信息",
                status: "success",
                duration: 3000,
                isClosable: true,
            });
            
        } catch (error) {
            console.error("加载池子失败:", error);
            toast({
                title: "错误",
                description: error.message || "加载流动性池失败",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoadingPool(false);
        }
    };
    
    // 加载池子信息 - 通过代币对
    const loadPoolByTokens = async () => {
        if (!tokenAAddress || !tokenBAddress) {
            toast({
                title: "输入错误",
                description: "请输入两个有效的代币地址",
                status: "error",
                duration: 3000,
                isClosable: true,
            });
            return;
        }
        
        try {
            setIsLoadingPool(true);
            
            // 验证地址是有效的PublicKey
            try {
                new PublicKey(tokenAAddress);
                new PublicKey(tokenBAddress);
            } catch {
                throw new Error("无效的代币地址格式");
            }
            
            // 获取所有池子
            const { poolsData } = await getPoolInfo(connection);
            
            if (!poolsData || poolsData.length === 0) {
                throw new Error("未找到任何流动性池");
            }
            
            // 查找匹配的池子
            const matchedPool = poolsData.find(pool => {
                const baseMint = pool.poolKeys.baseMint.toString();
                const quoteMint = pool.poolKeys.quoteMint.toString();
                
                return (
                    (baseMint === tokenAAddress && quoteMint === tokenBAddress) ||
                    (baseMint === tokenBAddress && quoteMint === tokenAAddress)
                );
            });
            
            if (!matchedPool) {
                throw new Error("找不到这两个代币的流动性池");
            }
            
            // 获取代币信息
            const baseMint = matchedPool.poolKeys.baseMint.toString();
            const quoteMint = matchedPool.poolKeys.quoteMint.toString();
            
            const mintInfoA = await connection.getParsedAccountInfo(new PublicKey(baseMint));
            const decimalsA = mintInfoA.value?.data ? (mintInfoA.value.data as any).parsed.info.decimals : 0;
            
            const mintInfoB = await connection.getParsedAccountInfo(new PublicKey(quoteMint));
            const decimalsB = mintInfoB.value?.data ? (mintInfoB.value.data as any).parsed.info.decimals : 0;
            
            // 计算比例
            const baseReserve = Number(matchedPool.poolInfo.baseReserve);
            const quoteReserve = Number(matchedPool.poolInfo.quoteReserve);
            const ratio = baseReserve > 0 ? quoteReserve / baseReserve : 0;
            
            // 设置池子ID和信息
            const foundAmmId = matchedPool.poolKeys.id.toString();
            setAmmId(foundAmmId);
            
            setPoolInfo({
                ammId: foundAmmId,
                tokenA: {
                    mint: baseMint,
                    symbol: `Token A (${baseMint.slice(0, 4)}...${baseMint.slice(-4)})`,
                    decimals: decimalsA,
                },
                tokenB: {
                    mint: quoteMint,
                    symbol: `Token B (${quoteMint.slice(0, 4)}...${quoteMint.slice(-4)})`,
                    decimals: decimalsB,
                },
                ratio,
                lpMint: matchedPool.poolKeys.lpMint.toString()
            });
            
            // 可以尝试获取代币余额，代码与loadPoolByAmmId中类似
            
            toast({
                title: "成功",
                description: `成功找到流动性池: ${foundAmmId.slice(0, 8)}...`,
                status: "success",
                duration: 3000,
                isClosable: true,
            });
            
        } catch (error) {
            console.error("查找池子失败:", error);
            toast({
                title: "错误",
                description: error.message || "查找流动性池失败",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoadingPool(false);
        }
    };
    
    // 根据Token A数量自动计算Token B数量
    const calculateTokenBAmount = (amountA: string) => {
        if (!poolInfo || !amountA || parseFloat(amountA) <= 0) {
            setTokenBAmount('');
            return;
        }
        
        const calculatedAmountB = parseFloat(amountA) * poolInfo.ratio;
        setTokenBAmount(calculatedAmountB.toFixed(6));
    };
    
    // 根据Token B数量自动计算Token A数量
    const calculateTokenAAmount = (amountB: string) => {
        if (!poolInfo || !amountB || parseFloat(amountB) <= 0 || poolInfo.ratio <= 0) {
            setTokenAAmount('');
            return;
        }
        
        const calculatedAmountA = parseFloat(amountB) / poolInfo.ratio;
        setTokenAAmount(calculatedAmountA.toFixed(6));
    };
    
    // 设置Token A的最大值
    const setMaxTokenA = () => {
        if (poolInfo?.tokenA.balance) {
            // 使用极小的金额进行测试
            const maxAmount = Math.min(poolInfo.tokenA.balance * 0.001, 1);
            setTokenAAmount(maxAmount.toString());
            calculateTokenBAmount(maxAmount.toString());
        }
    };
    
    // 设置Token B的最大值
    const setMaxTokenB = () => {
        if (poolInfo?.tokenB.balance) {
            // 使用极小的金额进行测试
            const maxAmount = Math.min(poolInfo.tokenB.balance * 0.001, 0.0001);
            setTokenBAmount(maxAmount.toString());
            calculateTokenAAmount(maxAmount.toString());
        }
    };
    
    // 修改handleAddLiquidity函数，跳过fetchInfo步骤
    const handleAddLiquidity = async () => {
        if (!publicKey) throw new WalletNotConnectedError();
        if (!poolInfo) return;
        
        setIsSubmitting(true);
        
        try {
            console.log("开始添加流动性流程");
            
            // 1. 获取池子详细信息
            const { poolData } = await getPoolInfo(connection, { ammId });
            console.log("池子数据:", poolData);
            
            // 2. 获取用户代币账户信息
            const userTokenAccounts = await getWalletTokenAccounts(connection, publicKey);
            
            // 3. 创建代币对象
            const tokenA = new Token(
                TOKEN_PROGRAM_ID,
                new PublicKey(poolInfo.tokenA.mint),
                poolInfo.tokenA.decimals,
                poolInfo.tokenA.symbol,
                poolInfo.tokenA.name || ''
            );
            
            const tokenB = new Token(
                TOKEN_PROGRAM_ID,
                new PublicKey(poolInfo.tokenB.mint),
                poolInfo.tokenB.decimals,
                poolInfo.tokenB.symbol,
                poolInfo.tokenB.name || ''
            );
            
            // 4. 计算池子当前比例
            const currentRatio = poolData.poolInfo.quoteReserve / poolData.poolInfo.baseReserve;
            console.log("获取池子当前比例:", {
                baseReserve: poolData.poolInfo.baseReserve,
                quoteReserve: poolData.poolInfo.quoteReserve,
                currentRatio,
                "input比例": parseFloat(tokenBAmount) / parseFloat(tokenAAmount)
            });
            
            // 5. 确保输入量与池子比例匹配
            let adjustedAmountA = parseFloat(tokenAAmount);
            // 限制最大数量
            if (adjustedAmountA > 1) {
                adjustedAmountA = 1;
                console.log("金额过大，已限制为最大1个代币");
            }
            
            // 6. 创建TokenAmount对象
            const inputTokenAmount = new TokenAmount(
                tokenA,
                Math.floor(adjustedAmountA * Math.pow(10, poolInfo.tokenA.decimals))
            );
            console.log("inputTokenAmount:", inputTokenAmount);
            const poolKeys = poolData.poolKeys;
            
            // 7. 使用池子比例直接计算另一种代币数量(基于池子比例)：
            console.log("使用池子比例直接计算另一种代币数量");
            
            // 修改池子比例计算，添加滑点
            const poolRatio = poolData.poolInfo.quoteReserve / poolData.poolInfo.baseReserve;
            
            // 添加1%的滑点余量
            const slippage = 0.01; // 1%滑点
            const adjustedRatio = poolRatio * (1 + slippage);
            
            // 计算另一种代币的数量，加上滑点
            const amountBRaw = adjustedAmountA * adjustedRatio * Math.pow(10, poolInfo.tokenB.decimals);
            
            // 创建TokenAmount对象
            const maxAnotherAmount = new TokenAmount(
                tokenB,
                Math.floor(amountBRaw)
            );
            
            console.log("计算得到的另一个代币数量:", {
                "池子原始比例": poolRatio,
                "添加滑点后比例": adjustedRatio,
                "输入金额A": adjustedAmountA,
                "计算得到的B数量(含滑点)": Math.floor(amountBRaw),
                "B代币小数位": poolInfo.tokenB.decimals
            });
            
            // 8. 创建添加流动性指令
            console.log("创建添加流动性指令...");
            const addLiquidityInstruction = await Liquidity.makeAddLiquidityInstructionSimple({
                connection,
                poolKeys: poolKeys,
                userKeys: {
                    owner: publicKey,
                    payer: publicKey,
                    tokenAccounts: userTokenAccounts,
                },
                amountInA: inputTokenAmount,
                amountInB: maxAnotherAmount,
                fixedSide: 'a',
                makeTxVersion: TxVersion.LEGACY,
                computeBudgetConfig: {
                    units: 1000000,
                    microLamports: 200000 // 增加计算预算
                },
                lookupTableCache: {}
            });
            
            // 9. 构建并发送交易 - 使用我们上面定义的辅助函数
            console.log("发送添加流动性交易...");
            const txids = await buildAndSendTx(
                addLiquidityInstruction.innerTransactions,
                connection,
                { publicKey, sendTransaction }
            );
            
            console.log("添加流动性交易完成，交易ID:", txids);
            
            toast({
                title: "添加流动性成功",
                description: `已成功添加流动性到池子`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });
            
            // 重置输入
            setTokenAAmount('');
            setTokenBAmount('');
            
        } catch (error) {
            console.error("添加流动性错误:", error);
            
            let errorMessage = "添加流动性失败";
            
            // 检查特定的错误类型
            if (error.message && error.message.includes('Transaction was not confirmed')) {
                errorMessage = "交易因超时未确认，但可能已成功处理。请稍后检查您的钱包余额或在Solana Explorer中查看交易状态";
                // 这里可以添加查询交易状态的代码
            } else if (error.message && error.message.includes('No instructions provided')) {
                errorMessage = "无法创建添加流动性指令，请稍后重试";
            } else if (error.message && error.message.includes('Cannot read properties')) {
                errorMessage = "流动性池数据格式错误，无法添加流动性";
            } else if (error instanceof Error) {
                errorMessage = error.message;
            }
            
            console.error("错误详情:", {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            
            // 提示用户查询交易状态的网址
            if (error.message && error.message.includes('Transaction was not confirmed')) {
                const lastTxid = error.message.match(/Check signature ([a-zA-Z0-9]+)/);
                if (lastTxid && lastTxid[1]) {
                    const txSignature = lastTxid[1];
                    const explorerUrl = `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`;
                    console.log("可以在以下链接查询交易状态:", explorerUrl);
                    
                    errorMessage += `\n您可以在Solana Explorer查询交易状态：${explorerUrl}`;
                }
            }
            
            toast({
                title: "添加流动性失败",
                description: errorMessage,
                status: "error",
                duration: 10000,  // 增加显示时间
                isClosable: true,
            });
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // 判断是否可以添加流动性
    const canAddLiquidity = 
        !!poolInfo && 
        !!tokenAAmount && 
        !!tokenBAmount && 
        parseFloat(tokenAAmount) > 0 && 
        parseFloat(tokenBAmount) > 0;
    
    return (
        <Box p={5}>
            <Heading size="lg" mb={6}>添加流动性</Heading>
            
            {/* 搜索模式选择 */}
            <HStack mb={6}>
                <Button 
                    colorScheme={searchMode === 'ammId' ? 'blue' : 'gray'} 
                    onClick={() => setSearchMode('ammId')}
                    flex={1}
                >
                    通过流动性池ID查找
                </Button>
                <Button 
                    colorScheme={searchMode === 'tokens' ? 'blue' : 'gray'} 
                    onClick={() => setSearchMode('tokens')}
                    flex={1}
                >
                    通过代币对查找
                </Button>
            </HStack>
            
            {/* 搜索区域 */}
            <Card mb={6}>
                <CardHeader>
                    <Heading size="md">
                        {searchMode === 'ammId' ? '输入流动性池ID' : '输入代币对地址'}
                    </Heading>
                </CardHeader>
                <CardBody>
                    {searchMode === 'ammId' ? (
                        <VStack spacing={4}>
                            <FormControl>
                                <FormLabel>流动性池ID (AMM ID)</FormLabel>
                                <Input 
                                    value={ammId} 
                                    onChange={(e) => setAmmId(e.target.value)}
                                    placeholder="输入流动性池ID..."
                                />
                                <FormHelperText>输入Raydium流动性池的AMM ID</FormHelperText>
                            </FormControl>
                            <Button 
                                colorScheme="blue" 
                                onClick={loadPoolByAmmId} 
                                isLoading={isLoadingPool}
                                width="100%"
                            >
                                加载池子信息
                            </Button>
                        </VStack>
                    ) : (
                        <VStack spacing={4}>
                            <FormControl>
                                <FormLabel>代币A地址</FormLabel>
                                <Input 
                                    value={tokenAAddress} 
                                    onChange={(e) => setTokenAAddress(e.target.value)}
                                    placeholder="输入第一个代币地址..."
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>代币B地址</FormLabel>
                                <Input 
                                    value={tokenBAddress} 
                                    onChange={(e) => setTokenBAddress(e.target.value)}
                                    placeholder="输入第二个代币地址..."
                                />
                            </FormControl>
                            <Button 
                                colorScheme="blue" 
                                onClick={loadPoolByTokens} 
                                isLoading={isLoadingPool}
                                width="100%"
                            >
                                查找流动性池
                            </Button>
                        </VStack>
                    )}
                </CardBody>
            </Card>
            
            {/* 池子信息和添加流动性表单 */}
            {poolInfo && (
                <Card mb={6}>
                    <CardHeader>
                        <Heading size="md">池子信息</Heading>
                    </CardHeader>
                    <CardBody>
                        <VStack spacing={4} align="stretch">
                            {/* 池子信息 */}
                            <Box p={4} borderWidth="1px" borderRadius="lg">
                                <VStack spacing={2} align="stretch">
                                    <HStack justify="space-between">
                                        <Text fontWeight="bold">流动性池ID:</Text>
                                        <Text>{poolInfo.ammId.slice(0, 8)}...{poolInfo.ammId.slice(-8)}</Text>
                                    </HStack>
                                    <Divider />
                                    <HStack justify="space-between">
                                        <Text fontWeight="bold">代币A:</Text>
                                        <Text>{poolInfo.tokenA.symbol}</Text>
                                    </HStack>
                                    <HStack justify="space-between">
                                        <Text fontWeight="bold">代币B:</Text>
                                        <Text>{poolInfo.tokenB.symbol}</Text>
                                    </HStack>
                                    <HStack justify="space-between">
                                        <Text fontWeight="bold">比例:</Text>
                                        <Text>1 {poolInfo.tokenA.symbol.slice(0, 6)}... = {poolInfo.ratio.toFixed(6)} {poolInfo.tokenB.symbol.slice(0, 6)}...</Text>
                                    </HStack>
                                    {poolInfo.tokenA.balance !== undefined && (
                                        <HStack justify="space-between">
                                            <Text fontWeight="bold">代币A余额:</Text>
                                            <Text>{poolInfo.tokenA.balance.toFixed(6)}</Text>
                                        </HStack>
                                    )}
                                    {poolInfo.tokenB.balance !== undefined && (
                                        <HStack justify="space-between">
                                            <Text fontWeight="bold">代币B余额:</Text>
                                            <Text>{poolInfo.tokenB.balance.toFixed(6)}</Text>
                                        </HStack>
                                    )}
                                </VStack>
                            </Box>
                            
                            {/* 添加流动性表单 */}
                            <VStack spacing={4} align="stretch">
                                <FormControl>
                                    <FormLabel>输入 {poolInfo.tokenA.symbol} 数量</FormLabel>
                                    <InputGroup>
                                        <NumberInput 
                                            value={tokenAAmount} 
                                            onChange={(valueAsString) => {
                                                setTokenAAmount(valueAsString);
                                                calculateTokenBAmount(valueAsString);
                                            }}
                                            min={0}
                                            precision={6}
                                            width="100%"
                                        >
                                            <NumberInputField placeholder="输入数量..." />
                                        </NumberInput>
                                        <InputRightElement width="4.5rem">
                                            <Button 
                                                h="1.75rem" 
                                                size="sm" 
                                                onClick={setMaxTokenA}
                                                isDisabled={!poolInfo?.tokenA.balance}
                                            >
                                                最大
                                            </Button>
                                        </InputRightElement>
                                    </InputGroup>
                                </FormControl>
                                
                                <Flex justify="center">
                                    <Divider width="80%" />
                                </Flex>
                                
                                <FormControl>
                                    <FormLabel>输入 {poolInfo.tokenB.symbol} 数量</FormLabel>
                                    <InputGroup>
                                        <NumberInput 
                                            value={tokenBAmount} 
                                            onChange={(valueAsString) => {
                                                setTokenBAmount(valueAsString);
                                                calculateTokenAAmount(valueAsString);
                                            }}
                                            min={0}
                                            precision={6}
                                            width="100%"
                                        >
                                            <NumberInputField placeholder="输入数量..." />
                                        </NumberInput>
                                        <InputRightElement width="4.5rem">
                                            <Button 
                                                h="1.75rem" 
                                                size="sm" 
                                                onClick={setMaxTokenB}
                                                isDisabled={!poolInfo?.tokenB.balance}
                                            >
                                                最大
                                            </Button>
                                        </InputRightElement>
                                    </InputGroup>
                                </FormControl>
                                
                                <Button
                                    colorScheme="blue"
                                    onClick={handleAddLiquidity}
                                    isLoading={isSubmitting}
                                    loadingText="处理中..."
                                    isDisabled={!canAddLiquidity || !publicKey}
                                    size="lg"
                                    mt={2}
                                >
                                    添加流动性
                                </Button>
                                
                                <Text fontSize="sm" color="red.500" fontWeight="bold">
                                    重要提示: 请先使用极小金额测试添加流动性功能。Raydium的流动性添加可能因交易复杂性而失败。
                                </Text>
                            </VStack>
                        </VStack>
                    </CardBody>
                </Card>
            )}
            <Text mt={2} fontSize="sm" color="blue.500">
                提示: 添加流动性时请注意以下几点:
                1. 使用小额测试（1-5个代币）
                2. 如果部分操作完成，可能需要刷新页面查看最新状态
                3. 某些指令可能因复杂度原因无法执行，但不影响整体功能
            </Text>
        </Box>
    );
};
