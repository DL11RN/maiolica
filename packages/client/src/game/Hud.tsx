/**
 * Interfaccia della partita: barra in alto (ritorno alla bottega, round, sacchetto, strumenti),
 * striscia di stato con i giocatori e cosa fare, finestre per cronaca, chat e regole.
 */
import { BOT_LEVEL_LABEL, seatName, type GameView } from '@maiolica/shared';
import { ArrowLeft, BookOpen, Box, MessageCircle, ScrollText, ShoppingBag, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { GameSummary } from '../api';
import { GuideContent } from '../guide/Guide';
import { useGame } from '../store';
import { Chat } from '../ui/Chat';
import { Modal } from '../ui/Modal';
import { colorOf } from './colors';
import { eventText, type PlayControls } from './play';
import { COLOR_NAMES, Tile } from './TileFace';

export function useNarrow() {
  const query = '(max-width: 820px), (max-height: 520px)';
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

function statusText(game: GameSummary, view: GameView, c: PlayControls): string {
  if (game.status === 'waiting') return 'In attesa degli altri giocatori…';
  if (view.phase === 'ended') return 'Partita finita.';
  if (!view.current) return '';
  if (!c.mine) {
    const p = game.players[view.current.seat];
    const who = p ? seatName(p) : 'un altro giocatore';
    return view.phase === 'wall' ? `${who} sceglie dove posare sul muro…` : `Tocca a ${who}…`;
  }
  if (c.wallTurn) return `Scegli la colonna del muro per la riga ${(c.pendingRow ?? 0) + 1}.`;
  if (!c.plan) return 'Tocca a te: scegli un colore da una fornace o dal centro.';
  return `${COLOR_NAMES[c.plan.color]}: tocca una riga illuminata o il pavimento.`;
}

function LogList({ game, view }: { game: GameSummary; view: GameView }) {
  const events = [...view.log].reverse();
  return (
    <ul className="log">
      {events.slice(0, 60).map((e, i) => (
        <li key={i} className={e.type === 'tile' || e.type === 'bonus' ? 'score' : ''}>
          {'seat' in e && <i className="dot" style={{ background: colorOf(e.seat) }} />}
          <span>{eventText(e, game)}</span>
        </li>
      ))}
    </ul>
  );
}

type Sheet = 'log' | 'chat' | 'guide' | null;

function useUnread(open: boolean) {
  const messages = useGame((s) => s.messages);
  const [seen, setSeen] = useState(messages.length);
  useEffect(() => {
    if (open) setSeen(messages.length);
  }, [open, messages.length]);
  return open ? 0 : Math.max(0, messages.length - seen);
}

export function Hud({
  game,
  view,
  c,
  onLeave,
  narrow,
  overlay,
  mode,
  onToggleMode,
}: {
  game: GameSummary;
  view: GameView;
  c: PlayControls;
  onLeave: () => void;
  narrow: boolean;
  overlay?: ReactNode;
  mode: '2d' | '3d';
  onToggleMode: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const unread = useUnread(sheet === 'chat');
  const quality = useGame((s) => s.quality);
  const setQuality = useGame((s) => s.setQuality);
  const titles: Record<Exclude<Sheet, null>, [string, string]> = {
    log: ['Cronaca', 'Cosa è successo'],
    chat: ['Bottega', 'Chat'],
    guide: ['Regole', 'Come si gioca'],
  };
  return (
    <>
      <header className={`hud-top glass ${narrow ? 'mobile' : ''}`}>
        <button className={narrow ? 'icon-btn sm' : 'btn ghost sm'} onClick={onLeave} aria-label="Torna alla bottega">
          <ArrowLeft size={15} />
          {!narrow && 'Bottega'}
        </button>
        <span className="hud-meta muted small">
          Round <b className="mono">{view.round}</b> · <ShoppingBag size={13} /> <b className="mono">{view.bagCount}</b>
          {!narrow && (
            <>
              {' '}
              nel sacchetto · codice <span className="mono">{game.code}</span>
            </>
          )}
        </span>
        <div className="hud-tools">
          <button className="icon-btn sm" onClick={() => setSheet('log')} title="Cronaca" aria-label="Cronaca">
            <ScrollText size={15} />
          </button>
          <button className="icon-btn sm badge-wrap" onClick={() => setSheet('chat')} title="Chat" aria-label="Chat">
            <MessageCircle size={15} />
            {unread > 0 && <i className="badge">{unread}</i>}
          </button>
          <button className="icon-btn sm" onClick={() => setSheet('guide')} title="Regole" aria-label="Regole">
            <BookOpen size={15} />
          </button>
          <button
            className="icon-btn sm"
            onClick={onToggleMode}
            title={mode === '3d' ? 'Passa al tavolo 2D' : 'Passa al tavolo 3D'}
            aria-label={mode === '3d' ? 'Tavolo 2D' : 'Tavolo 3D'}
          >
            {mode === '3d' ? <Square size={15} /> : <Box size={15} />}
          </button>
          {mode === '3d' && (
            <button
              className={`icon-btn sm ${quality === 'alta' ? 'on' : ''}`}
              onClick={() => setQuality(quality === 'alta' ? 'bassa' : 'alta')}
              title={`Qualità ${quality === 'alta' ? 'alta (ombre)' : 'bassa'}: tocca per cambiare`}
              aria-label="Qualità grafica"
            >
              <Sparkles size={15} />
            </button>
          )}
        </div>
      </header>

      <section className={`hud-status glass ${c.mine ? 'mine' : ''} ${narrow ? 'mobile' : ''}`}>
        <div className="players-strip">
          {game.players.map((p) => (
            <span
              key={p.seat}
              className={`pchip ${view.current?.seat === p.seat ? 'active' : ''}`}
              style={{ '--pc': colorOf(p.seat) } as React.CSSProperties}
              title={p.bot ? `bot · ${BOT_LEVEL_LABEL[p.bot].toLowerCase()}` : undefined}
            >
              <span className="swatch" />
              <span className="name">{p.seat === view.you ? 'Tu' : seatName(p)}</span>
              <b className="mono">{view.players[p.seat]?.score ?? 0}</b>
            </span>
          ))}
        </div>
        <div className="status-row">
          {c.plan && <Tile color={c.plan.color} size={22} />}
          <p className="status">{statusText(game, view, c)}</p>
          {c.plan && (
            <button className="icon-btn sm" onClick={c.cancel} aria-label="Annulla la scelta" title="Annulla (Esc)">
              <X size={14} />
            </button>
          )}
        </div>
        {c.plan && !narrow && <p className="faint small hint">Tasti: 1-5 per la riga, 0 per il pavimento, Esc per annullare.</p>}
      </section>

      {overlay}
      {sheet && (
        <Modal kicker={titles[sheet][0]} title={titles[sheet][1]} onClose={() => setSheet(null)} wide={sheet === 'guide'}>
          {sheet === 'log' && <LogList game={game} view={view} />}
          {sheet === 'chat' && <Chat />}
          {sheet === 'guide' && (
            <div className="guide-in-game">
              <GuideContent compact />
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
