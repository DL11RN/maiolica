import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { Server, type Socket } from 'socket.io';
import {
  GameError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  applyAction,
  chooseBotMove,
  createGame,
  migrateState,
  sanitizeOptions,
  standings,
  viewFor,
  type BotLevel,
  type GameAction,
  type GameMode,
  type GameState,
  type GameSummary,
} from '@maiolica/shared';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  hashPassword,
  newInviteCode,
  newTempPassword,
  newToken,
  validateCredentials,
  verifyPassword,
} from './auth.js';
import { Limiter, minutes } from './limiter.js';
import { resolveTrustedProxies } from './proxies.js';
import { openDb, type GameRow, type UserRow } from './db.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const DB_FILE = process.env.DB_FILE ?? resolve('data/maiolica.db');
/**
 * Cookie "solo HTTPS": "true", "false" oppure "auto" (predefinito), che lo attiva solo per le richieste
 * arrivate in HTTPS, anche tramite proxy (X-Forwarded-Proto). Così il sito funziona sia in HTTP in rete
 * locale sia in HTTPS dietro Cloudflare: un cookie Secure su HTTP verrebbe scartato dal browser.
 */
const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? 'auto').toLowerCase();
const here = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = process.env.CLIENT_DIST ?? resolve(here, '../../client/dist');
/** Nomi utente che sono sempre amministratori (separati da virgola). */
const ADMIN_USERS = (process.env.ADMIN_USERS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
/** Pausa prima della mossa di un bot: risposte istantanee sembrano innaturali. */
const BOT_DELAY_MS = Math.max(0, Number(process.env.BOT_DELAY_MS ?? 900));
const BOT_LEVELS: BotLevel[] = ['easy', 'medium', 'hard'];

const db = openDb(DB_FILE);
/**
 * Proxy di cui fidarsi per X-Forwarded-For/-Proto (NPM, cloudflared): IP, reti CIDR o nomi separati da
 * virgola, più le parole chiave "loopback", "linklocal", "uniquelocal". I nomi si risolvono all'avvio.
 */
const trusted = await resolveTrustedProxies(process.env.TRUSTED_PROXIES ?? 'loopback,172.16.0.0/12');
const TRUSTED_PROXIES = trusted.entries;

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  trustProxy: TRUSTED_PROXIES.length ? TRUSTED_PROXIES : false,
});

for (const w of trusted.warnings) app.log.warn(`TRUSTED_PROXIES: ${w}`);
app.log.info(`Proxy fidati: ${TRUSTED_PROXIES.join(', ') || 'nessuno'}`);

// Header di sicurezza su tutte le risposte.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React e i font locali usano anche stili in linea
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
app.addHook('onSend', async (req, reply) => {
  reply.header('Content-Security-Policy', CSP);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'same-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  reply.header('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=15552000');
  if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
});

// ---------- limiti ai tentativi ----------

/** Login falliti per indirizzo IP: 20 in 15 minuti bloccano l'IP per 15 minuti. */
const loginByIp = new Limiter(20, 15 * 60_000, 15 * 60_000);
/** Login falliti per nome utente: 8 in 15 minuti bloccano quel nome per 15 minuti. */
const loginByUser = new Limiter(8, 15 * 60_000, 15 * 60_000);
/** Registrazioni (riuscite o no) per IP: 6 all'ora. */
const registerByIp = new Limiter(6, 60 * 60_000, 60 * 60_000);
/** Password attuale sbagliata nel cambio password, per utente. */
const passwordByUser = new Limiter(5, 15 * 60_000, 15 * 60_000);
setInterval(() => [loginByIp, loginByUser, registerByIp, passwordByUser].forEach((l) => l.prune()), 10 * 60_000).unref();

const tooMany = (reply: FastifyReply, ms: number) =>
  reply.code(429).send({ error: `Troppi tentativi: riprova tra ${minutes(ms)} minuti.` });

/** Hash di riferimento per far durare uguale il login con utenti inesistenti (niente indizi sui nomi). */
const DUMMY_HASH = await hashPassword(newToken());
await app.register(cookie);

/** Gli utenti in ADMIN_USERS sono admin; se non ce n'è nessuno, lo diventa il primo utente registrato. */
function ensureAdmins() {
  for (const u of db.listUsers()) if (ADMIN_USERS.includes(u.username.toLowerCase()) && !u.is_admin) db.setAdmin(u.id, true);
  if (db.countAdmins() === 0) {
    const first = db.firstUser();
    if (first) {
      db.setAdmin(first.id, true);
      app.log.info(`Nessun amministratore configurato: ${first.username} diventa admin.`);
    }
  }
}
ensureAdmins();

