/** Resolve local API URLs through Metro's LAN address when running on a phone. */
export function resolveApiUrl(raw: string, hostUri?: string | null, development = false): string {
  const url = new URL(raw.trim());
  let hostname = url.hostname;
  if (development && ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname) && hostUri) {
    try {
      const host = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`).hostname;
      // A tunnel serves Metro only; never send API requests or credentials to it.
      const parts = host.split('.').map(Number);
      const privateIp = parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255)
        && (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168)
          || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31));
      if (privateIp) hostname = host;
    } catch { /* Keep the explicitly configured address if Metro has no usable host. */ }
  }
  const path = url.pathname.replace(/\/+$/, '');
  const apiPath = path.endsWith('/api') ? path : `${path}/api`;
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${hostname}${port}${apiPath}${url.search}`;
}
