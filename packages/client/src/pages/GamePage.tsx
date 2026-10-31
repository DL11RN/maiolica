import { BOT_LEVEL_LABEL, seatName, standings, type GameView, type ScoreBreakdown } from '@maiolica/shared';
import { Copy, Crown, Home, Swords } from 'lucide-react';
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, type GameSummary } from '../api';
import { Table2D } from '../game/Table2D';

const Board3D = lazy(() => import('../game3d/Board3D').then((m) => ({ default: m.Board3D })));

/** Il tavolo 3D richiede WebGL 2. */
function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Se il tavolo 3D non parte, si passa al 2D spiegando il motivo. */
class SceneBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'errore sconosciuto');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
import { Hud, useNarrow } from '../game/Hud';
import { colorOf } from '../game/colors';
import { usePlay } from '../game/play';
import { connectGame, disconnectGame } from '../socket';
import { useGame } from '../store';
import { Backdrop } from '../ui/Backdrop';
import { Confetti } from '../ui/Confetti';
import { ConfirmDialog, Modal } from '../ui/Modal';

const KIND_LABEL: Record<keyof ScoreBreakdown, string> = {
  wall: 'Muro',
  floor: 'Pavimento',
  rows: 'Righe',
  columns: 'Colonne',
  colors: 'Colori',
};
const KINDS = Object.keys(KIND_LABEL) as (keyof ScoreBreakdown)[];

