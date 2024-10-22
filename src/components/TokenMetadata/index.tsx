import { useState } from 'react';
import { 
    Box, 
    VStack, 
    Input,
    Button, 
    FormControl, 
    FormLabel,
    Checkbox,
    useToast,
    Text
} from '@chakra-ui/react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { 
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID as TOKEN_METADATA_PROGRAM_ID,
} from '@metaplex-foundation/mpl-token-metadata';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { getMintAuthority } from '../../utils/wallet';

export const TokenMetadata = () => {
    const { connection } = useConnection();
    const { publicKey, signTransaction } = useWallet();
    const [mintAddress, setMintAddress] = useState('');
    const [name, setName] = useState('');
    const [symbol, setSymbol] = useState('');
    const [uri, setUri] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [allowUpdate, setAllowUpdate] = useState(true);
    const toast = useToast();

    const handleCreateMetadata = async () => {
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

            // 获取元数据账户地址
            const [metadataAddress] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from('metadata'),
                    TOKEN_METADATA_PROGRAM_ID.toBuffer(),
                    mintPubkey.toBuffer(),
                ],
                TOKEN_METADATA_PROGRAM_ID
            );

            // 创建元数据指令
            const instruction = createCreateMetadataAccountV3Instruction(
                {
                    metadata: metadataAddress,
                    mint: mintPubkey,
                    mintAuthority: publicKey,
                    payer: publicKey,
                    updateAuthority: publicKey,
                },
                {
                    createMetadataAccountArgsV3: {
                        data: {
                            name,
                            symbol,
                            uri,
                            sellerFeeBasisPoints: 0,
                            creators: null,
                            collection: null,
                            uses: null,
                        },
                        isMutable: allowUpdate,
                        collectionDetails: null,
                    },
                }
            );

            // 创建交易
            const transaction = new Transaction().add(instruction);
            
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
                description: `代币元数据创建成功！\n名称: ${name}\n符号: ${symbol}`,
                status: "success",
                duration: 5000,
                isClosable: true,
            });

        } catch (error) {
            console.error("创建元数据错误:", error);
            toast({
                title: "错误",
                description: "创建元数据失败: " + (error as Error).message,
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

                <FormControl isRequired>
                    <FormLabel>代币名称</FormLabel>
                    <Input 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="输入代币名称"
                    />
                </FormControl>

                <FormControl isRequired>
                    <FormLabel>代币符号</FormLabel>
                    <Input 
                        value={symbol}
                        onChange={(e) => setSymbol(e.target.value)}
                        placeholder="输入代币符号"
                    />
                </FormControl>

                <FormControl>
                    <FormLabel>元数据 URI</FormLabel>
                    <Input 
                        value={uri}
                        onChange={(e) => setUri(e.target.value)}
                        placeholder="输入元数据 URI（可选）"
                    />
                </FormControl>

                <Checkbox 
                    isChecked={allowUpdate} 
                    onChange={(e) => setAllowUpdate(e.target.checked)}
                >
                    允许后续修改元数据
                </Checkbox>

                <Button
                    colorScheme="purple"
                    onClick={handleCreateMetadata}
                    isLoading={isLoading}
                    loadingText="创建中..."
                    isDisabled={!mintAddress || !name || !symbol}
                >
                    创建元数据
                </Button>
            </VStack>
        </Box>
    );
}; 