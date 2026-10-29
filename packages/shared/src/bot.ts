/**
 * Avversari automatici. Ogni presa possibile riceve un valore: punti attesi sul muro per le righe
 * che si completano, avanzamento delle altre, penalità del pavimento, bonus di fine partita. Il
 * livello difficile toglie anche quanto la mossa lascia di buono al giocatore successivo. I livelli
 * più bassi sbagliano apposta più spesso.
 */
import {
  floorPenalty,
  legalColumns,
  legalTakes,
  tilePoints,
  wallColumn,
} from './engine';
import type { Color, GameAction, GameState, PlayerState, TakeAction, WallAction } from './types';

export type BotLevel = 'easy' | 'medium' | 'hard';

const MISTAKE_RATE: Record<BotLevel, number> = { easy: 0.45, medium: 0.15, hard: 0 };
const MISTAKE_POOL: Record<BotLevel, number> = { easy: 8, medium: 3, hard: 1 };

/** Colonna migliore per un colore in una riga (muro classico: obbligata). */
function bestColumn(state: GameState, p: PlayerState, row: number, color: Color): number | null {
  if (!state.options.freeWall) return wallColumn(row, color);
  let best: number | null = null;
  let bestValue = -Infinity;
  for (let col = 0; col < 5; col++) {
    if (p.wall[row]![col] !== null || p.wall.some((r) => r[col] === color)) continue;
    const v = wallValue(p, row, col, color);
    if (v > bestValue) {
      bestValue = v;
      best = col;
    }
  }
  return best;
}

/** Valore di una piastrella posata: punti subito più un anticipo dei bonus di fine partita. */
function wallValue(p: PlayerState, row: number, col: number, color: Color): number {
  const wall = p.wall.map((r) => [...r]);
  wall[row]![col] = color;
  let v = tilePoints(wall, row, col);
  const inRow = wall[row]!.filter((c) => c !== null).length;
  const inCol = wall.filter((r) => r[col] !== null).length;
  const sameColor = wall.flat().filter((c) => c === color).length;
  v += (inRow / 5) ** 2 * 2 + (inCol / 5) ** 2 * 7 + (sameColor / 5) ** 2 * 10 * 0.6;
  return v;
}

function takeValue(state: GameState, seat: number, a: TakeAction): number {
  const p = state.players[seat]!;
  const tiles = a.source === 'center' ? state.center : state.factories[a.source]!;
  const n = tiles.filter((c) => c === a.color).length;
  const first = a.source === 'center' && state.firstInCenter;
  let overflow = first ? 1 : 0;
  let value = 0;
  if (a.target === 'floor') overflow += n;
  else {
    const row = a.target;
    const line = p.lines[row]!;
    const cap = row + 1;
    const placed = Math.min(n, cap - line.count);
    overflow += n - placed;
    const col = bestColumn(state, p, row, a.color);
    const tileV = col === null ? 0 : wallValue(p, row, col, a.color);
    if (line.count + placed === cap) value += tileV;
    else {
      // Riga a metà: vale in proporzione a quanto manca, meno se ne mancano tante.
      const missing = cap - line.count - placed;
      value += tileV * (placed / cap) * Math.pow(0.7, missing) + placed * 0.15;
    }
    // Non sprecare righe lunghe per poche piastrelle quando se ne potevano mettere di più.
    if (line.count === 0 && n < cap - 1) value -= 0.25 * (cap - n);
  }
  value += floorPenalty(p.floor.length + overflow) - floorPenalty(p.floor.length);
  if (first) value += 0.6; // si comincia il round dopo
  return value;
}

/** Il meglio che può fare un giocatore in questa situazione (per la mossa difficile). */
function bestFor(state: GameState, seat: number): number {
  const saved = state.current;
  state.current = { seat };
  let best = 0;
  for (const t of legalTakes(state)) best = Math.max(best, takeValue(state, seat, t));
  state.current = saved;
  return best;
}

/** Stato dopo una presa, senza fine round (basta per stimare cosa resta agli altri). */
function afterTake(state: GameState, a: TakeAction): GameState {
  const s = structuredClone(state);
  if (a.source === 'center') {
    s.center = s.center.filter((c) => c !== a.color);
    s.firstInCenter = false;
  } else {
    const f = s.factories[a.source]!;
    s.center.push(...f.filter((c) => c !== a.color));
    s.factories[a.source] = [];
  }
  return s;
}

export function chooseBotMove(state: GameState, seat: number, level: BotLevel, rng: () => number = Math.random): GameAction {
  if (!state.current || state.current.seat !== seat) throw new Error('Non è il turno del bot');
  if (state.phase === 'wall') {
    const next = state.pending[0]!;
    const p = state.players[seat]!;
    const color = p.lines[next.row]!.color!;
    const cols = legalColumns(state);
    const scored = cols.map((col) => ({ col, v: wallValue(p, next.row, col, color) + rng() * 0.01 }));
    scored.sort((a, b) => b.v - a.v);
    const pick = rng() < MISTAKE_RATE[level] && scored.length > 1 ? scored[1 + Math.floor(rng() * (scored.length - 1))]! : scored[0]!;
    return { type: 'wall', col: pick.col } satisfies WallAction;
  }
  const moves = legalTakes(state);
  if (!moves.length) throw new Error('Nessuna mossa possibile');
  const nextSeat = (seat + 1) % state.players.length;
  const scored = moves.map((m) => {
    let v = takeValue(state, seat, m);
    if (level === 'hard') v -= 0.45 * bestFor(afterTake(state, m), nextSeat);
    return { m, v: v + rng() * 0.02 };
  });
  scored.sort((a, b) => b.v - a.v);
  if (rng() < MISTAKE_RATE[level]) {
    const pool = scored.slice(1, 1 + MISTAKE_POOL[level]);
    if (pool.length) return pool[Math.floor(rng() * pool.length)]!.m;
  }
  return scored[0]!.m;
}

