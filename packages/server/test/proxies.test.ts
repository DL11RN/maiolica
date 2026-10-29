import { describe, expect, it } from 'vitest';
import { resolveTrustedProxies } from '../src/proxies.js';

const fakeDns = async (host: string) => {
  if (host === 'skydreams.home') return ['192.168.1.20'];
  throw new Error('ENOTFOUND');
};

describe('resolveTrustedProxies', () => {
  it('keeps IPs, CIDR ranges and keywords as they are', async () => {
    const r = await resolveTrustedProxies('loopback, 172.16.0.0/12,100.64.0.10,fd00::/8', fakeDns);
    expect(r.entries).toEqual(['loopback', '172.16.0.0/12', '100.64.0.10', 'fd00::/8']);
    expect(r.warnings).toEqual([]);
  });

  it('resolves host names instead of crashing', async () => {
    const r = await resolveTrustedProxies('loopback,skydreams.home', fakeDns);
    expect(r.entries).toEqual(['loopback', '192.168.1.20']);
    expect(r.warnings[0]).toMatch(/risolto/);
  });

  it('drops unresolvable or malformed entries with a warning', async () => {
    const r = await resolveTrustedProxies('nonesiste.local,10.0.0.0/99,http://x,loopback', fakeDns);
    expect(r.entries).toEqual(['loopback']);
    expect(r.warnings).toHaveLength(3);
  });
});
