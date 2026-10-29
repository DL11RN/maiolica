/** Logica lato client per preparare la mossa: usa le stesse funzioni del server, solo per mostrare. */
import {
  canUseLine,
  legalColumns,
  seatName,
  type Color,
  type GameEvent,
  type GameSummary,
  type GameView,
  type Source,
} from '@maiolica/shared';
import { useCallback, useEffect } from 'react';
import { sendAction } from '../socket';
import { useGame } from '../store';
import { COLOR_NAMES } from './TileFace';

export const isMyTurn = (view: GameView, game: GameSummary) =>
  game.status === 'playing' && view.phase !== 'ended' && view.current?.seat === view.you && view.you !== null;

/** Righe (0-4) dove si possono mettere le piastrelle scelte; il pavimento va sempre bene. */
export function validRows(view: GameView, color: Color): number[] {
  if (view.you === null) return [];
  const p = view.players[view.you]!;
  return [0, 1, 2, 3, 4].filter((r) => canUseLine(p, r, color));
}

export const sourceTiles = (view: GameView, source: Source): Color[] =>
  source === 'center' ? view.center : (view.factories[source] ?? []);

export function eventText(e: GameEvent, game: GameSummary): string {
  const name = (seat: number) => seatName(game.players[seat] ?? { seat, name: null, bot: null });
  switch (e.type) {
    case 'take': {
      const where = e.source === 'center' ? 'dal centro' : `dalla fornace ${e.source + 1}`;
      const to = e.target === 'floor' ? 'sul pavimento' : `nella riga ${e.target + 1}`;
      const tiles = e.count === 1 ? `1 ${COLOR_NAMES[e.color]}` : `${e.count} ${COLOR_NAMES[e.color]}`;
      return `${name(e.seat)} prende ${tiles} ${where}, ${to}${e.first ? ' (e il segnalino del primo giocatore)' : ''}.`;
    }
    case 'tile':
      return `${name(e.seat)} posa ${COLOR_NAMES[e.color]} sul muro: +${e.points}.`;
    case 'floor':
      return `${name(e.seat)}: pavimento ${e.points}.`;
    case 'bonus': {
      const what = e.kind === 'rows' ? 'righe complete' : e.kind === 'columns' ? 'colonne complete' : 'colori completi';
      return `${name(e.seat)}: ${e.count} ${what}, +${e.points}.`;
    }
    case 'round':
      return `Inizia il round ${e.round}.`;
  }
}

/** Selezione e invio della mossa, condivisi da tavolo 2D, 3D e pannelli. */
export function usePlay(game: GameSummary, view: GameView) {
  const plan = useGame((s) => s.plan);
  const setPlan = useGame((s) => s.setPlan);
  const mine = isMyTurn(view, game);
  const offer = mine && view.phase === 'offer';
  const wallTurn = mine && view.phase === 'wall';
  const rows = plan && offer ? validRows(view, plan.color) : [];
  const columns = wallTurn ? legalColumns(view) : [];
  const pendingRow = wallTurn ? (view.pending[0]?.row ?? null) : null;

  const pick = useCallback(
    (source: Source, color: Color) => {
      if (!offer) return;
      if (plan && plan.source === source && plan.color === color) setPlan(null);
      else setPlan({ source, color });
    },
    [offer, plan, setPlan],
  );

  const place = useCallback(
    async (target: number | 'floor') => {
      if (!plan || !offer) return;
      if (target !== 'floor' && !rows.includes(target)) return;
      const ok = await sendAction({ type: 'take', source: plan.source, color: plan.color, target });
      if (ok) setPlan(null);
    },
    [plan, offer, rows, setPlan],
  );

  const wall = useCallback(
    async (col: number) => {
      if (!wallTurn || !columns.includes(col)) return;
      await sendAction({ type: 'wall', col });
    },
    [wallTurn, columns],
  );

  // Tastiera (PC): 1-5 righe, 0 o P pavimento, Esc annulla.
  useEffect(() => {
    if (!offer) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') setPlan(null);
      else if (plan && /^[1-5]$/.test(e.key)) void place(Number(e.key) - 1);
      else if (plan && (e.key === '0' || e.key.toLowerCase() === 'p')) void place('floor');
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [offer, plan, place, setPlan]);

  return { plan, mine, offer, wallTurn, rows, columns, pendingRow, pick, place, wall, cancel: () => setPlan(null) };
}

export type PlayControls = ReturnType<typeof usePlay>;
