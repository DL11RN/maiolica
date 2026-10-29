import type { BotLevel } from './bot';
import type { GameOptions } from './types';

/** Come si riempie il tavolo: con altre persone o contro il computer. */
export type GameMode = 'friends' | 'bots';
export type GameStatus = 'waiting' | 'playing' | 'ended';

export type SeatSummary = {
  seat: number;
  /** Nome della persona seduta (`null` = posto libero o bot). */
  name: string | null;
  bot: BotLevel | null;
  online: boolean;
  score: number;
};

/** Riepilogo di una partita, per la bottega e per l'intestazione della partita. */
export type GameSummary = {
  id: string;
  code: string;
  status: GameStatus;
  mode: GameMode;
  botLevel: BotLevel | null;
  options: GameOptions;
  players: SeatSummary[];
  /** Il tuo posto (`null` se non sei al tavolo). */
  you: number | null;
  isHost: boolean;
  /** Chi deve giocare (`null` in attesa o a partita finita). */
  turn: number | null;
  /** Round in corso. */
  round: number;
  /** A partita finita: chi ha vinto. */
  winners: number[] | null;
  /** Rivincita già proposta (id della nuova partita). */
  rematch: string | null;
  updatedAt: number;
};

export const BOT_NAMES: Record<BotLevel, string> = {
  easy: 'Apprendista',
  medium: 'Decoratore',
  hard: 'Maestro ceramista',
};

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  easy: 'Facile',
  medium: 'Medio',
  hard: 'Difficile',
};

/** Nome da mostrare per un posto. */
export const seatName = (s: Pick<SeatSummary, 'name' | 'bot' | 'seat'>) =>
  s.name ?? (s.bot ? `${BOT_NAMES[s.bot]} ${s.seat + 1}` : 'Posto libero');
