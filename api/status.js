export default function handler(req, res) {
  res.status(200).json({ 
    message: 'Dex-Liquidity API',
    endpoints: {
      health: '/api/health',
      metrics: '/api/metrics?token=0x69eFD833288605f320d77eB2aB99DDE62919BbC1&chainId=8453'
    },
    deployed: true
  });
}
