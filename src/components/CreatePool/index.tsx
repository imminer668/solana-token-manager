import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { ComputeBudgetProgram } from '@solana/web3.js';
import { 
    NATIVE_MINT,
    getMint,
    createSetAuthorityInstruction,
    AuthorityType
} from '@solana/spl-token';
import { useEffect, useState } from 'react';
import { 
    Box,
    VStack,
    Button,
    FormControl,
    FormLabel,
    NumberInput,
    NumberInputField,
    useToast,
    Text
} from '@chakra-ui/react';
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
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@project-serum/anchor';


const CreatePool = ({ tokenMint }: { tokenMint: string }) => {
    const { publicKey, sendTransaction, signTransaction } = useWallet();
    const { connection } = useConnection();
    const toast = useToast();
    const [baseAmount, setBaseAmount] = useState('100');
    const [quoteAmount, setQuoteAmount] = useState('0.1');
    const [isLoading, setIsLoading] = useState(false);

    const checkAndRevokeAuthority = async (mintAddress: string): Promise<boolean> => {
        try {
            const mintInfo = await getMint(connection, new PublicKey(mintAddress));
            
            if (mintInfo.mintAuthority === null) {
                console.log('代币已放弃权限');
                return true;
            }

            if (!publicKey || !mintInfo.mintAuthority.equals(publicKey)) {
                toast({
                    title: "错误",
                    description: "您不是代币的发行权限持有者",
                    status: "error",
                    duration: 5000,
                    isClosable: true,
                });
                return false;
            }

            const transaction = new Transaction();
            transaction.add(
                createSetAuthorityInstruction(
                    new PublicKey(mintAddress),
                    publicKey,
                    AuthorityType.MintTokens,
                    null
                )
            );

            const signature = await sendTransaction(transaction, connection);
            await connection.confirmTransaction(signature, 'confirmed');

            console.log('成功放弃代币权限');
            return true;

        } catch (error) {
            console.error('检查或放弃权限失败:', error);
            toast({
                title: "错误",
                description: "检查或放弃代币权限失败",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return false;
        }
    };

    const createPool = async () => {
        if (!publicKey || !tokenMint) {
            toast({
                title: "错误",
                description: "请先连接钱包并选择代币",
                status: "error",
                duration: 5000,
                isClosable: true,
            });
            return;
        }

        try {
            setIsLoading(true);
            console.log('开始创建流动性池...');

            // 检查代币权限
            /*const hasRevokedAuthority = await checkAndRevokeAuthority(tokenMint);
            if (!hasRevokedAuthority) {
                return;
            }*/

            // 1. 创建市场
            console.log('Creating market...');
            let marketId: PublicKey | null = null;
            
            const baseMint = new PublicKey(tokenMint);
            const quoteMint = NATIVE_MINT;
            const marketProgramId = DEVNET_PROGRAM_ID.OPENBOOK_MARKET;
            //const raydiumProgram = MAINNET_PROGRAM_ID;
            const raydiumProgram = DEVNET_PROGRAM_ID;
            
            const { innerTransactions, address } = await MarketV2.makeCreateMarketInstructionSimple({
                connection,
                wallet: publicKey,
                baseInfo: {
                    mint: baseMint,
                    decimals: 9
                },
                quoteInfo: {
                    mint: quoteMint,
                    decimals: 9
                },
                dexProgramId: marketProgramId,
                lotSize: 1,
                tickSize: 0.01,
                makeTxVersion: TxVersion.LEGACY
            })
            console.log("innter Transactions ====>", innerTransactions);
            console.log("address ====>", address); 
            console.log("marketId ===>", address.marketId.toBase58());
            marketId = address.marketId;

            for (let i = 0; i < innerTransactions.length; i++) {
                const transaction = new Transaction();
                for (let j = 0; j < innerTransactions[i].instructions.length; j++) {
                    transaction.add(innerTransactions[i].instructions[j]);
                }
                if (publicKey != undefined && signTransaction != undefined) {
                    try {
                        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
                        transaction.feePayer = publicKey;

                        let signedTx = await signTransaction(transaction);

                        const signature = await connection.sendRawTransaction(signedTx.serialize());
                        console.log("marketId signature ====>", signature);
                        await connection.confirmTransaction(signature, 'confirmed');
                    } catch (err) {
                        console.log("transaction error ===>", err);
                        marketId = null;
                    }
                }

            }
            // 在市场创建后添加延迟
            await new Promise(resolve => setTimeout(resolve, 10000));
    
            
         
            // 在创建流动性池之前检查市场状态
            // 1. 首先检查市场账户的详细信息
            const marketAccount = await connection.getAccountInfo(marketId);
            if (!marketAccount) {
                throw new Error('Market account not found');
            }
            
            const marketState = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
            console.log('marketAccount ===>', marketAccount);
            console.log('marketState ===>', marketState);
            console.log('Market State:', {
                owner: marketState.ownAddress.toBase58(),
                baseMint: marketState.baseMint.toBase58(),
                quoteMint: marketState.quoteMint.toBase58(),
                programId: marketAccount.owner.toBase58()
            });

            // 2. 验证代币对是否匹配
            if (!marketState.baseMint.equals(baseMint) || !marketState.quoteMint.equals(quoteMint)) {
                console.error('Market token pair mismatch');
            }

            // 3. 检查市场程序 ID
            if (!marketAccount.owner.equals(DEVNET_PROGRAM_ID.OPENBOOK_MARKET)) {
                console.error('Market program ID mismatch');
            }
          

            // 2. 创建流动性池
            console.log('Creating liquidity pool...');
            
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
                baseAmount: new BN('100000000000').toString(),
                quoteAmount: new BN('100000000').toString(),
                programId: DEVNET_PROGRAM_ID.AmmV4.toBase58()
            });

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
                baseAmount: new BN(baseAmount**10**9),  // 使用字符串避免数字精度问题
                quoteAmount:   new BN(quoteAmount**10**9),    // 使用字符串避免数字精度问题
                computeBudgetConfig: budget,
                checkCreateATAOwner: true,
                makeTxVersion: TxVersion.LEGACY,
                feeDestinationId: new PublicKey("3XMrhbv989VxAMi3DErLV9eJht1pHppW5LbKxe9fkEFR"), // for devnet
            //  feeDestinationId: new PublicKey("7YttLkHDoNj9wyDur5pM1ejNaAvT9X4eqaYcHQqtj2G5"), // for mainnet
                });

            console.log("Pool address ====>", poolInnerTransactions);
            console.log("ammId ===>", poolAddress.ammId.toBase58());
            console.log("marketId ====>", poolAddress.marketId.toBase58());
            console.log("pcMint ===>", poolAddress.pcMint.toBase58());
            console.log("pcVault ===>", poolAddress.pcVault.toBase58());
            console.log("coinMint ===>", poolAddress.coinMint.toBase58());
            console.log("coinVault ===>", poolAddress.coinVault.toBase58());
            console.log("lpMint ===>", poolAddress.lpMint.toBase58());

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
            
            

            console.log('Pool created successfully');

            toast({
                title: "成功",
                description: `成功创建流动性池\nPool ID: ${poolAddress.ammId.toBase58()}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

        } catch (error: any) {
            console.error('Transaction failed:', error);
            console.error('Error stack:', error.stack);
            toast({
                title: "错误",
                description: `创建流动性池失败: ${error.message}`,
                status: "error",
                duration: 5000,
                isClosable: true,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box p={4}>
            <VStack spacing={4} align="stretch">
                <Text>代币地址: {tokenMint}</Text>
                
                <FormControl>
                    <FormLabel>代币数量</FormLabel>
                    <NumberInput
                        value={baseAmount}
                        onChange={(value) => setBaseAmount(value)}
                        min={0}
                    >
                        <NumberInputField />
                    </NumberInput>
                </FormControl>

                <FormControl>
                    <FormLabel>SOL 数量</FormLabel>
                    <NumberInput
                        value={quoteAmount}
                        onChange={(value) => setQuoteAmount(value)}
                        min={0}
                    >
                        <NumberInputField />
                    </NumberInput>
                </FormControl>

                <Button
                    onClick={createPool}
                    colorScheme="blue"
                    isLoading={isLoading}
                    loadingText="创建中..."
                    isDisabled={!publicKey || !tokenMint}
                >
                    创建流动性池
                </Button>
            </VStack>
        </Box>
    );
};

export default CreatePool;