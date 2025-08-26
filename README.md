# Dex-Liquidity Tracker

Ein kleines CLI und eine Vercel-API, die den Uniswap v3 Pool für einen Token findet (mehrere Fee-Tiers und WETH/USDC automatisch), die Pool-Bestände liest und daraus Preis sowie Market Cap berechnet.

## Setup (Lokal CLI)

1. Node 18+
2. Abhängigkeiten installieren

```
npm install
```

3. `.env` anlegen (siehe `.env.example`):

```
ETH_RPC_URL=... # z.B. Base RPC
CHAIN_ID=8453
EXCLUDE_ADDRESSES=
```

CLI ausführen:

```
CHAIN_ID=8453 node src/index.js 0x69eFD833288605f320d77eB2aB99DDE62919BbC1
```

## API auf Vercel

- Endpoint: `/api/metrics` (Query: `token`, optional `chainId`)
- Beispiel: `/api/metrics?token=0x69eFD833288605f320d77eB2aB99DDE62919BbC1&chainId=8453`

### Deploy

1. Vercel CLI installieren und anmelden
2. Optional: `ETH_RPC_URL` und `EXCLUDE_ADDRESSES` als Vercel Environment Variables setzen
3. Deployen

Die API gibt JSON mit Pool, Preis, Supply, Market Cap und EUR-Werten (bei WETH-Quote) aus.

## Hinweise

- Preis wird aus `slot0.sqrtPriceX96` hergeleitet (Uniswap v3). Für TWAP kann `observe` genutzt werden.
- Circulating Supply = Total - Pool - Excluded. Pflege `EXCLUDE_ADDRESSES` für realistischere Werte.
- Unterstützte Chains aktuell: Ethereum Mainnet, Base. Weitere können wir leicht ergänzen.