import { Box, VStack, Button, Text, Input, useToast, FormControl, InputGroup, InputRightElement, Spinner } from '@chakra-ui/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { useState } from 'react';
import { 
    NATIVE_MINT,
    getMint,
    createSetAuthorityInstruction,
    AuthorityType
} from '@solana/spl-token';
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
interface MarketCreatorProps {
  tokenMint: string;
  onMarketCreated: (marketId: PublicKey, marketDetails: MarketDetails) => void;
}

interface MarketDetails {
  marketId: string;
  baseMint: string;
  quoteMint: string;
  baseVault: string;
  quoteVault: string;
}

export const MarketCreator: React.FC<MarketCreatorProps> = ({ tokenMint, onMarketCreated }) => {
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [isCreating, setIsCreating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [manualMarketId, setManualMarketId] = useState('');
  const toast = useToast();

  const createMarket = async () => {
    setIsCreating(true);
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
        toast({
            title: "成功",
            description: `成功创建市场\nMarket ID: ${marketId?.toBase58()}`,
            status: "success",
            duration: 5000,
            isClosable: true,
        });
        onMarketCreated(marketId, {
            marketId: marketId?.toBase58(),
            baseMint: tokenMint,
            quoteMint: NATIVE_MINT.toBase58(),
            baseVault: '',
            quoteVault: ''
        });
    } catch (error) {
      toast({
        title: "错误",
        description: `创建市场失败: ${error.message}`,
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsCreating(false);
    }
  };

  const useExistingMarket = async () => {
    setIsValidating(true);
    try {
      const marketId = new PublicKey(manualMarketId);
      const baseMint = new PublicKey(tokenMint);
      const quoteMint = NATIVE_MINT;

      toast({
        title: "验证中",
        description: "正在验证市场信息...",
        status: "info",
        duration: 2000,
        isClosable: true
      });

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

      // 3. 检查市场程序 ID
      if (!marketAccount.owner.equals(DEVNET_PROGRAM_ID.OPENBOOK_MARKET)) {
          throw new Error('Market program ID mismatch');
      }

      onMarketCreated(marketId, {
        marketId: manualMarketId,
        baseMint: marketState.baseMint.toBase58(),
        quoteMint: marketState.quoteMint.toBase58(),
        baseVault: '',
        quoteVault: ''
      });

      toast({
        title: "成功",
        description: "市场验证成功",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: "错误",
        description: error.message || "无效的市场ID",
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <VStack spacing={4} w="100%">
      <Text fontSize="xl">第一步：创建或选择市场</Text>
      <Box w="100%" p={4} borderWidth={1} borderRadius="md">
        <VStack spacing={4}>
          <Text>代币地址: {tokenMint}</Text>
          <Button
            onClick={createMarket}
            colorScheme="blue"
            isLoading={isCreating}
            loadingText="创建中..."
            w="100%"
          >
            创建新市场
          </Button>
          <Text>或</Text>
          <FormControl>
            <InputGroup>
              <Input
                placeholder="输入已有的市场ID"
                value={manualMarketId}
                onChange={(e) => setManualMarketId(e.target.value)}
                isDisabled={isValidating}
              />
              {isValidating && (
                <InputRightElement>
                  <Spinner size="sm" color="purple.500" />
                </InputRightElement>
              )}
            </InputGroup>
          </FormControl>
          <Button
            onClick={useExistingMarket}
            colorScheme="green"
            w="100%"
            isLoading={isValidating}
            loadingText="验证中..."
            disabled={!manualMarketId || isValidating}
          >
            使用已有市场
          </Button>
        </VStack>
      </Box>
    </VStack>
  );
}; 