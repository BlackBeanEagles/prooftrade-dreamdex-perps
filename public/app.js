const byId = id => document.getElementById(id);
let status = null;
let liveMarket = null;
let lastMarketAt = null;
let startupRetryScheduled = false;
let checkedOrder = null;
let checkedInput = null;
let busy = false;

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function friendlyError(message) {
  return /@somnia-chain|WebSocket|RPC|indexer|fetch failed|genesis check/i.test(message) ? 'Market connection is temporarily unavailable. Please try again shortly.' : message;
}
function showMessage(message, isError = false, source = 'general') {
  const box = byId('message');
  box.textContent = isError ? friendlyError(message) : message;
  box.dataset.source = source;
  box.classList.toggle('error', isError);
  box.hidden = false;
}
function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n) : String(value);
}
function formInput() {
  return {
    account: byId('account').value.trim(),
    side: document.querySelector('input[name="side"]:checked')?.value || 'long',
    price: byId('price').value.trim(),
    quantity: byId('quantity').value.trim(),
    cap: byId('cap').value.trim(),
  };
}
function updateNotional() {
  const price = Number(byId('price').value);
  const quantity = Number(byId('quantity').value);
  const cap = Number(byId('cap').value);
  const valid = Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity > 0;
  const notional = valid ? price * quantity : 0;
  const fraction = valid && Number.isFinite(cap) && cap > 0 ? notional / cap : 0;
  byId('notional-live').textContent = valid ? `${fmt(notional)} USDso` : '—';
  byId('cap-live').textContent = Number.isFinite(cap) && cap > 0 ? `Cap: ${fmt(cap)} USDso` : 'Set a cap';
  byId('cap-usage').textContent = valid && cap > 0 ? fraction > 1 ? `${fmt(fraction * 100, 0)}% of cap · reduce size` : `${fmt(fraction * 100, 0)}% of cap used` : 'Enter price and size';
  byId('meter-fill').style.width = `${Math.max(0, Math.min(100, fraction * 100))}%`;
  document.querySelector('.rule-meter').classList.toggle('over', fraction > 1);
  renderVisuals({ price, quantity, cap, valid, notional, fraction });
}

