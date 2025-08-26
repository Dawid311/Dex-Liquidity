import { computeMetrics } from '../src/lib/uniswap.js';

export default async function handler(req, res) {
  try {
    const token = (req.query.token || '0x69eFD833288605f320d77eB2aB99DDE62919BbC1').toLowerCase();
    const chainId = Number(req.query.chainId || 8453);
    const rpcUrl = process.env.ETH_RPC_URL || null;
    const exclude = (process.env.EXCLUDE_ADDRESSES || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    const data = await computeMetrics({ tokenAddress: token, chainId, rpcUrl, excludeAddresses: exclude });
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'unknown error' });
  }
}
