const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');

// The real setting, so this fails if server.js stops (or changes) trusting the proxy in front of it.
const source = fs.readFileSync(path.join(__dirname, '../../../server.js'), 'utf8');
const [, TRUSTED] = /app\.set\('trust proxy', '([^']+)'\)/.exec(source) || [];

const lanAddress = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

let server;
let port;

/** The API as it runs: behind its limits. */
async function start() {
  jest.resetModules();
  const { authLimiter, generalLimiter, guestCheckoutLimiter } = require('../../../middleware/rateLimiter');
  const app = express();
  app.set('trust proxy', TRUSTED);
  app.get('/who', (req, res) => res.json({ ip: req.ip, protocol: req.protocol }));
  app.get('/login', authLimiter, (req, res) => res.json({ ok: true }));
  app.get('/checkout', guestCheckoutLimiter, (req, res) => res.json({ ok: true }));
  app.get('/any', generalLimiter, (req, res) => res.json({ ok: true }));
  server = app.listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
}

const get = (url, headers = {}, host = '127.0.0.1') => new Promise((resolve, reject) => {
  http.get({ host, port, path: url, headers, agent: false }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, left: Number(res.headers['ratelimit-remaining']), ...JSON.parse(body) }));
  }).on('error', reject);
});

/** A visitor's request as nginx passes it on: their address added after anything they sent themselves. */
const visit = (url, address, sent = null, extra = {}) => get(url, { 'x-forwarded-for': sent ? `${sent}, ${address}` : address, ...extra });

beforeEach(start);
afterEach(() => new Promise((resolve) => server.close(resolve)));

describe('each visitor has their own limits', () => {
  it('server.js believes only the proxy on its own machine', () => {
    expect(TRUSTED).toBe('loopback');
  });

  it('knows who is visiting, and that they came by https', async () => {
    expect(await visit('/who', '41.66.1.1', null, { 'x-forwarded-proto': 'https' })).toMatchObject({ ip: '41.66.1.1', protocol: 'https' });
  });

  it('one person\'s sign-in tries do not use up another\'s', async () => {
    for (let i = 0; i < 5; i += 1) expect((await visit('/login', '41.66.1.1')).status).toBe(200);
    expect((await visit('/login', '41.66.1.1')).status).toBe(429);
    expect((await visit('/login', '41.66.2.2')).status).toBe(200);
  });

  it('nor one shopper\'s checkouts and pages', async () => {
    for (let i = 0; i < 11; i += 1) await visit('/checkout', '41.66.1.1');
    expect((await visit('/checkout', '41.66.1.1')).status).toBe(429);
    expect(await visit('/checkout', '41.66.2.2')).toMatchObject({ status: 200, left: 9 });
    await visit('/any', '41.66.1.1');
    expect((await visit('/any', '41.66.2.2')).left).toBe(299);
  });

  it('making up an address does not get round a limit', async () => {
    for (let i = 0; i < 5; i += 1) await visit('/login', '41.66.1.1', `10.0.0.${i}`);
    expect((await visit('/login', '41.66.1.1', '8.8.8.8')).status).toBe(429);
    expect((await visit('/login', '41.66.1.1', '127.0.0.1')).status).toBe(429);
    expect((await visit('/who', '41.66.1.1', '8.8.8.8')).ip).toBe('41.66.1.1');
  });

  (lanAddress ? it : it.skip)('nor does reaching the server without the proxy', async () => {
    const direct = await get('/who', { 'x-forwarded-for': '8.8.8.8' }, lanAddress);
    expect(direct.ip).not.toBe('8.8.8.8');
    for (let i = 0; i < 5; i += 1) await get('/login', { 'x-forwarded-for': `8.8.8.${i}` }, lanAddress);
    expect((await get('/login', { 'x-forwarded-for': '9.9.9.9' }, lanAddress)).status).toBe(429);
  });
});
