const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
function load(relative) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, relative), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', code)(mod, mod.exports);
  return mod.exports;
}
const web = load('../lib/workspace.ts');
const mobile = load('../../sabito-app-mobile/src/utils/commission.ts');
for (const [name, client] of [['web', web], ['mobile', mobile]]) {
  test(`${name}: cashout shows the net share and preserves zero`, () => {
    assert.equal(client.commissionAmount({ amount: 100, marketerShareAmount: '80' }), 80);
    assert.equal(client.commissionAmount({ amount: 100, marketerShareAmount: 0 }), 0);
    assert.equal(client.commissionAmount({ amount: '25' }), 25);
  });
  test(`${name}: only collected, unlocked due commissions can be withdrawn`, () => {
    const valid = { status: 'due', remittanceStatus: 'collected', cashoutRequestId: null };
    assert.equal(client.canCashout(valid), true);
    for (const change of [{ status: 'paid' }, { status: 'cashout_pending' }, { remittanceStatus: 'pending' }, { cashoutRequestId: 'existing' }]) assert.equal(client.canCashout({ ...valid, ...change }), false);
  });
}
