# Maiolica — guida per chi sviluppa (persone e assistenti IA)

Questo file serve a chi riprende il progetto senza conoscerne la storia. Il `README.md` è la guida
per installare e giocare. L'interfaccia, i testi, i commenti e i messaggi di commit sono **in
italiano**: mantienili così.

## Cos'è

Gioco di piastrelle per 2-4 giocatori (ispirato ai classici giochi di draft di piastrelle), nel
browser, da PC e da telefono. Si gioca contro altre persone (sempre da dispositivi diversi) o contro
bot lato server. Gira su un server di casa (Docker) ed è integrato anche in **Arena**
(`BomberCacio9/arena_games`, cartella `games/maiolica`), dove l'identità arriva da Cloudflare Access.

Il nome del progetto è **Maiolica**: non usare nomi, loghi o grafica del gioco da tavolo originale.
La lobby si chiama **Bottega** (in Arena `hangarName: "bottega"`). Struttura, accesso e interfaccia
sono gli stessi di Nepi (`DL11RN/nepi`), da cui il progetto è partito.

## Struttura (monorepo npm workspaces, TypeScript)

```
packages/shared   motore di regole puro, condiviso da server, client e Arena (nessuna dipendenza)
  src/types.ts      Color 0-4, fonti (fornace o 'center'), plancia, stato, vista, azioni, eventi
  src/engine.ts     createGame, applyAction (pura, rng passato esplicitamente), legalTakes,
                    legalColumns, punteggi, viewFor (nasconde il sacchetto), migrateState
  src/bot.ts        chooseBotMove (facile/medio/difficile)
  src/summary.ts    GameSummary (riepilogo per bottega e intestazione), nomi dei bot
  test/             test Vitest delle regole e dei bot
packages/server   Fastify + Socket.IO + SQLite (node:sqlite)
  src/index.ts      accesso e amministrazione (come SkyDreams), bottega, rivincita, socket, bot
  src/db.ts         schema (users, sessions, games, game_seats, messages, settings) e query
  src/auth.ts, limiter.ts, proxies.ts   identici a SkyDreams (cookie `maiolica_session`)
packages/client   React 19 + Zustand, build con Vite
  src/App.tsx       routing a hash: #/ bottega, #/partita/<id>, #/guida, #/admin
  src/api.ts        tutte le chiamate HTTP   ┐ in Arena questi due file vengono sostituiti dagli
  src/socket.ts     partita in tempo reale   ┘ adattatori (games/maiolica/src/client)
  src/store.ts      stato del client (vista, presa in preparazione, chat, avvisi, 2D/3D)
  src/game/         TileFace (piastrelle SVG), Table2D (fornaci, centro, plance), Hud (barra e stato),
                    play.ts (usePlay: scelta e invio della mossa, tastiera), colors.ts
  src/game3d/       tavolo 3D (React Three Fiber, caricato solo quando serve): Board3D,
                    textures.tsx (piastrelle dall'SVG 2D, legno e feltro su canvas)
  src/pages/        Accesso, Bottega, Partita (sceglie 3D o 2D), Guida, Utenti
  src/guide/        regole con esempi disegnati
  src/ui/           marchio, tavolo di sfondo (Backdrop), finestre, barra in alto, chat, coriandoli
  src/styles.css    stile "glass floating" di SkyDreams (vetro in tono caldo) + sezioni di Maiolica
```

## Comandi

```bash
npm install
npm test            # Vitest (regole, bot)
npm run typecheck   # tsc sui tre pacchetti
npm run build       # client (Vite) e server (esbuild in packages/server/dist)
npm run dev         # server su :8080 e Vite su :5173 con proxy
docker compose up -d --build   # produzione (porta 8081 sull'host); il Dockerfile esegue anche i test
```

## Principi da rispettare

- **Il server è l'unico arbitro.** Ogni azione passa da `applyAction`; il client usa le stesse
  funzioni (`canUseLine`, `legalColumns`) solo per mostrare le mosse. Una regola nuova va nel motore
  condiviso, con un test.
