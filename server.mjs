import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from '@somnia-chain/markets-sdk';
import { hidekiTestnet } from '@somnia-chain/markets-sdk/chains';
import { formatUnits, isAddress, parseUnits } from 'viem';
import { validateOrder, toRaw, calculateNotional } from './rules.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const receiptsPath = join(root, 'data', 'receipts.json');
const port = Number(process.env.PORT || 4173);
const privateKey = process.env.PRIVATE_KEY?.trim();
const maxNotional = process.env.MAX_NOTIONAL_USDSO || '25';
const INDEXER = 'https://hideki-dev.smk.somnia.host/v1/graphql';
const markets = new SomniaMarkets({
  chain: hidekiTestnet,
  indexerUrl: INDEXER,
  addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  ...(privateKey ? { privateKey } : {}),
});

function json(res, status, payload) {
  const body = JSON.stringify(payload, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
}
function error(res, status, message) { json(res, status, { error: message }); }
function safeError(cause) { return cause instanceof Error ? cause.message.slice(0, 500) : 'Unexpected error'; }
function format(raw, decimals) { return formatUnits(BigInt(raw), decimals); }
async function btcMarket() {
  const all = await markets.client.listPerpMarkets();
  const btc = all.find(m => m.baseSymbol === 'BTC');
  if (!btc) throw new Error('BTC-PERP is unavailable on this testnet.');
  return btc;
}
async function accountSnapshot(market, account) {
  if (!isAddress(account)) throw new Error('Enter a valid 0x wallet address.');
  const [margin, position] = await Promise.all([
    markets.client.getMarginAccount(market.marginBank, account),
    markets.client.getPerpPosition({ marginBank: market.marginBank, pool: market.poolAddress, account }),
  ]);
  return {
    address: account,
    equity: format(margin.equity, market.quoteDecimals),
    unlockedCollateral: format(margin.unlockedCollateralBalance, market.quoteDecimals),
    lockedCollateral: format(margin.lockedCollateral, market.quoteDecimals),
    initialMarginRequired: format(margin.imReq, market.quoteDecimals),
    maintenanceMarginRequired: format(margin.mmReq, market.quoteDecimals),
    marginStatus: margin.marginStatus,
    asOfBlock: margin.asOfBlock.toString(),
    positionSize: format(position.size, market.baseDecimals),
    averageEntry: format(position.avgEntryPrice, market.quoteDecimals),
  };
}
async function preview(body, accountOverride) {
  const market = await btcMarket();
  const account = accountOverride || String(body.account || '');
  if (!isAddress(account)) throw new Error('Enter a valid 0x wallet address.');
  const isBid = body.side === 'long';
  if (!isBid && body.side !== 'short') throw new Error('Choose long or short.');
  const price = toRaw(body.price, market.quoteDecimals, 'Price');
  const quantity = toRaw(body.quantity, market.baseDecimals, 'Quantity');
  const cap = toRaw(body.cap || maxNotional, market.quoteDecimals, 'Risk cap');
  const serverCap = parseUnits(maxNotional, market.quoteDecimals);
  if (cap > serverCap) throw new Error(`This local app limits each order to ${maxNotional} USDso notional.`);
  validateOrder({ market, price, quantity, cap });
  const [limit, state, accountState] = await Promise.all([
    markets.client.getMaxPerpOrderSize({ pool: market.poolAddress, marginBank: market.marginBank, account, isBid, price }),
    markets.client.getPerpState(market.poolAddress),
    accountSnapshot(market, account),
  ]);
  if (!state.markPriceOk || !limit.priceable) throw new Error('The market mark price is stale; try again after it updates.');
  if (!limit.placeable || quantity > limit.maxQuantity) {
    throw new Error(`Order exceeds the account limit. Maximum now: ${format(limit.maxQuantity || 0n, market.baseDecimals)} BTC; limited by ${limit.limitedBy || 'market'}.`);
  }
  const notional = calculateNotional(price, quantity, market.baseDecimals);
  return {
    market: 'BTC-PERP', account, side: body.side,
    price: format(price, market.quoteDecimals),
    quantity: format(quantity, market.baseDecimals),
    cap: format(cap, market.quoteDecimals),
    notional: format(notional, market.quoteDecimals),
    estimatedInitialMargin: format((notional * BigInt(market.initialMarginBps) + 9999n) / 10000n, market.quoteDecimals),
    markPrice: format(state.markPrice, market.quoteDecimals),
    markPriceOk: state.markPriceOk,
    maxQuantity: format(limit.maxQuantity, market.baseDecimals),
    limitedBy: limit.limitedBy,
    asOfBlock: limit.asOfBlock.toString(),
    accountState,
    _raw: { price, quantity },
  };
}
async function readReceipts() {
  try { return JSON.parse(await readFile(receiptsPath, 'utf8')); }
  catch (cause) { if (cause.code === 'ENOENT') return []; throw cause; }
}
async function saveReceipt(receipt) {
  await mkdir(join(root, 'data'), { recursive: true });
  const list = await readReceipts();
  list.unshift(receipt);
  await writeFile(receiptsPath, JSON.stringify(list.slice(0, 200), null, 2));
}
async function parseBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error('Request is too large.');
  }
  return JSON.parse(body || '{}');
}
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
async function serveStatic(pathname, res) {
  const path = pathname === '/' ? '/index.html' : pathname;
  if (!/^\/[a-zA-Z0-9._/-]+$/.test(path) || path.includes('..')) return error(res, 404, 'Not found');
  const file = join(publicDir, path);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(body);
  } catch { error(res, 404, 'Not found'); }
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) return error(res, 403, 'Local access only');
  if (req.method === 'POST' && req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}` && req.headers.origin !== `http://localhost:${port}`) return error(res, 403, 'Local access only');
  try {
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return json(res, 200, { network: 'Somnia Hideki / dreamDEX Tokyo', chainId: 50383, sdkVersion: '0.32.1', signerAddress: markets.walletAddress || null, tradingEnabled: !!privateKey, maxNotional });
    }
    if (req.method === 'GET' && url.pathname === '/api/market') {
      const m = await btcMarket();
      const state = await markets.client.getPerpState(m.poolAddress);
      return json(res, 200, { symbol: 'BTC-PERP', pool: m.poolAddress, baseDecimals: m.baseDecimals, quoteDecimals: m.quoteDecimals, minQuantity: format(m.minQuantity, m.baseDecimals), lotSize: format(m.lotSize, m.baseDecimals), tickSize: format(m.tickSize, m.quoteDecimals), maxLeverage: 10000 / m.initialMarginBps, markPrice: format(state.markPrice, m.quoteDecimals), indexPrice: format(state.indexPrice, m.quoteDecimals), markPriceOk: state.markPriceOk, fundingRate: formatUnits(state.fundingRate, 18), fundingWindowSec: state.fundingWindowSec, nextFundingAt: state.nextFundingAt.toString() });
    }
    if (req.method === 'GET' && url.pathname === '/api/account') {
      const m = await btcMarket();
      return json(res, 200, await accountSnapshot(m, url.searchParams.get('address') || markets.walletAddress || ''));
    }
    if (req.method === 'GET' && url.pathname === '/api/receipts') return json(res, 200, await readReceipts());
    if (req.method === 'POST' && url.pathname === '/api/preview') {
      const result = await preview(await parseBody(req));
      delete result._raw;
      return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      if (!privateKey || !markets.walletAddress) return error(res, 409, 'Trading is disabled. Configure PRIVATE_KEY locally in .env and restart.');
      const body = await parseBody(req);
      if (body.confirm !== 'PLACE_TESTNET_ORDER') return error(res, 400, 'Explicit confirmation is required.');
      const account = markets.walletAddress;
      if (body.account && body.account.toLowerCase() !== account.toLowerCase()) return error(res, 400, 'The order account must match the configured signer.');
      const checked = await preview(body, account);
      const m = await btcMarket();
      const result = await markets.trader.placePerpOrder({ pool: m.poolAddress, isBid: checked.side === 'long', price: checked._raw.price, quantity: checked._raw.quantity });
      let after = null;
      try { after = await accountSnapshot(m, account); } catch { /* receipt remains valid if snapshot read fails */ }
      const receipt = {
        id: result.hash, createdAt: new Date().toISOString(), chainId: 50383,
        network: 'Somnia Hideki / dreamDEX Tokyo', account, market: checked.market,
        side: checked.side, requestedPrice: checked.price, requestedQuantity: checked.quantity,
        notional: checked.notional, riskCap: checked.cap, preflightBlock: checked.asOfBlock,
        before: checked.accountState, after, txHash: result.hash,
        txStatus: result.receipt.status, gasUsed: result.receipt.gasUsed.toString(),
        orderId: result.orderId?.toString() || null,
        fills: result.fills.map(f => JSON.parse(JSON.stringify(f, (_k, v) => typeof v === 'bigint' ? v.toString() : v))),
      };
      try { await saveReceipt(receipt); } catch (cause) { receipt.persistenceWarning = `Order sent, but local receipt save failed: ${safeError(cause)}`; }
      return json(res, 200, receipt);
    }
    if (req.method === 'GET') return serveStatic(url.pathname, res);
    return error(res, 404, 'Not found');
  } catch (cause) {
    const message = safeError(cause);
    const status = /valid|Choose|must|exceeds|stale|limit|grid|large|cap|Quantity|Price|Risk/.test(message) ? 400 : 502;
    return error(res, status, message);
  }
});
server.listen(port, '127.0.0.1', () => console.log(`ProofTrade running at http://127.0.0.1:${port}`));


