export default function handler(req, res) {
  res.status(200).json({ endpoints: ['/api/health', '/api/metrics?token=...&chainId=...'] });
}