const registrationOpen = () =>
  (db.getSetting('registration_open') ?? (process.env.REGISTRATION_OPEN === 'false' ? 'false' : 'true')) === 'true';

/** Numero massimo di profili (MAX_USERS); 0 o assente = nessun limite. */
const MAX_USERS = Math.max(0, Math.floor(Number(process.env.MAX_USERS) || 0));
const usersFull = () => MAX_USERS > 0 && db.countUsers() >= MAX_USERS;
const FULL_MESSAGE = `Raggiunto il numero massimo di utenti (${MAX_USERS}).`;

const accessInfo = () => ({
  registrationOpen: registrationOpen(),
  full: usersFull(),
  maxUsers: MAX_USERS || null,
  userCount: db.countUsers(),
});

// ---------- helpers ----------

const loadState = (g: GameRow) => migrateState(JSON.parse(g.state) as GameState);

const seatOf = (gameId: string, userId: number): number | null =>
  db.seats(gameId).find((s) => s.user_id === userId)?.seat ?? null;

/** Chi è collegato a ogni partita (id utente). */
const online = new Map<string, Set<number>>();

function summary(g: GameRow, userId: number): GameSummary {
  const state = loadState(g);
  const seats = db.seats(g.id);
  const here = online.get(g.id) ?? new Set();
  const ended = state.phase === 'ended';
  return {
    id: g.id,
    code: g.code,
    status: g.status,
    mode: g.mode,
    botLevel: g.bot_level,
    options: state.options,
    players: seats.map((s) => ({
      seat: s.seat,
      name: s.username,
      bot: s.bot,
      online: s.bot !== null || (s.user_id !== null && here.has(s.user_id)),
      score: state.players[s.seat]?.score ?? 0,
    })),
    you: seats.find((s) => s.user_id === userId)?.seat ?? null,
    isHost: g.host_id === userId,
    turn: g.status === 'playing' ? (state.current?.seat ?? null) : null,
    round: state.round,
    winners: ended ? standings(state).winners : null,
    rematch: db.rematchOf(g.id)?.id ?? null,
    updatedAt: g.updated_at,
  };
}

async function currentUser(req: FastifyRequest): Promise<UserRow | undefined> {
  const token = req.cookies[SESSION_COOKIE];
  return token ? db.sessionUser(token) : undefined;
}

