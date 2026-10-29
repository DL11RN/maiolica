/**
 * Tavolo 3D (PC): le fornaci in cerchio al centro del feltro con il mucchio comune in mezzo, le
 * plance dei giocatori intorno (la propria davanti). Le piastrelle sono lastrine smaltate con la
 * stessa grafica del 2D. Trascinando si ruota la vista, con la rotella si avvicina.
 *
 * Coordinate: 1 unità = una piastrella; y verso l'alto; la propria plancia sta verso +z.
 */
import { FLOOR_SIZE, seatName, wallColor, type Color, type GameView, type PlayerState, type Source } from '@maiolica/shared';
import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useMemo, useState } from 'react';
import type { Texture } from 'three';
import type { GameSummary } from '../api';
import { colorOf } from '../game/colors';
import type { PlayControls } from '../game/play';
import { TILE_BASE } from '../game/TileFace';
import { useGame } from '../store';
import { feltTexture, firstTexture, tileTexture, woodTexture } from './textures';

type Props = { game: GameSummary; view: GameView; c: PlayControls; narrow: boolean };

const T = 0.9; // lato della piastrella
const H = 0.16; // spessore
const STEP = 1.05; // passo tra le caselle
const BOARD_W = 12.4;
const BOARD_D = 7.6;
const BOARD_H = 0.14;
const AMBER = '#ffc46e';

/** Un clic vale solo se il puntatore non si è spostato (altrimenti era un trascinamento). */
const click = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation();
  if (e.delta > 6) return;
  fn();
};
const hover = (on: boolean) => (e: ThreeEvent<PointerEvent>) => {
  e.stopPropagation();
  document.body.style.cursor = on ? 'pointer' : '';
};

function useTex(load: () => Promise<Texture>, deps: unknown[]) {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((t) => alive && setTex(t));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return tex;
}

/** Una piastrella smaltata (o il segnalino del primo giocatore se `color` manca). */
const Tile3D = memo(function Tile3D({
  color,
  position,
  rotation = 0,
  lift = 0,
  glow,
  onPick,
}: {
  color?: Color;
  position: [number, number, number];
  rotation?: number;
  lift?: number;
  glow?: boolean;
  onPick?: () => void;
}) {
  const tex = useTex(() => (color === undefined ? firstTexture() : tileTexture(color)), [color]);
  const base = color === undefined ? '#efe6d2' : TILE_BASE[color];
  const interactive = onPick
    ? { onClick: click(onPick), onPointerOver: hover(true), onPointerOut: hover(false) }
    : {};
  return (
    <group position={[position[0], position[1] + H / 2 + lift, position[2]]} rotation={[0, rotation, 0]} {...interactive}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[T, H, T]} />
        <meshStandardMaterial
          color={base}
          emissive={glow ? AMBER : '#000000'}
          emissiveIntensity={glow ? 0.45 : 0}
          roughness={0.35}
          metalness={0.05}
        />
      </mesh>
      <mesh position={[0, H / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[T, T]} />
        {tex ? (
          <meshStandardMaterial key="map" map={tex} roughness={0.22} metalness={0.05} emissive={glow ? AMBER : '#000000'} emissiveIntensity={glow ? 0.25 : 0} />
        ) : (
          <meshStandardMaterial key="plain" color={base} roughness={0.3} />
        )}
      </mesh>
    </group>
  );
});

/** Sagoma pallida di una casella del muro ancora vuota. */
const Ghost = memo(function Ghost({ color, position }: { color: Color; position: [number, number, number] }) {
  const tex = useTex(() => tileTexture(color, true), [color]);
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[T, T]} />
      {tex ? <meshStandardMaterial key="map" map={tex} transparent roughness={0.9} /> : <meshStandardMaterial key="plain" color="#3a2a1c" />}
    </mesh>
  );
});

/** Casella incassata nella plancia; `target` = illuminata e cliccabile. */
function Slot({ position, target, onPick }: { position: [number, number, number]; target?: boolean; onPick?: () => void }) {
  return (
    <mesh
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      {...(target && onPick ? { onClick: click(onPick), onPointerOver: hover(true), onPointerOut: hover(false) } : {})}
    >
      <planeGeometry args={[T + 0.04, T + 0.04]} />
      <meshStandardMaterial
        color={target ? '#6b4a1e' : '#2d1f14'}
        emissive={target ? AMBER : '#000000'}
        emissiveIntensity={target ? 0.4 : 0}
        roughness={0.9}
      />
    </mesh>
  );
}

/** Fascia luminosa sotto una riga o il pavimento: si clicca su tutta la fascia. */
function TargetBand({ x, z, w, onPick }: { x: number; z: number; w: number; onPick: () => void }) {
  return (
    <mesh position={[x, BOARD_H + 0.004, z]} rotation={[-Math.PI / 2, 0, 0]} onClick={click(onPick)} onPointerOver={hover(true)} onPointerOut={hover(false)}>
      <planeGeometry args={[w, STEP]} />
      <meshBasicMaterial color={AMBER} transparent opacity={0.28} depthWrite={false} />
    </mesh>
  );
}

