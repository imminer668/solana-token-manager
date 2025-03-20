import {
    ApiPoolInfoV4,
    LIQUIDITY_STATE_LAYOUT_V4,
    Liquidity,
    MARKET_STATE_LAYOUT_V3,
    Market,
    SPL_MINT_LAYOUT,
    jsonInfo2PoolKeys
  } from '@raydium-io/raydium-sdk';
  import {
    PublicKey,
    Connection,
    clusterApiUrl
  } from '@solana/web3.js';
 
  
  
  export async function formatAmmKeysById(id: string): Promise<any> {
    try {
      // 使用 devnet 连接
      const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
      
      // 直接从链上获取池信息
      const account = await connection.getAccountInfo(new PublicKey(id));
      if (account === null) throw Error('get id info error');
      const info = LIQUIDITY_STATE_LAYOUT_V4.decode(account.data);
    
      const marketId = info.marketId;
      const marketAccount = await connection.getAccountInfo(marketId);
      if (marketAccount === null) throw Error('get market info error');
      const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccount.data);
    
      const lpMint = info.lpMint;
      const lpMintAccount = await connection.getAccountInfo(lpMint);
      if (lpMintAccount === null) throw Error('get lp mint info error');
      const lpMintInfo = SPL_MINT_LAYOUT.decode(lpMintAccount.data);
    
      const poolInfoFromChain = {
        id,
        baseMint: info.baseMint.toString(),
        quoteMint: info.quoteMint.toString(),
        lpMint: info.lpMint.toString(),
        baseDecimals: info.baseDecimal.toNumber(),
        quoteDecimals: info.quoteDecimal.toNumber(),
        lpDecimals: lpMintInfo.decimals,
        version: 4,
        programId: account.owner.toString(),
        authority: Liquidity.getAssociatedAuthority({ programId: account.owner }).publicKey.toString(),
        openOrders: info.openOrders.toString(),
        targetOrders: info.targetOrders.toString(),
        baseVault: info.baseVault.toString(),
        quoteVault: info.quoteVault.toString(),
        withdrawQueue: info.withdrawQueue.toString(),
        lpVault: info.lpVault.toString(),
        marketVersion: 3,
        marketProgramId: info.marketProgramId.toString(),
        marketId: info.marketId.toString(),
        marketAuthority: Market.getAssociatedAuthority({ programId: info.marketProgramId, marketId: info.marketId }).publicKey.toString(),
        marketBaseVault: marketInfo.baseVault.toString(),
        marketQuoteVault: marketInfo.quoteVault.toString(),
        marketBids: marketInfo.bids.toString(),
        marketAsks: marketInfo.asks.toString(),
        marketEventQueue: marketInfo.eventQueue.toString(),
        lookupTableAccount: PublicKey.default.toString()
      };
      
      // 在 devnet 上，我们不使用 Raydium API，直接使用链上数据
      console.log('使用链上数据构建池信息');
      const poolKeys = jsonInfo2PoolKeys(poolInfoFromChain);
      const poolInfo = await Liquidity.fetchInfo({
        connection,
        poolKeys
      });
      
      return {
        poolKeys,
        poolInfo
      };
    } catch (error) {
      console.error('formatAmmKeysById 失败:', error);
      throw error;
    }
  }