# ProofTrade

A local, risk-aware order planner and transaction recorder for dreamDEX perps on the Somnia Hideki testnet (the DreamDEX app labels this Tokyo). Built for the **dreamDEX Perps Builder Bounty**.

## What it does

ProofTrade lets a trader set a maximum order notional, preview a BTC-PERP order against the live account limit, place a real testnet order, and save a receipt containing the transaction hash, fills or resting order ID, and account snapshots. The local server uses `@somnia-chain/markets-sdk@0.32.1`; the browser never receives a private key.

The current product is for a Perps Arena participant who wants to know whether an order fits their rule and retain proof of what happened. It supports one market and one configured signing wallet. A public challenge leaderboard is the next product milestone; it is **not** implemented or claimed in this version.

## Network and dependencies

- Somnia Hideki / dreamDEX Tokyo testnet, chain ID `50383`
- Official [perps developer guide](https://app.testnet.dreamdex.io/docs/developers/perps-testnet)
- Node.js 24 or newer, npm
- Network access to the Hideki WebSocket RPC and GraphQL indexer
- For order placement: a dedicated testnet wallet with STT for gas and usable USDso perps margin. The Perps Arena credit has market restrictions; BTC-PERP is currently eligible.

Do not use a mainnet key. Do not commit `.env`; it is ignored by Git.

## Run locally

```powershell
cd C:\Users\hridy\Desktop\stretest
npm install
npm run dev
```

Open <http://127.0.0.1:4173>. With no `.env`, the app is read-only: market, account and order preflight work, while order placement stays disabled.

To enable trading, copy `.env.example` to `.env`, then put a **dedicated testnet private key** in that local file. Restart `npm run dev`. Do not paste a key in chat or into the browser. The default hard maximum is **25 USDso notional per order**; adjust `MAX_NOTIONAL_USDSO` locally if needed. The browser only connects to a server bound to `127.0.0.1`.

If you want the app to trade an existing dreamDEX app wallet, use the official [Link a Bot](https://app.testnet.dreamdex.io/docs/trading/common/link-a-bot) setup with a separate bot key. This MVP currently sends orders from the configured key's own perps account, so the simplest first run is a dedicated funded testnet wallet.

## Test and verify

```powershell
npm run check
npm test
```

The rule tests cover exact decimal input, tick and lot alignment, minimum quantity, and the notional cap. A live read-only check should load BTC-PERP and its current mark price. A successful transaction appears under **Trade receipts**, and a JSON receipt is saved in `data/receipts.json` (ignored by Git). A resting limit order can have zero fills; the app labels it accordingly.

For a bounty demo, record:

1. A live preflight and the displayed block number.
2. One confirmed testnet order transaction and its explorer link.
3. The downloaded receipt and the trade or resting-order outcome.
4. A short screen recording showing the entire flow.

No testnet order has been submitted by the project author from this local checkout yet; a real funded wallet is needed to produce that evidence.

## How it is built

- `server.mjs` holds the SDK instance and local HTTP API.
- `rules.mjs` validates exact order units and the user's notional rule before an SDK call.
- `public/` is the local interface. It does not load third-party scripts.
- `data/receipts.json` stores local transaction records after confirmed SDK sends.

The preview uses the SDK's `getMaxPerpOrderSize` and live perp state. The server repeats that check immediately before every order. A preview is a snapshot, so a market or account can change between checking and chain confirmation. This MVP does not place stop-loss, take-profit, or reduce-only orders.

## X posts

Add links to **2 or 3 published posts** tagging `@DreamDEXSomnia` before submission. Suggested sequence: the problem and planner, a live testnet order with its transaction link, then the receipt and what the SDK testing revealed.

## Submission checklist

- [ ] Whitelist the DoraHacks email with dreamDEX.
- [ ] Push this folder to a public GitHub repository.
- [ ] Fund or link a dedicated testnet wallet; place real perps orders.
- [ ] Put transaction hashes and demo link in this README.
- [ ] Publish and link 2–3 accurate X posts above.
- [ ] Put each reproducible non-security issue in its own `feedback/*.md` file. Send security findings privately to `security@dreamdex.io`.

The bounty deadline supplied by the organizer is **November 1, 2026 at 23:59 UTC**. The organizer decides eligibility and awards.

