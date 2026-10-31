/**
 * Ultima mossa di ogni giocatore, da evidenziare sulla sua plancia: così chi gioca vede cosa hanno
 * fatto gli altri dal suo turno precedente.
 *  - durante il round: le piastrelle dell'ultima presa (nella riga e sul pavimento);
 *  - dopo la fine del round (o della partita): le piastrelle appena passate sul muro.
 */
import type { GameEvent, GameView } from '@maiolica/shared';

export type LastMove = {
  /** Caselle delle righe: `riga-indice` (indice 0 = la casella più a destra). */
  line: Set<string>;
  /** Caselle del pavimento (0-6). */
  floor: Set<number>;
  /** Caselle del muro: `riga-colonna`. */
  wall: Set<string>;
};

const EMPTY: LastMove = { line: new Set(), floor: new Set(), wall: new Set() };

/** Eventi che chiudono un round: dopo di loro righe e pavimento della presa non sono più quelli. */
const endOfRound = (e: GameEvent) => e.type === 'tile' || e.type === 'floor' || e.type === 'blocked' || e.type === 'round' || e.type === 'bonus';

export function lastMove(view: Pick<GameView, 'log'>, seat: number): LastMove {
  const log = view.log;
  let takeAt = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.type === 'take' && e.seat === seat) {
      takeAt = i;
      break;
    }
  }
  const after = log.slice(takeAt + 1);
  // Il round si è chiuso dopo l'ultima presa: si mostrano le piastrelle passate sul muro.
  if (takeAt < 0 || after.some(endOfRound)) {
    const wall = new Set<string>();
    for (const e of after) if (e.type === 'tile' && e.seat === seat) wall.add(`${e.row}-${e.col}`);
    return wall.size ? { ...EMPTY, wall } : EMPTY;
  }
  const e = log[takeAt]!;
  if (e.type !== 'take' || e.toFloor === undefined) return EMPTY;
  const line = new Set<string>();
  if (e.target !== 'floor') for (let k = e.lineFrom!; k < e.lineFrom! + e.toLine!; k++) line.add(`${e.target}-${k}`);
  const floor = new Set<number>();
  for (let k = e.floorFrom!; k < e.floorFrom! + e.toFloor; k++) floor.add(k);
  return { line, floor, wall: new Set() };
}