async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | undefined> {
  const user = await currentUser(req);
  if (!user) void reply.code(401).send({ error: 'Accesso richiesto.' });
  return user;
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<UserRow | undefined> {
  const user = await currentUser(req);
  if (!user) void reply.code(401).send({ error: 'Accesso richiesto.' });
  else if (!user.is_admin) void reply.code(403).send({ error: 'Riservato agli amministratori.' });
  else return user;
}

function startSession(reply: FastifyReply, user: UserRow) {
  const token = newToken();
  db.createSession(token, user.id, SESSION_TTL_MS);
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE === 'auto' ? reply.request.protocol === 'https' : COOKIE_SECURE === 'true',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

const publicUser = (u: UserRow) => ({ id: u.id, username: u.username, isAdmin: !!u.is_admin });

// ---------- accesso ----------

app.get('/api/config', async () => {
  const { registrationOpen: open, full } = accessInfo();
  return { registrationOpen: open && !full, full };
});

app.post('/api/register', async (req, reply) => {
  const ipWait = registerByIp.blockedFor(req.ip);
  if (ipWait) return tooMany(reply, ipWait);
  registerByIp.hit(req.ip);
  if (!registrationOpen())
    return reply.code(403).send({ error: 'La registrazione è chiusa: chiedi un account a un amministratore.' });
  if (usersFull()) return reply.code(403).send({ error: `${FULL_MESSAGE} Chiedi a un amministratore.` });
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  const err = validateCredentials(username, password);
  if (err) return reply.code(400).send({ error: err });
  if (db.userByName(username as string)) return reply.code(409).send({ error: 'Nome utente già in uso.' });
  const created = db.createUser(username as string, await hashPassword(password as string));
  ensureAdmins();
  const user = db.userById(created.id)!;
  db.touchLogin(user.id);
  startSession(reply, user);
  return publicUser(user);
});

app.post('/api/login', async (req, reply) => {
  const { username, password } = (req.body ?? {}) as Record<string, unknown>;
  const userKey = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const wait = Math.max(loginByIp.blockedFor(req.ip), loginByUser.blockedFor(userKey));
  if (wait) return tooMany(reply, wait);
  const user = userKey ? db.userByName(userKey) : undefined;
  const ok = typeof password === 'string' && (await verifyPassword(password, user?.pass_hash ?? DUMMY_HASH)) && !!user;
  if (!user || !ok) {
    loginByIp.hit(req.ip);
    if (loginByUser.hit(userKey)) req.log.warn({ username: userKey, ip: req.ip }, 'troppi login falliti, nome bloccato');
    return reply.code(401).send({ error: 'Credenziali non valide.' });
  }
  loginByUser.reset(userKey);
  if (user.blocked) return reply.code(403).send({ error: 'Questo account è stato bloccato da un amministratore.' });
  db.touchLogin(user.id);
  startSession(reply, user);
  return publicUser(user);
});

app.post('/api/me/password', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  const { current, next } = (req.body ?? {}) as Record<string, unknown>;
  const key = String(user.id);
  const wait = passwordByUser.blockedFor(key);
  if (wait) return tooMany(reply, wait);
  if (typeof current !== 'string' || !(await verifyPassword(current, user.pass_hash))) {
    passwordByUser.hit(key);
    return reply.code(400).send({ error: 'La password attuale non è corretta.' });
  }
  passwordByUser.reset(key);
  const err = validateCredentials(user.username, next);
  if (err) return reply.code(400).send({ error: err });
  db.setPassword(user.id, await hashPassword(next as string));
  kickUser(user.id, req.cookies[SESSION_COOKIE]);
  // Le altre sessioni sono chiuse; questa resta valida con un nuovo cookie.
  startSession(reply, user);
  return { ok: true };
});

// ---------- amministrazione ----------

const adminUser = (u: ReturnType<typeof db.listUsers>[number]) => ({
  id: u.id,
  username: u.username,
  isAdmin: !!u.is_admin,
  blocked: !!u.blocked,
  createdAt: u.created_at,
  lastLogin: u.last_login,
  games: u.games,
  fixedAdmin: ADMIN_USERS.includes(u.username.toLowerCase()),
});

app.get('/api/admin/users', async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  return db.listUsers().map(adminUser);
});

app.post('/api/admin/users', async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const { username } = (req.body ?? {}) as Record<string, unknown>;
  if (usersFull()) return reply.code(409).send({ error: `${FULL_MESSAGE} Elimina un utente o alza MAX_USERS.` });
  const password = newTempPassword();
  const err = validateCredentials(username, password);
  if (err) return reply.code(400).send({ error: err });
  if (db.userByName(username as string)) return reply.code(409).send({ error: 'Nome utente già in uso.' });
  const user = db.createUser(username as string, await hashPassword(password));
  ensureAdmins();
  return { user: publicUser(db.userById(user.id)!), password };
});

/** Controlli comuni alle azioni su un altro utente. */
async function targetUser(req: FastifyRequest, reply: FastifyReply) {
  const admin = await requireAdmin(req, reply);
  if (!admin) return;
  const target = db.userById(Number((req.params as { id: string }).id));
  if (!target) return void reply.code(404).send({ error: 'Utente non trovato.' });
  return { admin, target };
}

app.post('/api/admin/users/:id/block', async (req, reply) => {
  const t = await targetUser(req, reply);
  if (!t) return;
  const blocked = Boolean((req.body as { blocked?: boolean } | undefined)?.blocked);
  if (t.target.id === t.admin.id) return reply.code(400).send({ error: 'Non puoi bloccare te stesso.' });
  db.setBlocked(t.target.id, blocked);
  if (blocked) kickUser(t.target.id);
  return { ok: true };
});

app.post('/api/admin/users/:id/admin', async (req, reply) => {
  const t = await targetUser(req, reply);
  if (!t) return;
  const admin = Boolean((req.body as { admin?: boolean } | undefined)?.admin);
  if (!admin && t.target.id === t.admin.id) return reply.code(400).send({ error: 'Non puoi togliere i permessi a te stesso.' });
  if (!admin && ADMIN_USERS.includes(t.target.username.toLowerCase()))
    return reply.code(400).send({ error: 'Questo utente è admin per configurazione (ADMIN_USERS).' });
  db.setAdmin(t.target.id, admin);
  return { ok: true };
});

