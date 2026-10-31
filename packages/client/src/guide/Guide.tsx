import { wallColor, type Color } from '@maiolica/shared';
import { Lightbulb } from 'lucide-react';
import type { ReactNode } from 'react';
import { COLOR_SHORT, Tile } from '../game/TileFace';

/* ---------- piccoli mattoni per gli esempi ---------- */

function Example({ children, title = 'Esempio' }: { children: ReactNode; title?: string }) {
  return (
    <div className="example well">
      <div className="kicker">{title}</div>
      {children}
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="tip well">
      <Lightbulb size={18} />
      <p>{children}</p>
    </div>
  );
}

function Row({ tiles, size = 26 }: { tiles: (Color | 'first' | null)[]; size?: number }) {
  return (
    <span className="guide-row">
      {tiles.map((t, i) =>
        t === null ? <span key={i} className="guide-slot" style={{ width: size, height: size }} /> : t === 'first' ? <Tile key={i} first size={size} /> : <Tile key={i} color={t} size={size} />,
      )}
    </span>
  );
}

/** Muro 5×5 con le piastrelle indicate (riga, colonna) e le altre in trasparenza. */
function Wall({ filled, mark, size = 22 }: { filled: [number, number][]; mark?: [number, number]; size?: number }) {
  return (
    <span className="guide-wall" style={{ '--ts': `${size}px` } as React.CSSProperties}>
      {Array.from({ length: 25 }, (_, i) => {
        const r = Math.floor(i / 5);
        const c = i % 5;
        const on = filled.some(([a, b]) => a === r && b === c);
        const m = mark && mark[0] === r && mark[1] === c;
        return (
          <span key={i} className={m ? 'mark' : ''}>
            <Tile color={wallColor(r, c)} size={size} ghost={!on} />
          </span>
        );
      })}
    </span>
  );
}

const SECTIONS: [string, string][] = [
  ['scopo', 'Lo scopo'],
  ['materiale', 'Il materiale'],
  ['offerta', 'Prendere le piastrelle'],
  ['righe', 'Le righe'],
  ['pavimento', 'Il pavimento'],
  ['muro', 'Posare sul muro'],
  ['fine', 'Fine partita'],
  ['libero', 'Variante muro libero'],
  ['comandi', 'Comandi'],
];

export function GuideToc() {
  return (
    <>
      <span className="label">Indice</span>
      {SECTIONS.map(([id, title]) => (
        <a key={id} href={`#/guida`} onClick={(e) => (e.preventDefault(), document.getElementById(`g-${id}`)?.scrollIntoView({ behavior: 'smooth' }))}>
          {title}
        </a>
      ))}
    </>
  );
}

