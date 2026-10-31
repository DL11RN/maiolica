/**
 * Motore di regole di Maiolica: funzioni pure, usate dal server (unico arbitro) e dal client (solo per
 * mostrare le mosse possibili). Regole del gioco base di piastrelle con fornaci, righe di
 * preparazione, muro 5×5 e pavimento, più la variante del muro libero.
 */
import type {
  Color,
  FloorItem,
  GameAction,
  GameEvent,
  GameOptions,
  GameState,
  GameView,
  PlayerState,
  Source,
  TakeAction,
  Target,
  WallAction,
} from './types';

export class GameError extends Error {}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const COLORS: readonly Color[] = [0, 1, 2, 3, 4];
export const TILES_PER_COLOR = 20;
export const TILES_PER_FACTORY = 4;
/** Penalità delle 7 caselle del pavimento; oltre, le piastrelle vanno nella scatola senza costare. */
export const FLOOR_PENALTY = [-1, -1, -2, -2, -2, -3, -3] as const;
export const FLOOR_SIZE = FLOOR_PENALTY.length;
const LOG_SIZE = 120;

export const DEFAULT_OPTIONS: GameOptions = { freeWall: false };

export function sanitizeOptions(raw: unknown, base: GameOptions = DEFAULT_OPTIONS): GameOptions {
  const r = (raw ?? {}) as Partial<GameOptions>;
  return { freeWall: typeof r.freeWall === 'boolean' ? r.freeWall : base.freeWall };
}

/** Fornaci per numero di giocatori: 5, 7, 9. */
export const factoriesFor = (players: number) => players * 2 + 1;

/** Muro classico: colore della casella (riga, colonna). Ogni riga è spostata di uno a destra. */
export const wallColor = (row: number, col: number): Color => (((col - row) % 5) + 5) % 5 as Color;
/** Muro classico: colonna in cui va un colore in una riga. */
export const wallColumn = (row: number, color: Color) => (row + color) % 5;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

const emptyPlayer = (seat: number): PlayerState => ({
  seat,
  score: 0,
  breakdown: { wall: 0, floor: 0, rows: 0, columns: 0, colors: 0 },
  lines: Array.from({ length: 5 }, () => ({ color: null, count: 0 })),
  wall: Array.from({ length: 5 }, () => Array<Color | null>(5).fill(null)),
  floor: [],
});

function pushLog(state: GameState, e: GameEvent) {
  state.log.push(e);
  if (state.log.length > LOG_SIZE) state.log.splice(0, state.log.length - LOG_SIZE);
}

/** Riempie le fornaci dal sacchetto; se finisce, ci torna la scatola mescolata. */
function fillFactories(state: GameState, rng: () => number) {
  state.factories = state.factories.map(() => {
    const out: Color[] = [];
    while (out.length < TILES_PER_FACTORY) {
      if (!state.bag.length) {
        if (!state.box.length) break;
        state.bag = shuffle(state.box, rng);
        state.box = [];
      }
      out.push(state.bag.pop()!);
    }
    return out;
  });
}

export function createGame(options: GameOptions, numPlayers: number, rng: () => number = Math.random): GameState {
  if (!Number.isInteger(numPlayers) || numPlayers < MIN_PLAYERS || numPlayers > MAX_PLAYERS)
    throw new GameError(`Servono da ${MIN_PLAYERS} a ${MAX_PLAYERS} giocatori.`);
  const bag = shuffle(
    COLORS.flatMap((c) => Array<Color>(TILES_PER_COLOR).fill(c)),
    rng,
  );
  const state: GameState = {
    version: 1,
    options: sanitizeOptions(options),
    phase: 'offer',
    round: 1,
    players: Array.from({ length: numPlayers }, (_, i) => emptyPlayer(i)),
    factories: Array.from({ length: factoriesFor(numPlayers) }, () => []),
    center: [],
    firstInCenter: true,
    bag,
    box: [],
    current: { seat: 0 },
    pending: [],
    nextFirst: 0,
    log: [{ type: 'round', round: 1 }],
  };
  fillFactories(state, rng);
  return state;
}

// ---------- regole di posa ----------

/** Il colore c'è già nella riga del muro? */
export const rowHasColor = (p: PlayerState, row: number, color: Color) => p.wall[row]!.includes(color);