app.post('/api/admin/users/:id/reset-password', async (req, reply) => {
  const t = await targetUser(req, reply);
  if (!t) return;
  const password = newTempPassword();
  db.setPassword(t.target.id, await hashPassword(password));
  kickUser(t.target.id);
  return { password };
});

app.delete('/api/admin/users/:id', async (req, reply) => {
  const t = await targetUser(req, reply);
  if (!t) return;
  if (t.target.id === t.admin.id) return reply.code(400).send({ error: 'Non puoi eliminare te stesso.' });
  kickUser(t.target.id);
  const { deleted, affected } = db.deleteUser(t.target.id);
  for (const id of deleted) io.to(id).emit('closed');
  for (const id of affected) {
    void broadcast(id);
    scheduleBot(id);
  }
  return { ok: true };
});

app.get('/api/admin/settings', async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  return accessInfo();
});

app.put('/api/admin/settings', async (req, reply) => {
  if (!(await requireAdmin(req, reply))) return;
  const { registrationOpen: open } = (req.body ?? {}) as { registrationOpen?: unknown };
  if (typeof open === 'boolean') db.putSetting('registration_open', String(open));
  return accessInfo();
});

app.post('/api/logout', async (req, reply) => {
  const token = req.cookies[SESSION_COOKIE];
  if (token) db.deleteSession(token);
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/me', async (req, reply) => {
  const user = await requireUser(req, reply);
  return user && publicUser(user);
});

// ---------- bottega (partite) ----------

type CreateBody = { mode?: unknown; players?: unknown; botLevel?: unknown; options?: unknown };

/** Crea la partita e siede il creatore al posto 0. Contro il computer gli altri posti sono bot. */
function newGame(hostId: number, body: CreateBody, rematchOf?: GameRow): GameRow {
  const mode: GameMode = body.mode === 'bots' ? 'bots' : 'friends';
  const players = Math.round(Number(body.players));
  if (!(players >= MIN_PLAYERS && players <= MAX_PLAYERS))
    throw new GameError(`I giocatori vanno da ${MIN_PLAYERS} a ${MAX_PLAYERS}.`);
  const botLevel = mode === 'bots' ? (BOT_LEVELS.includes(body.botLevel as BotLevel) ? (body.botLevel as BotLevel) : 'medium') : null;
  const options = sanitizeOptions(body.options);
  let code = newInviteCode();
  while (db.gameByCode(code)) code = newInviteCode();
  const id = randomUUID();
  const seats = Array.from({ length: players }, (_, i) => ({
    userId: i === 0 ? hostId : null,
    bot: i > 0 && botLevel ? botLevel : null,
  }));
  db.createGame({
    id,
    code,
    hostId,
    mode,
    seats,
    botLevel,
    options,
    state: createGame(options, players),
    status: mode === 'bots' ? 'playing' : 'waiting',
    rematchOf: rematchOf?.id ?? null,
  });
  return db.gameById(id)!;
}

const fail = (reply: FastifyReply, e: unknown) => {
  if (e instanceof GameError) return reply.code(400).send({ error: e.message });
  throw e;
};

app.get('/api/games', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  return db.gamesForUser(user.id).map((g) => summary(g, user.id));
});

app.post('/api/games', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  try {
    const g = newGame(user.id, (req.body ?? {}) as CreateBody);
    scheduleBot(g.id);
    return summary(g, user.id);
  } catch (e) {
    return fail(reply, e);
  }
});

app.post('/api/games/join', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  const { code } = (req.body ?? {}) as { code?: string };
  const g = typeof code === 'string' ? db.gameByCode(code.trim().toUpperCase()) : undefined;
  if (!g) return reply.code(404).send({ error: 'Nessuna partita con questo codice.' });
  if (seatOf(g.id, user.id) === null) {
    if (g.status !== 'waiting' || db.claimSeat(g.id, user.id) === null)
      return reply.code(409).send({ error: 'La partita è già al completo.' });
    void broadcast(g.id);
  }
  return summary(db.gameById(g.id)!, user.id);
});

