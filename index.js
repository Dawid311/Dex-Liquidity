export default function handler(req, res) {
  res.status(200).json({ 
    name: 'Dex-Liquidity API',
    description: 'Uniswap v3 pool metrics for D.FAITH token on Base',
    version: '1.0.0',
    endpoints: {
      '/api/health': 'Health check',
      '/api/metrics': 'Token pool metrics (query: token, chainId)',
      '/api/status': 'Deployment status'
    },
    example: '/api/metrics?token=0x69eFD833288605f320d77eB2aB99DDE62919BbC1&chainId=8453',
    deployed: new Date().toISOString()
  });
}
