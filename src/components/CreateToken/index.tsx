import { useState, useEffect } from 'react';
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
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    createMint, 
    getMinimumBalanceForRentExemptMint, 
    getOrCreateAssociatedTokenAccount,
    mintTo
} from '@solana/spl-token';
import { 
    Keypair, 
    LAMPORTS_PER_SOL, 
    SystemProgram, 
    Transaction,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { getMintAuthority } from '../../utils/wallet';

export const CreateToken = () => {
    const { connection } = useConnection();
    const { publicKey, signTransaction } = useWallet();
    const [decimals, setDecimals] = useState("9");
    const [isLoading, setIsLoading] = useState(false);
    const [balance, setBalance] = useState(0);
    const toast = useToast();

    // 获取余额
    const getBalance = async () => {
        if (publicKey) {
            const balance = await connection.getBalance(publicKey);
            setBalance(balance / LAMPORTS_PER_SOL);
        }
    };

    // 请求空投
    const requestAirdrop = async () => {
        if (!publicKey) return;
        
        try {
            setIsLoading(true);
            const signature = await connection.requestAirdrop(publicKey, 2 * LAMPORTS_PER_SOL);
            await connection.confirmTransaction(signature, 'confirmed');
            await getBalance();
            
            toast({
                title: "成功",
                description: "获取 2 SOL 成功",
                status: "success",
                duration: 3000,
            });
        } catch (error) {
            console.error("空投错误:", error);
            toast({
                title: "错误",
                description: "获取 SOL 失败",
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateToken = async () => {
        if (!publicKey || !signTransaction) {
            toast({
                title: "错误",
                description: "请先连接钱包",
                status: "error",
                duration: 3000,
            });
            return;
        }

        try {
            setIsLoading(true);

            const mintAuthority = getMintAuthority();

            //获取mintAuthority的余额
            const mintAuthorityBalance = await connection.getBalance(mintAuthority.publicKey);
            console.log("mintAuthorityBalance", mintAuthorityBalance);
            
            // 获取创建代币所需的最小租金
            const mintRent = await getMinimumBalanceForRentExemptMint(connection);
            // 额外添加一些 SOL 用于支付交易费用
            const totalAmount = mintRent + 0.1 * LAMPORTS_PER_SOL; // 添加 0.1 SOL 作为交易费用

            // 转账 SOL 到 mintAuthority 账户
            const transaction = new Transaction().add(
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: mintAuthority.publicKey,
                    lamports: totalAmount
                })
            );

            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // 等待确认转账交易
            const signed = await signTransaction(transaction);
            const transferSignature = await connection.sendRawTransaction(signed.serialize());
            const confirmation = await connection.confirmTransaction(transferSignature, 'confirmed');
            
            if (confirmation.value.err) {
                throw new Error('转账失败');
            }

            // 创建代币铸造账户
            const mint = await createMint(
                connection,
                mintAuthority,    // 使用新生成的密钥对
                publicKey,        // mint authority (铸币权限)
                publicKey,        // freeze authority (冻结权限)
                Number(decimals)
            );
            const mintATA = await getOrCreateAssociatedTokenAccount(
                connection,
                mintAuthority,
                mint,
                publicKey
            );
            console.log("mintATA", mintATA);

            // 更新钱包余额显示
            await getBalance();

            toast({
                title: "成功",
                description: `代币创建成功！\n代币地址: ${mint.toBase58()}\n铸币权限: ${publicKey.toBase58()}\n冻结权限: ${publicKey.toBase58()}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

        } catch (error) {
            console.error("创建代币错误:", error);
            toast({
                title: "错误",
                description: "创建代币失败: " + (error as Error).message,
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    // 在组件加载时获取余额
    useEffect(() => {
        getBalance();
    }, [publicKey]);

    return (
        <Box p={4}>
            <VStack spacing={4} align="stretch">
                <Box>
                    <Text>当前余额: {balance} SOL</Text>
                    <Button
                        colorScheme="blue"
                        onClick={requestAirdrop}
                        isLoading={isLoading}
                        loadingText="请求中..."
                        size="sm"
                        mt={2}
                    >
                        获取测试 SOL
                    </Button>
                </Box>

                <FormControl>
                    <FormLabel>小数位数</FormLabel>
                    <NumberInput 
                        value={decimals} 
                        onChange={(value) => setDecimals(value)}
                        min={0} 
                        max={9}
                    >
                        <NumberInputField />
                    </NumberInput>
                </FormControl>

                <Button
                    colorScheme="purple"
                    onClick={handleCreateToken}
                    isLoading={isLoading}
                    loadingText="创建中..."
                    isDisabled={balance < 0.5}
                >
                    创建代币
                </Button>
            </VStack>
        </Box>
    );
}; 