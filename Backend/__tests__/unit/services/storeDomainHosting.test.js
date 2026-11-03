jest.mock('axios', () => jest.fn());
jest.mock('dns', () => ({ promises: { resolveCname: jest.fn(), resolve4: jest.fn() } }));
jest.mock('../../../utils/corsUtils', () => ({ refreshVerifiedDomainOrigins: jest.fn().mockResolvedValue(undefined) }));

const axios = require('axios');
const dns = require('dns').promises;
const hosting = require('../../../services/storeDomainHosting');

/** A fake store hosting: which names it has, which are verified, which point here. */
const fakeVercel = ({ elsewhere = [], unverified = {}, pointing = [] } = {}) => {
  const onProject = new Set();
  const calls = [];
  axios.mockImplementation(async ({ method, url, data }) => {
    calls.push(`${method} ${url.replace('https://api.vercel.com', '')}${data ? ` ${JSON.stringify(data)}` : ''}`);
    const fail = (status, code) => Promise.reject(Object.assign(new Error(code), { response: { status, data: { error: { code, message: code } } } }));
    const name = decodeURIComponent(url.split('/').filter(Boolean).slice(-1)[0]);
    if (method === 'post') {
      if (elsewhere.includes(data.name)) return fail(409, 'domain_already_in_use');
      if (onProject.has(data.name)) return fail(409, 'domain_already_exists');
      onProject.add(data.name);
      return { data: { name: data.name } };
    }
    if (method === 'delete') {
      if (!onProject.delete(name)) return fail(404, 'not_found');
      return { data: {} };
    }
    if (url.includes('/config')) {
      const configName = decodeURIComponent(url.split('/domains/')[1].replace('/config', ''));
      return { data: { misconfigured: !pointing.includes(configName) } };
    }
    if (!onProject.has(name)) return fail(404, 'not_found');
    return { data: unverified[name] ? { verified: false, verification: unverified[name] } : { verified: true } };
  });
  return { onProject, calls };
};

/** A store's settings row as Sequelize gives it. */
const settingsRow = (customDomain, customDomainStatus = 'pending', metadata = {}) => {
  const row = { customDomain, customDomainStatus, metadata };
  row.update = jest.fn(async (changes) => Object.assign(row, changes));
  return row;
};

