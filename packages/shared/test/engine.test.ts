import { describe, expect, it } from 'vitest';
import {
  COLORS,
  applyAction,
  canUseLine,
  chooseBotMove,
  createGame,
  finalBonus,
  floorPenalty,
  legalColumns,
  legalTakes,
  standings,
  tilePoints,
  viewFor,
  wallColor,
  wallColumn,
  type Color,
  type GameState,
} from '../src/index';

function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wall = (cells: [number, number][]) => {
  const w: (Color | null)[][] = Array.from({ length: 5 }, () => Array<Color | null>(5).fill(null));
  for (const [r, c] of cells) w[r]![c] = wallColor(r, c);
  return w;
};

/** Gioca una partita intera con i bot. */
function playOut(state: GameState, levels: ('easy' | 'medium' | 'hard')[], seed = 1) {
  let s = state;
  const r = rng(seed);
  let moves = 0;
  while (s.phase !== 'ended' && moves < 2000) {
    const seat = s.current!.seat;
    s = applyAction(s, seat, chooseBotMove(s, seat, levels[seat]!, r), r);
    moves++;
  }
  return s;
}

describe('preparazione', () => {
  it('fornaci per numero di giocatori, 4 piastrelle ciascuna, 100 in tutto', () => {
    for (const [n, f] of [[2, 5], [3, 7], [4, 9]] as const) {
      const s = createGame({ freeWall: false }, n, rng(n));
      expect(s.factories).toHaveLength(f);
      expect(s.factories.every((x) => x.length === 4)).toBe(true);
      expect(s.bag.length + f * 4).toBe(100);
    }
  });

  it('il muro classico ha ogni colore una volta per riga e per colonna', () => {
    for (let r = 0; r < 5; r++) {
      expect(new Set([0, 1, 2, 3, 4].map((c) => wallColor(r, c))).size).toBe(5);
      for (const color of COLORS) expect(wallColor(r, wallColumn(r, color))).toBe(color);
    }
    for (let c = 0; c < 5; c++) expect(new Set([0, 1, 2, 3, 4].map((r) => wallColor(r, c))).size).toBe(5);
  });
});

describe('prese', () => {
  it('da una fornace: il resto va al centro e tocca al successivo', () => {
    const s = createGame({ freeWall: false }, 2, rng());
    s.factories[0] = [0, 0, 1, 2];
    const n = applyAction(s, 0, { type: 'take', source: 0, color: 0, target: 1 });
    expect(n.players[0]!.lines[1]).toEqual({ color: 0, count: 2 });
    expect(n.center.sort()).toEqual([1, 2]);
    expect(n.factories[0]).toEqual([]);
    expect(n.current!.seat).toBe(1);
  });

  it('dal centro la prima volta si prende il segnalino del primo giocatore', () => {
    const s = createGame({ freeWall: false }, 2, rng());
    s.center = [3, 3, 4];
    const n = applyAction(s, 0, { type: 'take', source: 'center', color: 3, target: 0 });
    expect(n.players[0]!.lines[0]).toEqual({ color: 3, count: 1 });
    expect(n.players[0]!.floor).toEqual(['first', 3]);
    expect(n.firstInCenter).toBe(false);
    expect(n.nextFirst).toBe(0);
  });

  it('non si mescolano colori in una riga né si ripete un colore già sul muro', () => {
    const s = createGame({ freeWall: false }, 2, rng());
    const p = s.players[0]!;
    p.lines[2] = { color: 1, count: 1 };
    expect(canUseLine(p, 2, 1)).toBe(true);
    expect(canUseLine(p, 2, 2)).toBe(false);
    p.wall[3]![wallColumn(3, 4)] = 4;
    expect(canUseLine(p, 3, 4)).toBe(false);
    expect(legalTakes(s).every((t) => t.target === 'floor' || canUseLine(p, t.target, t.color))).toBe(true);
  });
});

