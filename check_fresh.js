import { ethers } from 'ethers';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

async function checkWithMultipleRPCs() {
  const rpcs = [
    'https://mainnet.base.org',
    'https://base.llamarpc.com',
    'https://base.blockpi.network/v1/rpc/public',
    'https://1rpc.io/base'
  ];
  
  const tokenAddress = '0x69eFD833288605f320d77eB2aB99DDE62919BbC1';
  const poolAddress = '0x7109214bAfde13a6eF8060644656464bcCaB93cd';
  
  console.log('Checking D.FAITH balance in pool across multiple RPCs...\n');
  
  for (const rpc of rpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc, 8453);
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      const balance = await token.balanceOf(poolAddress);
      const decimals = await token.decimals();
      const formatted = Number(ethers.formatUnits(balance, decimals));
      
      const blockNumber = await provider.getBlockNumber();
      
      console.log(`RPC: ${rpc}`);
      console.log(`Block: ${blockNumber}`);
      console.log(`D.FAITH in pool: ${formatted}`);
      console.log('---');
    } catch (e) {
      console.log(`RPC ${rpc} failed: ${e.message}`);
      console.log('---');
    }
  }
}

checkWithMultipleRPCs().catch(console.error);
