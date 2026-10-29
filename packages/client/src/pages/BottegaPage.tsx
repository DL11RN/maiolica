import {
  BOT_LEVEL_LABEL,
  DEFAULT_OPTIONS,
  factoriesFor,
  MAX_PLAYERS,
  MIN_PLAYERS,
  seatName,
  type BotLevel,
  type GameMode,
  type GameOptions,
} from '@maiolica/shared';
import { Bot, Grid3x3, LogIn, Play, Trash2, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type GameSummary, type User } from '../api';
import { colorOf } from '../game/colors';
import { useGame } from '../store';
import { ConfirmDialog } from '../ui/Modal';
import { Backdrop } from '../ui/Backdrop';
import { TopNav } from '../ui/TopNav';

const LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];
const LEVEL_CLASS: Record<BotLevel, string> = { easy: 'facile', medium: 'media', hard: 'difficile' };

function statusOf(g: GameSummary): [string, string] {
  if (g.status === 'waiting') return ['In attesa', ''];
  if (g.status === 'ended') return ['Conclusa', 'won'];
  return g.turn === g.you ? ['Tocca a te', 'flying'] : ['In corso', 'flying'];
}

/** Opzioni della partita: per ora la variante del muro libero. */
export function OptionsPicker({ value, onChange }: { value: GameOptions; onChange: (o: GameOptions) => void }) {
  return (
    <div className="options-picker">
      <span className="label">Variante</span>
      <button
        type="button"
        className={`toggle wide ${value.freeWall ? 'active' : ''}`}
        aria-pressed={value.freeWall}
        onClick={() => onChange({ ...value, freeWall: !value.freeWall })}
        title="Il muro non ha colori stampati: a fine round scegli tu la colonna, senza ripetere un colore nella stessa colonna."
      >
        <Grid3x3 size={16} />
        <span>
          Muro libero
          <small>scegli tu dove posare ogni piastrella</small>
        </span>
      </button>
    </div>
  );
}

