import { 
    Box,
    VStack,
    Button,
    FormControl,
    FormLabel,
    NumberInput,
    NumberInputField,
    useToast,
    Text,
    HStack,
    Badge,
    Divider,
    Spinner,
    Alert,
    AlertIcon,
    AlertDescription,
    Progress
} from '@chakra-ui/react';
import { PublicKey } from '@solana/web3.js';
import { useState } from 'react';
import { PoolDetails } from './PoolDetails';
import { 
    MAINNET_PROGRAM_ID,
    jsonInfo2PoolKeys,
    Liquidity,
    MarketV2,
    TxVersion,
    MARKET_STATE_LAYOUT_V3,
    DEVNET_PROGRAM_ID,
    TokenAccount,
    SPL_ACCOUNT_LAYOUT,
    ComputeBudgetConfig
} from '@raydium-io/raydium-sdk';
import { TOKEN_PROGRAM_ID,NATIVE_MINT,
    getMint,
    createSetAuthorityInstruction,
    AuthorityType } from '@solana/spl-token';
import { BN } from '@project-serum/anchor';
import { Transaction } from '@solana/web3.js';
import { useWallet,useConnection } from '@solana/wallet-adapter-react';

interface PoolCreatorProps {
    marketId: PublicKey;
    tokenMint: string;
    baseAmount: string;
    quoteAmount: string;
    onPoolCreated: (details: {
        lpMint: string;
        poolId: string;
    }) => void;
}