- **Casualità esplicita**: `applyAction(state, seat, action, rng)` pesca dal sacchetto solo con
  l'`rng` ricevuto (in Arena è quello deterministico di Colyseus). Non usare `Math.random` nel motore
  se non come valore predefinito del parametro.
- **Informazione nascosta**: il contenuto del sacchetto non arriva mai al client (`viewFor` lo
  sostituisce con `bagCount`).
- **Due azioni**: `take` (fonte, colore, riga o pavimento) e, solo col muro libero, `wall` (colonna
  per la prima riga in attesa in `pending`).
- **Stati salvati**: lo stato è JSON in SQLite (e in Postgres in Arena). Campi nuovi: opzionali o
  aggiunti in `migrateState`.
- **Arena**: `api.ts` e `socket.ts` sono l'unico confine verso il server; Arena li sostituisce con un
  plugin di Vite. Se ne cambi le firme, aggiorna anche gli adattatori in `arena_games/games/maiolica`.

## Tavolo 2D e 3D

- Il **2D** (`game/Table2D.tsx`) è la grafica di base e quella del telefono: fornaci e centro in
  alto, la propria plancia sotto, gli avversari in una colonna (PC) o in una striscia da toccare
  (telefono). Il **3D** (`game3d/Board3D.tsx`) parte in automatico sul PC con WebGL 2; il pulsante
  con il cubo passa dall'uno all'altro (scelta salvata in `maiolica-view`). Se il 3D lancia un
  errore si torna al 2D.
- Le piastrelle 3D usano come texture lo stesso SVG del 2D (`renderToStaticMarkup`), quindi la
  grafica si cambia in un posto solo (`TileFace`). Quando un materiale riceve la `map`, cambiagli la
  `key` (altrimenti three non ricompila lo shader e la faccia resta nera).

## Decisioni sulle regole

- 20 piastrelle per colore; fornaci = 2 × giocatori + 1, 4 piastrelle ciascuna. Sacchetto vuoto: si
  rimescola la scatola; se manca anche quella, le fornaci restano incomplete.
- Primo giocatore del round dopo = chi ha preso per primo dal centro (il segnalino va sul pavimento e
  conta come penalità).
- Pavimento: 7 posti (−1, −1, −2, −2, −2, −3, −3); le piastrelle in più tornano nella scatola. Il
  punteggio non scende sotto zero.
- Fine partita alla fine del round in cui qualcuno completa una riga orizzontale. Bonus: +2 riga,
  +7 colonna, +10 colore completo. Pareggio: vince chi ha più righe complete (altrimenti pareggio).
- **Muro libero**: a fine round, in ordine di turno a partire dal nuovo primo giocatore, ogni riga
  completa (dall'alto) sceglie una colonna senza ripetere il colore nella colonna; se non ce n'è
  nessuna, le piastrelle della riga cadono sul pavimento.
- Sacchetto e scatola vuoti a inizio round (nessuna piastrella da offrire): la partita finisce lì, con
  i bonus (prima il round vuoto si ripeteva all'infinito).
- **Ogni punteggio si spiega**: gli eventi del log portano il calcolo (`tile` con `h`/`v`, `floor` con
  `count`/`penalty`, `bonus` con `which`, `blocked` per il muro libero) e la cronaca (`eventText` in
  `client/src/game/play.ts`) lo scrive per esteso. I campi sono facoltativi (partite vecchie). Un test
  gioca partite intere e controlla che la somma delle spiegazioni dia la variazione dei punteggi.

## Bot

`chooseBotMove` valuta ogni presa legale: punti attesi della riga completata (adiacenze sul muro),
avanzamento delle righe, differenza di penalità sul pavimento, segnalino del primo giocatore. Il
difficile sottrae anche una parte del miglior guadagno che la mossa lascia al giocatore successivo.
Facile: 45% di mosse sbagliate apposta tra le 8 migliori; medio 15% tra 3; difficile nessuna.

## Git

Si lavora su `main` del repository GitHub `DL11RN/maiolica`. Commit piccoli e descritti in italiano.
Dopo ogni modifica, aggiornare anche `arena_games/games/maiolica/upstream` con il suo
`sync-upstream.sh`.
