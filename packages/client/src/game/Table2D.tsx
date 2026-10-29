/**
 * Tavolo 2D (grafica di base e quella del telefono): fornaci e centro in alto, la propria plancia
 * sotto, le plance degli altri accanto (sul PC) o in una striscia da toccare (sul telefono).
 */
import { FLOOR_PENALTY, seatName, wallColor, type Color, type GameView, type PlayerState, type Source } from '@maiolica/shared';
import { useState } from 'react';
import type { GameSummary } from '../api';
import { colorOf } from './colors';
import type { PlayControls } from './play';
import { Tile } from './TileFace';

function Factory({ index, tiles, c }: { index: number; tiles: Color[]; c: PlayControls }) {
  return (
    <div className={`factory ${tiles.length ? '' : 'empty'}`} aria-label={`Fornace ${index + 1}`}>
      {tiles.map((color, i) => (
        <TileButton key={i} source={index} color={color} c={c} />
      ))}
    </div>
  );
}

function TileButton({ source, color, c, size = 30 }: { source: Source; color: Color; c: PlayControls; size?: number }) {
  const chosen = c.plan && c.plan.source === source && c.plan.color === color;
  return (
    <button
      className={`tile-btn ${chosen ? 'chosen' : ''} ${c.offer ? 'live' : ''}`}
      onClick={() => c.pick(source, color)}
      disabled={!c.offer}
      aria-label={`Prendi ${color}`}
    >
      <Tile color={color} size={size} />
    </button>
  );
}

function Center({ view, c }: { view: GameView; c: PlayControls }) {
  const sorted = [...view.center].sort();
  return (
    <div className="center-pool" aria-label="Centro del tavolo">
      {view.firstInCenter && <Tile first size={30} />}
      {sorted.map((color, i) => (
        <TileButton key={i} source="center" color={color} c={c} />
      ))}
      {!sorted.length && !view.firstInCenter && <span className="faint small">centro vuoto</span>}
    </div>
  );
}

export function Market({ view, c }: { view: GameView; c: PlayControls }) {
  return (
    <section className="market">
      <div className="factories">
        {view.factories.map((tiles, i) => (
          <Factory key={i} index={i} tiles={tiles} c={c} />
        ))}
      </div>
      <Center view={view} c={c} />
    </section>
  );
}

/** Plancia di un giocatore: righe di preparazione, muro, pavimento. */
export function PlayerBoard({
  view,
  player,
  name,
  c,
  compact,
}: {
  view: GameView;
  player: PlayerState;
  name: string;
  c: PlayControls;
  compact?: boolean;
}) {
  const mine = player.seat === view.you;
  const size = compact ? 18 : 34;
  const free = view.options.freeWall;
  const active = view.current?.seat === player.seat;
  return (
    <section
      className={`pboard ${mine ? 'mine' : ''} ${active ? 'active' : ''} ${compact ? 'compact' : ''}`}
      style={{ '--pc': colorOf(player.seat), '--ts': `${size}px` } as React.CSSProperties}
    >
      <header>
        <span className="swatch" />
        <b>{name}</b>
        <span className="score mono">{player.score}</span>
      </header>
      <div className="pboard-grid">
        <div className="lines">
          {player.lines.map((line, row) => {
            const target = mine && c.rows.includes(row);
            return (
              <button
                key={row}
                className={`line ${target ? 'target' : ''}`}
                disabled={!target}
                onClick={() => void c.place(row)}
                aria-label={`Riga ${row + 1}`}
              >
                {Array.from({ length: row + 1 }, (_, k) => (
                  <span key={k} className="slot">
                    {k < line.count && line.color !== null ? <Tile color={line.color} size={size} /> : null}
                  </span>
                ))}
              </button>
            );
          })}
        </div>
        <div className="wall">
          {player.wall.map((cells, row) =>
            cells.map((cell, col) => {
              const pick = mine && c.wallTurn && c.pendingRow === row && c.columns.includes(col);
              return (
                <button
                  key={`${row}-${col}`}
                  className={`wall-cell ${pick ? 'target' : ''}`}
                  disabled={!pick}
                  onClick={() => void c.wall(col)}
                  aria-label={`Muro riga ${row + 1} colonna ${col + 1}`}
                >
                  {cell !== null ? (
                    <Tile color={cell} size={size} />
                  ) : free ? null : (
                    <Tile color={wallColor(row, col)} size={size} ghost />
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>
      <button
        className={`floor ${mine && c.plan && c.offer ? 'target' : ''}`}
        disabled={!(mine && c.plan && c.offer)}
        onClick={() => void c.place('floor')}
        aria-label="Pavimento"
      >
        {FLOOR_PENALTY.map((pen, i) => {
          const it = player.floor[i];
          return (
            <span key={i} className="slot">
              {!compact && <small>{pen}</small>}
              {it === 'first' ? <Tile first size={size} /> : it !== undefined ? <Tile color={it} size={size} /> : null}
            </span>
          );
        })}
      </button>
    </section>
  );
}

export function Table2D({ game, view, c, narrow }: { game: GameSummary; view: GameView; c: PlayControls; narrow: boolean }) {
  const me = view.you ?? 0;
  const others = view.players.filter((p) => p.seat !== me);
  const [focus, setFocus] = useState<number | null>(null);
  const name = (p: PlayerState) => (p.seat === view.you ? 'La tua plancia' : seatName(game.players[p.seat]!));
  const meP = view.players[me]!;
  if (narrow)
    return (
      <div className="table2d narrow">
        <Market view={view} c={c} />
        <div className="others-strip">
          {others.map((p) => (
            <div
              key={p.seat}
              role="button"
              tabIndex={0}
              className={`mini ${focus === p.seat ? 'on' : ''}`}
              onClick={() => setFocus(focus === p.seat ? null : p.seat)}
              onKeyDown={(e) => e.key === 'Enter' && setFocus(focus === p.seat ? null : p.seat)}
            >
              <PlayerBoard view={view} player={p} name={seatName(game.players[p.seat]!)} c={c} compact />
            </div>
          ))}
        </div>
        {focus !== null ? (
          <PlayerBoard view={view} player={view.players[focus]!} name={seatName(game.players[focus]!)} c={c} />
        ) : (
          <PlayerBoard view={view} player={meP} name={name(meP)} c={c} />
        )}
      </div>
    );
  return (
    <div className="table2d wide">
      <div className="others">
        {others.map((p) => (
          <PlayerBoard key={p.seat} view={view} player={p} name={name(p)} c={c} compact />
        ))}
      </div>
      <Market view={view} c={c} />
      <PlayerBoard view={view} player={meP} name={name(meP)} c={c} />
    </div>
  );
}