/** Si può mettere `color` nella riga di preparazione `row`? */
export function canUseLine(p: PlayerState, row: number, color: Color): boolean {
  const line = p.lines[row]!;
  if (line.count >= row + 1) return false;
  if (line.color !== null && line.color !== color) return false;
  return !rowHasColor(p, row, color);
}

type Table = Pick<GameState, 'factories' | 'center' | 'players' | 'phase' | 'current' | 'pending'>;

/** Colori disponibili in una fonte. */
export function colorsIn(state: Pick<GameState, 'factories' | 'center'>, source: Source): Color[] {
  const tiles = source === 'center' ? state.center : (state.factories[source] ?? []);
  return COLORS.filter((c) => tiles.includes(c));
}

/** Tutte le prese possibili per chi è di turno. */
export function legalTakes(state: Table): TakeAction[] {
  if (state.phase !== 'offer' || !state.current) return [];
  const p = state.players[state.current.seat]!;
  const out: TakeAction[] = [];
  const sources: Source[] = [...state.factories.map((_, i) => i), 'center'];
  for (const source of sources)
    for (const color of colorsIn(state, source)) {
      for (let row = 0; row < 5; row++) if (canUseLine(p, row, color)) out.push({ type: 'take', source, color, target: row });
      out.push({ type: 'take', source, color, target: 'floor' });
    }
  return out;
}

/** Muro libero: colonne possibili per la riga in attesa (vuote e senza quel colore nella colonna). */
export function legalColumns(state: Pick<GameState, 'players' | 'pending'>): number[] {
  const next = state.pending[0];
  if (!next) return [];
  const p = state.players[next.seat]!;
  const color = p.lines[next.row]!.color!;
  const out: number[] = [];
  for (let col = 0; col < 5; col++) {
    if (p.wall[next.row]![col] !== null) continue;
    if (p.wall.some((r) => r[col] === color)) continue;
    out.push(col);
  }
  return out;
}

// ---------- punteggi ----------

/** Punti per una piastrella appena posata in (riga, colonna): file orizzontale + verticale. */
/**
 * Come si calcolano i punti di una piastrella appena posata in (riga, colonna): `h` e `v` sono le
 * file orizzontale e verticale che la contengono (lei compresa). Se è isolata vale 1; altrimenti
 * vale la somma delle file lunghe almeno 2 (una fila di 1 non conta).
 */
export function tileScore(wall: (Color | null)[][], row: number, col: number) {
  let h = 1;
  for (let c = col - 1; c >= 0 && wall[row]![c] !== null; c--) h++;
  for (let c = col + 1; c < 5 && wall[row]![c] !== null; c++) h++;
  let v = 1;
  for (let r = row - 1; r >= 0 && wall[r]![col] !== null; r--) v++;
  for (let r = row + 1; r < 5 && wall[r]![col] !== null; r++) v++;
  const points = h === 1 && v === 1 ? 1 : (h > 1 ? h : 0) + (v > 1 ? v : 0);
  return { h, v, points };
}

/** Punti per una piastrella appena posata in (riga, colonna): file orizzontale + verticale. */
export const tilePoints = (wall: (Color | null)[][], row: number, col: number) => tileScore(wall, row, col).points;

export const floorPenalty = (count: number) =>
  FLOOR_PENALTY.slice(0, Math.min(count, FLOOR_SIZE)).reduce((a, b) => a + b, 0);

/** Bonus di fine partita, con le righe, le colonne (0-4) e i colori che lo danno. */
export function finalBonusDetail(p: PlayerState) {
  const rowList = [0, 1, 2, 3, 4].filter((r) => p.wall[r]!.every((c) => c !== null));
  const columnList = [0, 1, 2, 3, 4].filter((c) => p.wall.every((r) => r[c] !== null));
  const colorList = COLORS.filter((color) => p.wall.flat().filter((c) => c === color).length === 5);
  return { rowList, columnList, colorList };
}

export function finalBonus(p: PlayerState) {
  const { rowList, columnList, colorList } = finalBonusDetail(p);
  const rows = rowList.length;
  const columns = columnList.length;
  const colors = colorList.length;
  return { rows, columns, colors, points: rows * 2 + columns * 7 + colors * 10 };
}

