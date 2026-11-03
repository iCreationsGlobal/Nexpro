const axios = require('axios');
const dns = require('dns').promises;

/**
 * Online Store custom domains on the store's hosting (the Vercel project that serves store.absghana.com).
 *
 * Saving a domain used to leave it "pending" until someone at ABS added it to that project by hand. Here ABS adds it
 * (and its www / bare twin) itself, checks whether the merchant's DNS records point at the store, and flips the domain
 * to "verified" once Vercel serves it with HTTPS. Taking a domain off or changing it removes the old one.
 *
 * Needs VERCEL_TOKEN and VERCEL_STORE_PROJECT_ID (plus VERCEL_TEAM_ID when the project is in a team). Without them
 * nothing here calls out: domains stay "pending" for the team to connect by hand, as before.
 */

/** Where a domain itself (no www) points: the store's hosting address (absghana.com uses the same). */
const DEFAULT_A_RECORD = '216.198.79.1';
/** A pending domain is looked at again when the page is opened after this long. */
const RECHECK_AFTER_MS = 60 * 1000;

class StoreHostingError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'StoreHostingError';
    this.status = status;
    this.code = code;
  }
}

const isConfigured = () => Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_STORE_PROJECT_ID);
const apexARecord = () => String(process.env.STOREFRONT_A_RECORD || DEFAULT_A_RECORD).trim();

const clean = (host) => String(host || '').trim().toLowerCase().replace(/\.$/, '');

