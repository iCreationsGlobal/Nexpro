import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConnectDomainDialog, { buildDnsRecord } from '../../components/store/ConnectDomainDialog';

vi.mock('../../components/store/OnlineStoreHelpBanner', () => ({ default: () => null }));

describe('buildDnsRecord', () => {
  it('gives a domain itself an A record and www a CNAME when the server sends nothing', () => {
    const record = buildDnsRecord('paylesstechnologysystems.com', 'store.absghana.com');
    expect(record.records).toEqual([
      { type: 'A', host: '@', value: '216.198.79.1' },
      { type: 'CNAME', host: 'www', value: 'store.absghana.com' },
    ]);
    expect(buildDnsRecord('www.payless.com', 'store.absghana.com').records).toHaveLength(2);
    expect(buildDnsRecord('shop.payless.com', 'store.absghana.com').records).toEqual([{ type: 'CNAME', host: 'shop', value: 'store.absghana.com' }]);
    expect(buildDnsRecord('', 'store.absghana.com')).toBeNull();
  });

  it("uses the server's records and what its last check found", () => {
    const record = buildDnsRecord('shop.com.gh', 'store.absghana.com', {
      dnsRecords: [{ type: 'A', host: '@', value: '216.198.79.1' }, { type: 'TXT', host: '_vercel', value: 'vc-domain-verify=abc' }],
      autoConnect: true,
      hosting: { state: 'waiting', message: 'shop.com.gh points to 62.169.22.3 right now. Change it to A 216.198.79.1.' },
    });
    expect(record.records.map((r) => r.type)).toEqual(['A', 'TXT']);
    expect(record.autoConnect).toBe(true);
    expect(record.hosting.state).toBe('waiting');
  });
});

describe('ConnectDomainDialog', () => {
  it('lists every record and says what to change while the domain is pending', () => {
    const dnsRecord = buildDnsRecord('paylesstechnologysystems.com', 'store.absghana.com', {
      autoConnect: true,
      hosting: { state: 'waiting', message: 'paylesstechnologysystems.com points to 62.169.22.3 right now. Change it to A 216.198.79.1.' },
    });
    render(
      <ConnectDomainDialog
        open onOpenChange={vi.fn()} domainStatus="pending" domainInput="paylesstechnologysystems.com"
        onDomainInputChange={vi.fn()} customDomain="paylesstechnologysystems.com" cnameTarget="store.absghana.com"
        dnsRecord={dnsRecord} onSave={vi.fn()} onDisconnect={vi.fn()} onCopyAllRecord={vi.fn()}
      />,
    );
    expect(screen.getByText('216.198.79.1')).toBeInTheDocument();
    expect(screen.getByText('store.absghana.com')).toBeInTheDocument();
    expect(screen.getByText(/points to 62\.169\.22\.3 right now/)).toBeInTheDocument();
    expect(screen.getByText(/we connect your domain and set up HTTPS by ourselves/)).toBeInTheDocument();
    expect(screen.queryByText(/cannot use a CNAME/)).not.toBeInTheDocument();
  });
});