export function GuideContent({ compact }: { compact?: boolean }) {
  return (
    <div className={`guide-content ${compact ? 'compact' : ''}`}>
      <section id="g-scopo">
        <h2>Lo scopo</h2>
        <p>
          Ogni giocatore decora il muro della propria bottega con le piastrelle di maiolica. Si fanno punti posando le
          piastrelle accanto a quelle già sul muro e, a fine partita, completando righe, colonne e colori. Chi spreca
          piastrelle le fa cadere sul pavimento e perde punti.
        </p>
        <p>Vince chi ha più punti; a parità, chi ha completato più righe orizzontali.</p>
      </section>

      <section id="g-materiale">
        <h2>Il materiale</h2>
        <p>
          Ci sono 100 piastrelle, 20 per colore, in un sacchetto. Al centro del tavolo ci sono le <b>fornaci</b>: 5 con
          due giocatori, 7 con tre, 9 con quattro. A inizio round ogni fornace riceve 4 piastrelle pescate a caso.
        </p>
        <Example title="I cinque colori">
          <div className="guide-colors">
            {([0, 1, 2, 3, 4] as Color[]).map((c) => (
              <span key={c}>
                <Tile color={c} size={34} />
                <small>{COLOR_SHORT[c]}</small>
              </span>
            ))}
            <span>
              <Tile first size={34} />
              <small>Primo</small>
            </span>
          </div>
        </Example>
        <p>
          Ognuno ha una plancia con cinque <b>righe di preparazione</b> (lunghe da 1 a 5) a sinistra, il <b>muro</b> 5×5
          a destra e il <b>pavimento</b> in basso.
        </p>
      </section>

      <section id="g-offerta">
        <h2>Prendere le piastrelle</h2>
        <p>Al proprio turno si sceglie un colore e si prendono tutte le piastrelle di quel colore:</p>
        <ul>
          <li>
            <b>da una fornace</b>: le altre piastrelle della fornace vanno al centro del tavolo;
          </li>
          <li>
            <b>dal centro</b>: si prendono tutte quelle di quel colore. Il primo che prende dal centro in un round prende
            anche il segnalino <b>1</b>: sarà il primo del round successivo, ma il segnalino finisce sul suo pavimento.
          </li>
        </ul>
        <Example>
          <p>
            Una fornace ha <Row tiles={[0, 0, 2, 4]} size={20} />. Prendi i due blu: il rosso e il turchese scivolano al
            centro, a disposizione di tutti.
          </p>
        </Example>
        <p>Il round di offerta finisce quando fornaci e centro sono vuoti.</p>
      </section>

      <section id="g-righe">
        <h2>Le righe</h2>
        <p>Le piastrelle prese vanno tutte in una sola riga di preparazione, da destra verso sinistra. Le regole:</p>
        <ul>
          <li>una riga contiene un solo colore;</li>
          <li>non si può usare una riga con un colore che è già sul muro, nella stessa riga;</li>
          <li>quelle che non ci stanno cadono sul pavimento.</li>
        </ul>
        <Example>
          <p>
            Hai preso tre gialli e li metti nella riga 2 (due posti): <Row tiles={[1, 1]} size={20} /> e il terzo cade sul
            pavimento.
          </p>
        </Example>
        <Tip>Una riga piena resta lì finché il round non finisce: solo allora passa sul muro.</Tip>
      </section>

      <section id="g-pavimento">
        <h2>Il pavimento</h2>
        <p>
          Ogni piastrella sul pavimento costa punti a fine round: −1, −1, −2, −2, −2, −3, −3 (fino a −14). Oltre la
          settima, le piastrelle tornano nella scatola senza altra penalità. Si può sempre scegliere di mettere tutto sul
          pavimento, anche quando nessuna riga va bene. Il punteggio non scende mai sotto zero.
        </p>
        <p>
          Le penalità si sommano casella per casella, da sinistra: conta quante caselle sono occupate, non di che colore
          sono. Anche il segnalino del primo giocatore occupa una casella e costa come una piastrella.
        </p>
        <Example>
          <p>
            Hai preso dal centro per primo (segnalino) e 3 piastrelle non ti stavano nella riga: 4 caselle occupate, −1 −1
            −2 −2 = <b>−6</b>. Se avevi solo 4 punti, perdi 4 e resti a 0.
          </p>
        </Example>
      </section>

      <section id="g-muro">
        <h2>Posare sul muro</h2>
        <p>
          A fine round, per ogni riga completa, la piastrella più a destra passa sul muro nella stessa riga, nella casella
          del suo colore; le altre tornano nella scatola. Le righe incomplete restano per il round dopo.
        </p>
        <p>
          Le righe complete passano sul muro una alla volta, dall'alto in basso, e ogni piastrella vale subito dei punti
          secondo le piastrelle <b>già</b> sul muro, compresa quella appena posata dalla riga sopra:
        </p>
        <ul>
          <li>
            si guarda la <b>fila orizzontale</b>: la piastrella e quelle attaccate a destra e a sinistra, senza buchi;
          </li>
          <li>
            poi la <b>fila verticale</b>: la piastrella e quelle attaccate sopra e sotto, senza buchi;
          </li>
          <li>
            ogni fila lunga almeno 2 vale tante piastrelle quante ne contiene (lei compresa) e le due file si sommano;
            una fila di 1 (nessuna vicina in quella direzione) non conta;
          </li>
          <li>se non tocca nessuna piastrella, né in orizzontale né in verticale, vale 1.</li>
        </ul>
        <Example title="Esempio: piastrella isolata">
          <div className="guide-example-row">
            <Wall filled={[[2, 2]]} mark={[2, 2]} />
            <p>
              Nessuna vicina: vale <b>1</b> punto.
            </p>
          </div>
        </Example>
        <Example title="Esempio: solo in orizzontale">
          <div className="guide-example-row">
            <Wall filled={[[0, 0], [0, 1], [0, 2]]} mark={[0, 2]} />
            <p>
              Due piastrelle attaccate a sinistra: fila orizzontale di 3. In verticale è da sola, quindi non conta: vale{' '}
              <b>3</b> punti (non 3 + 1).
            </p>
          </div>
        </Example>
        <Example title="Esempio: in tutte e due le direzioni">
          <div className="guide-example-row">
            <Wall filled={[[1, 1], [1, 2], [0, 3], [2, 3], [1, 3]]} mark={[1, 3]} />
            <p>
              La piastrella evidenziata tocca due piastrelle a sinistra (fila di 3) e una sopra e una sotto (colonna di
              3): vale 3 + 3 = <b>6</b> punti.
            </p>
          </div>
        </Example>
        <Example title="Esempio: il buco interrompe la fila">
          <div className="guide-example-row">
            <Wall filled={[[3, 0], [3, 2], [3, 3], [4, 2]]} mark={[3, 2]} />
            <p>
              A sinistra c'è un buco: la piastrella più a sinistra non conta. Fila orizzontale di 2 (lei e quella a
              destra) + fila verticale di 2 (quella sotto): vale 2 + 2 = <b>4</b> punti.
            </p>
          </div>
        </Example>
        <Tip>
          Nella <b>cronaca</b> della partita, per ogni punteggio è scritto il calcolo: le file che hanno contato per ogni
          piastrella, le caselle del pavimento con le penalità e, a fine partita, quali righe, colonne e colori hanno dato
          il bonus.
        </Tip>
      </section>

      <section id="g-fine">
        <h2>Fine partita</h2>
        <p>La partita finisce alla fine del round in cui qualcuno completa una riga orizzontale del muro. Poi i bonus:</p>
        <ul>
          <li>
            <b>+2</b> per ogni riga orizzontale completa;
          </li>
          <li>
            <b>+7</b> per ogni colonna verticale completa;
          </li>
          <li>
            <b>+10</b> per ogni colore con tutte e cinque le piastrelle sul muro.
          </li>
        </ul>
        <p>
          I bonus valgono per tutti i giocatori, non solo per chi ha chiuso la partita. Una riga orizzontale completa conta
          sia per far finire la partita sia per il bonus.
        </p>
        <Example>
          <p>
            A fine partita hai completato le righe 1 e 3, la colonna 2 e tutti e cinque i blu: 2 × 2 + 7 + 10 ={' '}
            <b>+21</b>.
          </p>
        </Example>
      </section>

      <section id="g-libero">
        <h2>Variante muro libero</h2>
        <p>
          Chi fonda la partita può scegliere il <b>muro libero</b>: il muro non ha colori stampati. A fine round, in ordine
          di turno, ognuno sceglie in quale colonna posare ogni riga completa, dall'alto in basso. L'unico vincolo: un
          colore non può comparire due volte nella stessa colonna (né, come sempre, nella stessa riga). Se una riga non ha
          colonne possibili, le sue piastrelle cadono sul pavimento.
        </p>
      </section>

      <section id="g-comandi">
        <h2>Comandi</h2>
        <ul>
          <li>Tocca una piastrella in una fornace o al centro per scegliere quel colore; ritocca per annullare.</li>
          <li>Poi tocca una riga illuminata della tua plancia, o il pavimento.</li>
          <li>Sul PC: tasti 1-5 per la riga, 0 o P per il pavimento, Esc per annullare.</li>
          <li>Sul telefono tocca la plancia piccola di un avversario per vederla in grande.</li>
          <li>
            Sulle plance degli avversari l'ultima mossa è illuminata del loro colore: le piastrelle appena prese (nella riga
            e sul pavimento) o, a fine round, quelle appena passate sul muro.
          </li>
          <li>Il pulsante con il cubo passa dal tavolo 3D a quello 2D; nel 3D trascina per ruotare la vista.</li>
        </ul>
      </section>
    </div>
  );
}