// Posizioni locali sulla plancia (x a destra, z verso chi guarda).
const lineSlot = (row: number, k: number): [number, number] => [-0.9 - k * STEP, -2.75 + row * STEP];
const wallCell = (row: number, col: number): [number, number] => [0.75 + col * STEP, -2.75 + row * STEP];
const floorSlot = (k: number): [number, number] => [-5.55 + k * STEP, 2.75];

function PlayerBoard3D({
  player,
  view,
  c,
  name,
  wood,
  position,
  rotation,
}: {
  player: PlayerState;
  view: GameView;
  c: PlayControls;
  name: string;
  wood: Texture;
  position: [number, number, number];
  rotation: number;
}) {
  const mine = player.seat === view.you;
  const free = view.options.freeWall;
  const y = BOARD_H;
  const active = view.current?.seat === player.seat;
  const floorTarget = mine && !!c.plan && c.offer;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, BOARD_H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[BOARD_W, BOARD_H, BOARD_D]} />
        <meshStandardMaterial map={wood} color="#d9b98c" roughness={0.75} />
      </mesh>
      {/* bordo colorato del giocatore */}
      <mesh position={[0, BOARD_H + 0.003, -BOARD_D / 2 + 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOARD_W - 0.2, 0.14]} />
        <meshStandardMaterial color={colorOf(player.seat)} emissive={colorOf(player.seat)} emissiveIntensity={active ? 0.7 : 0.15} />
      </mesh>
      <Html position={[0, 0.3, -BOARD_D / 2 - 0.45]} center className="label3d-wrap" zIndexRange={[5, 0]}>
        <div className={`label3d ${active ? 'active' : ''}`} style={{ '--pc': colorOf(player.seat) } as React.CSSProperties}>
          <span className="swatch" />
          {name}
          <b className="mono">{player.score}</b>
        </div>
      </Html>

      {/* righe di preparazione */}
      {player.lines.map((line, row) => {
        const target = mine && c.rows.includes(row);
        return (
          <group key={`l${row}`}>
            {target && <TargetBand x={-0.9 - (row * STEP) / 2} z={lineSlot(row, 0)[1]} w={(row + 1) * STEP + 0.1} onPick={() => void c.place(row)} />}
            {Array.from({ length: row + 1 }, (_, k) => {
              const [x, z] = lineSlot(row, k);
              return k < line.count && line.color !== null ? (
                <Tile3D key={k} color={line.color} position={[x, y, z]} onPick={target ? () => void c.place(row) : undefined} />
              ) : (
                <Slot key={k} position={[x, y + 0.002, z]} target={target} onPick={() => void c.place(row)} />
              );
            })}
          </group>
        );
      })}

      {/* muro */}
      {player.wall.map((cells, row) =>
        cells.map((cell, col) => {
          const [x, z] = wallCell(row, col);
          const pick = mine && c.wallTurn && c.pendingRow === row && c.columns.includes(col);
          if (cell !== null) return <Tile3D key={`w${row}${col}`} color={cell} position={[x, y, z]} />;
          return (
            <group key={`w${row}${col}`}>
              <Slot position={[x, y + 0.002, z]} target={pick} onPick={() => void c.wall(col)} />
              {!free && <Ghost color={wallColor(row, col)} position={[x, y + 0.006, z]} />}
            </group>
          );
        }),
      )}

      {/* pavimento */}
      {floorTarget && <TargetBand x={floorSlot(3)[0]} z={floorSlot(0)[1]} w={FLOOR_SIZE * STEP + 0.1} onPick={() => void c.place('floor')} />}
      {Array.from({ length: FLOOR_SIZE }, (_, k) => {
        const [x, z] = floorSlot(k);
        const it = player.floor[k];
        if (it === undefined)
          return <Slot key={`f${k}`} position={[x, y + 0.002, z]} target={floorTarget} onPick={() => void c.place('floor')} />;
        return <Tile3D key={`f${k}`} color={it === 'first' ? undefined : it} position={[x, y, z]} />;
      })}
    </group>
  );
}

/** Fornace: disco di terracotta con fino a quattro piastrelle. */
function Factory3D({ index, tiles, position, c }: { index: number; tiles: Color[]; position: [number, number, number]; c: PlayControls }) {
  const offsets: [number, number][] = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ];
  return (
    <group position={position}>
      <mesh position={[0, 0.09, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.32, 1.4, 0.18, 40]} />
        <meshStandardMaterial color={tiles.length ? '#e4d3b0' : '#9c8b6c'} roughness={0.85} />
      </mesh>
      {tiles.map((color, i) => {
        const chosen = c.plan?.source === index && c.plan.color === color;
        return (
          <Tile3D
            key={i}
            color={color}
            position={[offsets[i]![0], 0.18, offsets[i]![1]]}
            rotation={((i * 37) % 11) * 0.012 - 0.06}
            lift={chosen ? 0.22 : 0}
            glow={chosen}
            onPick={c.offer ? () => c.pick(index, color) : undefined}
          />
        );
      })}
    </group>
  );
}

