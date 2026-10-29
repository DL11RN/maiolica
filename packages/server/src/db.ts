import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BotLevel, GameMode, GameOptions, GameState, GameStatus } from '@maiolica/shared';

export interface UserRow {
  id: number;
  username: string;
  pass_hash: string;
  created_at: number;
  is_admin: number;
  blocked: number;
  last_login: number | null;
}

export interface UserListRow extends Omit<UserRow, 'pass_hash'> {
  games: number;
}

export interface GameRow {
  id: string;
  code: string;
  host_id: number;
  mode: GameMode;
  seats: number;
  bot_level: BotLevel | null;
  options: string;
  state: string;
  status: GameStatus;
  /** Partita da cui nasce (rivincita). */
  rematch_of: string | null;
  created_at: number;
  updated_at: number;
}

export interface SeatRow {
  game_id: string;
  seat: number;
  user_id: number | null;
  username: string | null;
  bot: BotLevel | null;
}

export interface MessageRow {
  id: number;
  game_id: string;
  user_id: number;
  username: string;
  text: string;
  created_at: number;
}

export function openDb(file: string) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      pass_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      last_login INTEGER
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      host_id INTEGER NOT NULL REFERENCES users(id),
      mode TEXT NOT NULL,
      seats INTEGER NOT NULL,
      bot_level TEXT,
      options TEXT NOT NULL,
      state TEXT NOT NULL,
      status TEXT NOT NULL,
      rematch_of TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS games_rematch ON games(rematch_of);
    CREATE TABLE IF NOT EXISTS game_seats (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      seat INTEGER NOT NULL,
      user_id INTEGER REFERENCES users(id),
      bot TEXT,
      PRIMARY KEY (game_id, seat)
    );
    CREATE INDEX IF NOT EXISTS game_seats_user ON game_seats(user_id);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_game ON messages(game_id, id);
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const q = {
    insertUser: db.prepare('INSERT INTO users (username, pass_hash, created_at) VALUES (?, ?, ?)'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ? AND u.blocked = 0',
    ),
    listUsers: db.prepare(
      `SELECT u.id, u.username, u.created_at, u.is_admin, u.blocked, u.last_login,
         (SELECT COUNT(*) FROM game_seats s WHERE s.user_id = u.id) AS games
       FROM users u ORDER BY u.username COLLATE NOCASE`,
    ),
    countAdmins: db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1'),
    countUsers: db.prepare('SELECT COUNT(*) AS n FROM users'),
    firstUser: db.prepare('SELECT * FROM users ORDER BY created_at, id LIMIT 1'),
    setAdmin: db.prepare('UPDATE users SET is_admin = ? WHERE id = ?'),
    setBlocked: db.prepare('UPDATE users SET blocked = ? WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?'),
    touchLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
    deleteUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    hostedGameIds: db.prepare('SELECT id FROM games WHERE host_id = ?'),
    deleteHostedGames: db.prepare('DELETE FROM games WHERE host_id = ?'),
    userSeatGames: db.prepare('SELECT DISTINCT game_id FROM game_seats WHERE user_id = ?'),
    deleteUserMessages: db.prepare('DELETE FROM messages WHERE user_id = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    putSetting: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    insertGame: db.prepare(
      `INSERT INTO games (id, code, host_id, mode, seats, bot_level, options, state, status, rematch_of, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertSeat: db.prepare('INSERT INTO game_seats (game_id, seat, user_id, bot) VALUES (?, ?, ?, ?)'),
    setSeat: db.prepare('UPDATE game_seats SET user_id = ?, bot = ? WHERE game_id = ? AND seat = ?'),
    seats: db.prepare(
      `SELECT s.game_id, s.seat, s.user_id, s.bot, u.username FROM game_seats s
       LEFT JOIN users u ON u.id = s.user_id WHERE s.game_id = ? ORDER BY s.seat`,
    ),
    gameById: db.prepare('SELECT * FROM games WHERE id = ?'),
    gameByCode: db.prepare('SELECT * FROM games WHERE code = ?'),
    rematchOf: db.prepare('SELECT * FROM games WHERE rematch_of = ?'),
    playingGames: db.prepare("SELECT * FROM games WHERE status = 'playing'"),
    gamesForUser: db.prepare(
      `SELECT g.* FROM games g WHERE g.id IN (SELECT game_id FROM game_seats WHERE user_id = ?)
       ORDER BY g.updated_at DESC LIMIT 50`,
    ),
    updateState: db.prepare('UPDATE games SET state = ?, status = ?, updated_at = ? WHERE id = ?'),
    setStatus: db.prepare('UPDATE games SET status = ?, updated_at = ? WHERE id = ?'),
    deleteGame: db.prepare('DELETE FROM games WHERE id = ?'),
    insertMessage: db.prepare('INSERT INTO messages (game_id, user_id, text, created_at) VALUES (?, ?, ?, ?)'),
    messages: db.prepare(
      `SELECT m.*, u.username FROM messages m JOIN users u ON u.id = m.user_id
       WHERE m.game_id = ? ORDER BY m.id DESC LIMIT 100`,
    ),
  };

  const tx = <T>(fn: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    raw: db,
    createUser(username: string, passHash: string): UserRow {
      const r = q.insertUser.run(username, passHash, Date.now());
      return q.userById.get(Number(r.lastInsertRowid)) as unknown as UserRow;
    },
    listUsers: () => q.listUsers.all() as unknown as UserListRow[],
    countAdmins: () => (q.countAdmins.get() as { n: number }).n,
    countUsers: () => (q.countUsers.get() as { n: number }).n,
    firstUser: () => q.firstUser.get() as UserRow | undefined,
    setAdmin: (id: number, admin: boolean) => void q.setAdmin.run(admin ? 1 : 0, id),
    setBlocked(id: number, blocked: boolean) {
      q.setBlocked.run(blocked ? 1 : 0, id);
      if (blocked) q.deleteUserSessions.run(id);
    },
    /** Nuova password: chiude anche tutte le sessioni aperte dell'utente. */
    setPassword(id: number, passHash: string) {
      q.setPassword.run(passHash, id);
      q.deleteUserSessions.run(id);
    },
    touchLogin: (id: number) => void q.touchLogin.run(Date.now(), id),
    /**
     * Elimina un utente: le partite che ha creato spariscono; in quelle degli altri il suo posto
     * passa a un bot (partite in corso) o torna libero (in attesa). Restituisce le partite eliminate
     * e quelle toccate.
     */
    deleteUser(id: number): { deleted: string[]; affected: string[] } {
      const deleted = (q.hostedGameIds.all(id) as { id: string }[]).map((r) => r.id);
      const affected = (q.userSeatGames.all(id) as { game_id: string }[])
        .map((r) => r.game_id)
        .filter((g) => !deleted.includes(g));
      tx(() => {
        q.deleteUserMessages.run(id);
        q.deleteHostedGames.run(id);
        for (const gameId of affected) {
          const g = q.gameById.get(gameId) as unknown as GameRow;
          for (const s of q.seats.all(gameId) as unknown as SeatRow[])
            if (s.user_id === id) q.setSeat.run(null, g.status === 'waiting' ? null : 'medium', gameId, s.seat);
        }
        q.deleteUser.run(id);
      });
      return { deleted, affected };
    },
    getSetting: (key: string) => (q.getSetting.get(key) as { value: string } | undefined)?.value,
    putSetting: (key: string, value: string) => void q.putSetting.run(key, value),
    userByName: (username: string) => q.userByName.get(username) as UserRow | undefined,
    userById: (id: number) => q.userById.get(id) as UserRow | undefined,
    createSession(token: string, userId: number, ttlMs: number) {
      q.purgeSessions.run(Date.now());
      q.insertSession.run(token, userId, Date.now() + ttlMs);
    },
    sessionUser: (token: string) => q.sessionUser.get(token, Date.now()) as UserRow | undefined,
    deleteSession: (token: string) => void q.deleteSession.run(token),

    createGame(g: {
      id: string;
      code: string;
      hostId: number;
      mode: GameMode;
      seats: { userId: number | null; bot: BotLevel | null }[];
      botLevel: BotLevel | null;
      options: GameOptions;
      state: GameState;
      status: GameStatus;
      rematchOf?: string | null;
    }) {
      const now = Date.now();
      tx(() => {
        q.insertGame.run(
          g.id,
          g.code,
          g.hostId,
          g.mode,
          g.seats.length,
          g.botLevel,
          JSON.stringify(g.options),
          JSON.stringify(g.state),
          g.status,
          g.rematchOf ?? null,
          now,
          now,
        );
        g.seats.forEach((s, seat) => q.insertSeat.run(g.id, seat, s.userId, s.bot));
      });
    },
    gameById: (id: string) => q.gameById.get(id) as GameRow | undefined,
    gameByCode: (code: string) => q.gameByCode.get(code) as GameRow | undefined,
    rematchOf: (id: string) => q.rematchOf.get(id) as GameRow | undefined,
    playingGames: () => q.playingGames.all() as unknown as GameRow[],
    gamesForUser: (userId: number) => q.gamesForUser.all(userId) as unknown as GameRow[],
    seats: (gameId: string) => q.seats.all(gameId) as unknown as SeatRow[],
    /** Mette l'utente nel primo posto libero; restituisce il posto oppure null se è tutto pieno. */
    claimSeat(gameId: string, userId: number): number | null {
      return tx(() => {
        const seats = q.seats.all(gameId) as unknown as SeatRow[];
        const mine = seats.find((s) => s.user_id === userId);
        if (mine) return mine.seat;
        const free = seats.find((s) => s.user_id === null && s.bot === null);
        if (!free) return null;
        q.setSeat.run(userId, null, gameId, free.seat);
        const full = seats.every((s) => s.seat === free.seat || s.user_id !== null || s.bot !== null);
        if (full) q.setStatus.run('playing', Date.now(), gameId);
        return free.seat;
      });
    },
    setSeat: (gameId: string, seat: number, userId: number | null, bot: BotLevel | null) =>
      void q.setSeat.run(userId, bot, gameId, seat),
    saveState(id: string, state: GameState, status: GameStatus) {
      q.updateState.run(JSON.stringify(state), status, Date.now(), id);
    },
    deleteGame: (id: string) => void q.deleteGame.run(id),
    addMessage(gameId: string, userId: number, text: string) {
      q.insertMessage.run(gameId, userId, text, Date.now());
    },
    messages: (gameId: string) => (q.messages.all(gameId) as unknown as MessageRow[]).reverse(),
  };
}

export type Db = ReturnType<typeof openDb>;
