# Maiolica

Gioco di piastrelle per 2-4 giocatori: a turno si prendono tutte le piastrelle di un colore da una
fornace o dal centro del tavolo, si preparano le righe della propria plancia e a fine round le righe
complete passano sul muro, facendo punti. Si gioca nel browser, dal PC (tavolo 3D) o dal telefono
(tavolo 2D), contro altre persone (ognuna dal suo dispositivo) o contro il computer. È pensato per
girare su un server di casa tramite Docker, ed è anche integrato in Arena.

## Avvio rapido (Docker)

```bash
docker compose up -d --build
```

Poi apri `http://<indirizzo-del-server>:8081`, crea un profilo, apri una partita in bottega e
condividi il codice invito di 6 lettere.

| Variabile        | Default              | Descrizione                                                                   |
| ---------------- | -------------------- | ----------------------------------------------------------------------------- |
| `MAIOLICA_PORT`  | `8081`               | Porta esposta sull'host                                                       |
| `MAIOLICA_BIND`      | `0.0.0.0`            | Indirizzo su cui pubblicare la porta (`127.0.0.1` = solo il server, oppure l'IP Tailscale) |
| `COOKIE_SECURE`  | `auto`               | Cookie solo HTTPS: `auto` lo attiva per le richieste in HTTPS (anche dietro proxy), `true`/`false` lo forzano |
| `LOG_LEVEL`      | `info`               | Livello di log del server                                                     |
| `ADMIN_USERS`    | (vuoto)              | Nomi utente sempre amministratori, separati da virgola. Se vuoto, è admin il primo utente registrato |
| `REGISTRATION_OPEN` | `true`            | Registrazione libera all'avvio; poi si gestisce dalla pagina Utenti           |
| `TRUSTED_PROXIES` | `loopback,172.16.0.0/12` | Proxy fidati per `X-Forwarded-For`/`-Proto` (NPM, cloudflared)            |
| `MAX_USERS`      | `0`                  | Numero massimo di profili (0 = nessun limite)                                 |
| `BOT_DELAY_MS`   | `900`                | Pausa prima di ogni mossa dei bot                                             |
| `DB_FILE`        | `/data/maiolica.db`  | Database SQLite (nel volume `maiolica-data`): profili, partite, chat              |

Il reverse proxy deve inoltrare anche i WebSocket (percorso `/socket.io/`).
Accesso, sicurezza e amministrazione degli utenti funzionano come in SkyDreams: tentativi di login
limitati, password con scrypt, header di sicurezza, pagina **Utenti** per gli amministratori
(blocco, reset password, promozione, eliminazione, chiusura della registrazione).

## Il gioco

- **Bottega**: si apre una partita scegliendo con chi giocare (altre persone con il codice invito,
  oppure contro il computer), quanti giocatori (2-4), il livello dei bot (facile, medio, difficile) e
  la variante del muro libero. Lì si vedono anche le proprie partite da riprendere.
- **Regole**: 100 piastrelle in 5 colori, 5/7/9 fornaci, righe di preparazione da 1 a 5, pavimento
  con penalità −1…−3, punti per le piastrelle adiacenti, bonus finali (+2 riga, +7 colonna, +10
  colore). La partita finisce quando qualcuno completa una riga del muro.
- **Muro libero** (variante): il muro non ha colori stampati e ognuno sceglie la colonna.
- **Bot**: giocano lato server; il difficile guarda anche cosa lascia all'avversario.
- **Partite persistenti**: lo stato si salva dopo ogni mossa; chi abbandona una partita in corso
  lascia il posto a un bot.
- **PC e telefono**: sul PC il tavolo 3D (fornaci in cerchio, plance intorno) con scorciatoie da
  tastiera; sul telefono un tavolo 2D compatto con pulsanti grandi. Si passa dall'uno all'altro con
  il pulsante con il cubo.
- **Grafica**: piastrelle disegnate dal codice (SVG, anche come texture del 3D); nessuna immagine o
  nome del gioco da tavolo originale.

## Sviluppo

Per riprendere il progetto (anche con un assistente IA) leggi prima [`AGENTS.md`](AGENTS.md).

Serve Node.js 22.13 o superiore (usa il modulo integrato `node:sqlite`).

```bash
npm install
npm test          # test del motore di regole
npm run typecheck
npm run dev       # server su :8080 e client Vite su :5173 (con proxy verso il server)
```

- `packages/shared`: motore di regole puro, bot e tipi condivisi, con i test.
- `packages/server`: Fastify con Socket.IO e SQLite; serve anche il client compilato.
- `packages/client`: React e Zustand, compilato con Vite.

Maiolica è pensato per uso privato su un server in VPN.
