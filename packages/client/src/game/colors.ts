/** Colori dei giocatori, per posto (bordi delle plance, nomi, punteggi). */
export const PLAYER_COLORS = ['#e0533f', '#3f7de0', '#3aa864', '#f0c12e'] as const;
export const colorOf = (seat: number) => PLAYER_COLORS[seat % PLAYER_COLORS.length]!;
