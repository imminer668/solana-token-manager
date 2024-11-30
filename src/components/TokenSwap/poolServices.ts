import {
  ApiPoolInfoV4,
  LIQUIDITY_STATE_LAYOUT_V4,
  Liquidity,
  MARKET_STATE_LAYOUT_V3,
  Market,
  SPL_MINT_LAYOUT,
  jsonInfo2PoolKeys,
  LIQUIDITY_PROGRAM_ID_V4
} from '@raydium-io/raydium-sdk';
import {
  PublicKey,
  Connection,
  clusterApiUrl,
  GetProgramAccountsFilter
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { LiquidityPoolData } from './types';
import BN from 'bn.js';

/**
 * 获取流动性池信息
 * @param connection Solana 连接对象
 * @param params 参数对象，包含 ammId 或 tokenPair
 * @returns 池信息对象，包含 poolKeys、poolInfo 和 poolData
 */
export async function getPoolInfo(
  connection: Connection,
  params: { ammId: string } | { tokenPair: [string, string] }
) {
  try {
    let ammId: PublicKey;
    
    // 确定 AMM ID
    if ('ammId' in params) {
      // 如果直接提供 ammId，则直接使用
      ammId = new PublicKey(params.ammId);
      console.log('使用提供的 AMM ID:', ammId.toString());
    } else {
      // 使用代币对查找 AMM 池
      const [mintA, mintB] = params.tokenPair.map(mint => new PublicKey(mint));
      console.log('查找代币对的流动性池:', mintA.toString(), mintB.toString());
      
      // 在链上查找符合条件的流动性池
      ammId = await findLiquidityPoolByTokenPair(connection, mintA, mintB);
      
      if (!ammId) {
        throw new Error('找不到匹配的流动性池');
      }
      
      console.log('找到匹配的 AMM ID:', ammId.toString());
    }
    
    // 获取池账户信息
    const poolAccount = await connection.getAccountInfo(ammId);
    if (!poolAccount) {
      throw new Error('流动性池不存在');
    }
    
    // 解码池信息
    const poolInfo = LIQUIDITY_STATE_LAYOUT_V4.decode(poolAccount.data);
    
    // 获取市场信息
    const marketId = poolInfo.marketId;
    const marketAccount = await connection.getAccountInfo(marketId);
    if (!marketAccount) {
      throw new Error('获取市场信息失败');
    }
    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
    
    // 获取 LP 代币信息
    const lpMint = poolInfo.lpMint;
    const lpMintAccount = await connection.getAccountInfo(lpMint);
    if (!lpMintAccount) {
      throw new Error('获取 LP 代币信息失败');
    }
    const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);
    
    // 获取储备金信息
    const baseVaultInfo = await getAccount(connection, poolInfo.baseVault);
    const quoteVaultInfo = await getAccount(connection, poolInfo.quoteVault);
    
    // 构建用于 Raydium SDK 的 poolInfo
    const apiPoolInfo: ApiPoolInfoV4 = {
      id: ammId.toString(),
      baseMint: poolInfo.baseMint.toString(),
      quoteMint: poolInfo.quoteMint.toString(),
      lpMint: poolInfo.lpMint.toString(),
      baseDecimals: poolInfo.baseDecimal.toNumber(),
      quoteDecimals: poolInfo.quoteDecimal.toNumber(),
      lpDecimals: lpMintInfo.decimals,
      version: 4,
      programId: poolAccount.owner.toString(),
      authority: Liquidity.getAssociatedAuthority({ programId: poolAccount.owner }).publicKey.toString(),
      openOrders: poolInfo.openOrders.toString(),
      targetOrders: poolInfo.targetOrders.toString(),
      baseVault: poolInfo.baseVault.toString(),
      quoteVault: poolInfo.quoteVault.toString(),
      withdrawQueue: poolInfo.withdrawQueue.toString(),
      lpVault: poolInfo.lpVault.toString(),
      marketVersion: 3,
      marketProgramId: poolInfo.marketProgramId.toString(),
      marketId: poolInfo.marketId.toString(),
      marketAuthority: Market.getAssociatedAuthority({ 
        programId: poolInfo.marketProgramId, 
        marketId: poolInfo.marketId 
      }).publicKey.toString(),
      marketBaseVault: marketInfo.baseVault.toString(),
      marketQuoteVault: marketInfo.quoteVault.toString(),
      marketBids: marketInfo.bids.toString(),
      marketAsks: marketInfo.asks.toString(),
      marketEventQueue: marketInfo.eventQueue.toString(),
      lookupTableAccount: PublicKey.default.toString()
    };
    
    // 转换为 PoolKeys 格式
    const poolKeys = jsonInfo2PoolKeys(apiPoolInfo);
    
    // 获取池的详细信息
    const sdkPoolInfo = await Liquidity.fetchInfo({
      connection,
      poolKeys
    });
    
    // 构建 PoolData 格式（兼容现有代码）
    const poolData: LiquidityPoolData = {
      version: 4,
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
        owner: poolInfo.owner,
        version: 4,
        baseDecimals: poolInfo.baseDecimal.toNumber(),
        quoteDecimals: poolInfo.quoteDecimal.toNumber(),
        lpDecimals: lpMintInfo.decimals,
        programId: poolAccount.owner,
        authority: new PublicKey(apiPoolInfo.authority),
        openOrders: poolInfo.openOrders,
        marketVersion: 3,
        marketBaseVault: marketInfo.baseVault,
        marketQuoteVault: marketInfo.quoteVault,
        marketAuthority: new PublicKey(apiPoolInfo.marketAuthority)
      },
      poolInfo: {
        baseDecimals: poolInfo.baseDecimal,
        quoteDecimals: poolInfo.quoteDecimal,
        lpDecimals: new BN(lpMintInfo.decimals),
        baseReserve: new BN(baseVaultInfo.amount.toString()),
        quoteReserve: new BN(quoteVaultInfo.amount.toString()),
        lpSupply: new BN(sdkPoolInfo.lpSupply.toString()),
        startTime: new BN(0)
      }
    };
    
    return {
      poolKeys,
      poolInfo: sdkPoolInfo,
      poolData
    };
  } catch (error) {
    console.error('获取池信息失败:', error);
    throw error;
  }
}

