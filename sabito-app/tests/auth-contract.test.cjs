const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function api(response) {
  const requests = [];
  let token = 'test-session';
  const context = {
    exports: {}, URLSearchParams, AbortSignal, window: {},
    localStorage: { getItem: () => token },
    require: () => ({ getApiBaseUrl: () => 'https://api.example.test/api', TOKEN_KEY: 'test-token' }),
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, json: async () => response }; },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/api.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, context);
  return { client: context.exports, requests, setToken: value => { token = value; } };
}
test('password recovery uses the same code endpoints as mobile', async () => {
  const { client, requests } = api({ success: true, data: { message: 'Accepted' } });
  await client.requestPasswordReset('user@example.test');
  await client.resetPassword({ email: 'user@example.test', code: '123456', password: 'test-only-password' });
  assert.equal(requests[0].url, 'https://api.example.test/api/public/sabito-marketer/auth/forgot-password');
  assert.equal(requests[1].url, 'https://api.example.test/api/public/sabito-marketer/auth/reset-password');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(JSON.parse(requests[1].options.body).code, '123456');
});
test('a failed API envelope is surfaced instead of treated as signup success', async () => {
  const { client } = api({ success: false, message: 'Registration unavailable' });
  await assert.rejects(client.registerMarketer({ name: 'Test', email: 'user@example.test', password: 'test-only-password' }), /Registration unavailable/);
});
test('password change and closure send authenticated requests with confirmation credentials', async () => {
  const { client, requests } = api({ success: true });
  await client.changePassword({ currentPassword: 'old-test-password', password: 'new-test-password' });
  await client.closeAccount('confirmation-password');
  assert.equal(requests[0].url, 'https://api.example.test/api/public/sabito-marketer/auth/change-password');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(JSON.parse(requests[0].options.body).currentPassword, 'old-test-password');
  assert.equal(requests[1].url, 'https://api.example.test/api/public/sabito-marketer/auth/account');
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(JSON.parse(requests[1].options.body).password, 'confirmation-password');
  for (const request of requests) assert.equal(request.options.headers.Authorization, 'Bearer test-session');
});
test('concurrent reads share a request but later reads refresh', async () => {
  const { client, requests } = api({ success: true, data: {} });
  await Promise.all([client.getMarketerSession(), client.getMarketerSession()]);
  assert.equal(requests.length, 1);
  await client.getMarketerSession();
  assert.equal(requests.length, 2);
});
test('concurrent reads are isolated by authentication session', async () => {
  const { client, requests, setToken } = api({ success: true, data: {} });
  const first = client.getMarketerSession();
  setToken('another-session');
  const second = client.getMarketerSession();
  await Promise.all([first, second]);
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].options.headers.Authorization, requests[1].options.headers.Authorization);
});
test('a mutation prevents new reads from joining an older in-flight read', async () => {
  const { client, requests } = api({ success: true, data: {} });
  await Promise.all([client.getMarketerSession(), client.updateMarketerProfile({name:'Updated'}), client.getMarketerSession()]);
  assert.equal(requests.length, 3);
});
