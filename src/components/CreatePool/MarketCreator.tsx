import { Box, VStack, Button, Text, Input, useToast, FormControl, InputGroup, InputRightElement, Spinner, Progress, Center } from '@chakra-ui/react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { Keypair, Transaction, PublicKey } from '@solana/web3.js';
import { useState, useEffect } from 'react';
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
  const [progress, setProgress] = useState(0);
  const [manualMarketId, setManualMarketId] = useState('');
  const toast = useToast();
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const checkTimeout = (operation: string) => {
    const timeout = setTimeout(() => {
      toast({
        title: "请求超时",
        description: `${operation}操作超时，请检查网络连接后重试`,
        status: "error",
        duration: 5000,
        isClosable: true
      });
      setIsCreating(false);
      setIsValidating(false);
      setProgress(0);
    }, 60000); // 60秒超时

    setTimeoutId(timeout);
    return timeout;
  };

  const clearTimeoutCheck = (timeout: NodeJS.Timeout) => {
    clearTimeout(timeout);
    setTimeoutId(null);
  };

  const createMarket = async () => {
    setIsCreating(true);
    setProgress(0);
    //const timeout = checkTimeout("创建市场");

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
       
       setProgress(5);
        let marketId: PublicKey | null = null;
        
        const baseMint = new PublicKey(tokenMint);
        setProgress(10);
        const quoteMint = NATIVE_MINT;
        const marketProgramId = DEVNET_PROGRAM_ID.OPENBOOK_MARKET;
        //const raydiumProgram = MAINNET_PROGRAM_ID;
        const raydiumProgram = DEVNET_PROGRAM_ID;
        setProgress(30);
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
        setProgress(50);
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
                    throw err;
                    marketId = null;
                }
            }
            setProgress(50 + 50 * (i+1) / innerTransactions.length);

        }
        //clearTimeoutCheck(timeout);
        setProgress(100);
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
    } catch (error: any) {
        //clearTimeoutCheck(timeout);
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
                description: `创建市场失败: ${error.message}`,
                status: "error",
                duration: 5000,
                isClosable: true
            });
        }
    } finally {
      setIsCreating(false);
      setTimeout(() => setProgress(0), 1000);
    }
  };

  const useExistingMarket = async () => {
    setIsValidating(true);
    //const timeout = checkTimeout("验证市场");

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

      //clearTimeoutCheck(timeout);
      toast({
        title: "成功",
        description: "市场验证成功",
        status: "success",
        duration: 3000,
        isClosable: true
      });
    } catch (error: any) {
      //clearTimeoutCheck(timeout);
      //判断是否连接超时
      if (error.message.includes('TypeError: Failed to fetch')) {
        toast({
          title: "错误",
          description: "连接超时，请检查网络连接后重试",
          status: "error",
          duration: 5000,
          isClosable: true
        });
      } else {
        toast({
          title: "错误",
          description: error.message || "无效的市场ID",
          status: "error",
          duration: 5000,
          isClosable: true
        });
      }
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [timeoutId]);

  return (
    <VStack spacing={4} w="100%">
      <Center w="100%" py={4}>
        <Text 
          fontSize="2xl" 
          fontWeight="medium"
          bgGradient="linear(to-r, blue.400, blue.600)"
          bgClip="text"
        >
          第一步：创建或选择市场
        </Text>
      </Center>

      <Box w="100%" p={4} borderWidth={1} borderRadius="md">
        <VStack spacing={4}>
          <Text>代币地址: {tokenMint}</Text>
          <VStack w="100%" spacing={2}>
            <Button
              onClick={createMarket}
              colorScheme="blue"
              isLoading={isCreating}
              loadingText="创建中..."
              w="100%"
              size="lg"
            >
              创建新市场
            </Button>
            {isCreating && (
              <Box w="100%">
                <Progress 
                  size="sm" 
                  value={progress} 
                  colorScheme="blue" 
                  hasStripe 
                  isAnimated
                  borderRadius="full"
                />
                <Text 
                  fontSize="sm" 
                  color="gray.500" 
                  textAlign="center"
                  mt={1}
                >
                  {progress === 100 ? "创建完成" : "创建中,请耐心等待,不要重复点击,等待交易确认..."}
                </Text>
              </Box>
            )}
          </VStack>

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