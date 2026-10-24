# ProofTrade

A local, risk-aware order planner and transaction recorder for dreamDEX perps on the Somnia Hideki testnet (the DreamDEX app labels this Tokyo). Built for the **dreamDEX Perps Builder Bounty**.

## What it does

ProofTrade lets a trader set a maximum order notional, preview a BTC-PERP order against the live account limit, place a real testnet order, track resting orders from on-chain state, cancel an order after explicit confirmation, and save a receipt containing the transaction hash, fills or resting order ID, and account snapshots. The local server uses `@somnia-chain/markets-sdk@0.32.1`; the browser never receives a private key.

The interface visualizes live index, mark and planned limit prices, observed mark-price samples, notional cap usage, and margin utilization. Price history consists only of samples taken while the page is open; it is not a historical candle feed.

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

To fund the local signer, sign in to the [dreamDEX testnet app](https://app.testnet.dreamdex.io/), open a Somnia Account wallet, then use [Link a Bot](https://app.testnet.dreamdex.io/docs/trading/common/link-a-bot) with the public signer address and enable **Send it … for gas** or use **Top up**. The app can send Hideki STT to that address. The local signer trades its **own** perp account in this MVP; linking it does not make ProofTrade trade the linked owner wallet. The Shannon faucet funds a different chain and does not directly fund Hideki.

After the wallet has STT, the **Wallet / testnet readiness** panel can claim the one-time paper USDso voucher with an explicit confirmation. The dedicated wallet in this checkout currently has **0 STT** and is eligible for **1,000 paper USDso**. The private key is only in the ignored local `.env` file.

## Test and verify

```powershell
npm run check
npm test
```

The rule tests cover exact decimal input, tick and lot alignment, minimum quantity, and the notional cap. A live read-only check should load BTC-PERP and its current mark price. A successful transaction appears under **Trade receipts**, and a JSON receipt is saved in `data/receipts.json` (ignored by Git). A resting limit order can have zero fills. The Open orders panel reads the chain at a reported block; indexed history can lag, so a receipt without a current open order is marked “reconciling” until an indexed terminal state appears. Cancellation verifies the on-chain owner before sending a transaction. The chart never invents historical data.

For a bounty demo, record:

1. A live preflight and the displayed block number.
2. One confirmed testnet order transaction and its explorer link.
3. The downloaded receipt and the trade or resting-order outcome.
4. A short screen recording showing the entire flow.

No testnet order has been submitted from this checkout yet. The configured wallet has 0 STT gas, so live-order evidence is still pending. Do not claim a real order or post a transaction hash until it is confirmed.

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


## Demo and X post drafts

These are drafts. Replace bracketed placeholders with real proof after a confirmed testnet order and publish 2 or 3 posts tagging `@DreamDEXSomnia`.

1. “Built ProofTrade for @DreamDEXSomnia: plan a BTC perp order against a personal USDso cap, compare the limit to live mark and index prices, then check account capacity before sending. Demo: [URL]”
2. “ProofTrade just placed a real BTC-PERP order on Somnia Hideki testnet. The receipt links the preflight block, transaction, fills or resting order, and account state. Tx: [EXPLORER LINK] @DreamDEXSomnia”
3. “A resting order is not a fill. ProofTrade now checks open orders on-chain, shows indexed lifecycle separately, and lets the signer cancel after confirmation. Full build and replay: [GITHUB URL] @DreamDEXSomnia”

### Evidence to add before submission

- Confirmed order hash: **pending**
- Cancellation hash, if applicable: **pending**
- Demo video: **pending**
- X post links: **pending**
- GitHub URL: **pending**

Do not submit the MVP track until the order hash and X links are real.