export function BottegaPage({ user, onOpen, onLogout }: { user: User; onOpen: (id: string) => void; onLogout: () => void }) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [mode, setMode] = useState<GameMode>('friends');
  const [players, setPlayers] = useState(2);
  const [botLevel, setBotLevel] = useState<BotLevel>('medium');
  const [options, setOptions] = useState<GameOptions>(DEFAULT_OPTIONS);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<GameSummary | null>(null);
  const showToast = useGame((s) => s.showToast);
  const fail = (e: Error) => showToast(e.message);

  const refresh = useCallback(() => {
    api.games().then(setGames).catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const create = () => {
    setBusy(true);
    api
      .createGame({ mode, players, botLevel, options })
      .then((g) => onOpen(g.id))
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return (
    <div className="page">
      <Backdrop />
      <TopNav active="bottega" user={user} onLogout={onLogout} />
      <main className="page-body lobby-grid two">
        <section className="panel glass float-in">
          <div className="panel-head">
            <div>
              <div className="kicker">Bottega</div>
              <h2>Apri una nuova partita</h2>
            </div>
          </div>
          <div className="field">
            <span className="label">Con chi giochi</span>
            <div className="role-switch">
              <button className={`role-option ${mode === 'friends' ? 'active' : ''}`} onClick={() => setMode('friends')}>
                <Users size={18} />
                <span>
                  Con altre persone
                  <small>ognuno dal suo dispositivo, con un codice</small>
                </span>
              </button>
              <button className={`role-option ${mode === 'bots' ? 'active' : ''}`} onClick={() => setMode('bots')}>
                <Bot size={18} />
                <span>
                  Contro il computer
                  <small>si comincia subito</small>
                </span>
              </button>
            </div>
          </div>
          <div className="field">
            <span className="label">{mode === 'bots' ? 'Giocatori al tavolo (tu compreso)' : 'Giocatori'}</span>
            <div className="segmented">
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
                <button key={n} className={players === n ? 'active' : ''} onClick={() => setPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
            <div className="seat-preview">
              {Array.from({ length: players }, (_, i) => (
                <span key={i} className="seat-dot" style={{ background: colorOf(i) }} title={i === 0 ? 'Tu' : mode === 'bots' ? 'Bot' : 'Posto libero'}>
                  {i === 0 ? 'Tu' : mode === 'bots' ? <Bot size={12} /> : ''}
                </span>
              ))}
            </div>
          </div>
          {mode === 'bots' && (
            <div className="field">
              <span className="label">Livello del computer</span>
              <div className="segmented">
                {LEVELS.map((l) => (
                  <button key={l} className={botLevel === l ? 'active' : ''} onClick={() => setBotLevel(l)}>
                    {BOT_LEVEL_LABEL[l]}
                  </button>
                ))}
              </div>
            </div>
          )}
          <OptionsPicker value={options} onChange={setOptions} />
          <div className="brief-stats">
            <div className="well">
              <b>{factoriesFor(players)}</b>
              <small>fornaci</small>
            </div>
            <div className="well">
              <b>100</b>
              <small>piastrelle</small>
            </div>
            <div className="well">
              <b>~5</b>
              <small>round</small>
            </div>
          </div>
          <button className="btn primary block" onClick={create} disabled={busy}>
            <Play size={16} /> Apri la partita
          </button>
        </section>

        <section className="panel glass float-in" style={{ animationDelay: '60ms' }}>
          <div>
            <div className="kicker">Invito</div>
            <h2>Unisciti a una partita</h2>
          </div>
          <form
            className="code-form"
            onSubmit={(e) => {
              e.preventDefault();
              api
                .joinGame(code)
                .then((g) => onOpen(g.id))
                .catch(fail);
            }}
          >
            <input
              className="code-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODICE"
              maxLength={6}
              aria-label="Codice invito"
            />
            <button className="icon-btn" disabled={code.length < 6} aria-label="Entra">
              <LogIn size={17} />
            </button>
          </form>

          <div>
            <div className="kicker">Registro</div>
            <h2>Le tue partite</h2>
          </div>
          {games.length === 0 && <div className="empty">Nessuna partita ancora. Aprine una o fatti dare un codice.</div>}
          <ul className="game-list">
            {games.map((g) => {
              const [label, cls] = statusOf(g);
              const others = g.players.filter((p) => p.seat !== g.you);
              return (
                <li key={g.id} className={g.turn === g.you && g.status === 'playing' ? 'your-turn' : ''}>
                  <div className="row spread">
                    <span className="game-seats">
                      {g.players.map((p) => (
                        <span key={p.seat} className="seat-dot sm" style={{ background: colorOf(p.seat) }} title={seatName(p)} />
                      ))}
                      <b>{g.mode === 'bots' ? `Contro ${others.length} bot` : `${g.players.length} giocatori`}</b>
                      {g.botLevel && <span className={`diff ${LEVEL_CLASS[g.botLevel]}`}>{BOT_LEVEL_LABEL[g.botLevel]}</span>}
                    </span>
                    <span className={`phase-tag ${cls}`}>{label}</span>
                  </div>
                  <div className="who">
                    con {others.map((p) => seatName(p)).join(', ')} · <span className="mono">{g.code}</span>
                    {g.status !== 'waiting' && (
                      <>
                        {' '}
                        · tuoi punti <b className="mono">{g.players[g.you ?? 0]?.score ?? 0}</b>
                      </>
                    )}
                  </div>
                  <div className="row">
                    <button className="btn sm primary" onClick={() => onOpen(g.id)}>
                      {g.status === 'ended' ? 'Apri' : 'Riprendi'}
                    </button>
                    <button className="btn sm ghost danger" onClick={() => setToDelete(g)}>
                      <Trash2 size={14} /> {g.isHost ? 'Elimina' : 'Abbandona'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>

      {toDelete && (
        <ConfirmDialog
          title={toDelete.isHost ? 'Eliminare la partita?' : 'Abbandonare la partita?'}
          text={
            toDelete.isHost
              ? 'La partita verrà cancellata per tutti i giocatori.'
              : toDelete.status === 'playing'
                ? 'Il tuo posto passerà a un bot, così gli altri possono finire la partita.'
                : 'Lascerai il tuo posto; potrà prenderlo qualcun altro.'
          }
          confirmLabel={toDelete.isHost ? 'Elimina' : 'Abbandona'}
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const g = toDelete;
            setToDelete(null);
            api.deleteGame(g.id).then(refresh).catch(fail);
          }}
        />
      )}
    </div>
  );
}
