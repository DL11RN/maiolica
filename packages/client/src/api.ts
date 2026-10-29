import type { BotLevel, GameMode, GameOptions, GameSummary } from '@maiolica/shared';

export type { GameSummary };

export interface User {
  id: number;
  username: string;
  isAdmin?: boolean;
}

export interface AccessInfo {
  registrationOpen: boolean;
  /** Raggiunto il limite MAX_USERS. */
  full: boolean;
  maxUsers: number | null;
  userCount: number;
}

export interface AdminUser {
  id: number;
  username: string;
  isAdmin: boolean;
  blocked: boolean;
  createdAt: number;
  lastLogin: number | null;
  games: number;
  /** Admin per configurazione (variabile ADMIN_USERS): non si può revocare dall'interfaccia. */
  fixedAdmin: boolean;
}

/** Cosa si sceglie in bottega per aprire una partita. */
export interface NewGame {
  mode: GameMode;
  players: number;
  botLevel: BotLevel;
  options: GameOptions;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Errore ${res.status}`);
  return data as T;
}

export const api = {
  me: () => request<User>('GET', '/api/me'),
  login: (username: string, password: string) => request<User>('POST', '/api/login', { username, password }),
  register: (username: string, password: string) =>
    request<User>('POST', '/api/register', { username, password }),
  logout: () => request<{ ok: true }>('POST', '/api/logout'),
  config: () => request<{ registrationOpen: boolean; full: boolean }>('GET', '/api/config'),
  changePassword: (current: string, next: string) => request<{ ok: true }>('POST', '/api/me/password', { current, next }),
  admin: {
    users: () => request<AdminUser[]>('GET', '/api/admin/users'),
    createUser: (username: string) => request<{ user: User; password: string }>('POST', '/api/admin/users', { username }),
    block: (id: number, blocked: boolean) => request<{ ok: true }>('POST', `/api/admin/users/${id}/block`, { blocked }),
    setAdmin: (id: number, admin: boolean) => request<{ ok: true }>('POST', `/api/admin/users/${id}/admin`, { admin }),
    resetPassword: (id: number) => request<{ password: string }>('POST', `/api/admin/users/${id}/reset-password`, {}),
    deleteUser: (id: number) => request<{ ok: true }>('DELETE', `/api/admin/users/${id}`),
    settings: () => request<AccessInfo>('GET', '/api/admin/settings'),
    saveSettings: (s: { registrationOpen: boolean }) => request<AccessInfo>('PUT', '/api/admin/settings', s),
  },
  games: () => request<GameSummary[]>('GET', '/api/games'),
  createGame: (g: NewGame) => request<GameSummary>('POST', '/api/games', g),
  joinGame: (code: string) => request<GameSummary>('POST', '/api/games/join', { code }),
  /** Propone la rivincita (o entra in quella già proposta). */
  rematch: (id: string) => request<GameSummary>('POST', `/api/games/${id}/rematch`, {}),
  deleteGame: (id: string) => request<{ ok: true }>('DELETE', `/api/games/${id}`),
};
