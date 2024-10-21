import { useState } from 'react';
import { 
    Box, 
    VStack, 
    Input,
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
    getAssociatedTokenAddress,
    getMint,
    createMintToInstruction
} from '@solana/spl-token';
import { 
    PublicKey, 
    Transaction,
    sendAndConfirmTransaction
} from '@solana/web3.js';
import { getMintAuthority } from '../../utils/wallet';

export const MintToken = () => {
    const { connection } = useConnection();
    const { publicKey, signTransaction } = useWallet();
    const [mintAddress, setMintAddress] = useState('');
    const [recipientAddress, setRecipientAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const handleMintToken = async () => {
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

            // 验证代币地址
            const mintPubkey = new PublicKey(mintAddress);
            
            // 验证接收者地址
            const recipient = recipientAddress ? 
                new PublicKey(recipientAddress) : 
                publicKey;
            
            // 获取代币信息
            const mintInfo = await getMint(connection, mintPubkey);
            
            // 检查铸币权限
            if (!mintInfo.mintAuthority?.equals(publicKey)) {
                throw new Error("您没有该代币的铸币权限");
            }

            // 获取接收者的代币账户地址
            const associatedTokenAddress = await getAssociatedTokenAddress(
                mintPubkey,
                recipient
            );

            // 计算实际铸造数量（考虑小数位数）
            const mintAmount = Number(amount) * Math.pow(10, mintInfo.decimals);

           /* await mintTo(
                connection,
                getMintAuthority(), // payer
                mintPubkey,
                tokenAccount.address,
                publicKey, // mint authority
                mintAmount
            );*/
            // 创建铸造指令
            const mintInstruction = createMintToInstruction(
                mintPubkey,           // mint
                associatedTokenAddress, // 接收账户
                publicKey,            // mint authority
                mintAmount           // 铸造数量
            );

            // 创建交易
            const transaction = new Transaction().add(mintInstruction);
            
            // 获取最新的 blockhash
            const { blockhash } = await connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;

            // 用户签名交易
            const signedTx = await signTransaction(transaction);

            // 发送交易
            const signature = await connection.sendRawTransaction(signedTx.serialize());
            
            // 等待交易确认
            await connection.confirmTransaction(signature, 'confirmed');

            toast({
                title: "成功",
                description: `成功铸造 ${amount} 个代币\n接收者: ${recipient.toBase58()}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

        } catch (error) {
            console.error("铸造代币错误:", error);
            toast({
                title: "错误",
                description: "铸造代币失败: " + (error as Error).message,
                status: "error",
                duration: 3000,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box p={4}>
            <VStack spacing={4} align="stretch">
                <FormControl isRequired>
                    <FormLabel>代币地址</FormLabel>
                    <Input 
                        value={mintAddress}
                        onChange={(e) => setMintAddress(e.target.value)}
                        placeholder="输入代币地址"
                    />
                </FormControl>

                <FormControl>
                    <FormLabel>接收者地址 (可选，默认为当前钱包)</FormLabel>
                    <Input 
                        value={recipientAddress}
                        onChange={(e) => setRecipientAddress(e.target.value)}
                        placeholder="输入接收者钱包地址"
                    />
                </FormControl>

                <FormControl isRequired>
                    <FormLabel>铸造数量</FormLabel>
                    <NumberInput 
                        value={amount}
                        onChange={(value) => setAmount(value)}
                        min={0}
                    >
                        <NumberInputField />
                    </NumberInput>
                </FormControl>

                <Button
                    colorScheme="purple"
                    onClick={handleMintToken}
                    isLoading={isLoading}
                    loadingText="铸造中..."
                    isDisabled={!mintAddress || !amount}
                >
                    铸造代币
                </Button>
            </VStack>
        </Box>
    );
}; 