import { ethers } from 'ethers';

// Minimal ABIs
export const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)'
];

// Uniswap V3 contracts
export const UNISWAP_V3_FACTORY_BY_CHAIN = {
  1: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
  8453: '0x33128a8fc17869897dce68ed026d694621f6fdfd'
};
export const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];
export const UNISWAP_V3_POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)'
];

export const WETH_BY_CHAIN = {
  1: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  8453: '0x4200000000000000000000000000000000000006'
};
export const USDC_BY_CHAIN = {
  1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
};

export function formatUnits(bn, decimals) {
  return Number(ethers.formatUnits(bn, decimals));
}

export async function findPool({ provider, chainId, tokenAddress, quoteCandidates, feeTiers = [500, 3000, 10000] }) {
  const factoryAddr = UNISWAP_V3_FACTORY_BY_CHAIN[chainId];
  if (!factoryAddr) throw new Error(`Keine Uniswap v3 Factory für chainId ${chainId} hinterlegt`);
  const factory = new ethers.Contract(factoryAddr, UNISWAP_V3_FACTORY_ABI, provider);

  for (const quoteToken of quoteCandidates) {
    for (const fee of feeTiers) {
      const poolAddr = await factory.getPool(tokenAddress, quoteToken, fee);
      if (poolAddr && poolAddr !== ethers.ZeroAddress) {
        return { poolAddr, quoteToken, fee };
      }
    }
  }
  throw new Error('Kein Pool gefunden. Prüfe Fee-Tier/Quote-Token/Chain.');
}

export async function getPoolAndBalances({ provider, chainId, tokenAddress }) {
  const quotes = [WETH_BY_CHAIN[chainId], USDC_BY_CHAIN[chainId]].filter(Boolean);
  const { poolAddr, quoteToken, fee } = await findPool({ provider, chainId, tokenAddress, quoteCandidates: quotes });

  // Get tokens
  // token0/token1 via slot0 is not necessary to read balances; directly read balances of pool for token
  const base = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const quote = new ethers.Contract(quoteToken, ERC20_ABI, provider);

  const [baseDec, baseSym, quoteDec, quoteSym] = await Promise.all([
    base.decimals(), base.symbol(), quote.decimals(), quote.symbol()
  ]);

  // Balances held by the pool address
  const [baseBalRaw, quoteBalRaw] = await Promise.all([
    base.balanceOf(poolAddr),
    quote.balanceOf(poolAddr)
  ]);

  return {
    poolAddr,
    fee,
  base: { address: tokenAddress, symbol: baseSym, decimals: baseDec, balanceRaw: baseBalRaw },
  quote: { address: quoteToken, symbol: quoteSym, decimals: quoteDec, balanceRaw: quoteBalRaw }
  };
}

export async function getEthEurRate() {
  const tryEndpoints = [
    async () => {
      const r = await fetch('https://api.coinbase.com/v2/prices/ETH-EUR/spot', { headers: { 'accept': 'application/json' } });
      if (!r.ok) throw new Error('coinbase not ok');
      const j = await r.json();
      const v = Number(j?.data?.amount);
      if (!Number.isFinite(v) || v <= 0) throw new Error('coinbase bad');
      return v;
    },
    async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=eur', { headers: { 'accept': 'application/json' } });
      if (!r.ok) throw new Error('coingecko not ok');
      const j = await r.json();
      const v = Number(j?.ethereum?.eur);
      if (!Number.isFinite(v) || v <= 0) throw new Error('coingecko bad');
      return v;
    }
  ];
  for (const f of tryEndpoints) {
    try { return await f(); } catch (_) { /* try next */ }
  }
  return null;
}

export async function computeMetrics({ tokenAddress, chainId, rpcUrl, excludeAddresses = [] }) {
  // Multiple RPC fallbacks for Base
  const baseRpcs = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com', 
    'https://base.blockpi.network/v1/rpc/public',
    'https://1rpc.io/base'
  ];
  
  if (!rpcUrl && chainId === 8453) {
    rpcUrl = baseRpcs[0]; // Start with official Base RPC
  }
  if (!rpcUrl) throw new Error('ETH_RPC_URL ist erforderlich');
  
  let provider;
  let lastError;
  
  // Try each RPC until one works for the actual call
  const rpcUrls = chainId === 8453 ? baseRpcs : [rpcUrl];
  
  for (const currentRpcUrl of rpcUrls) {
    try {
      provider = new ethers.JsonRpcProvider(currentRpcUrl, chainId);
      
      // Test the provider with a simple call
      await provider.getBlockNumber();
      
      // Try the actual pool call to make sure it works
      const { poolAddr, fee, base, quote } = await getPoolAndBalances({ provider, chainId, tokenAddress });
      
      // If we get here, this RPC works, continue with full computation
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const totalSupply = await token.totalSupply();
      
      // Filter excluded addresses from total supply
      let circulatingSupply = totalSupply;
      for (const excludeAddr of excludeAddresses) {
        const balance = await token.balanceOf(excludeAddr);
        circulatingSupply -= balance;
      }
      
      // Get ETH/EUR rate
      const ethEurRate = await getEthEurRate();
      if (!ethEurRate) throw new Error('Failed to get ETH/EUR rate');
      
      // Calculate metrics
      const baseBalanceFormatted = formatUnits(base.balanceRaw, base.decimals);
      const quoteBalanceFormatted = formatUnits(quote.balanceRaw, quote.decimals);
      const circulatingSupplyFormatted = formatUnits(circulatingSupply, base.decimals);
      
      let priceInQuote = 0;
      let priceInEur = 0;
      let marketCapEur = 0;
      
      if (baseBalanceFormatted > 0) {
        priceInQuote = quoteBalanceFormatted / baseBalanceFormatted;
        
        if (quote.symbol === 'WETH') {
          priceInEur = priceInQuote * ethEurRate;
        } else if (quote.symbol === 'USDC') {
          priceInEur = priceInQuote * 0.85; // Approximate EUR/USD
        }
        
        marketCapEur = circulatingSupplyFormatted * priceInEur;
      }
      
      return {
        token: {
          address: tokenAddress,
          symbol: base.symbol,
          decimals: base.decimals,
          totalSupply: totalSupply.toString(),
          circulatingSupply: circulatingSupply.toString(),
          circulatingSupplyFormatted
        },
        pool: {
          address: poolAddr,
          fee,
          baseBalance: base.balanceRaw.toString(),
          baseBalanceFormatted,
          quoteBalance: quote.balanceRaw.toString(),
          quoteBalanceFormatted,
          quoteToken: {
            address: quote.address,
            symbol: quote.symbol,
            decimals: quote.decimals
          }
        },
        price: {
          inQuote: priceInQuote,
          inEur: priceInEur,
          ethEurRate
        },
        marketCap: {
          eur: marketCapEur
        },
        timestamp: new Date().toISOString(),
        rpcUrl: currentRpcUrl
      };
      
    } catch (e) {
      console.log(`RPC ${currentRpcUrl} failed:`, e.message);
      lastError = e;
      // Continue to next RPC
    }
  }
  
  // If we get here, all RPCs failed
  throw new Error(`All RPCs failed. Last error: ${lastError?.message || 'Unknown error'}`);
}