const hostFromUrl = (value) => clean(String(value || '').replace(/^https?:\/\//i, '').split('/')[0]);

/**
 * Host merchants CNAME their domain to: the ABS Online Store host, never Sabito's STOREFRONT_URL (marketplace).
 * @returns {string}
 */
const cnameTarget = () => (
  hostFromUrl(process.env.STOREFRONT_CNAME_TARGET)
  || hostFromUrl(process.env.ONLINE_STORE_URL)
  || 'store.absghana.com'
);

// Two-part country endings (yourbusiness.com.gh, yourbusiness.co.uk): the domain itself has three labels there.
const SECOND_LEVEL = /^(com|co|org|net|edu|gov|ac)$/;

/** The domain someone bought: "shop.yourbusiness.com.gh" → "yourbusiness.com.gh". */
const registrableDomain = (host) => {
  const labels = clean(host).split('.').filter(Boolean);
  const take = labels.length >= 3 && SECOND_LEVEL.test(labels[labels.length - 2]) && labels[labels.length - 1].length === 2 ? 3 : 2;
  return labels.slice(-take).join('.');
};

const isApex = (host) => Boolean(clean(host)) && clean(host) === registrableDomain(host);

/**
 * The names a saved domain needs on the hosting, the saved one first: a domain itself or its www gets its twin too
 * (yourbusiness.com and www.yourbusiness.com); any other subdomain only itself.
 * @param {string} host
 * @returns {string[]}
 */
const hostingNames = (host) => {
  const h = clean(host);
  if (!h) return [];
  if (h.startsWith('www.') && isApex(h.slice(4))) return [h, h.slice(4)];
  if (isApex(h)) return [h, `www.${h}`];
  return [h];
};

/**
 * The records the merchant adds at their domain company. A domain itself can't take a CNAME at most companies, so it
 * gets an A record; www and other subdomains get a CNAME to the store host.
 * @param {string} host
 * @param {string} [target] - The store host (cnameTarget())
 * @returns {{ type: string, host: string, value: string }[]}
 */
const dnsRecordsFor = (host, target = cnameTarget()) => {
  const names = hostingNames(host);
  if (!names.length) return [];
  const base = registrableDomain(names[0]);
  return names
    .map((name) => (name === base
      ? { type: 'A', host: '@', value: apexARecord() }
      : { type: 'CNAME', host: name.slice(0, -(base.length + 1)), value: target }))
    .sort((a, b) => Number(b.type === 'A') - Number(a.type === 'A'));
};

const projectPath = () => `/projects/${encodeURIComponent(process.env.VERCEL_STORE_PROJECT_ID)}`;

const vercel = async (method, path, data) => {
  try {
    const res = await axios({
      method,
      url: `https://api.vercel.com${path}`,
      data,
      params: process.env.VERCEL_TEAM_ID ? { teamId: process.env.VERCEL_TEAM_ID } : undefined,
      headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
      timeout: 10000,
    });
    return res.data || {};
  } catch (err) {
    throw new StoreHostingError(err.response?.data?.error?.message || err.message, {
      status: err.response?.status,
      code: err.response?.data?.error?.code,
    });
  }
};

const onProject = (name) => vercel('get', `/v9${projectPath()}/domains/${encodeURIComponent(name)}`).then(() => true, () => false);

/**
 * Adds the domain (and its twin, sent on to it) to the store's hosting. Safe to repeat.
 * @param {string} host
 */
const addToHosting = async (host) => {
  const names = hostingNames(host);
  for (const [i, name] of names.entries()) {
    const body = i === 0 ? { name } : { name, redirect: names[0], redirectStatusCode: 308 };
    try {
      await vercel('post', `/v10${projectPath()}/domains`, body);
    } catch (err) {
      if (err.status !== 409) throw err;
      // Already here (added before, or by hand): fine. On another website host: the merchant has to free it there.
      if (!(await onProject(name))) {
        throw new StoreHostingError(`${name} is connected to another website host. Remove it there first, then save it here again.`, { status: 409, code: 'in_use_elsewhere' });
      }
    }
  }
};

/**
 * Takes the domain (and its twin) off the store's hosting. Safe to repeat.
 * @param {string} host
 * @param {string[]} keep - Names still needed (when the merchant only switched between a domain and its www)
 */
const removeFromHosting = async (host, keep = []) => {
  for (const name of hostingNames(host).reverse()) {
    if (keep.includes(name)) continue;
    await vercel('delete', `/v9${projectPath()}/domains/${encodeURIComponent(name)}`).catch((err) => {
      if (err.status !== 404) throw err;
    });
  }
};

/** Where a name points now, as the merchant would see it in their DNS. */
const wherePoints = async (name) => {
  const cname = await dns.resolveCname(name).catch(() => []);
  if (cname.length) return cname[0].replace(/\.$/, '');
  const ips = await dns.resolve4(name).catch(() => []);
  return ips.length ? ips.join(', ') : null;
};

/**
 * Whether the saved domain serves the store now: Vercel has it verified and its DNS points here.
 * @param {string} host
 * @returns {Promise<{ state: 'connected'|'waiting', message?: string, verification?: { type: string, host: string, value: string }[] }>}
 */
const hostingState = async (host) => {
  const [main] = hostingNames(host);
  const [domain, config] = await Promise.all([
    vercel('get', `/v9${projectPath()}/domains/${encodeURIComponent(main)}`),
    vercel('get', `/v6/domains/${encodeURIComponent(main)}/config`),
  ]);
  const base = registrableDomain(main);
  const verification = (domain.verification || []).map((v) => {
    const name = clean(v.domain);
    return { type: v.type, host: name === base ? '@' : name.endsWith(`.${base}`) ? name.slice(0, -(base.length + 1)) : name, value: v.value };
  });
  if (domain.verified === false) {
    return { state: 'waiting', verification, message: 'Add the TXT record below too. It shows the domain is yours, because it was used on another website before.' };
  }
  if (config.misconfigured === false) return { state: 'connected' };
  const want = dnsRecordsFor(main).find((r) => (r.host === '@' ? base : `${r.host}.${base}`) === main);
  const now = await wherePoints(main);
  return {
    state: 'waiting',
    message: now
      ? `${main} points to ${now} right now. Change it to ${want ? `${want.type} ${want.value}` : 'the record below'}.`
      : `We can't see the records for ${main} yet. If you've just added them, give it up to an hour.`,
  };
};

/**
 * Puts the store's saved domain on the hosting if it isn't yet, checks it, keeps what was found on the settings
 * (`metadata.domainHosting`), and flips a pending domain to "verified" once it serves. Never throws.
 * @param {import('sequelize').Model} settings - OnlineStoreSettings
 */
const checkStoreDomain = async (settings) => {
  if (!isConfigured() || !settings?.customDomain) return null;
  const domain = clean(settings.customDomain);
  const before = settings.metadata?.domainHosting;
  let found;
  let added = before?.domain === domain && before?.added === true;
  try {
    if (!added) {
      await addToHosting(domain);
      added = true;
    }
    found = await hostingState(domain);
  } catch (err) {
    console.error(`[StoreDomain] Hosting check failed for ${domain}:`, err?.message || err);
    found = {
      state: 'problem',
      message: err?.code === 'in_use_elsewhere' ? err.message : "We couldn't reach the store's hosting just now. We'll try again in a few minutes.",
    };
  }
  const domainHosting = { ...found, domain, added, checkedAt: new Date().toISOString() };
  const updates = { metadata: { ...(settings.metadata || {}), domainHosting } };
  const connectedNow = found.state === 'connected' && settings.customDomainStatus === 'pending';
  if (connectedNow) updates.customDomainStatus = 'verified';
  await settings.update(updates);
  if (connectedNow) {
    console.log(`[StoreDomain] ${domain} connected`);
    require('../utils/corsUtils').refreshVerifiedDomainOrigins().catch(() => {});
  }
  return domainHosting;
};

/** Whether the page should look at a pending domain again before showing it. */
const dueForCheck = (settings) => {
  if (!isConfigured() || !settings?.customDomain || settings.customDomainStatus !== 'pending') return false;
  const h = settings.metadata?.domainHosting;
  if (!h || h.domain !== clean(settings.customDomain)) return true;
  return Date.now() - new Date(h.checkedAt || 0).getTime() > RECHECK_AFTER_MS;
};

/** What the merchant sees about the hosting: the last check for the domain saved now. */
const hostingView = (settings) => {
  const h = settings?.metadata?.domainHosting;
  if (!h || !settings?.customDomain || h.domain !== clean(settings.customDomain)) return null;
  return { state: h.state, message: h.message || null, verification: h.verification || [], checkedAt: h.checkedAt || null };
};

module.exports = {
  StoreHostingError,
  isConfigured,
  cnameTarget,
  hostingNames,
  dnsRecordsFor,
  addToHosting,
  removeFromHosting,
  hostingState,
  checkStoreDomain,
  dueForCheck,
  hostingView,
  registrableDomain,
};
