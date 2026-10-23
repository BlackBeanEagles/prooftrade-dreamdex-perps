const byId = id => document.getElementById(id);
let status = null;
let liveMarket = null;
let checkedOrder = null;
let checkedInput = null;
let busy = false;

async function api(path, options = {}) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
function showMessage(message, isError = false) {
  const box = byId('message');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.hidden = false;
}
function fmt(value, digits = 2) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(n) : String(value);
}
function formInput() {
  return {
    account: byId('account').value.trim(), side: byId('side').value,
    price: byId('price').value.trim(), quantity: byId('quantity').value.trim(),
    cap: byId('cap').value.trim(),
  };
}
function invalidate() {
  checkedOrder = null;
  checkedInput = null;
  byId('empty-preview').hidden = false;
  byId('preview').hidden = true;
  byId('preflight-state').textContent = 'AWAITING INPUT';
  byId('preflight-state').classList.remove('ready');
  byId('confirm').checked = false;
  updatePlaceButton();
}
function updatePlaceButton() {
  byId('place-button').disabled = !status?.tradingEnabled || !checkedOrder || !byId('confirm').checked || busy;
}
async function loadStatus() {
  status = await api('/api/status');
  byId('connection').classList.add('connected');
  byId('connection').innerHTML = '<span class="status-dot"></span>SDK CONNECTED';
  byId('cap').max = status.maxNotional;
  byId('cap').value = status.maxNotional;
  if (status.signerAddress) {
    byId('account').value = status.signerAddress;
    byId('account').readOnly = true;
    byId('wallet-help').textContent = 'Configured testnet signer. The private key remains in your local server process.';
    byId('trade-help').textContent = 'The order will be sent by your configured testnet signer after a fresh preflight.';
  }
  updatePlaceButton();
}
async function loadMarket() {
  byId('refresh').disabled = true;
  try {
    liveMarket = await api('/api/market');
    byId('mark-price').textContent = fmt(liveMarket.markPrice, 2);
    byId('index-price').textContent = fmt(liveMarket.indexPrice, 2);
    byId('funding-rate').textContent = `${fmt(Number(liveMarket.fundingRate) * 100, 4)}%`;
    byId('funding-caption').textContent = `Rate per ${fmt(liveMarket.fundingWindowSec / 3600, 1)}h calculation window`;
    byId('market-health').textContent = liveMarket.markPriceOk ? `Live · tick ${liveMarket.tickSize} · min ${liveMarket.minQuantity} BTC` : 'Mark feed stale';
    if (!byId('price').value && liveMarket.markPriceOk) {
      const tick = Number(liveMarket.tickSize);
      const rounded = Math.round(Number(liveMarket.markPrice) / tick) * tick;
      const places = (liveMarket.tickSize.split('.')[1] || '').length;
      byId('price').value = rounded.toFixed(Math.min(places, 8));
    }
    if (!byId('quantity').value) byId('quantity').value = liveMarket.minQuantity;
  } catch (cause) {
    byId('market-health').textContent = 'Market unavailable';
    showMessage(cause.message, true);
  } finally { byId('refresh').disabled = false; }
}
async function loadAccount() {
  const address = byId('account').value.trim();
  if (!address) return;
  try {
    const a = await api(`/api/account?address=${encodeURIComponent(address)}`);
    const entries = [
      ['EQUITY', `${fmt(a.equity)} USDso`],
      ['AVAILABLE COLLATERAL', `${fmt(a.unlockedCollateral)} USDso`],
      ['BTC POSITION', `${fmt(a.positionSize, 8)} BTC`],
      ['AVERAGE ENTRY', `${fmt(a.averageEntry)} USDso`],
      ['INITIAL MARGIN', `${fmt(a.initialMarginRequired)} USDso`],
      ['MARGIN STATUS', String(a.marginStatus)],
    ];
    const grid = document.createElement('div'); grid.className = 'account-grid';
    for (const [label, value] of entries) {
      const item = document.createElement('div'); item.className = 'account-item';
      const name = document.createElement('span'); name.textContent = label;
      const figure = document.createElement('strong'); figure.textContent = value;
      item.append(name, figure); grid.append(item);
    }
    byId('account-details').replaceChildren(grid);
  } catch (cause) { byId('account-details').textContent = cause.message; }
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
  if (!list.length) { parent.textContent = 'No testnet orders have been sent from this app yet.'; return; }
  parent.replaceChildren();
  for (const r of list.slice(0, 8)) {
    const card = document.createElement('article'); card.className = 'receipt';
    const top = document.createElement('div'); top.className = 'receipt-top';
    const title = document.createElement('strong'); title.textContent = `${r.side.toUpperCase()} · ${r.requestedQuantity} BTC`;
    const date = document.createElement('small'); date.textContent = new Date(r.createdAt).toLocaleString();
    top.append(title, date);
    const desc = document.createElement('p');
    const outcome = r.fills?.length ? `${r.fills.length} fill${r.fills.length === 1 ? '' : 's'}` : r.orderId ? 'Resting order placed; no fill in this transaction' : 'No fill recorded in this transaction';
    desc.textContent = `${outcome} · ${fmt(r.notional)} USDso notional · gas ${r.gasUsed}`;
    const actions = document.createElement('div'); actions.className = 'receipt-actions';
    const link = document.createElement('a'); link.href = `https://explorer.testnet.somnia.network/tokyo/tx/${r.txHash}`; link.target = '_blank'; link.rel = 'noopener'; link.textContent = 'VIEW TRANSACTION ↗';
    const download = document.createElement('button'); download.type = 'button'; download.textContent = 'DOWNLOAD RECEIPT ↓';
    download.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `prooftrade-${r.txHash.slice(0, 10)}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    actions.append(link, download); card.append(top, desc, actions); parent.append(card);
  }
}
byId('trade-form').addEventListener('input', invalidate);
byId('trade-form').addEventListener('change', invalidate);
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
  if (JSON.stringify(formInput()) !== JSON.stringify(checkedInput)) { invalidate(); showMessage('Order fields changed. Run the preflight again.', true); return; }
  busy = true; updatePlaceButton();
  byId('place-button').textContent = 'SENDING TESTNET ORDER…';
  try {
    const r = await api('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...checkedInput, confirm: 'PLACE_TESTNET_ORDER' }) });
    showMessage(`${r.txStatus === 'success' ? 'Order transaction confirmed' : 'Transaction included but order failed'}: ${r.txHash}. ${r.fills.length ? `${r.fills.length} fill(s) recorded.` : 'No fills in this transaction; a resting order may remain open.'}${r.persistenceWarning ? ` ${r.persistenceWarning}` : ''}`, r.txStatus !== 'success' || !!r.persistenceWarning);
    await Promise.all([loadReceipts(), loadAccount(), loadMarket()]);
    invalidate();
  } catch (cause) { showMessage(cause.message, true); }
  finally { busy = false; byId('place-button').innerHTML = 'PLACE REAL TESTNET ORDER <span>→</span>'; updatePlaceButton(); }
});
byId('refresh').addEventListener('click', async () => { await loadMarket(); invalidate(); });
byId('account-refresh').addEventListener('click', loadAccount);
Promise.allSettled([loadStatus(), loadMarket(), loadReceipts()]).then(results => {
  for (const r of results) if (r.status === 'rejected') showMessage(r.reason.message || 'Unable to load testnet data.', true);
  if (status?.signerAddress) loadAccount();
});

