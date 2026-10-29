/**
 * Le piastrelle di Maiolica, disegnate dal codice (SVG 100×100): cinque colori, ognuno con un
 * motivo proprio in smalto chiaro, più il segnalino del primo giocatore. Stessa grafica nel 2D e,
 * come texture, nel 3D.
 */
import type { Color } from '@maiolica/shared';
import { memo } from 'react';

export const COLOR_NAMES = ['blu cobalto', 'giallo ocra', 'rosso', 'nero', 'turchese'] as const;
export const COLOR_SHORT = ['Blu', 'Giallo', 'Rosso', 'Nero', 'Turchese'] as const;
export const TILE_BASE = ['#2b58b0', '#e1a22c', '#c1432d', '#2a2631', '#2f9fa3'] as const;
const TILE_DARK = ['#1c3c7d', '#a8730f', '#8a2a1a', '#15131a', '#1f6f72'] as const;
const MOTIF = ['#f3ead6', '#5a2f12', '#f6e9d2', '#d9b35b', '#f3ead6'] as const;

/** Sfumature condivise (smalto lucido): da montare una volta sola nella pagina. */
export function TileDefsContent() {
  return (
    <defs>
      <linearGradient id="mai-glaze" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0.04" />
        <stop offset="1" stopColor="#000" stopOpacity="0.18" />
      </linearGradient>
      <radialGradient id="mai-shine" cx="0.3" cy="0.25" r="0.5">
        <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

export function TileDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <TileDefsContent />
    </svg>
  );
}

/** Stella a otto punte (due quadrati ruotati). */
const star = (r: number) => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.62;
    pts.push(`${(50 + Math.cos(a) * rr).toFixed(1)},${(50 + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
};

function Motif({ color }: { color: Color }) {
  const m = MOTIF[color];
  switch (color) {
    case 0: // blu: stella moresca con punti agli angoli
      return (
        <g>
          <polygon points={star(30)} fill={m} />
          <polygon points={star(14)} fill={TILE_BASE[0]} />
          <circle cx="50" cy="50" r="5" fill={m} />
          {[[12, 12], [88, 12], [12, 88], [88, 88]].map(([x, y]) => (
            <path key={`${x}${y}`} d={`M${x - 8} ${y} L${x} ${y - 8} L${x + 8} ${y} L${x} ${y + 8} Z`} fill={m} opacity="0.9" />
          ))}
        </g>
      );
    case 1: // giallo: rosetta a otto petali
      return (
        <g>
          {Array.from({ length: 8 }, (_, i) => (
            <ellipse key={i} cx="50" cy="28" rx="7" ry="15" fill="#f6dc8e" stroke={m} strokeWidth="2" transform={`rotate(${i * 45} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="10" fill={m} />
          <circle cx="50" cy="50" r="4" fill="#f6dc8e" />
        </g>
      );
    case 2: // rosso: fiore a quattro petali e foglie
      return (
        <g>
          {[0, 90, 180, 270].map((a) => (
            <path key={a} d="M50 50 C38 36 40 18 50 14 C60 18 62 36 50 50 Z" fill={m} transform={`rotate(${a} 50 50)`} />
          ))}
          {[45, 135, 225, 315].map((a) => (
            <path key={a} d="M50 50 C46 42 46 32 50 28 C54 32 54 42 50 50 Z" fill="#7d2416" transform={`rotate(${a} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="6" fill="#e9b04a" />
        </g>
      );
    case 3: // nero: reticolo di rombi dorati
      return (
        <g fill="none" stroke={m} strokeWidth="3">
          <path d="M50 10 L90 50 L50 90 L10 50 Z" />
          <path d="M50 28 L72 50 L50 72 L28 50 Z" />
          <path d="M10 10 L30 30 M90 10 L70 30 M10 90 L30 70 M90 90 L70 70" />
          <circle cx="50" cy="50" r="5" fill={m} stroke="none" />
        </g>
      );
    default: // turchese: onde a quarti di cerchio
      return (
        <g fill="none" stroke={m} strokeWidth="4" strokeLinecap="round">
          {[0, 90, 180, 270].map((a) => (
            <g key={a} transform={`rotate(${a} 50 50)`}>
              <path d="M8 50 A42 42 0 0 1 50 8" />
              <path d="M22 50 A28 28 0 0 1 50 22" />
            </g>
          ))}
          <circle cx="50" cy="50" r="8" fill={m} stroke="none" />
        </g>
      );
  }
}

/** Faccia di una piastrella (0-100). `ghost` = sagoma pallida per le caselle vuote del muro. */
export const TileFace = memo(function TileFace({ color, ghost }: { color: Color; ghost?: boolean }) {
  return (
    <g opacity={ghost ? 0.22 : 1}>
      <rect x="1" y="1" width="98" height="98" rx="9" fill={TILE_BASE[color]} />
      <rect x="1" y="1" width="98" height="98" rx="9" fill="none" stroke={TILE_DARK[color]} strokeWidth="2.5" />
      <Motif color={color} />
      {!ghost && (
        <>
          <rect x="1" y="1" width="98" height="98" rx="9" fill="url(#mai-glaze)" />
          <rect x="1" y="1" width="98" height="98" rx="9" fill="url(#mai-shine)" />
        </>
      )}
    </g>
  );
});

/** Segnalino del primo giocatore: piastrella avorio con l'"1". */
export const FirstToken = memo(function FirstToken() {
  return (
    <g>
      <rect x="1" y="1" width="98" height="98" rx="9" fill="#f1e8d4" stroke="#b9a988" strokeWidth="2.5" />
      <text x="50" y="68" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="58" fill="#2b58b0">
        1
      </text>
      <rect x="1" y="1" width="98" height="98" rx="9" fill="url(#mai-glaze)" />
    </g>
  );
});

/** Piastrella in un piccolo SVG a sé. */
export function Tile({ color, size = 28, ghost, first }: { color?: Color; size?: number; ghost?: boolean; first?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="tile-svg" aria-hidden="true">
      {first ? <FirstToken /> : color !== undefined ? <TileFace color={color} ghost={ghost} /> : null}
    </svg>
  );
}