export const PoolCreator: React.FC<PoolCreatorProps> = ({
    marketId,
    tokenMint,
    baseAmount,
    quoteAmount,
    onPoolCreated
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [poolDetails, setPoolDetails] = useState<PoolDetails | null>(null);
    const toast = useToast();
    const { publicKey, sendTransaction, signTransaction } = useWallet();
    const { connection } = useConnection();

    const createPool = async () => {
        setIsCreating(true);
        setProgress(0);
        try {
            // 流动性池创建逻辑...
           
            // 更多创建步骤...
            
            // 最后步骤...
            

            // 2. 创建流动性池
            console.log('Creating liquidity pool...');
            const baseMint = new PublicKey(tokenMint);
            const quoteMint = NATIVE_MINT;
            const marketProgramId = DEVNET_PROGRAM_ID.OPENBOOK_MARKET;
            //const raydiumProgram = MAINNET_PROGRAM_ID;
            const raydiumProgram = DEVNET_PROGRAM_ID;
            // 获取当前用户的所有代币账户信息
            const walletTokenAccount = await connection.getTokenAccountsByOwner(publicKey, {
                programId: TOKEN_PROGRAM_ID
            });
            // 将获取到的代币账户信息转换为 TokenAccount 类型的数组
            const tokenAccountsInfo: TokenAccount[] = walletTokenAccount.value.map((i) => ({
                pubkey: i.pubkey, // 代币账户的公钥
                programId: i.account.owner, // 代币账户所属的程序ID
                accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data) // 解码后的代币账户信息
            }));
            

                // 在创建池之前检查余额
            const tokenAccount = tokenAccountsInfo.find(
                account => account.accountInfo.mint.equals(baseMint)
            );

            if (!tokenAccount) {
                throw new Error('Token account not found');
            }
            // 打印更详细的代币账户信息
            console.log('Token Account Info:', {
                mint: tokenAccount.accountInfo.mint.toBase58(),
                owner: tokenAccount.accountInfo.owner.toBase58(),
                amount: tokenAccount.accountInfo.amount.toString(),
                delegate: tokenAccount.accountInfo.delegate?.toBase58() || 'none',
                delegateAmount: tokenAccount.accountInfo.delegatedAmount.toString()
            });

            // 检查代币账户的所有者是否正确
            if (!tokenAccount.accountInfo.owner.equals(publicKey)) {
                console.error('Token account owner mismatch');
            }

            const tokenBalance = await connection.getTokenAccountBalance(tokenAccount.pubkey);
            const solBalance = await connection.getBalance(publicKey);

            console.log('Token balance:', tokenBalance.value.uiAmount);
            console.log('SOL balance:', solBalance / 1e9);

            if (tokenBalance.value.uiAmount < 100 || solBalance < 100000000) {
                throw new Error('Insufficient balance for pool creation');
            }

            // 检查 AmmV4 程序账户
            const ammProgramAccount = await connection.getAccountInfo(DEVNET_PROGRAM_ID.AmmV4);
            console.log('AMM Program:', {
                programId: DEVNET_PROGRAM_ID.AmmV4.toBase58(),
                exists: !!ammProgramAccount,
                dataLength: ammProgramAccount?.data.length
            });

            // 打印完整的流动性池创建参数
            console.log('Pool Creation Params:', {
                marketId: marketId.toBase58(),
                baseMint: baseMint.toBase58(),
                quoteMint: quoteMint.toBase58(),
                baseAmount: new BN(baseAmount* 10**9).toString(),
                quoteAmount: new BN(quoteAmount* 10**9).toString(),
                programId: DEVNET_PROGRAM_ID.AmmV4.toBase58()
            });
            setProgress(30);
            // 检查是否有重复的流动性池
            const existingPools = await connection.getProgramAccounts(DEVNET_PROGRAM_ID.AmmV4, {
                filters: [
                    {
                        memcmp: {
                            offset: 8, // 市场 ID 的偏移量
                            bytes: marketId.toBase58()
                        }
                    }
                ]
            });
            console.log('Existing pools for this market:', existingPools.length);

            


            // 这个配置用于指定计算预算的参数。计算预算是Solana区块链中的一项机制，用于限制智能合约执行的计算资源。
            // 'units' 字段指定了合约执行的最大计算单元数，'microLamports' 字段指定了每个计算单元的微 Lamport 成本。
            // 这个配置将限制合约执行的计算资源，防止过度消耗计算资源，避免可能的攻击或不当使用。
            const budget: ComputeBudgetConfig = {
                units: 1400000, // 最大计算单元数
                microLamports: 50000 // 每个计算单元的微 Lamport 成本
            };

            // feeDestinationId 参数用于指定交易手续费的接收地址
            // 在本例中，我们将手续费接收地址设置为当前用户的公钥
            const { innerTransactions: poolInnerTransactions, address: poolAddress } = await Liquidity.makeCreatePoolV4InstructionV2Simple({

                connection,
                programId: DEVNET_PROGRAM_ID.AmmV4,
                marketInfo: {
                    programId: DEVNET_PROGRAM_ID.OPENBOOK_MARKET,
                    marketId: marketId
                },
                associatedOnly: false,
                ownerInfo: {
                    feePayer: publicKey,
                    wallet: publicKey,
                    tokenAccounts: tokenAccountsInfo,
                    useSOLBalance: true
                },
                baseMintInfo: {
                    mint: baseMint,
                    decimals: 9
                },
                quoteMintInfo: {
                    mint: quoteMint,
                    decimals: 9
                },
                startTime: new BN(Date.now() / 1000),
                baseAmount: new BN(baseAmount * 10**9),  
                quoteAmount:   new BN(quoteAmount * 10**9),
                computeBudgetConfig: budget,
                checkCreateATAOwner: true,
                makeTxVersion: TxVersion.LEGACY,
                feeDestinationId: new PublicKey("3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR"), // for devnet
            //  feeDestinationId: new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"), // for mainnet
                });

            // 打印池子内的交易列表
            console.log("Pool address ====>", poolInnerTransactions);
            // 打印自动做市商（AMM）ID
            console.log("ammId ===>", poolAddress.ammId.toBase58());
            // 打印市场ID
            console.log("marketId ====>", poolAddress.marketId.toBase58());
            // 打印程序代币（PC）的铸币地址，程序代币是流动性池中的一种特殊代币
            console.log("pcMint ===>", poolAddress.pcMint.toBase58());
            // 打印程序代币（PC）的金库地址
            console.log("pcVault ===>", poolAddress.pcVault.toBase58());
            // 打印币种代币（Coin）的铸币地址，币种代币是流动性池中交易的另一方币种
            console.log("coinMint ===>", poolAddress.coinMint.toBase58());
            // 打印币种代币（Coin）的金库地址
            console.log("coinVault ===>", poolAddress.coinVault.toBase58());
            // 打印流动性池代币（LP）的铸币地址，流动性池代币是流动性池中交易的凭证
            console.log("lpMint ===>", poolAddress.lpMint.toBase58());
            
            setProgress(60);
            for (let i = 0; i < poolInnerTransactions.length; i++) {
                const transaction = new Transaction();
                for (let j = 0; j < poolInnerTransactions[i].instructions.length; j++) {
                    transaction.add(poolInnerTransactions[i].instructions[j]);
                }
                
                if (publicKey != undefined && signTransaction != undefined) {
                    try {
                        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                        transaction.feePayer = publicKey;

                        let signedTx = await signTransaction(transaction);
                        const signature = await connection.sendRawTransaction(signedTx.serialize());
                        console.log(`Pool transaction ${i + 1} signature ====>`, signature);
                        await connection.confirmTransaction(signature, 'confirmed');
                    } catch (err) {
                        console.log("Pool transaction error ===>", err);
                        throw err;
                    }
                }
            }
            
            setProgress(100);

            console.log('Pool created successfully');

            const details = {
                marketId: marketId,
                poolId: poolAddress.ammId.toBase58(),
                lpMint: poolAddress.lpMint.toBase58(),
                baseVault: "基础代币金库地址",
                quoteVault: "报价代币金库地址",
                baseAmount: baseAmount,
                quoteAmount: quoteAmount
            };

            setPoolDetails(details);
            onPoolCreated(details);

            toast({
                title: "成功",
                description: "流动性池创建成功",
                status: "success",
                duration: 5000,
                isClosable: true
            });
        } catch (error) {
            if (error.message === 'User rejected the request.') {
                toast({
                    title: "错误",
                    description: `用户拒绝了钱包请求`,
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
            } else {
                toast({
                    title: "错误",
                    description: `创建流动性池失败: ${error.message}`,
                    status: "error",
                    duration: 5000,
                    isClosable: true
                });
            }
        } finally {
            setIsCreating(false);
        }
    };

    if (poolDetails) {
        return <PoolDetails details={poolDetails} />;
    }

    return (
        <Box 
            w="100%" 
            p={6} 
            borderWidth={1} 
            borderRadius="lg" 
            borderColor="purple.200"
            bg="white"
            boxShadow="sm"
            position="relative"
        >
            <VStack spacing={4} align="start" w="100%">
                <HStack justify="space-between" w="100%">
                    <Text fontSize="xl" fontWeight="bold">确认创建</Text>
                    <Badge colorScheme="purple" fontSize="md" px={3} py={1} borderRadius="full">
                        最后一步
                    </Badge>
                </HStack>

                <Divider />

                <VStack spacing={3} w="100%" align="start">
                    <Text fontSize="sm" color="gray.600">
                        您将创建一个新的流动性池，包含：
                    </Text>
                    
                    <HStack 
                        w="100%" 
                        p={4} 
                        bg="purple.50" 
                        borderRadius="md"
                        justify="space-between"
                    >
                        <VStack align="start" spacing={1}>
                            <Text fontSize="sm" color="gray.600">代币数量</Text>
                            <Text fontSize="lg" fontWeight="bold">{baseAmount}</Text>
                        </VStack>
                        <Text fontSize="xl" color="purple.500">+</Text>
                        <VStack align="start" spacing={1}>
                            <Text fontSize="sm" color="gray.600">SOL 数量</Text>
                            <Text fontSize="lg" fontWeight="bold">{quoteAmount}</Text>
                        </VStack>
                    </HStack>

                    <Alert status="info" borderRadius="md">
                        <AlertIcon />
                        <AlertDescription fontSize="sm">
                            创建流动性池后，您将收到对应数量的 LP 代币作为凭证
                        </AlertDescription>
                    </Alert>
                </VStack>

                <Button
                    colorScheme="purple"
                    size="lg"
                    width="100%"
                    onClick={createPool}
                    isLoading={isCreating}
                    loadingText="创建中..."
                    disabled={isCreating}
                >
                    创建流动性池
                </Button>

                {isCreating && (
                    <VStack w="100%" spacing={2}>
                        <Progress 
                            hasStripe 
                            isAnimated 
                            value={progress} 
                            w="100%" 
                            colorScheme="purple" 
                            borderRadius="full"
                        />
                        <Text fontSize="sm" color="gray.500">
                            正在创建流动性池，请稍候...
                        </Text>
                    </VStack>
                )}
            </VStack>
        </Box>
    );
}; 