/** Classifica: più punti; a parità, più righe complete; poi pari merito. */
export function standings(state: Pick<GameState, 'players'>) {
  const scores = state.players.map((p) => p.score);
  const rows = state.players.map((p) => p.wall.filter((r) => r.every((c) => c !== null)).length);
  const best = Math.max(...scores);
  const tied = scores.flatMap((s, i) => (s === best ? [i] : []));
  const bestRows = Math.max(...tied.map((i) => rows[i]!));
  return { scores, winners: tied.filter((i) => rows[i] === bestRows) };
}

// ---------- azioni ----------

function addPoints(p: PlayerState, key: keyof PlayerState['breakdown'], points: number) {
  p.breakdown[key] += points;
  p.score += points;
}

function dropToFloor(state: GameState, p: PlayerState, items: FloorItem[]) {
  for (const it of items) {
    if (p.floor.length < FLOOR_SIZE || it === 'first') p.floor.push(it);
    else state.box.push(it);
  }
}

function applyTake(state: GameState, seat: number, a: TakeAction, rng: () => number) {
  if (state.phase !== 'offer') throw new GameError('Ora non si prendono piastrelle.');
  const p = state.players[seat]!;
  const { source, color, target } = a;
  if (!COLORS.includes(color)) throw new GameError('Colore non valido.');
  let taken: Color[];
  let first = false;
  if (source === 'center') {
    taken = state.center.filter((c) => c === color);
    if (!taken.length) throw new GameError('Al centro non c’è quel colore.');
    state.center = state.center.filter((c) => c !== color);
    if (state.firstInCenter) {
      state.firstInCenter = false;
      state.nextFirst = seat;
      first = true;
    }
  } else {
    const f = state.factories[source];
    if (!Number.isInteger(source) || !f) throw new GameError('Fornace non valida.');
    taken = f.filter((c) => c === color);
    if (!taken.length) throw new GameError('In quella fornace non c’è quel colore.');
    state.center.push(...f.filter((c) => c !== color));
    state.factories[source] = [];
  }
  const overflow: FloorItem[] = first ? ['first'] : [];
  if (target === 'floor') overflow.push(...taken);
  else {
    if (!Number.isInteger(target) || target < 0 || target > 4) throw new GameError('Riga non valida.');
    if (!canUseLine(p, target, color)) throw new GameError('In quella riga non si può mettere questo colore.');
    const line = p.lines[target]!;
    const room = target + 1 - line.count;
    line.color = color;
    line.count += Math.min(room, taken.length);
    overflow.push(...taken.slice(room));
  }
  dropToFloor(state, p, overflow);
  pushLog(state, { type: 'take', round: state.round, seat, source, color, count: taken.length, target, first });

  const empty = state.factories.every((f) => !f.length) && !state.center.length;
  if (!empty) {
    state.current = { seat: (seat + 1) % state.players.length };
    return;
  }
  startWallTiling(state, rng);
}

/** Fine delle offerte: le righe complete passano sul muro (in automatico o, col muro libero, a scelta). */
function startWallTiling(state: GameState, rng: () => number) {
  if (!state.options.freeWall) {
    for (const p of state.players)
      for (let row = 0; row < 5; row++) {
        const line = p.lines[row]!;
        if (line.count === row + 1 && line.color !== null) placeOnWall(state, p, row, wallColumn(row, line.color));
      }
    endRound(state, rng);
    return;
  }
  state.phase = 'wall';
  state.pending = [];
  for (let k = 0; k < state.players.length; k++) {
    const seat = (state.nextFirst + k) % state.players.length;
    const p = state.players[seat]!;
    for (let row = 0; row < 5; row++) if (p.lines[row]!.count === row + 1) state.pending.push({ seat, row });
  }
  advancePending(state, rng);
}

function placeOnWall(state: GameState, p: PlayerState, row: number, col: number) {
  const line = p.lines[row]!;
  const color = line.color!;
  p.wall[row]![col] = color;
  const { h, v, points } = tileScore(p.wall, row, col);
  addPoints(p, 'wall', points);
  pushLog(state, { type: 'tile', round: state.round, seat: p.seat, row, col, color, points, h, v });
  // Una piastrella resta sul muro, le altre della riga vanno nella scatola.
  for (let i = 1; i < line.count; i++) state.box.push(color);
  p.lines[row] = { color: null, count: 0 };
}

