/** Marchio: quattro piastrelle a scacchiera ruotate di 45°, più il nome in maiuscoletto. */
export function Brand({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`brand brand-${size}`}>
      <svg viewBox="0 0 48 48" aria-hidden="true" className="brand-mark">
        <circle cx="24" cy="24" r="23" className="brand-ring" />
        <g transform="rotate(45 24 24)">
          <rect x="12" y="12" width="11.5" height="11.5" rx="2" fill="#2b58b0" />
          <rect x="24.5" y="12" width="11.5" height="11.5" rx="2" fill="#e1a22c" />
          <rect x="12" y="24.5" width="11.5" height="11.5" rx="2" fill="#2f9fa3" />
          <rect x="24.5" y="24.5" width="11.5" height="11.5" rx="2" fill="#c1432d" />
          <circle cx="24" cy="24" r="3.2" className="brand-dot" />
        </g>
      </svg>
      <span className="brand-name">
        <b>Maiolica</b>
      </span>
    </span>
  );
}