function Center3D({ view, c }: { view: GameView; c: PlayControls }) {
  const items: (Color | 'first')[] = [...(view.firstInCenter ? (['first'] as const) : []), ...[...view.center].sort()];
  const cols = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(items.length))));
  const rows = Math.ceil(items.length / cols);
  return (
    <group>
      {items.map((it, i) => {
        const x = ((i % cols) - (cols - 1) / 2) * 0.98;
        const z = (Math.floor(i / cols) - (rows - 1) / 2) * 0.98;
        if (it === 'first') return <Tile3D key="first" position={[x, 0, z]} rotation={0.2} />;
        const src: Source = 'center';
        const chosen = c.plan?.source === src && c.plan.color === it;
        return (
          <Tile3D
            key={i}
            color={it}
            position={[x, 0, z]}
            rotation={((i * 53) % 13) * 0.015 - 0.09}
            lift={chosen ? 0.22 : 0}
            glow={chosen}
            onPick={c.offer ? () => c.pick(src, it) : undefined}
          />
        );
      })}
    </group>
  );
}

/** Dove sta ogni plancia, a partire dalla propria (davanti): 0 davanti, 1 sinistra, 2 di fronte, 3 destra. */
const SLOTS: Record<number, number[]> = { 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] };
const SLOT_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];

function Scene({ game, view, c }: Props) {
  const wood = useMemo(() => woodTexture([150, 104, 64], 1), []);
  const tableWood = useMemo(() => woodTexture(), []);
  const felt = useMemo(() => feltTexture(), []);
  const n = view.players.length;
  const nf = view.factories.length;
  const ring = 3.4 + nf * 0.25;
  const dist = ring + 1.6 + BOARD_D / 2 + 0.6;
  const me = view.you ?? 0;
  const quality = useGame((s) => s.quality);
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#ffe9c8', '#2a180c', 0.45]} />
      <directionalLight
        position={[6, 18, 10]}
        intensity={1.6}
        castShadow={quality === 'alta'}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        shadow-normalBias={0.02}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial map={tableWood} roughness={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]} receiveShadow>
        <circleGeometry args={[dist + BOARD_D / 2 + 3, 64]} />
        <meshStandardMaterial map={felt} roughness={1} />
      </mesh>

      {view.factories.map((tiles, i) => {
        // La fornace 0 sta verso di me, le altre in senso orario.
        const a = Math.PI / 2 + (i / nf) * Math.PI * 2;
        return <Factory3D key={i} index={i} tiles={tiles} c={c} position={[Math.cos(a) * ring, 0, Math.sin(a) * ring]} />;
      })}
      <Center3D view={view} c={c} />

      {view.players.map((p) => {
        const rel = (p.seat - me + n) % n;
        const slot = SLOTS[n]?.[rel] ?? rel;
        const rot = SLOT_ROT[slot]!;
        const name = p.seat === view.you ? 'Tu' : seatName(game.players[p.seat]!);
        return (
          <PlayerBoard3D
            key={p.seat}
            player={p}
            view={view}
            c={c}
            name={name}
            wood={wood}
            position={[Math.sin(rot) * dist, 0, Math.cos(rot) * dist]}
            rotation={rot}
          />
        );
      })}
    </>
  );
}

export function Board3D(props: Props) {
  const quality = useGame((s) => s.quality);
  const nf = props.view.factories.length;
  const ring = 3.4 + nf * 0.25;
  const dist = ring + 1.6 + BOARD_D / 2 + 0.6;
  // Vista iniziale: da dietro la propria plancia, inclinata, con fornaci e plancia in campo.
  const target: [number, number, number] = [0, 0, dist * 0.45];
  useEffect(() => () => void (document.body.style.cursor = ''), []);
  return (
    <div className="board-3d">
      <Canvas
        shadows={quality === 'alta'}
        dpr={quality === 'alta' ? [1, 2] : 1}
        camera={{ position: [0, dist * 1.55, dist * 1.75], fov: 40, near: 0.1, far: 300 }}
        gl={{ antialias: quality === 'alta' }}
      >
        <color attach="background" args={['#2a180c']} />
        <fog attach="fog" args={['#2a180c', 45, 110]} />
        <Scene {...props} />
        <OrbitControls
          makeDefault
          target={target}
          enableDamping
          dampingFactor={0.12}
          maxPolarAngle={1.25}
          minDistance={6}
          maxDistance={60}
          enablePan
          screenSpacePanning={false}
        />
      </Canvas>
    </div>
  );
}
