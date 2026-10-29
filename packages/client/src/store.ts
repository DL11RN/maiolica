import type { Color, GameView, Source } from '@maiolica/shared';
import { create } from 'zustand';
import type { GameSummary } from './api';

export interface ChatMessage {
  id: number;
  user: string;
  text: string;
  at: number;
}

/** Presa in preparazione: la fonte e il colore scelti, prima di indicare la riga. */
export interface Plan {
  source: Source;
  color: Color;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preferenza solo locale */
  }
};

/** Telefoni e tablet: schermo touch come puntatore principale. */
export const isTouchDevice = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export type Quality = 'alta' | 'bassa';
/** Come mostrare il tavolo: 3D, 2D o scelta automatica (3D sul PC, 2D sul telefono). */
export type ViewMode = 'auto' | '3d' | '2d';

const loadQuality = (): Quality => {
  const saved = read('maiolica-quality');
  if (saved === 'alta' || saved === 'bassa') return saved;
  return isTouchDevice() ? 'bassa' : 'alta';
};
const loadViewMode = (): ViewMode => {
  const saved = read('maiolica-view');
  return saved === '3d' || saved === '2d' ? saved : 'auto';
};

interface GameStore {
  game: GameSummary | null;
  view: GameView | null;
  messages: ChatMessage[];
  toast: { text: string; id: number } | null;
  plan: Plan | null;
  /** Rivincita proposta da un altro giocatore. */
  rematchOffer: { id: string; by: string } | null;
  /** Differenza tra l'orologio del server e quello locale. */
  serverOffset: number;
  /** Mostra le tessere rimaste (pannello laterale). */
  showDeck: boolean;
  quality: Quality;
  viewMode: ViewMode;
  /** Motivo per cui il tavolo 3D non è partito (si passa al 2D). */
  sceneError: string | null;
  setQuality: (q: Quality) => void;
  setViewMode: (m: ViewMode) => void;
  setSceneError: (e: string | null) => void;
  setState: (game: GameSummary, view: GameView, serverNow?: number) => void;
  setPlan: (plan: Plan | null) => void;
  showToast: (text: string) => void;
  setMessages: (m: ChatMessage[]) => void;
  addMessage: (m: ChatMessage) => void;
  setRematchOffer: (r: { id: string; by: string } | null) => void;
  setShowDeck: (v: boolean) => void;
  reset: () => void;
}

export const useGame = create<GameStore>((set, get) => ({
  game: null,
  view: null,
  messages: [],
  toast: null,
  plan: null,
  rematchOffer: null,
  serverOffset: 0,
  showDeck: read('maiolica-deck') === '1',
  quality: loadQuality(),
  viewMode: loadViewMode(),
  sceneError: null,
  setQuality: (quality) => {
    write('maiolica-quality', quality);
    set({ quality });
  },
  setViewMode: (viewMode) => {
    write('maiolica-view', viewMode);
    set({ viewMode, ...(viewMode === '3d' ? { sceneError: null } : {}) });
  },
  setSceneError: (sceneError) => set({ sceneError }),
  setState: (game, view, serverNow) => {
    // Cambiato il turno: la presa in preparazione non vale più.
    const prev = get().view;
    const sameTurn = prev && prev.current?.seat === view.current?.seat && prev.log.length === view.log.length;
    set({
      game,
      view,
      ...(serverNow ? { serverOffset: serverNow - Date.now() } : {}),
      ...(sameTurn ? {} : { plan: null }),
    });
  },
  setPlan: (plan) => set({ plan }),
  showToast: (text) => set({ toast: { text, id: Date.now() } }),
  setMessages: (messages) => set({ messages }),
  addMessage: (m) => set({ messages: [...get().messages.slice(-199), m] }),
  setRematchOffer: (rematchOffer) => set({ rematchOffer }),
  setShowDeck: (showDeck) => {
    write('maiolica-deck', showDeck ? '1' : '0');
    set({ showDeck });
  },
  reset: () => set({ game: null, view: null, messages: [], plan: null, rematchOffer: null }),
}));