function renderVisuals({ price, quantity, cap, valid, notional, fraction }) {
  const side = document.querySelector('input[name="side"]:checked')?.value || 'long';
  const accountReady = /^0x[a-fA-F0-9]{40}$/.test(byId('account').value.trim());
  const hasCap = Number.isFinite(cap) && cap > 0;
  const percent = valid && hasCap ? Math.round(fraction * 100) : 0;
  const ring = byId('risk-ring');
  const circumference = 2 * Math.PI * 61;
  ring.style.strokeDasharray = String(circumference);
  ring.style.strokeDashoffset = String(circumference * (1 - Math.min(Math.max(fraction, 0), 1)));
  byId('empty-preview').classList.toggle('over', valid && hasCap && fraction > 1);
  byId('risk-percent').textContent = `${percent}%`;
  byId('risk-title').textContent = valid ? `${side === 'long' ? 'Long' : 'Short'} BTC · ${fmt(quantity, 8)} BTC` : 'Your order, at a glance.';
  byId('risk-summary').textContent = valid ? `At ${fmt(price)} USDso, this order represents about ${fmt(notional)} USDso of exposure.` : 'Adjust price, size and cap to see your planned exposure before a live check.';
  byId('risk-notional').textContent = valid ? `${fmt(notional)} USDso` : '—';
  byId('risk-remaining').textContent = hasCap && valid ? `${fmt(Math.max(0, cap - notional))} USDso` : '—';
  byId('risk-market').textContent = liveMarket?.markPriceOk ? 'Live BTC market available' : liveMarket ? 'Market feed is stale' : 'Waiting for live market';
  byId('risk-market-dot').className = `check-dot ${liveMarket?.markPriceOk ? 'good' : liveMarket ? 'warn' : ''}`;
  byId('risk-cap').textContent = valid && hasCap ? fraction <= 1 ? 'Order fits your chosen cap' : `Over cap by ${fmt(notional - cap)} USDso` : 'Set an order to check the cap';
  byId('risk-cap-dot').className = `check-dot ${valid && hasCap ? fraction <= 1 ? 'good' : 'warn' : ''}`;
  byId('risk-account').textContent = accountReady ? 'Wallet address ready to check' : 'Add a valid wallet address';
  byId('risk-account-dot').className = `check-dot ${accountReady ? 'good' : ''}`;

  const mark = Number(liveMarket?.markPrice);
  const index = Number(liveMarket?.indexPrice);
  const pricesAvailable = Number.isFinite(mark) && mark > 0 && Number.isFinite(index) && index > 0;
  document.querySelector('.visual-panel').classList.toggle('unavailable', !pricesAvailable);
  if (!pricesAvailable) {
    byId('map-range').textContent = 'Waiting for live prices';
    for (const id of ['map-index', 'map-mark', 'map-limit', 'map-low', 'map-high', 'basis-value']) byId(id).textContent = '—';
    byId('basis-explain').textContent = 'Waiting for both live prices.';
    return;
  }
  const values = [mark, index, ...(valid ? [price] : [])];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * .2, mark * .001);
  const low = min - pad;
  const high = max + pad;
  const position = value => `${Math.max(3, Math.min(97, ((value - low) / (high - low)) * 100))}%`;
  byId('index-marker').style.left = position(index);
  byId('mark-marker').style.left = position(mark);
  byId('limit-marker').style.left = valid ? position(price) : position(mark);
  document.querySelector('.limit-lane').classList.toggle('unavailable', !valid);
  byId('map-index').textContent = fmt(index);
  byId('map-mark').textContent = fmt(mark);
  byId('map-limit').textContent = valid ? fmt(price) : 'Set limit';
  byId('map-low').textContent = fmt(low);
  byId('map-high').textContent = fmt(high);
  const distance = valid ? ((price - mark) / mark) * 100 : null;
  byId('map-range').textContent = distance === null ? 'Enter a limit to compare' : Math.abs(distance) < .0005 ? 'Limit at mark' : `Limit ${Math.abs(distance).toFixed(3)}% ${distance > 0 ? 'above' : 'below'} mark`;
  const gap = mark - index;
  byId('basis-value').textContent = `${gap >= 0 ? '+' : '−'}${fmt(Math.abs(gap))} USDso`;
  byId('basis-explain').textContent = `Mark is ${Math.abs(gap / index * 100).toFixed(3)}% ${gap >= 0 ? 'above' : 'below'} the index at this snapshot.`;
}
function invalidate() {
  checkedOrder = null;
  checkedInput = null;
  byId('empty-preview').hidden = false;
  byId('preview').hidden = true;
  byId('preflight-state').textContent = 'NOT CHECKED';
  byId('preflight-state').classList.remove('ready');
  byId('confirm').checked = false;
  updatePlaceButton();
}
function updatePlaceButton() {
  byId('place-button').disabled = !status?.tradingEnabled || !checkedOrder || !byId('confirm').checked || busy;
}
async function loadStatus() {
  status = await api('/api/status');
  const connection = byId('connection');
  connection.classList.add('connected');
  connection.innerHTML = '<i></i>CHECKING MARKET';
  const mode = byId('wallet-mode');
  mode.textContent = status.tradingEnabled ? 'WALLET SET' : 'VIEW ONLY';
  mode.classList.toggle('enabled', !!status.tradingEnabled);
  byId('cap').max = status.maxNotional;
  byId('cap').value = status.maxNotional;
  if (status.signerAddress) {
    const account = byId('account');
    account.value = status.signerAddress;
    account.type = 'hidden';
    account.required = false;
    const display = document.createElement('div');
    display.className = 'wallet-display';
    const address = document.createElement('strong');
    address.textContent = status.signerAddress.slice(0, 6) + '…' + status.signerAddress.slice(-4);
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy address';
    copy.setAttribute('aria-label', 'Copy wallet address');
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(status.signerAddress); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy address';
    copy.setAttribute('aria-label', 'Copy wallet address'); }, 2000); }
      catch { showMessage('Could not copy the wallet address. Use the full address in the wallet panel.', true); }
    });
    display.append(address, copy);
    account.closest('.wallet-field').after(display);
    byId('wallet-help').textContent = 'This wallet places your testnet orders.';
    byId('trade-help').textContent = 'Your wallet will place this testnet order after a final check.';
  }
  updateNotional();
  updatePlaceButton();
}
function setMarkPrice() {
  if (!liveMarket?.markPriceOk) return;
  const tick = Number(liveMarket.tickSize);
  if (!Number.isFinite(tick) || tick <= 0) return;
  const rounded = Math.round(Number(liveMarket.markPrice) / tick) * tick;
  const places = (liveMarket.tickSize.split('.')[1] || '').length;
  byId('price').value = rounded.toFixed(Math.min(places, 8));
  invalidate();
  updateNotional();
}
async function loadMarket() {
  byId('refresh').disabled = true;
  try {
    liveMarket = await api('/api/market');
    lastMarketAt = new Date();
    window.dispatchEvent(new CustomEvent('prooftrade:market', { detail: liveMarket }));
    byId('connection').innerHTML = '<i></i>MARKET LIVE';
    if (byId('message').dataset.source === 'market') byId('message').hidden = true;
    byId('mark-price').textContent = fmt(liveMarket.markPrice, 2);
    byId('index-price').textContent = fmt(liveMarket.indexPrice, 2);
    byId('funding-rate').textContent = `${fmt(Number(liveMarket.fundingRate) * 100, 4)}%`;
    byId('funding-caption').textContent = `Per ${fmt(liveMarket.fundingWindowSec / 3600, 1)}h calculation window`;
    const health = byId('market-health');
    health.replaceChildren();
    const dot = document.createElement('i');
    dot.className = `feed-dot ${liveMarket.markPriceOk ? 'live' : 'stale'}`;
    health.append(dot, document.createTextNode(liveMarket.markPriceOk ? 'Live feed' : 'Mark feed stale'));
    byId('market-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
    if (!byId('price').value && liveMarket.markPriceOk) setMarkPrice();
    if (!byId('quantity').value) byId('quantity').value = liveMarket.minQuantity;
    updateNotional();
  } catch (cause) {
    if (liveMarket) liveMarket.markPriceOk = false;
    byId('connection').innerHTML = '<i></i>MARKET DELAYED';
    let recentObservation = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem('prooftrade-mark-samples') || '[]').at(-1);
      if (saved && Date.now() - saved.time < 5 * 60 * 1000) recentObservation = saved;
    } catch {}
    if (!liveMarket) {
      byId('mark-price').textContent = recentObservation ? fmt(recentObservation.price) : '—';
      byId('index-price').textContent = '—';
      byId('funding-rate').textContent = '—';
    }
    byId('market-health').textContent = liveMarket || recentObservation ? 'Last observed price' : 'Market unavailable';
    byId('market-updated').textContent = lastMarketAt ? 'Seen at ' + lastMarketAt.toLocaleTimeString() : recentObservation ? 'Seen at ' + new Date(recentObservation.time).toLocaleTimeString() : 'Try refreshing in a moment';
    updateNotional();
    showMessage(cause.message, true, 'market');
    if (!lastMarketAt && !startupRetryScheduled) { startupRetryScheduled = true; setTimeout(() => { if (!document.hidden) loadMarket(); }, 5000); }
  } finally { byId('refresh').disabled = false; }
}
function smallEmpty(message) {
  const container = document.createElement('div');
  container.className = 'small-empty';
  const line = document.createElement('span');
  line.className = 'empty-line';
  const text = document.createElement('p');
  text.textContent = message;
  container.append(line, text);
  return container;
}
async function loadAccount() {
  const address = byId('account').value.trim();
  if (!address) {
    byId('account-details').replaceChildren(smallEmpty('Enter an account address to view its live position.'));
    return;
  }
  try {
    const a = await api(`/api/account?address=${encodeURIComponent(address)}`);
    const entries = [
      ['ACCOUNT VALUE', `${fmt(a.equity)} USDso`],
      ['AVAILABLE BALANCE', `${fmt(a.unlockedCollateral)} USDso`],
      ['BTC POSITION', `${fmt(a.positionSize, 8)} BTC`],
      ['AVERAGE ENTRY', `${fmt(a.averageEntry)} USDso`],
      ['ACCOUNT HEALTH', Number(a.equity) > 0 ? String(a.marginStatus) : 'No funds'],
    ];
    const grid = document.createElement('div'); grid.className = 'account-grid';
    for (const [label, value] of entries) {
      const item = document.createElement('div'); item.className = 'account-item';
      const name = document.createElement('span'); name.textContent = label;
      const figure = document.createElement('strong'); figure.textContent = value;
      item.append(name, figure); grid.append(item);
    }
    const equity = Number(a.equity), im = Number(a.initialMarginRequired), mm = Number(a.maintenanceMarginRequired);
    const risk = document.createElement('div'); risk.className = 'margin-visual';
    const label = document.createElement('div'); label.className = 'margin-label';
    const left = document.createElement('span'); left.textContent = 'MARGIN IN USE';
    const right = document.createElement('strong'); right.textContent = equity > 0 ? fmt(im / equity * 100, 1) + '% of balance' : 'No funds yet';
    label.append(left, right);
    const track = document.createElement('div'); track.className = 'margin-track';
    const fill = document.createElement('i'); fill.style.width = Math.max(0, Math.min(100, equity > 0 ? im / equity * 100 : 0)) + '%';
    track.append(fill);
    const foot = document.createElement('p'); foot.textContent = 'Margin reserved: ' + fmt(im) + ' USDso';
    risk.append(label, track, foot);
    byId('account-details').replaceChildren(grid, risk);
  } catch (cause) {
    byId('account-details').replaceChildren(smallEmpty(friendlyError(cause.message)));
  }
}
function renderPreview(p) {
  byId('empty-preview').hidden = true;
  byId('preview').hidden = false;
  byId('preflight-state').textContent = 'CHECK PASSED';
  byId('preflight-state').classList.add('ready');
  byId('preview-side').textContent = p.side === 'long' ? 'LONG BTC' : 'SHORT BTC';
  byId('preview-notional').textContent = `${fmt(p.notional)} USDso`;
  byId('preview-quantity').textContent = `${p.quantity} BTC`;
  byId('preview-price').textContent = `${fmt(p.price)} USDso`;
  byId('preview-cap').textContent = `≤ ${fmt(p.cap)} USDso`;
  byId('preview-max').textContent = `${p.maxQuantity} BTC`;
  byId('preview-margin').textContent = `${fmt(p.estimatedInitialMargin)} USDso`;
  byId('preview-equity').textContent = `${fmt(p.accountState.equity)} USDso`;
  byId('preview-block').textContent = p.asOfBlock;
  byId('confirm').checked = false;
  updatePlaceButton();
}
async function loadReceipts() {
  const list = await api('/api/receipts');
  const parent = byId('receipts');
  if (!list.length) {
    parent.replaceChildren(smallEmpty('Your first order will appear here with its receipt.'));
    return;
  }
  parent.replaceChildren();
  for (const r of list.slice(0, 8)) {
    const card = document.createElement('article'); card.className = 'receipt';
    const top = document.createElement('div'); top.className = 'receipt-top';
    const title = document.createElement('strong'); title.textContent = `${r.side.toUpperCase()} · ${r.requestedQuantity} BTC`;
    const date = document.createElement('small'); date.textContent = new Date(r.createdAt).toLocaleString();
    top.append(title, date);
    const desc = document.createElement('p');
    const outcome = r.fills?.length ? `${r.fills.length} fill${r.fills.length === 1 ? '' : 's'}` : r.orderId ? 'Resting order placed; no fill in this transaction' : 'No fill recorded in this transaction';
    desc.textContent = outcome + ' · ' + fmt(r.notional) + ' USDso exposure';
    const actions = document.createElement('div'); actions.className = 'receipt-actions';
    const link = document.createElement('a'); link.href = `https://explorer.testnet.somnia.network/tokyo/tx/${r.txHash}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'VIEW ON EXPLORER ↗';
    const download = document.createElement('button'); download.type = 'button'; download.textContent = 'SAVE RECEIPT ↓';
    download.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `prooftrade-${r.txHash.slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    actions.append(link, download); card.append(top, desc, actions); parent.append(card);
  }
}
byId('trade-form').addEventListener('input', () => { invalidate(); updateNotional(); });
byId('trade-form').addEventListener('change', () => { invalidate(); updateNotional(); });
byId('trade-form').addEventListener('submit', async event => {
  event.preventDefault();
  const input = formInput();
  byId('preview-button').disabled = true;
  try {
    const p = await api('/api/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    checkedOrder = p;
    checkedInput = input;
    renderPreview(p);
    await loadAccount();
    byId('message').hidden = true;
  } catch (cause) { invalidate(); showMessage(cause.message, true); }
  finally { byId('preview-button').disabled = false; }
});
byId('confirm').addEventListener('change', updatePlaceButton);
byId('place-button').addEventListener('click', async () => {
  if (!checkedOrder || !checkedInput || !byId('confirm').checked) return;
  if (JSON.stringify(formInput()) !== JSON.stringify(checkedInput)) { invalidate(); showMessage('Order details changed. Check the order again.', true); return; }
  busy = true; updatePlaceButton();
  byId('place-button').textContent = 'SENDING TESTNET ORDER…';
  try {
    const r = await api('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...checkedInput, confirm: 'PLACE_TESTNET_ORDER' }) });
    const outcome = r.fills.length ? r.fills.length + ' fill(s) recorded.' : r.orderId ? 'Your limit order is waiting for a match.' : 'No fill was recorded.';
    showMessage(r.persistenceWarning ? 'Order sent, but the receipt could not be saved. Transaction: ' + r.txHash : r.txStatus === 'success' ? 'Order confirmed. ' + outcome + ' See your receipt below.' : 'Order transaction failed. Check its receipt below.', r.txStatus !== 'success' || !!r.persistenceWarning);
    await Promise.all([loadReceipts(), loadAccount(), loadMarket()]);
    invalidate();
  } catch (cause) { showMessage(cause.message, true); }
  finally { busy = false; byId('place-button').innerHTML = '<span>Place testnet order</span><span aria-hidden="true">→</span>'; updatePlaceButton(); }
});
byId('use-mark').addEventListener('click', setMarkPrice);
byId('use-min').addEventListener('click', () => {
  if (!liveMarket?.minQuantity) return;
  byId('quantity').value = liveMarket.minQuantity;
  invalidate();
  updateNotional();
});
byId('refresh').addEventListener('click', async () => { await loadMarket(); invalidate(); });
byId('account-refresh').addEventListener('click', loadAccount);
Promise.allSettled([loadStatus(), loadMarket(), loadReceipts()]).then(results => {
  for (const r of results) if (r.status === 'rejected') showMessage(r.reason.message || 'Unable to load testnet data.', true);
  if (status?.signerAddress) loadAccount();
  updateNotional();
});

