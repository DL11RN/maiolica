import { describe, expect, it } from 'vitest';
import { Limiter } from '../src/limiter.js';

describe('Limiter', () => {
  it('blocks a key after too many failures and frees it later', () => {
    let t = 0;
    const l = new Limiter(3, 60_000, 30_000, () => t);
    expect(l.hit('a')).toBe(false);
    expect(l.hit('a')).toBe(false);
    expect(l.hit('a')).toBe(true);
    expect(l.blockedFor('a')).toBe(30_000);
    expect(l.blockedFor('b')).toBe(0);
    t = 30_001;
    expect(l.blockedFor('a')).toBe(0);
  });

  it('forgets failures outside the window', () => {
    let t = 0;
    const l = new Limiter(3, 60_000, 30_000, () => t);
    l.hit('a');
    l.hit('a');
    t = 61_000;
    expect(l.hit('a')).toBe(false);
    expect(l.blockedFor('a')).toBe(0);
  });

  it('resets on success and prunes stale entries', () => {
    let t = 0;
    const l = new Limiter(2, 60_000, 30_000, () => t);
    l.hit('a');
    l.reset('a');
    expect(l.hit('a')).toBe(false);
    t = 200_000;
    l.prune();
    expect(l.blockedFor('a')).toBe(0);
  });
});