/** Sala d'attesa: il codice da condividere e chi si è già seduto. */
function Waiting({ game, onLeave }: { game: GameSummary; onLeave: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const showToast = useGame((s) => s.showToast);
  const copy = () =>
    navigator.clipboard
      ?.writeText(game.code)
      .then(() => showToast('Codice copiato.'))
      .catch(() => showToast(`Codice: ${game.code}`));
  return (
    <>
      <Modal kicker="Sala d’attesa" title="In attesa dei giocatori">
        <p className="muted">Condividi il codice: chi lo inserisce in bottega si siede al primo posto libero.</p>
        <button className="invite-code well" onClick={copy} title="Copia il codice">
          <span className="mono">{game.code}</span>
          <Copy size={18} />
        </button>
        <ul className="seat-list">
          {game.players.map((p) => (
            <li key={p.seat} style={{ '--pc': colorOf(p.seat) } as React.CSSProperties} className={p.name || p.bot ? 'taken' : ''}>
              <span className="swatch" />
              {p.name || p.bot ? seatName(p) : <span className="faint">posto libero…</span>}
              {p.seat === game.you && <small className="faint"> · tu</small>}
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onLeave}>
            <Home size={15} /> Bottega
          </button>
          <button className="btn ghost danger" onClick={() => setLeaving(true)}>
            {game.isHost ? 'Annulla la partita' : 'Lascia il posto'}
          </button>
        </div>
      </Modal>
      {leaving && (
        <ConfirmDialog
          title={game.isHost ? 'Annullare la partita?' : 'Lasciare il posto?'}
          text={game.isHost ? 'La partita sparisce per tutti.' : 'Il tuo posto torna libero.'}
          confirmLabel={game.isHost ? 'Annulla la partita' : 'Lascia'}
          danger
          onCancel={() => setLeaving(false)}
          onConfirm={() => {
            void api.deleteGame(game.id).finally(onLeave);
          }}
        />
      )}
    </>
  );
}

/** Classifica finale con il dettaglio dei punti, rivincita e ritorno alla bottega. */
function Ended({ game, view, onLeave }: { game: GameSummary; view: GameView; onLeave: () => void }) {
  const offer = useGame((s) => s.rematchOffer);
  const showToast = useGame((s) => s.showToast);
  const [open, setOpen] = useState(true);
  const narrow = useNarrow();
  const { winners } = standings(view);
  const order = [...view.players].sort((a, b) => b.score - a.score);
  const won = view.you !== null && winners.includes(view.you);
  const pending = offer?.id ?? game.rematch;
  const rematch = () =>
    api
      .rematch(game.id)
      .then((g) => (location.hash = `#/partita/${g.id}`))
      .catch((e: Error) => showToast(e.message));
  if (!open)
    return (
      <button className="btn primary reopen-results" onClick={() => setOpen(true)}>
        <Crown size={15} /> Risultati
      </button>
    );
  return (
    <>
      {won && <Confetti />}
      <Modal
        kicker="Fine partita"
        title={won ? (winners.length > 1 ? 'Pareggio in vetta!' : 'Hai vinto!') : `Vince ${winners.map((w) => seatName(game.players[w]!)).join(' e ')}`}
        tone={won ? 'good' : undefined}
        wide
        onClose={() => setOpen(false)}
        actions={
          <>
            <button className="btn ghost" onClick={onLeave}>
              <Home size={15} /> Bottega
            </button>
            <button className="btn primary" onClick={rematch}>
              <Swords size={15} /> {pending ? 'Entra nella rivincita' : 'Rivincita'}
            </button>
          </>
        }
      >
        {offer && <p className="offer">{offer.by} propone la rivincita.</p>}
        {narrow ? (
          // Telefono: una scheda per giocatore, si legge tutta senza ruotare lo schermo.
          <ol className="results-list">
            {order.map((p, i) => {
              const s = game.players[p.seat]!;
              return (
                <li key={p.seat} className={winners.includes(p.seat) ? 'winner' : ''}>
                  <div className="who">
                    <span className="mono">{i + 1}</span>
                    <span className="swatch" style={{ background: colorOf(p.seat) }} />
                    <span className="name">
                      {seatName(s)}
                      {s.bot && <small className="faint"> · {BOT_LEVEL_LABEL[s.bot].toLowerCase()}</small>}
                    </span>
                    <span className="mono total">{p.score}</span>
                  </div>
                  <div className="parts">
                    {KINDS.map((k) => (
                      <span key={k}>
                        {KIND_LABEL[k]} <b className="mono">{p.breakdown[k]}</b>
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="results-wrap">
            <table className="results">
              <thead>
                <tr>
                  <th />
                  <th>Giocatore</th>
                  {KINDS.map((k) => (
                    <th key={k}>{KIND_LABEL[k]}</th>
                  ))}
                  <th>Totale</th>
                </tr>
              </thead>
              <tbody>
                {order.map((p, i) => {
                  const s = game.players[p.seat]!;
                  return (
                    <tr key={p.seat} className={winners.includes(p.seat) ? 'winner' : ''}>
                      <td className="mono">{i + 1}</td>
                      <td>
                        <span className="swatch" style={{ background: colorOf(p.seat) }} /> {seatName(s)}
                        {s.bot && <small className="faint"> · {BOT_LEVEL_LABEL[s.bot].toLowerCase()}</small>}
                      </td>
                      {KINDS.map((k) => (
                        <td key={k} className="mono">
                          {p.breakdown[k]}
                        </td>
                      ))}
                      <td className="mono total">{p.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </>
  );
}

function Playing({ game, view, onLeave }: { game: GameSummary; view: GameView; onLeave: () => void }) {
  const narrow = useNarrow();
  const showToast = useGame((s) => s.showToast);
  const c = usePlay(game, view);
  const viewMode = useGame((st) => st.viewMode);
  const setViewMode = useGame((st) => st.setViewMode);
  const sceneError = useGame((st) => st.sceneError);
  const setSceneError = useGame((st) => st.setSceneError);
  const webgl2 = useMemo(hasWebGL2, []);
  // Automatico: 3D sul PC, 2D sul telefono. Senza WebGL 2 (o se il 3D si rompe) sempre 2D.
  const use3d = webgl2 && !sceneError && (viewMode === '3d' || (viewMode === 'auto' && !narrow));
  const toggleMode = () => {
    if (!use3d && !webgl2) return showToast('Il browser non supporta WebGL 2: il tavolo 3D non è disponibile.');
    setViewMode(use3d ? '2d' : '3d');
  };
  // Il turno che arriva: se è il mio, avvisa.
  const mineBefore = useRef(c.mine);
  useEffect(() => {
    if (c.mine && !mineBefore.current) {
      showToast('Tocca a te!');
      navigator.vibrate?.(60);
    }
    mineBefore.current = c.mine;
  }, [c.mine, showToast]);

  const overlay =
    game.status === 'waiting' ? (
      <Waiting game={game} onLeave={onLeave} />
    ) : view.phase === 'ended' ? (
      <Ended game={game} view={view} onLeave={onLeave} />
    ) : null;

  return (
    <div className={`game-page ${narrow ? 'narrow' : 'wide'}`}>
      <Backdrop table />
      {use3d ? (
        <SceneBoundary
          onError={(message) => {
            setSceneError(message);
            showToast('Il tavolo 3D non è partito: passo al 2D.');
          }}
        >
          <Suspense
            fallback={
              <div className="loading">
                <div className="spinner" />
                <p>Si accendono le fornaci…</p>
              </div>
            }
          >
            <Board3D game={game} view={view} c={c} narrow={narrow} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <div className="table-scroll">
          <Table2D game={game} view={view} c={c} narrow={narrow} />
        </div>
      )}
      <Hud
        game={game}
        view={view}
        c={c}
        onLeave={onLeave}
        narrow={narrow}
        overlay={overlay}
        mode={use3d ? '3d' : '2d'}
        onToggleMode={toggleMode}
      />
    </div>
  );
}

export function GamePage({ gameId, onLeave }: { gameId: string; onLeave: () => void }) {
  const game = useGame((s) => s.game);
  const view = useGame((s) => s.view);

  useEffect(() => {
    connectGame(gameId, onLeave);
    return () => disconnectGame();
  }, [gameId, onLeave]);

  if (!game || !view || game.id !== gameId)
    return (
      <div className="page">
        <Backdrop />
        <div className="loading">
          <div className="spinner" />
          <p>Si apre la bottega…</p>
        </div>
      </div>
    );
  return <Playing game={game} view={view} onLeave={onLeave} />;
}
