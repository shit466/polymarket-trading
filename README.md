# Polymarket Research Desk

A local research dashboard for screening Polymarket markets across many small candidate trades.

## Features

- Live Polymarket Gamma market discovery
- Polymarket CLOB order book snapshots with bid, ask, spread, and depth
- External data snapshots for Coinbase spot prices, MLB schedule, and NBA scoreboard
- Source authority tiers from A to D
- Position sizing controls for bankroll, per-trade cap, and total exposure
- Research cards with model probability, implied probability, edge, evidence, entry/exit rules, and no-trade conditions

## Run Locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

## Network Notes

The server automatically reads macOS system proxy settings and applies them to outbound API calls. Polymarket requests use a curl fallback through the detected proxy because Node's proxy stack can reset on that CDN path in some environments.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Safety

This is a research tool, not financial advice and not an execution bot. It does not place trades.
