import 'dotenv/config';
import { computeMetrics } from './lib/uniswap.js';

// Minimal ABIs
const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)'
];

// Uniswap V3 contracts
const UNISWAP_V3_FACTORY_BY_CHAIN = {
  // Ethereum Mainnet
  1: '0x1f98431c8ad98523631ae4a59f267346ea31f984',
  // Base (official Uniswap v3)
  8453: '0x33128a8fc17869897dce68ed026d694621f6fdfd'
};
const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];
const UNISWAP_V3_POOL_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)',
  'function balanceOf(address) view returns (uint256)', // for pool token balances when queried on erc20
  'function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128)'
];

// Common quote tokens per chain
const WETH_BY_CHAIN = {
  1: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  8453: '0x4200000000000000000000000000000000000006' // Base
};
const USDC_BY_CHAIN = {
  1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  // native USDC on Base
  8453: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
};

function formatUnits(bn, decimals) {
  return Number(ethers.formatUnits(bn, decimals));
}

async function getEthEurRate() {
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
  throw new Error('Kein ETH/EUR Kurs verfügbar');
}

async function findPool({ provider, chainId, tokenAddress }) {
  const factoryAddr = UNISWAP_V3_FACTORY_BY_CHAIN[chainId];
  if (!factoryAddr) throw new Error(`Keine Uniswap v3 Factory für chainId ${chainId} hinterlegt`);
  const factory = new ethers.Contract(factoryAddr, UNISWAP_V3_FACTORY_ABI, provider);

  const feeTiers = [500, 3000, 10000];
  const quoteCandidates = [WETH_BY_CHAIN[chainId], USDC_BY_CHAIN[chainId]].filter(Boolean);

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

async function getPoolAndBalances({ provider, chainId, tokenAddress }) {
  const { poolAddr, quoteToken, fee } = await findPool({ provider, chainId, tokenAddress });

  const pool = new ethers.Contract(poolAddr, UNISWAP_V3_POOL_ABI, provider);
  const token0 = await pool.token0();
  const token1 = await pool.token1();

  const base = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const quote = new ethers.Contract(quoteToken, ERC20_ABI, provider);

  const [baseDec, baseSym, quoteDec, quoteSym] = await Promise.all([
    base.decimals(), base.symbol(), quote.decimals(), quote.symbol()
  ]);

  // Token balances held by the pool
  const [bal0, bal1] = await Promise.all([
    new ethers.Contract(token0, ERC20_ABI, provider).balanceOf(poolAddr),
    new ethers.Contract(token1, ERC20_ABI, provider).balanceOf(poolAddr)
  ]);

  const baseIsToken0 = tokenAddress.toLowerCase() === token0.toLowerCase();
  const baseBal = baseIsToken0 ? bal0 : bal1;
  const quoteBal = baseIsToken0 ? bal1 : bal0;

  return {
    poolAddr,
    fee,
    base: { address: tokenAddress, symbol: baseSym, decimals: baseDec, balanceRaw: baseBal },
    quote: { address: quoteToken, symbol: quoteSym, decimals: quoteDec, balanceRaw: quoteBal }
  };
}

async function main() {
  // Inputs
  const tokenAddress = process.argv[2]?.toLowerCase() || '0x69eFD833288605f320d77eB2aB99DDE62919BbC1'.toLowerCase();
  const chainId = Number(process.env.CHAIN_ID || 1);

  let rpcUrl = process.env.ETH_RPC_URL;
  if (!rpcUrl && chainId === 8453) {
    // Fallback auf öffentlichen Base-RPC
    rpcUrl = 'https://base.llamarpc.com';
  }
  if (!rpcUrl) {
    throw new Error('Bitte ETH_RPC_URL in .env setzen');
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);

    const { poolAddr, fee, base, quote } = await getPoolAndBalances({ provider, chainId, tokenAddress });

  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const [totalSupplyRaw, decimals, symbol] = await Promise.all([
    token.totalSupply(), token.decimals(), token.symbol()
  ]);

  const baseBal = formatUnits(base.balanceRaw, base.decimals);
  const quoteBal = formatUnits(quote.balanceRaw, quote.decimals);
  const priceQuotePerBase = baseBal > 0 ? (quoteBal / baseBal) : 0;

  // Market caps
  const totalSupply = formatUnits(totalSupplyRaw, decimals);
  const fdv = totalSupply * priceQuotePerBase; // Fully Diluted in quote token units

  // Circulating supply: total - pool - excluded
  const excludeCsv = process.env.EXCLUDE_ADDRESSES || '';
  const exclude = excludeCsv.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  let excludedSum = 0;
  if (exclude.length) {
    const bals = await Promise.all(exclude.map(a => token.balanceOf(a)));
    excludedSum = bals.map(b => formatUnits(b, decimals)).reduce((a, b) => a + b, 0);
  }
  const circulating = Math.max(totalSupply - baseBal - excludedSum, 0);
  const mc = circulating * priceQuotePerBase;

  // EUR-Umrechnung über ETH/EUR
  let ethEur = null;
  let priceEUR = null;
  let mcEUR = null;
  let fdvEUR = null;
  try {
    ethEur = await getEthEurRate();
    priceEUR = priceQuotePerBase * ethEur;
    mcEUR = mc * ethEur;
    fdvEUR = fdv * ethEur;
  } catch (_) {
    // optional
  }

    const data = await computeMetrics({ tokenAddress, chainId, rpcUrl, excludeAddresses: exclude });
    const out = {
      chainId,
      pool: poolAddr,
      fee,
      token: { address: tokenAddress, symbol, decimals },
      quote: { address: quote.address, symbol: quote.symbol, decimals: quote.decimals },
      balances: { tokenInPool: baseBal, quoteInPool: quoteBal },
      price: { [quote.symbol]: priceQuotePerBase },
      supply: { total: totalSupply, circulating, excludedAddresses: exclude, excludedAmount: excludedSum },
      marketCap: { circulating: mc, fdv },
      notes: 'Preis ~ reserves ratio; für genauere Preise Tick/TWAP nutzen. Circulating naive.'
    };

  if (ethEur) {
    out.fx = { ethEur };
    out.priceEUR = priceEUR;
    out.marketCapEUR = { circulating: mcEUR, fdv: fdvEUR };
  }

  const json = JSON.stringify(out, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
  console.log(json);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
