/**
 * Limitatore di tentativi in memoria: conta i fallimenti per chiave (IP o nome utente) in una
 * finestra di tempo e, superata la soglia, blocca la chiave per un po'.
 */
export class Limiter {
  private entries = new Map<string, { count: number; first: number; blockedUntil: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly blockMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Millisecondi di blocco rimasti per la chiave (0 se libera). */
  blockedFor(key: string): number {
    const e = this.entries.get(key);
    if (!e) return 0;
    return Math.max(0, e.blockedUntil - this.now());
  }

  /** Registra un tentativo; restituisce true se con questo la chiave viene bloccata. */
  hit(key: string): boolean {
    const t = this.now();
    let e = this.entries.get(key);
    if (!e || t - e.first > this.windowMs) {
      e = { count: 0, first: t, blockedUntil: 0 };
      this.entries.set(key, e);
    }
    e.count++;
    if (e.count >= this.max) {
      e.blockedUntil = t + this.blockMs;
      e.count = 0;
      e.first = t;
      return true;
    }
    return false;
  }

  reset(key: string) {
    this.entries.delete(key);
  }

  /** Elimina le voci scadute, per non far crescere la memoria. */
  prune() {
    const t = this.now();
    for (const [k, e] of this.entries)
      if (e.blockedUntil <= t && t - e.first > this.windowMs) this.entries.delete(k);
  }
}

export const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60000));