describe('punteggi', () => {
  it('piastrella isolata 1 punto; in fila conta la fila', () => {
    expect(tilePoints(wall([[0, 0]]), 0, 0)).toBe(1);
    expect(tilePoints(wall([[0, 0], [0, 1], [0, 2]]), 0, 2)).toBe(3);
    // Croce: 3 in orizzontale + 3 in verticale.
    expect(tilePoints(wall([[1, 0], [1, 1], [1, 2], [0, 1], [2, 1]]), 1, 1)).toBe(6);
  });

  it('pavimento: -1 -1 -2 -2 -2 -3 -3', () => {
    expect(floorPenalty(1)).toBe(-1);
    expect(floorPenalty(3)).toBe(-4);
    expect(floorPenalty(7)).toBe(-14);
    expect(floorPenalty(9)).toBe(-14);
  });

  it('bonus finali: righe +2, colonne +7, colori +10', () => {
    const s = createGame({ freeWall: false }, 2, rng());
    const p = s.players[0]!;
    const cells: [number, number][] = [];
    for (let c = 0; c < 5; c++) cells.push([0, c]);
    for (let r = 1; r < 5; r++) cells.push([r, 0]);
    for (let r = 0; r < 5; r++) cells.push([r, wallColumn(r, 2)]);
    p.wall = wall(cells);
    const b = finalBonus(p);
    expect(b.rows).toBe(1);
    expect(b.columns).toBe(1);
    expect(b.colors).toBe(1);
    expect(b.points).toBe(19);
  });

  it('fine round: riga completa sul muro, penalità, si riparte da chi ha il segnalino', () => {
    const s = createGame({ freeWall: false }, 2, rng());
    s.factories = s.factories.map(() => []);
    s.factories[0] = [2, 2, 1, 1];
    s.center = [];
    const n = applyAction(s, 0, { type: 'take', source: 0, color: 2, target: 1 });
    expect(n.round).toBe(1);
    // Il giocatore 1 prende dal centro (con il segnalino) e chiude il round.
    const m = applyAction(n, 1, { type: 'take', source: 'center', color: 1, target: 1 });
    expect(m.round).toBe(2);
    expect(m.players[0]!.wall[1]![wallColumn(1, 2)]).toBe(2);
    expect(m.players[0]!.score).toBe(1);
    expect(m.players[1]!.score).toBe(0); // 1 punto meno il segnalino, mai sotto zero
    expect(m.current!.seat).toBe(1);
    expect(m.factories.every((f) => f.length === 4)).toBe(true);
  });
});

describe('muro libero', () => {
  it('chi ha una riga completa sceglie la colonna, senza ripetere il colore in colonna', () => {
    const s = createGame({ freeWall: true }, 2, rng());
    s.factories = s.factories.map(() => []);
    s.factories[0] = [3, 4, 4, 4];
    s.players[0]!.wall[1]![2] = 3;
    const n = applyAction(s, 0, { type: 'take', source: 0, color: 3, target: 0 });
    // Il centro ha ancora piastrelle: tocca all'altro, che prende il segnalino e chiude le offerte.
    const m = applyAction(n, 1, { type: 'take', source: 'center', color: 4, target: 2 });
    expect(m.phase).toBe('wall');
    // Comincia chi ha il segnalino.
    expect(m.current!.seat).toBe(1);
    expect(legalColumns(m)).toEqual([0, 1, 2, 3, 4]);
    const o1 = applyAction(m, 1, { type: 'wall', col: 4 });
    expect(o1.players[1]!.wall[2]![4]).toBe(4);
    // Poi il giocatore 0: la colonna 2 ha già quel colore.
    expect(o1.current!.seat).toBe(0);
    expect(legalColumns(o1)).toEqual([0, 1, 3, 4]);
    const o = applyAction(o1, 0, { type: 'wall', col: 0 });
    expect(o.phase).toBe('offer');
  });
});

describe('vista e bot', () => {
  it('la vista non mostra il sacchetto', () => {
    const v = viewFor(createGame({ freeWall: false }, 3, rng()), 1) as unknown as Record<string, unknown>;
    expect(v.bag).toBeUndefined();
    expect(v.bagCount).toBe(100 - 28);
  });

  it('i bot finiscono la partita con punteggi credibili, anche col muro libero', { timeout: 60_000 }, () => {
    for (const freeWall of [false, true]) {
      const end = playOut(createGame({ freeWall }, 4, rng(9)), ['easy', 'medium', 'hard', 'hard'], 3);
      expect(end.phase).toBe('ended');
      const tiles = end.players.reduce((a, p) => a + p.wall.flat().filter((c) => c !== null).length, 0);
      expect(tiles).toBeGreaterThan(30);
      expect(standings(end).winners.length).toBeGreaterThan(0);
    }
  });

  it('il bot difficile batte quasi sempre quello facile', { timeout: 120_000 }, () => {
    let wins = 0;
    for (let g = 0; g < 8; g++) {
      const end = playOut(createGame({ freeWall: false }, 2, rng(50 + g)), g % 2 ? ['hard', 'easy'] : ['easy', 'hard'], g);
      const hard = g % 2 ? 0 : 1;
      if (end.players[hard]!.score > end.players[1 - hard]!.score) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(6);
  });
});