/** Rivincita: stessi posti (persone e bot) e stesse opzioni. Chi la propone ci entra, gli altri la seguono. */
app.post('/api/games/:id/rematch', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  const g = db.gameById((req.params as { id: string }).id);
  if (!g || seatOf(g.id, user.id) === null) return reply.code(404).send({ error: 'Partita non trovata.' });
  if (g.status !== 'ended') return reply.code(409).send({ error: 'La partita non è ancora finita.' });
  const existing = db.rematchOf(g.id);
  if (existing) {
    db.claimSeat(existing.id, user.id);
    void broadcast(existing.id);
    return summary(db.gameById(existing.id)!, user.id);
  }
  const seats = db.seats(g.id);
  try {
    const next = newGame(user.id, { mode: g.mode, players: seats.length, botLevel: g.bot_level, options: JSON.parse(g.options) }, g);
    // Nella rivincita tra persone i posti restano liberi: entra chi accetta (dal suo invito).
    io.to(g.id).emit('rematch', { id: next.id, by: user.username });
    void broadcast(g.id);
    scheduleBot(next.id);
    return summary(next, user.id);
  } catch (e) {
    return fail(reply, e);
  }
});

app.post('/api/games/:id/rematch/join', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  const g = db.gameById((req.params as { id: string }).id);
  if (!g || seatOf(g.id, user.id) === null) return reply.code(404).send({ error: 'Partita non trovata.' });
  const next = db.rematchOf(g.id);
  if (!next) return reply.code(404).send({ error: 'Nessuna rivincita proposta.' });
  if (db.claimSeat(next.id, user.id) === null) return reply.code(409).send({ error: 'La rivincita è già al completo.' });
  void broadcast(next.id);
  return summary(db.gameById(next.id)!, user.id);
});

app.delete('/api/games/:id', async (req, reply) => {
  const user = await requireUser(req, reply);
  if (!user) return;
  const g = db.gameById((req.params as { id: string }).id);
  const seat = g ? seatOf(g.id, user.id) : null;
  if (!g || seat === null) return reply.code(404).send({ error: 'Partita non trovata.' });
  if (g.host_id === user.id) {
    db.deleteGame(g.id);
    io.to(g.id).emit('closed');
  } else {
    // Chi non ha creato la partita lascia il posto: libero in attesa, a un bot se si sta giocando.
    db.setSeat(g.id, seat, null, g.status === 'playing' ? 'medium' : null);
    void broadcast(g.id);
    scheduleBot(g.id);
  }
  return { ok: true };
});

app.get('/api/health', async () => ({ ok: true }));

// ---------- client ----------

