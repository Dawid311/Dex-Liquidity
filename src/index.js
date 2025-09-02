import 'dotenv/config';
import { computeMetrics } from './lib/uniswap.js';

function bigIntReplacer(key, value) {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
}

async function main() {
  const tokenAddress = process.env.TOKEN_ADDRESS || '0x69eFD833288605f320d77eB2aB99DDE62919BbC1';
  const chainId = parseInt(process.env.CHAIN_ID || '8453');
  const rpcUrl = process.env.ETH_RPC_URL; // Optional - will use auto-selection for Base
  const excludeAddresses = process.env.EXCLUDE_ADDRESSES?.split(',').filter(Boolean) || [];

  try {
    const result = await computeMetrics({ tokenAddress, chainId, rpcUrl, excludeAddresses });
    console.log(JSON.stringify(result, bigIntReplacer, 2));
  } catch (error) {
    console.error('Fehler:', error.message);
    process.exit(1);
  }
}

main();