/**
 * 根据代币对查找流动性池
 * @param connection Solana 连接对象
 * @param mintA 第一个代币的铸币密钥
 * @param mintB 第二个代币的铸币密钥
 * @returns 找到的 AMM ID，如果找不到则返回 null
 */
async function findLiquidityPoolByTokenPair(
  connection: Connection,
  mintA: PublicKey,
  mintB: PublicKey
): Promise<PublicKey | null> {
  try {
    console.log('开始查找代币对的流动性池...');
    
    // 获取使用 Raydium V4 程序创建的所有池
    const filters: GetProgramAccountsFilter[] = [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span }, // 按数据大小过滤
    ];
    
    console.log('查询 Raydium V4 程序账户...');
    console.log('程序 ID:', LIQUIDITY_PROGRAM_ID_V4.toString());
    console.log('数据大小:', LIQUIDITY_STATE_LAYOUT_V4.span);
    
    const accounts = await connection.getProgramAccounts(
      LIQUIDITY_PROGRAM_ID_V4,
      {
        filters: filters,
      }
    );
    
    console.log(`找到 ${accounts.length} 个潜在的流动性池`);
    
    // 解析每个池的数据并查找匹配的代币对
    for (const account of accounts) {
      try {
        const poolInfo = LIQUIDITY_STATE_LAYOUT_V4.decode(account.account.data);
        const poolBaseMint = poolInfo.baseMint.toString();
        const poolQuoteMint = poolInfo.quoteMint.toString();
        
        // 检查代币对是否匹配（考虑顺序的两种可能性）
        const isMatch = 
          (poolBaseMint === mintA.toString() && poolQuoteMint === mintB.toString()) ||
          (poolBaseMint === mintB.toString() && poolQuoteMint === mintA.toString());
        
        if (isMatch) {
          console.log('找到匹配的流动性池:', account.pubkey.toString());
          console.log('基础代币:', poolBaseMint);
          console.log('报价代币:', poolQuoteMint);
          return account.pubkey;
        }
      } catch (err) {
        console.warn('解析池数据时出错，跳过:', err);
        continue;
      }
    }
    
    console.log('找不到匹配的流动性池');
    
    // 如果在 devnet 上测试，可以使用默认池
    if (connection.rpcEndpoint.includes('devnet')) {
      console.log('在 devnet 上使用默认测试池');
      return new PublicKey('自定义');
    }
    
    return null;
  } catch (error) {
    console.error('查找流动性池失败:', error);
    return null;
  }
}

// 可选：增加缓存机制，提高性能
const poolCache: Record<string, { timestamp: number, ammId: string }> = {};

/**
 * 获取或创建代币对的缓存键
 * @param mintA 第一个代币的铸币密钥
 * @param mintB 第二个代币的铸币密钥
 * @returns 缓存键
 */
function getTokenPairCacheKey(mintA: string, mintB: string): string {
  // 确保按字母顺序排序以获得一致的键
  const mints = [mintA, mintB].sort();
  return `${mints[0]}-${mints[1]}`;
}

/**
 * 从缓存中获取 AMM ID
 * @param mintA 第一个代币的铸币密钥
 * @param mintB 第二个代币的铸币密钥
 * @returns 缓存的 AMM ID 或 null
 */
function getCachedAmmId(mintA: string, mintB: string): string | null {
  const key = getTokenPairCacheKey(mintA, mintB);
  const cached = poolCache[key];
  
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5分钟缓存
    return cached.ammId;
  }
  
  return null;
}

/**
 * 将 AMM ID 添加到缓存
 * @param mintA 第一个代币的铸币密钥
 * @param mintB 第二个代币的铸币密钥
 * @param ammId AMM ID
 */
function cacheAmmId(mintA: string, mintB: string, ammId: string): void {
  const key = getTokenPairCacheKey(mintA, mintB);
  poolCache[key] = {
    timestamp: Date.now(),
    ammId
  };
} 