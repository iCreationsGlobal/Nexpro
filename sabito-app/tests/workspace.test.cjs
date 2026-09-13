const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/workspace.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', compiled)(mod, mod.exports);
const { accountDestination, commissionAmount, canCashout } = mod.exports;
test('preserves internal business and referral destinations after login', () => {
  assert.equal(accountDestination('/businesses/print-studio?apply=1'), '/businesses/print-studio?apply=1');
  assert.equal(accountDestination('/referrals?add=1'), '/referrals?add=1');
});
test('rejects external and ambiguous authentication redirects', () => {
  for (const target of [null, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/\n/evil.test']) assert.equal(accountDestination(target), '/dashboard');
});
test('shows marketer share, including zero, rather than gross commission', () => {
  assert.equal(commissionAmount({ amount: 100, marketerShareAmount: '80' }), 80);
  assert.equal(commissionAmount({ amount: 100, marketerShareAmount: 0 }), 0);
  assert.equal(commissionAmount({ amount: '25', marketerShareAmount: null }), 25);
});
test('only collected, unreserved due commissions can be cashed out', () => {
  const due = { status: 'due', remittanceStatus: 'collected', cashoutRequestId: null };
  assert.equal(canCashout(due), true);
  assert.equal(canCashout({ ...due, remittanceStatus: 'owed' }), false);
  assert.equal(canCashout({ ...due, cashoutRequestId: 'request' }), false);
  assert.equal(canCashout({ ...due, status: 'paid' }), false);
});
