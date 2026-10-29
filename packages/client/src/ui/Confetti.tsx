import { useEffect, useRef } from 'react';

const COLORS = ['#ffc46e', '#e0533f', '#3f7de0', '#3aa864', '#f0c12e', '#a066e3', '#f4efe7'];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  w: number;
  h: number;
  color: string;
  wobble: number;
}

/** Esplosione di coriandoli a tutto schermo (vittoria). Rispetta "riduci movimento". */
export function Confetti({ duration = 4200 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    // due raffiche dagli angoli in basso e una pioggia dall'alto
    const pieces: Piece[] = [];
    const burst = (x: number, y: number, dir: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + dir * (0.25 + Math.random() * 0.55);
        const speed = 9 + Math.random() * 9;
        pieces.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.4,
          w: 6 + Math.random() * 6,
          h: 3 + Math.random() * 5,
          color: COLORS[i % COLORS.length]!,
          wobble: Math.random() * Math.PI * 2,
        });
      }
    };
    burst(innerWidth * 0.08, innerHeight, 1, 110);
    burst(innerWidth * 0.92, innerHeight, -1, 110);
    for (let i = 0; i < 90; i++)
      pieces.push({
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * innerHeight * 0.5,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        w: 6 + Math.random() * 5,
        h: 3 + Math.random() * 4,
        color: COLORS[i % COLORS.length]!,
        wobble: Math.random() * Math.PI * 2,
      });

    const start = performance.now();
    let last = start;
    let raf = 0;
    const tick = (now: number) => {
      // passo legato al tempo reale (anche con pochi fotogrammi al secondo), con un tetto per le pause lunghe
      const dt = Math.min(6, (now - last) / 16.7);
      last = now;
      const t = now - start;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const fade = t > duration - 900 ? Math.max(0, (duration - t) / 900) : 1;
      for (const p of pieces) {
        p.vy += 0.28 * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.wobble += 0.12 * dt;
        p.x += (p.vx + Math.sin(p.wobble) * 0.8) * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.wobble)) * 0.8 + 0.2);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < duration) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
    };
  }, [duration]);

  return <canvas ref={ref} className="confetti" aria-hidden="true" />;
}
