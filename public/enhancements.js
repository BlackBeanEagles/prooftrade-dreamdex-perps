const byId = id => document.getElementById(id);
const api = async (path, options = {}) => {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed');
  return body;
};
const fmt = (value, digits = 2) => {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(number) : String(value);
};
const empty = message => {
  const box = document.createElement('div'); box.className = 'small-empty';
  const line = document.createElement('span'); line.className = 'empty-line';
  const text = document.createElement('p'); text.textContent = message;
  box.append(line, text); return box;
};
const friendlyError = message => /@somnia-chain|WebSocket|RPC|indexer|fetch failed|genesis check/i.test(message) ? 'Market connection is temporarily unavailable. Please try again shortly.' : message;
const showNotice = (message, isError = false) => {
  const box = byId('message'); box.textContent = isError ? friendlyError(message) : message;
  box.classList.toggle('error', isError); box.hidden = false;
};
const showError = message => showNotice(message, true);
let signer = null, liveOrders = null, samples = [];
try { samples = JSON.parse(sessionStorage.getItem('prooftrade-mark-samples') || '[]').filter(p => Number.isFinite(p.price) && Number.isFinite(p.time)).slice(-60); } catch { samples = []; }
function renderHistory() {
  const host = byId('history-chart'); host.replaceChildren();
  byId('history-count').textContent = samples.length + (samples.length === 1 ? ' SAMPLE' : ' SAMPLES');
  if (!samples.length) { host.textContent = 'Waiting for the first live mark-price sample'; return; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 800 145'); svg.setAttribute('preserveAspectRatio', 'none');
  const prices = samples.map(p => p.price), low = Math.min(...prices), high = Math.max(...prices);
  const pad = Math.max((high - low) * .25, high * .0001);
  const y = price => 130 - (price - low + pad) / (high - low + 2 * pad) * 115;
  const x = i => samples.length === 1 ? 400 : 18 + i * 764 / (samples.length - 1);
  for (let i = 0; i < 3; i++) {
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', '0'); line.setAttribute('x2', '800');
    line.setAttribute('y1', String(20 + i * 55)); line.setAttribute('y2', String(20 + i * 55));
    line.setAttribute('class', 'history-gridline'); svg.append(line);
  }
  if (samples.length > 1) {
    const line = document.createElementNS(svg.namespaceURI, 'polyline');
    line.setAttribute('points', samples.map((p, i) => x(i) + ',' + y(p.price)).join(' '));
    line.setAttribute('class', 'history-line'); svg.append(line);
  }
  const dot = document.createElementNS(svg.namespaceURI, 'circle');
  dot.setAttribute('cx', String(x(samples.length - 1))); dot.setAttribute('cy', String(y(samples.at(-1).price)));
  dot.setAttribute('r', '5'); dot.setAttribute('class', 'history-dot'); svg.append(dot); host.append(svg);
  host.setAttribute('aria-label', samples.length + ' observed mark-price samples; latest ' + fmt(samples.at(-1).price) + ' USDso');
  byId('history-last').textContent = fmt(samples.at(-1).price) + ' USDso';
  byId('history-span').textContent = samples.length === 1 ? 'First sample · ' + new Date(samples[0].time).toLocaleTimeString() : new Date(samples[0].time).toLocaleTimeString() + ' → ' + new Date(samples.at(-1).time).toLocaleTimeString();
}
function sampleMarket(market) {
  try {
    const price = Number(market.markPrice);
    if (market.markPriceOk && Number.isFinite(price) && price > 0) {
      samples.push({ time: Date.now(), price }); samples = samples.slice(-60);
      try { sessionStorage.setItem('prooftrade-mark-samples', JSON.stringify(samples)); } catch {}
      renderHistory();
    }
  } catch {}
}
async function loadFunding() {
  if (!signer) { byId('funding-status').textContent = 'Wallet balance is unavailable in view-only mode.'; return; }
  byId('funding-address').textContent = 'Wallet ' + signer.slice(0, 6) + '…' + signer.slice(-4);
  try {
    const f = await api('/api/funding'), gas = Number(f.gasStt);
    byId('gas-balance').textContent = 'STT FOR FEES: ' + fmt(f.gasStt, 6);
    byId('voucher-status').textContent = f.voucher.eligible ? 'TRADING CREDIT: ' + fmt(f.voucher.grantUsdso) + ' available' : f.voucher.reason === 'alreadyClaimed' ? 'TRADING CREDIT: Claimed' : f.voucher.reason === 'chainReadUnavailable' ? 'TRADING CREDIT: Checking…' : 'TRADING CREDIT: Unavailable';
    byId('funding-status').textContent = gas > 0 ? (f.voucher.eligible ? 'Network fees are covered. Claim your trading credit to begin.' : 'Network fees are covered. Check your available balance.') : 'Add testnet STT to cover network fees before trading.';
    byId('claim-voucher').hidden = !(gas > 0 && f.voucher.eligible);
  } catch (cause) { byId('funding-status').textContent = friendlyError(cause.message); }
}
async function loadOrders() {
  const account = byId('account').value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(account)) return;
  try {
    liveOrders = await api('/api/orders/live?address=' + encodeURIComponent(account));
    byId('orders-meta').textContent = liveOrders.historyError ? 'Open orders updated · recent activity may be delayed' : 'Open orders updated just now';
    const host = byId('open-orders'); host.replaceChildren();
    if (!liveOrders.orders.length) host.append(empty('No resting BTC orders open on-chain for this account.'));
    for (const order of liveOrders.orders) {
      const row = document.createElement('article'); row.className = 'open-order';
      const detail = document.createElement('div'), title = document.createElement('strong'), sub = document.createElement('small');
      title.textContent = order.side.toUpperCase() + ' BTC';
      sub.textContent = order.quantityRemaining + ' BTC remaining at ' + fmt(order.price) + ' USDso';
      detail.append(title, sub); row.append(detail);
      if (signer && signer.toLowerCase() === order.owner.toLowerCase()) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'cancel-button'; button.textContent = 'Cancel order';
        button.addEventListener('click', async () => {
          if (!window.confirm('Cancel this testnet BTC order? This sends a transaction.')) return;
          button.disabled = true;
          try {
            const result = await api('/api/orders/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.orderId, confirm: 'CANCEL_TESTNET_ORDER' }) });
            showNotice('Order cancelled. See the updated receipt below.');
            await refresh();
          } catch (cause) { showError(cause.message); button.disabled = false; }
        });
        row.append(button);
      }
      host.append(row);
    }
    renderReplay();
  } catch (cause) { byId('orders-meta').textContent = 'Open orders unavailable'; byId('open-orders').replaceChildren(empty(friendlyError(cause.message))); }
}
async function renderReplay() {
  let receipts;
  try { receipts = await api('/api/receipts'); } catch { return; }
  for (const card of byId('receipts').querySelectorAll('.receipt')) {
    const txLink = card.querySelector('a[href*="/tx/"]');
    const receipt = receipts.find(r => txLink && txLink.href.endsWith(r.txHash));
    if (!receipt || card.querySelector('.trade-replay')) continue;
    const open = liveOrders?.orders.find(o => o.orderId === receipt.orderId);
    const indexed = liveOrders?.history.find(o => o.orderId === receipt.orderId);
    const state = receipt.cancellation ? 'Cancellation submitted' : open ? 'Open · ' + open.quantityRemaining + ' BTC remaining' : indexed ? indexed.status : receipt.orderId ? 'Checking latest outcome' : 'Transaction recorded';
    const replay = document.createElement('ol'); replay.className = 'trade-replay';
    for (const step of ['Planned ' + receipt.side + ' · ' + receipt.requestedQuantity + ' BTC within ' + receipt.riskCap + ' USDso cap', 'Order checked against live limits', receipt.txStatus === 'success' ? 'Order confirmed on testnet' : 'Order transaction failed', receipt.fills?.length ? receipt.fills.length + ' fill(s) in transaction' : receipt.orderId ? 'Limit order resting' : 'No fill or resting order ID', state]) {
      const item = document.createElement('li'); item.textContent = step; replay.append(item);
    }
    card.insertBefore(replay, card.querySelector('.receipt-actions'));
    if (receipt.cancellation) {
      const link = document.createElement('a'); link.href = 'https://explorer.testnet.somnia.network/tokyo/tx/' + receipt.cancellation.txHash;
      link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'VIEW CANCELLATION ↗'; card.querySelector('.receipt-actions').append(link);
    }
  }
}
let refreshInFlight = false;
async function refresh() { if (refreshInFlight) return; refreshInFlight = true; try { await loadFunding(); await loadOrders(); } finally { refreshInFlight = false; } }
byId('orders-refresh').addEventListener('click', refresh);
byId('claim-voucher').addEventListener('click', async () => {
  if (!window.confirm('Claim paper USDso for this dedicated testnet wallet? This sends a transaction.')) return;
  const button = byId('claim-voucher'); button.disabled = true;
  try {
    const result = await api('/api/voucher/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'CLAIM_TESTNET_VOUCHER' }) });
    showNotice('Trading credit claim confirmed. Your balance will update shortly.'); await refresh();
  } catch (cause) { showError(cause.message); }
  finally { button.disabled = false; }
});
byId('account-refresh').addEventListener('click', loadOrders);
byId('place-button').addEventListener('click', () => setTimeout(refresh, 2500));
renderHistory();
api('/api/status').then(data => { signer = data.signerAddress; setTimeout(refresh, 5000); }).catch(() => {});
window.addEventListener('prooftrade:market', event => sampleMarket(event.detail));
setInterval(() => { if (!document.hidden && !byId('refresh').disabled) byId('refresh').click(); }, 30000);
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