if (existsSync(CLIENT_DIST)) {
  await app.register(fastifyStatic, { root: CLIENT_DIST, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/socket.io'))
      return reply.code(404).send({ error: 'Non trovato.' });
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn(`Client non trovato in ${CLIENT_DIST}: servo solo le API.`);
}

// ---------- tempo reale ----------

const io = new Server(app.server, { serveClient: false });

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

io.use((socket, next) => {
  const token = parseCookies(socket.handshake.headers.cookie)[SESSION_COOKIE];
  const user = token ? db.sessionUser(token) : undefined;
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = publicUser(user);
  socket.data.token = token;
  next();
});

/** Chiude le connessioni in tempo reale di un utente (tranne, se indicata, quella della sessione corrente). */
function kickUser(userId: number, keepToken?: string) {
  for (const s of io.sockets.sockets.values()) {
    if (s.data.user?.id !== userId) continue;
    if (keepToken && s.data.token === keepToken) continue;
    s.emit('closed');
    s.disconnect(true);
  }
}

async function broadcast(gameId: string) {
  const g = db.gameById(gameId);
  if (!g) return;
  const state = loadState(g);
  const sockets = await io.in(gameId).fetchSockets();
  for (const s of sockets) {
    const userId = s.data.user.id as number;
    const seat = seatOf(g.id, userId);
    if (seat === null) {
      s.emit('closed');
      s.leave(gameId);
      continue;
    }
    s.emit('state', { game: summary(g, userId), view: viewFor(state, seat), serverNow: Date.now() });
  }
}

function refreshOnline(gameId: string) {
  const ids = new Set<number>();
  const room = io.sockets.adapter.rooms.get(gameId);
  for (const sid of room ?? []) {
    const s = io.sockets.sockets.get(sid);
    if (s) ids.add(s.data.user.id);
  }
  if (ids.size) online.set(gameId, ids);
  else online.delete(gameId);
}

/** Salva lo stato dopo una mossa; a fine partita la segna come conclusa. */
function save(g: GameRow, state: GameState) {
  db.saveState(g.id, state, state.phase === 'ended' ? 'ended' : g.status);
}

// ---------- bot ----------

const botTimers = new Map<string, NodeJS.Timeout>();

/** Se tocca a un bot, ne programma la mossa (una alla volta per partita). */
function scheduleBot(gameId: string) {
  if (botTimers.has(gameId)) return;
  const g = db.gameById(gameId);
  if (!g || g.status !== 'playing') return;
  const state = loadState(g);
  const seat = state.current?.seat;
  const bot = seat === undefined ? null : db.seats(gameId).find((s) => s.seat === seat)?.bot;
  if (!bot || seat === undefined) return;
  botTimers.set(
    gameId,
    setTimeout(() => {
      botTimers.delete(gameId);
      const fresh = db.gameById(gameId);
      if (!fresh || fresh.status !== 'playing') return;
      const now = loadState(fresh);
      if (now.current?.seat !== seat) return scheduleBot(gameId);
      try {
        const next = applyAction(now, seat, chooseBotMove(now, seat, bot));
        save(fresh, next);
        void broadcast(gameId);
      } catch (e) {
        app.log.error(e, `mossa del bot rifiutata nella partita ${gameId}`);
        return;
      }
      scheduleBot(gameId);
    }, BOT_DELAY_MS),
  );
}

type Ack = (res: { ok: boolean; error?: string }) => void;
const safeAck = (ack: unknown): Ack => (typeof ack === 'function' ? (ack as Ack) : () => {});

io.on('connection', (socket: Socket) => {
  const user = socket.data.user as { id: number; username: string };

  socket.on('join', (gameId: unknown, ack: unknown) => {
    const done = safeAck(ack);
    const g = typeof gameId === 'string' ? db.gameById(gameId) : undefined;
    if (!g || seatOf(g.id, user.id) === null) return done({ ok: false, error: 'Partita non trovata.' });
    for (const room of socket.rooms) if (room !== socket.id) void socket.leave(room);
    void socket.join(g.id);
    socket.data.gameId = g.id;
    refreshOnline(g.id);
    socket.emit(
      'chat:history',
      db.messages(g.id).map((m) => ({ id: m.id, user: m.username, text: m.text, at: m.created_at })),
    );
    done({ ok: true });
    void broadcast(g.id);
  });

  socket.on('action', (action: GameAction, ack: unknown) => {
    const done = safeAck(ack);
    const gameId = socket.data.gameId as string | undefined;
    const g = gameId ? db.gameById(gameId) : undefined;
    const seat = g ? seatOf(g.id, user.id) : null;
    if (!g || seat === null) return done({ ok: false, error: 'Partita non trovata.' });
    if (g.status === 'waiting') return done({ ok: false, error: 'In attesa degli altri giocatori.' });
    try {
      const next = applyAction(loadState(g), seat, action);
      save(g, next);
      done({ ok: true });
      void broadcast(g.id);
      scheduleBot(g.id);
    } catch (e) {
      if (e instanceof GameError) return done({ ok: false, error: e.message });
      app.log.error(e);
      done({ ok: false, error: 'Errore interno.' });
    }
  });

  socket.on('chat', (text: unknown, ack: unknown) => {
    const done = safeAck(ack);
    const gameId = socket.data.gameId as string | undefined;
    const g = gameId ? db.gameById(gameId) : undefined;
    if (!g || seatOf(g.id, user.id) === null) return done({ ok: false, error: 'Partita non trovata.' });
    if (typeof text !== 'string' || !text.trim()) return done({ ok: false, error: 'Messaggio vuoto.' });
    const clean = text.trim().slice(0, 300);
    db.addMessage(g.id, user.id, clean);
    io.to(g.id).emit('chat', { id: Date.now(), user: user.username, text: clean, at: Date.now() });
    done({ ok: true });
  });

  socket.on('disconnect', () => {
    const gameId = socket.data.gameId as string | undefined;
    if (gameId) {
      refreshOnline(gameId);
      void broadcast(gameId);
    }
  });
});

// Dopo un riavvio riprendono i bot delle partite in corso.
for (const g of db.playingGames()) scheduleBot(g.id);

await app.listen({ port: PORT, host: HOST });
