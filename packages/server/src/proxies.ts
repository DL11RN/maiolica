import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Parole chiave capite da proxy-addr. */
const KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

const isCidr = (s: string) => {
  const [ip, bits, extra] = s.split('/');
  if (extra !== undefined || !ip || !bits || !/^\d+$/.test(bits)) return false;
  const v = isIP(ip);
  return v !== 0 && Number(bits) <= (v === 4 ? 32 : 128);
};

export type Resolver = (host: string) => Promise<string[]>;

const dnsResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

/**
 * Trasforma TRUSTED_PROXIES in un elenco valido per Fastify: IP, reti CIDR e parole chiave passano
 * così come sono; i nomi (es. "npm.home") vengono risolti nei loro indirizzi all'avvio; ciò che non è
 * valido viene scartato con un avviso, invece di bloccare l'avvio del server.
 */
export async function resolveTrustedProxies(
  raw: string,
  resolve: Resolver = dnsResolver,
): Promise<{ entries: string[]; warnings: string[] }> {
  const entries: string[] = [];
  const warnings: string[] = [];
  for (const item of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (KEYWORDS.has(item.toLowerCase()) || isIP(item) || isCidr(item)) {
      entries.push(KEYWORDS.has(item.toLowerCase()) ? item.toLowerCase() : item);
      continue;
    }
    if (item.includes('/') || !/^[a-z0-9.-]+$/i.test(item)) {
      warnings.push(`"${item}" non è un IP, una rete CIDR né un nome valido: ignorato.`);
      continue;
    }
    try {
      const ips = await resolve(item);
      if (!ips.length) throw new Error('nessun indirizzo');
      entries.push(...ips);
      warnings.push(`"${item}" risolto in ${ips.join(', ')} (all'avvio: se l'IP cambia, riavvia il server).`);
    } catch {
      warnings.push(`Impossibile risolvere "${item}": ignorato.`);
    }
  }
  return { entries: [...new Set(entries)], warnings };
}
