import { parseUnits } from 'viem';

export function toRaw(value, decimals, label) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error(`${label} must be a positive decimal number.`);
  const fraction = value.trim().split('.')[1] || '';
  if (fraction.length > decimals) throw new Error(`${label} has too many decimal places.`);
  let raw;
  try { raw = parseUnits(value.trim(), decimals); }
  catch { throw new Error(`${label} has too many decimal places.`); }
  if (raw <= 0n) throw new Error(`${label} must be greater than zero.`);
  return raw;
}

export function calculateNotional(price, quantity, baseDecimals) {
  return price * quantity / (10n ** BigInt(baseDecimals));
}

export function validateOrder({ market, price, quantity, cap }) {
  const tick = BigInt(market.tickSize);
  const lot = BigInt(market.lotSize);
  const min = BigInt(market.minQuantity);
  if (tick <= 0n || lot <= 0n || min <= 0n) throw new Error('Market order grid is unavailable.');
  if (price % tick !== 0n) throw new Error('Price is off the market tick grid.');
  if (quantity % lot !== 0n) throw new Error('Quantity is off the market lot grid.');
  if (quantity < min) throw new Error('Quantity is below the market minimum.');
  if (price * quantity > cap * 10n ** BigInt(market.baseDecimals)) throw new Error('Order notional exceeds the risk cap.');
}
