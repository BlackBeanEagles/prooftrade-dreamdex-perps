import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUnits } from 'viem';
import { calculateNotional, toRaw, validateOrder } from '../rules.mjs';

const market = { quoteDecimals: 18, baseDecimals: 8, tickSize: parseUnits('0.1', 18).toString(), lotSize: parseUnits('0.00001', 8).toString(), minQuantity: parseUnits('0.00013', 8).toString() };
const price = toRaw('81465.0', 18, 'Price');
const quantity = toRaw('0.00013', 8, 'Quantity');
const cap = toRaw('25', 18, 'Risk cap');

test('valid BTC order meets market grids and cap', () => {
  assert.doesNotThrow(() => validateOrder({ market, price, quantity, cap }));
  assert.equal(calculateNotional(price, quantity, 8), parseUnits('10.59045', 18));
});
test('rejects excess notional and off-grid values before SDK call', () => {
  assert.throws(() => validateOrder({ market, price, quantity, cap: toRaw('10', 18, 'Risk cap') }), /risk cap/);
  assert.throws(() => validateOrder({ market, price: price + 1n, quantity, cap }), /tick grid/);
  assert.throws(() => validateOrder({ market, price, quantity: quantity + 1n, cap }), /lot grid/);
  assert.throws(() => validateOrder({ market, price, quantity: toRaw('0.0001', 8, 'Quantity'), cap }), /minimum/);
});
test('decimal input is exact and positive', () => {
  assert.throws(() => toRaw('1.123456789', 8, 'Quantity'), /too many/);
  assert.throws(() => toRaw('0', 8, 'Quantity'), /greater than zero/);
  assert.throws(() => toRaw('1e6', 8, 'Quantity'), /positive decimal/);
});
