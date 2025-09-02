import { ethers } from 'ethers';

const UNISWAP_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

async function checkAllPools() {
  const provider = new ethers.JsonRpcProvider('https://base.llamarpc.com', 8453);
  const factory = new ethers.Contract('0x33128a8fc17869897dce68ed026d694621f6fdfd', UNISWAP_V3_FACTORY_ABI, provider);
  
  const tokenAddress = '0x69eFD833288605f320d77eB2aB99DDE62919BbC1';
  const wethAddress = '0x4200000000000000000000000000000000000006';
  const usdcAddress = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
  
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  const tokenDecimals = await token.decimals();
  
  const feeTiers = [100, 500, 3000, 10000];
  const quotes = [wethAddress, usdcAddress];
  
  console.log('Checking all possible D.FAITH pools...\n');
  
  for (const quoteAddress of quotes) {
    const quote = new ethers.Contract(quoteAddress, ERC20_ABI, provider);
    const quoteSymbol = await quote.symbol();
    
    for (const fee of feeTiers) {
      try {
        const poolAddr = await factory.getPool(tokenAddress, quoteAddress, fee);
        if (poolAddr && poolAddr !== ethers.ZeroAddress) {
          const tokenBalance = await token.balanceOf(poolAddr);
          const tokenBalanceFormatted = Number(ethers.formatUnits(tokenBalance, tokenDecimals));
          
          console.log(`Pool found: ${poolAddr}`);
          console.log(`Fee tier: ${fee}`);
          console.log(`Quote: ${quoteSymbol} (${quoteAddress})`);
          console.log(`D.FAITH balance: ${tokenBalanceFormatted}`);
          console.log('---');
        }
      } catch (e) {
        // Pool doesn't exist, continue
      }
    }
  }
}

checkAllPools().catch(console.error);
