/**
 * Il tavolo da gioco dietro tutte le pagine: piano di legno a doghe visto dall'alto, un tappeto di
 * feltro verde con le cuciture e, ai bordi, qualche oggetto della partita (piastrelle sparse, il
 * sacchetto di stoffa, il blocco dei punti) sotto la luce calda di una lampada. Il centro resta calmo
 * per i pannelli.
 *
 * Nella partita (`table`) il feltro copre quasi tutto lo schermo e non ci sono oggetti.
 */
import type { Color } from '@maiolica/shared';
import { FirstToken, TileFace } from '../game/TileFace';

const PROPS: { c: Color | 'first'; x: number; y: number; r: number; s: number }[] = [
  { c: 0, x: 6, y: 74, r: -14, s: 1 },
  { c: 2, x: 11, y: 86, r: 9, s: 0.95 },
  { c: 4, x: 15.5, y: 77, r: 31, s: 0.9 },
  { c: 1, x: 88, y: 18, r: 21, s: 0.9 },
  { c: 3, x: 93, y: 30, r: -8, s: 1 },
  { c: 'first', x: 90, y: 80, r: 34, s: 0.95 },
  { c: 0, x: 95, y: 88, r: -20, s: 0.9 },
];

function Wood() {
  return (
    <svg className="table-wood" width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <filter id="mai-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.004 0.09" numOctaves="3" seed="7" />
          <feColorMatrix
            values="0 0 0 0 0.24
                    0 0 0 0 0.14
                    0 0 0 0 0.07
                    0 0 0 0.55 0"
          />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <pattern id="mai-planks" width="100%" height="260" patternUnits="userSpaceOnUse">
          <rect width="100%" height="260" fill="#7a4b2a" />
          <rect y="0" width="100%" height="64" fill="#80502d" />
          <rect y="130" width="100%" height="64" fill="#734727" />
          {[0, 64, 130, 194].map((y) => (
            <rect key={y} y={y} width="100%" height="2" fill="#3d2414" opacity="0.7" />
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#mai-planks)" />
      <rect width="100%" height="100%" fill="#000" filter="url(#mai-grain)" />
    </svg>
  );
}

export function Backdrop({ table }: { table?: boolean; dim?: boolean }) {
  return (
    <div className={`tabletop ${table ? 'in-game' : ''}`} aria-hidden="true">
      <Wood />
      <div className="felt">
        <div className="felt-stitch" />
      </div>
      {!table && (
        <div className="props">
          {PROPS.map((p, i) => (
            <svg
              key={i}
              className="prop-tile"
              viewBox="0 0 100 100"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(-50%, -50%) rotate(${p.r}deg) scale(${p.s})` }}
            >
              {p.c === 'first' ? <FirstToken /> : <TileFace color={p.c} />}
            </svg>
          ))}
          <svg className="prop-bag" viewBox="0 0 100 110" style={{ left: '10%', top: '42%' }}>
            <path d="M22 40 C8 60 10 100 50 104 C90 100 92 60 78 40 Z" fill="#8a3b2c" stroke="#5a2318" strokeWidth="2" />
            <path d="M30 40 C36 30 64 30 70 40" fill="none" stroke="#e8c37a" strokeWidth="4" />
            <path d="M34 28 C40 12 60 12 66 28 L60 38 L40 38 Z" fill="#9c4634" stroke="#5a2318" strokeWidth="2" />
            <path d="M28 64 C40 70 60 70 72 64" fill="none" stroke="#e8c37a" strokeWidth="2" strokeDasharray="4 4" opacity="0.7" />
          </svg>
          <div className="prop-pad" style={{ left: '7%', top: '17%' }}>
            <span>Maiolica</span>
            <i>Rosso · 34</i>
            <i>Blu · 41</i>
            <i>Verde · 28</i>
          </div>
        </div>
      )}
      <div className="lamp" />
    </div>
  );
}
