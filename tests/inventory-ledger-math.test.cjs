const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const file = path.resolve(__dirname, '../app/lib/inventoryLedgerMath.ts');
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const moduleShim = { exports: {} };
new Function('exports', 'require', 'module', '__filename', '__dirname', compiled.outputText)(moduleShim.exports, require, moduleShim, file, path.dirname(file));
const { calculateSkuLedger } = moduleShim.exports;

// Multiple orders for one SKU are processed from the prior transaction balance.
{
  const balances = calculateSkuLedger({ 'AB 972': 2000 }, [
    { id: 1, sku: 'AB 972', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -400 },
    { id: 2, sku: 'AB 972', occurredAt: '2026-11-07T10:01:00.000Z', signedQuantity: -300 },
  ]);
  assert.deepEqual(balances.map(x => [x.previousAvailable, x.newAvailable]), [[2000, 1600], [1600, 1300]]);
}

// A reversal restores only its SKU and only the amount that was dispatched.
{
  const balances = calculateSkuLedger({ 'AB 972': 2000, 'AB 204': 500 }, [
    { id: 1, sku: 'AB 972', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -700 },
    { id: 2, sku: 'AB 204', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -100 },
    { id: 3, sku: 'AB 972', occurredAt: '2026-11-07T10:02:00.000Z', signedQuantity: 700 },
  ]);
  assert.equal(balances.find(x => x.id === 2).newAvailable, 400);
  assert.equal(balances.find(x => x.id === 3).newAvailable, 2000);
}

// Similar-looking SKUs are isolated. AB 204 and AB 204 1 must never merge.
{
  const balances = calculateSkuLedger({ 'AB 204': 100, 'AB 204 1': 50 }, [
    { id: 1, sku: 'AB 204', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -20 },
    { id: 2, sku: 'AB 204 1', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -10 },
  ]);
  assert.deepEqual(balances.map(x => x.newAvailable).sort((a, b) => a - b), [40, 80]);
}

// Sequence ID resolves transactions created in the same millisecond.
{
  const balances = calculateSkuLedger({ SKU: 10 }, [
    { id: 2, sku: 'SKU', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -4 },
    { id: 1, sku: 'SKU', occurredAt: '2026-11-07T10:00:00.000Z', signedQuantity: -3 },
  ]);
  assert.deepEqual(balances.map(x => [x.id, x.previousAvailable, x.newAvailable]), [[1, 10, 7], [2, 7, 3]]);
}

console.log('inventory ledger math tests passed');