describe('storeDomainHosting', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VERCEL_TOKEN = 'test-token';
    process.env.VERCEL_STORE_PROJECT_ID = 'sabito-store';
    delete process.env.VERCEL_TEAM_ID;
    delete process.env.STOREFRONT_CNAME_TARGET;
    delete process.env.ONLINE_STORE_URL;
    dns.resolveCname.mockRejectedValue(new Error('ENODATA'));
    dns.resolve4.mockRejectedValue(new Error('ENODATA'));
  });
  afterAll(() => { process.env = saved; });

  it('works out the records: an A record for the domain itself, CNAMEs for www and subdomains', () => {
    const both = [{ type: 'A', host: '@', value: '216.198.79.1' }, { type: 'CNAME', host: 'www', value: 'store.absghana.com' }];
    expect(hosting.dnsRecordsFor('paylesstechnologysystems.com')).toEqual(both);
    expect(hosting.dnsRecordsFor('www.paylesstechnologysystems.com')).toEqual(both);
    expect(hosting.dnsRecordsFor('payless.com.gh')).toEqual(both);
    expect(hosting.dnsRecordsFor('shop.payless.com.gh')).toEqual([{ type: 'CNAME', host: 'shop', value: 'store.absghana.com' }]);
    expect(hosting.hostingNames('www.payless.com')).toEqual(['www.payless.com', 'payless.com']);
    expect(hosting.hostingNames('shop.payless.com')).toEqual(['shop.payless.com']);
  });

  it('does nothing without the hosting settings', async () => {
    delete process.env.VERCEL_TOKEN;
    const row = settingsRow('payless.com');
    expect(await hosting.checkStoreDomain(row)).toBeNull();
    expect(hosting.dueForCheck(row)).toBe(false);
    expect(axios).not.toHaveBeenCalled();
    expect(row.update).not.toHaveBeenCalled();
  });

  it('adds the domain and its twin, says what to change while the records point elsewhere, then turns Connected', async () => {
    const vercel = fakeVercel();
    dns.resolve4.mockResolvedValue(['62.169.22.3']);
    const row = settingsRow('paylesstechnologysystems.com');
    expect(hosting.dueForCheck(row)).toBe(true);

    const first = await hosting.checkStoreDomain(row);
    expect([...vercel.onProject]).toEqual(['paylesstechnologysystems.com', 'www.paylesstechnologysystems.com']);
    expect(vercel.calls).toContain('post /v10/projects/sabito-store/domains {"name":"www.paylesstechnologysystems.com","redirect":"paylesstechnologysystems.com","redirectStatusCode":308}');
    expect(first.state).toBe('waiting');
    expect(first.message).toBe('paylesstechnologysystems.com points to 62.169.22.3 right now. Change it to A 216.198.79.1.');
    expect(row.customDomainStatus).toBe('pending');
    expect(row.metadata.domainHosting).toMatchObject({ domain: 'paylesstechnologysystems.com', added: true, state: 'waiting' });
    expect(hosting.dueForCheck(row)).toBe(false);
    expect(hosting.hostingView(row)).toMatchObject({ state: 'waiting', message: first.message });

    // The merchant fixes the record: the next check doesn't add it again, and the domain turns Connected.
    axios.mockClear();
    fakeVercel({ pointing: ['paylesstechnologysystems.com'] }).onProject.add('paylesstechnologysystems.com');
    const second = await hosting.checkStoreDomain(row);
    expect(second.state).toBe('connected');
    expect(row.customDomainStatus).toBe('verified');
    expect(axios.mock.calls.every(([req]) => req.method === 'get')).toBe(true);
  });

  it('asks for the ownership record when the domain was used elsewhere before', async () => {
    fakeVercel({ unverified: { 'www.shop.com': [{ type: 'TXT', domain: '_vercel.shop.com', value: 'vc-domain-verify=www.shop.com,abc' }] } });
    const row = settingsRow('www.shop.com');
    const found = await hosting.checkStoreDomain(row);
    expect(found.state).toBe('waiting');
    expect(found.verification).toEqual([{ type: 'TXT', host: '_vercel', value: 'vc-domain-verify=www.shop.com,abc' }]);
    expect(found.message).toMatch(/Add the TXT record below too/);
  });

  it('says so when the domain is on another website host, and tries again later', async () => {
    fakeVercel({ elsewhere: ['taken.com'] });
    const row = settingsRow('taken.com');
    const found = await hosting.checkStoreDomain(row);
    expect(found).toMatchObject({ state: 'problem', added: false, message: 'taken.com is connected to another website host. Remove it there first, then save it here again.' });
    expect(row.customDomainStatus).toBe('pending');
  });

  it('keeps going when the hosting is down, without saying anything technical', async () => {
    axios.mockRejectedValue(Object.assign(new Error('timeout of 10000ms exceeded'), {}));
    const row = settingsRow('down.com');
    const found = await hosting.checkStoreDomain(row);
    expect(found.state).toBe('problem');
    expect(found.message).toBe("We couldn't reach the store's hosting just now. We'll try again in a few minutes.");
  });

  it('takes a domain off, keeping the names the new one still needs', async () => {
    const vercel = fakeVercel();
    await hosting.addToHosting('payless.com');
    await hosting.removeFromHosting('payless.com', hosting.hostingNames('www.payless.com'));
    expect([...vercel.onProject].sort()).toEqual(['payless.com', 'www.payless.com']);
    await hosting.removeFromHosting('payless.com');
    expect([...vercel.onProject]).toEqual([]);
    await expect(hosting.removeFromHosting('payless.com')).resolves.toBeUndefined();
  });

  it('sends the team id when the project is in a team', async () => {
    process.env.VERCEL_TEAM_ID = 'team_abc';
    fakeVercel();
    await hosting.addToHosting('shop.example.com');
    expect(axios).toHaveBeenCalledWith(expect.objectContaining({ params: { teamId: 'team_abc' }, headers: { Authorization: 'Bearer test-token' } }));
  });
});
