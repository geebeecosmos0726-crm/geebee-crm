const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');
const file = path.resolve(__dirname, '../app/lib/stockMovementBalances.ts');
const compiled = new Module(file, module);
compiled._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { stockMovementBalances } = compiled.exports;
const movement = (direction, quantity, time, auditId, before = 106608) => ({ direction, quantity, before, createdAt: `2026-11-07T${time}:00Z`, auditId });

test('deductions precede reversals by event time, not order grouping', () => {
  const a = movement('Dispatch', 600, '04:04', 1);
  const b = movement('Dispatch', 1800, '04:04', 2);
  const c = movement('Return', 600, '04:33', 3, 104208);
  const d = movement('Return', 1800, '04:33', 4, 104808);
  const result = stockMovementBalances([d, c, b, a]);
  assert.equal(result.startingBalance, 106608);
  assert.deepEqual([a, b, c, d].map(m => result.balances.get(m)), [106008, 104208, 104808, 106608]);
  assert.equal(result.runningBalance, 106608);
});

test('reversals in a different order use that order and later cycles remain cumulative', () => {
  const events = [movement('Dispatch', 600, '04:00', 1), movement('Dispatch', 1800, '04:01', 2),
    movement('Return', 1800, '04:02', 3), movement('Return', 600, '04:03', 4),
    movement('Dispatch', 200, '04:04', 5), movement('Return', 200, '04:05', 6)];
  const result = stockMovementBalances(events);
  assert.deepEqual(events.map(m => result.balances.get(m)), [106008,104208,106008,106608,106408,106608]);
});

test('return-first history uses its own before balance, without trusting later stale snapshots', () => {
  const events = [movement('Return', 600, '04:00', 1, 104208), movement('Dispatch', 100, '04:01', 2, 999999)];
  const result = stockMovementBalances(events);
  assert.equal(result.startingBalance, 104208);
  assert.deepEqual(events.map(m => result.balances.get(m)), [104808,104708]);
});

test('missing opening balance or timestamp never invents stock balances', () => {
  const derived = {...movement('Dispatch',600,'04:00',1),derivedFromOrder:true};
  const undated = {...movement('Dispatch',1800,'04:01',2),createdAt:''};
  const result = stockMovementBalances([derived,undated]);
  assert.equal(result.startingBalance,undefined);
  assert.equal(result.balances.size,0);
});