/** Muro libero: salta le righe senza colonne possibili (quelle piastrelle cadono sul pavimento). */
function advancePending(state: GameState, rng: () => number) {
  while (state.pending.length) {
    const next = state.pending[0]!;
    if (legalColumns(state).length) {
      state.current = { seat: next.seat };
      return;
    }
    const p = state.players[next.seat]!;
    const line = p.lines[next.row]!;
    pushLog(state, { type: 'blocked', round: state.round, seat: p.seat, row: next.row, color: line.color!, count: line.count });
    dropToFloor(state, p, Array<Color>(line.count).fill(line.color!));
    p.lines[next.row] = { color: null, count: 0 };
    state.pending.shift();
  }
  endRound(state, rng);
}

function applyWall(state: GameState, seat: number, a: WallAction, rng: () => number) {
  if (state.phase !== 'wall') throw new GameError('Ora non si posa sul muro.');
  const next = state.pending[0];
  if (!next || next.seat !== seat) throw new GameError('Non è il tuo turno.');
  if (!legalColumns(state).includes(a.col)) throw new GameError('In quella colonna non si può.');
  placeOnWall(state, state.players[seat]!, next.row, a.col);
  state.pending.shift();
  advancePending(state, rng);
}

/** Penalità del pavimento, controllo di fine partita, nuovo round. */
function endRound(state: GameState, rng: () => number) {
  for (const p of state.players) {
    const penalty = floorPenalty(p.floor.length);
    if (penalty) {
      // Il punteggio non scende sotto zero (`0 - score` e non `-score`, per non avere -0).
      const applied = Math.max(penalty, 0 - p.score);
      addPoints(p, 'floor', applied);
      const count = Math.min(p.floor.length, FLOOR_SIZE);
      pushLog(state, { type: 'floor', round: state.round, seat: p.seat, points: applied, count, penalty });
    }
    for (const it of p.floor) if (it !== 'first') state.box.push(it);
    p.floor = [];
  }
  state.pending = [];
  const over = state.players.some((p) => p.wall.some((r) => r.every((c) => c !== null)));
  if (over) {
    endGame(state);
    return;
  }
  state.round++;
  state.phase = 'offer';
  state.firstInCenter = true;
  fillFactories(state, rng);
  state.current = { seat: state.nextFirst };
  pushLog(state, { type: 'round', round: state.round });
  // Sacchetto e scatola vuoti (tutte le piastrelle sui muri o nelle righe incomplete): nessuno può
  // più giocare, la partita finisce qui (prima si ripeteva il round vuoto all'infinito).
  if (state.factories.every((f) => !f.length) && !state.center.length) endGame(state);
}

/** Bonus finali e chiusura della partita. */
function endGame(state: GameState) {
  for (const p of state.players) {
    const { rowList, columnList, colorList } = finalBonusDetail(p);
    const add = (kind: 'rows' | 'columns' | 'colors', which: number[], each: number) => {
      if (!which.length) return;
      addPoints(p, kind, which.length * each);
      pushLog(state, { type: 'bonus', seat: p.seat, kind, count: which.length, points: which.length * each, which });
    };
    add('rows', rowList, 2);
    add('columns', columnList, 7);
    add('colors', colorList, 10);
  }
  state.phase = 'ended';
  state.current = null;
}

/** Applica un'azione e restituisce il nuovo stato (quello ricevuto non viene modificato). */
export function applyAction(state: GameState, seat: number, action: GameAction, rng: () => number = Math.random): GameState {
  if (state.phase === 'ended' || !state.current) throw new GameError('La partita è finita.');
  if (seat !== state.current.seat) throw new GameError('Non è il tuo turno.');
  if (!action || typeof action !== 'object') throw new GameError('Azione non valida.');
  const next = structuredClone(state);
  if (action.type === 'take') applyTake(next, seat, action, rng);
  else if (action.type === 'wall') applyWall(next, seat, action, rng);
  else throw new GameError('Azione non valida.');
  return next;
}

export function viewFor(state: GameState, seat: number | null): GameView {
  const { bag, ...rest } = state;
  return { ...structuredClone(rest), bagCount: bag.length, you: seat };
}

export function migrateState(state: GameState): GameState {
  return { ...state, options: sanitizeOptions(state.options), pending: state.pending ?? [] };
}

export type { Target };
