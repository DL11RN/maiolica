/** Colori delle piastrelle (indici 0-4), nell'ordine della prima riga del muro. */
export type Color = 0 | 1 | 2 | 3 | 4;

/** Dove si prendono le piastrelle: una fornace (indice) o il centro del tavolo. */
export type Source = number | 'center';

/** Dove si mettono: una riga di preparazione (0-4) o direttamente il pavimento. */
export type Target = number | 'floor';

export type GameOptions = {
  /** Muro libero: ognuno sceglie dove mettere i colori (una volta per riga e per colonna). */
  freeWall: boolean;
};

/** Riga di preparazione: colore e numero di piastrelle (al massimo indice + 1). */
export type PatternLine = { color: Color | null; count: number };

/** Pavimento: piastrelle cadute e, forse, il segnalino del primo giocatore (`'first'`). */
export type FloorItem = Color | 'first';

export type ScoreBreakdown = { wall: number; floor: number; rows: number; columns: number; colors: number };

export type PlayerState = {
  seat: number;
  score: number;
  breakdown: ScoreBreakdown;
  lines: PatternLine[];
  /** Muro 5×5: colore della piastrella posata o `null`. */
  wall: (Color | null)[][];
  floor: FloorItem[];
};

export type GameEvent =
  | { type: 'take'; round: number; seat: number; source: Source; color: Color; count: number; target: Target; first: boolean }
  /**
   * Piastrella posata sul muro. `h` e `v`: lunghezza della fila orizzontale e verticale che la
   * contengono (lei compresa); una fila di 1 non conta (facoltativi: assenti nelle partite vecchie).
   */
  | { type: 'tile'; round: number; seat: number; row: number; col: number; color: Color; points: number; h?: number; v?: number }
  /**
   * Penalità del pavimento. `count`: caselle occupate (segnalino compreso, al massimo 7); `penalty`:
   * penalità piena; `points`: quella applicata (minore se il punteggio sarebbe sceso sotto zero).
   */
  | { type: 'floor'; round: number; seat: number; points: number; count?: number; penalty?: number }
  /** Muro libero: una riga completa senza colonne possibili, le sue piastrelle cadono sul pavimento. */
  | { type: 'blocked'; round: number; seat: number; row: number; color: Color; count: number }
  /** Bonus di fine partita. `which`: righe, colonne (0-4) o colori che lo hanno dato. */
  | { type: 'bonus'; seat: number; kind: 'rows' | 'columns' | 'colors'; count: number; points: number; which?: number[] }
  | { type: 'round'; round: number };

export type Phase = 'offer' | 'wall' | 'ended';

export type GameState = {
  version: 1;
  options: GameOptions;
  phase: Phase;
  round: number;
  players: PlayerState[];
  factories: Color[][];
  center: Color[];
  /** Il segnalino del primo giocatore è ancora al centro. */
  firstInCenter: boolean;
  /** Piastrelle nel sacchetto (ordine nascosto). */
  bag: Color[];
  /** Piastrelle scartate, che tornano nel sacchetto quando finisce. */
  box: Color[];
  /** Chi deve giocare (`null` a partita finita). */
  current: { seat: number } | null;
  /** Muro libero: righe complete ancora da posare, in ordine (posto, riga). */
  pending: { seat: number; row: number }[];
  /** Chi comincia il prossimo round (ha preso il segnalino). */
  nextFirst: number;
  log: GameEvent[];
};

export type GameView = Omit<GameState, 'bag'> & {
  bagCount: number;
  you: number | null;
};

export type TakeAction = { type: 'take'; source: Source; color: Color; target: Target };
/** Muro libero: colonna dove posare la piastrella della riga in attesa. */
export type WallAction = { type: 'wall'; col: number };

export type GameAction = TakeAction | WallAction;
