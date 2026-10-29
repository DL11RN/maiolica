/**
 * Texture del tavolo 3D generate nel browser: le piastrelle dallo stesso SVG della grafica 2D,
 * legno e feltro disegnati su canvas. Nessun file esterno.
 */
import type { Color } from '@maiolica/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { FirstToken, TileDefsContent, TileFace } from '../game/TileFace';

const PX = 256;
const cache = new Map<string, Promise<Texture>>();

function finish(canvas: HTMLCanvasElement, repeat?: number): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.minFilter = LinearMipmapLinearFilter;
  if (repeat) {
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(repeat, repeat);
  }
  return t;
}

function svgTexture(key: string, inner: string): Promise<Texture> {
  let hit = cache.get(key);
  if (!hit) {
    hit = new Promise<Texture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = PX;
        canvas.getContext('2d')!.drawImage(img, 0, 0, PX, PX);
        resolve(finish(canvas));
      };
      img.onerror = () => reject(new Error(`Texture ${key} non disegnata`));
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${PX}" height="${PX}">${inner}</svg>`;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    cache.set(key, hit);
  }
  return hit;
}

/** Faccia di una piastrella (o la sua sagoma pallida per il muro vuoto). */
export const tileTexture = (color: Color, ghost = false) =>
  svgTexture(
    `${color}${ghost ? 'g' : ''}`,
    renderToStaticMarkup(
      <>
        <TileDefsContent />
        <TileFace color={color} ghost={ghost} />
      </>,
    ),
  );

export const firstTexture = () =>
  svgTexture(
    'first',
    renderToStaticMarkup(
      <>
        <TileDefsContent />
        <FirstToken />
      </>,
    ),
  );

function rand(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function woodTexture(tone: [number, number, number] = [122, 75, 42], repeat = 3): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const r = rand(11);
  const planks = 6;
  const h = c.height / planks;
  for (let i = 0; i < planks; i++) {
    const k = 0.85 + r() * 0.2;
    g.fillStyle = `rgb(${Math.round(tone[0] * k)}, ${Math.round(tone[1] * k)}, ${Math.round(tone[2] * k)})`;
    g.fillRect(0, i * h, c.width, h);
    for (let n = 0; n < 70; n++) {
      const y = i * h + r() * h;
      g.strokeStyle = `rgba(${r() < 0.5 ? '60,34,18' : '150,98,58'}, ${0.08 + r() * 0.12})`;
      g.lineWidth = 0.6 + r() * 1.6;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= c.width; x += 64) g.lineTo(x, y + Math.sin(x / 140 + n) * (2 + r() * 3));
      g.stroke();
    }
    g.fillStyle = 'rgba(30,16,6,0.75)';
    g.fillRect(0, i * h, c.width, 3);
  }
  return finish(c, repeat);
}

export function feltTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const r = rand(5);
  g.fillStyle = '#1f5a3c';
  g.fillRect(0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    img.data[i] = Math.max(0, img.data[i]! + n);
    img.data[i + 1] = Math.max(0, img.data[i + 1]! + n);
    img.data[i + 2] = Math.max(0, img.data[i + 2]! + n);
  }
  g.putImageData(img, 0, 0);
  return finish(c, 10);
}
