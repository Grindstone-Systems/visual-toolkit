import { FONT, renderSvg, type RenderOptions } from "../render.ts";
import { decodeJsonCode, encodeJsonCode } from "../share.ts";
import { cylinder, emptyMesh, roundedDisc, sweep, type Mesh } from "../spatial/mesh.ts";
import { STYLES } from "../styles.ts";
import { getTheme, type TokenSet } from "../themes.ts";
import { generate, getGenerator } from "../symbols/index.ts";
import { STATES, type ParamValues, type Port, type SpatialModel, type SpatialPort, type StateName, type StyleId, type ThemeId, type TokenName, type Vec3, type VtObject } from "../types.ts";

/**
 * Skid composer: place generated equipment, connect their ports with pipes.
 * The same scene renders as a 2D mimic (SVG) and as a 3D layout; pipes are
 * routed automatically — orthogonal in 2D, over a pipe-rack height in 3D.
 * Scenes are plain data (vt.scene/v0) and travel like recipes.
 */

export const SCENE_SCHEMA = "vt.scene/v0" as const;

export type Rotation = 0 | 90 | 180 | 270;

export interface SceneItem {
  id: string;
  generator: string;
  version?: number;
  params: ParamValues;
  state: StateName;
  /** Top-left of the item's box in scene units (the 2D symbol grid). */
  x: number;
  y: number;
  rotation: Rotation;
  mirror?: boolean;
}

export interface PipeEnd {
  item: string;
  port: string;
}

export interface Pipe {
  id: string;
  from: PipeEnd;
  to: PipeEnd;
}

export interface Scene {
  schema: typeof SCENE_SCHEMA;
  name?: string;
  style?: StyleId;
  theme?: ThemeId;
  items: SceneItem[];
  pipes: Pipe[];
}

export const emptyScene = (): Scene => ({ schema: SCENE_SCHEMA, items: [], pipes: [] });

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

/** Validate untrusted JSON (files, share links) into a Scene. Unknown generators are dropped. */
export function parseScene(v: unknown): Scene {
  const o = v as Partial<Scene> | null;
  if (!o || typeof o !== "object" || o.schema !== SCENE_SCHEMA || !Array.isArray(o.items) || !Array.isArray(o.pipes)) {
    throw new Error("Not a Visual Toolkit scene (vt.scene/v0)");
  }
  const items: SceneItem[] = [];
  for (const it of o.items as Partial<SceneItem>[]) {
    if (!it || typeof it.id !== "string" || typeof it.generator !== "string" || !getGenerator(it.generator)) continue;
    const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
    items.push({
      id: it.id.slice(0, 40),
      generator: it.generator,
      ...(typeof it.version === "number" ? { version: it.version } : {}),
      params: it.params && typeof it.params === "object" ? (it.params as ParamValues) : {},
      state: STATES.includes(it.state as StateName) ? (it.state as StateName) : "normal",
      x: num(it.x),
      y: num(it.y),
      rotation: ROTATIONS.includes(it.rotation as Rotation) ? (it.rotation as Rotation) : 0,
      ...(it.mirror ? { mirror: true } : {}),
    });
  }
  const ids = new Set(items.map((i) => i.id));
  const pipes = (o.pipes as Partial<Pipe>[]).filter(
    (p): p is Pipe => !!p && typeof p.id === "string" && ids.has(p.from?.item as string) && ids.has(p.to?.item as string) && typeof p.from?.port === "string" && typeof p.to?.port === "string",
  );
  const scene: Scene = { schema: SCENE_SCHEMA, items, pipes };
  if (typeof o.name === "string") scene.name = o.name.slice(0, 80);
  if (typeof o.style === "string" && o.style in STYLES) scene.style = o.style;
  if (o.theme === "light" || o.theme === "dark") scene.theme = o.theme;
  return scene;
}

export const encodeSceneCode = (scene: Scene): Promise<string> => encodeJsonCode(scene);
export const decodeSceneCode = async (code: string): Promise<Scene> => parseScene(await decodeJsonCode(code));

/** Next free id for a generator, e.g. "pump-2". */
export function nextItemId(scene: Scene, generator: string): string {
  const base = generator.split(".")[0]!;
  for (let i = 1; ; i++) if (!scene.items.some((it) => it.id === `${base}-${i}`)) return `${base}-${i}`;
}

/** A small transfer skid: tank → valve → pump → valve, with a conveyor alongside. */
export function demoScene(): Scene {
  return {
    schema: SCENE_SCHEMA,
    name: "Transfer skid",
    items: [
      { id: "tank-1", generator: "tank.process", params: { label: "TK-101" }, state: "normal", x: 0, y: 0, rotation: 0 },
      { id: "valve-1", generator: "valve.two-way", params: { label: "XV-101" }, state: "running", x: 110, y: 136, rotation: 0 },
      { id: "pump-1", generator: "pump.centrifugal", params: { label: "P-101" }, state: "running", x: 250, y: 130, rotation: 0 },
      { id: "valve-2", generator: "valve.two-way", params: { label: "XV-102" }, state: "normal", x: 430, y: 20, rotation: 0 },
    ],
    pipes: [
      { id: "l-1", from: { item: "tank-1", port: "outlet" }, to: { item: "valve-1", port: "inlet" } },
      { id: "l-2", from: { item: "valve-1", port: "outlet" }, to: { item: "pump-1", port: "suction" } },
      { id: "l-3", from: { item: "pump-1", port: "discharge" }, to: { item: "valve-2", port: "inlet" } },
    ],
  };
}

/* ------------------------------ geometry ------------------------------ */

type P2 = [number, number];

export interface PlacedItem {
  item: SceneItem;
  vo: VtObject;
  /** Width/height of the item's box after rotation. */
  w: number;
  h: number;
  ports: (Port & { sx: number; sy: number; dir: P2 })[];
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Map a point from the object's viewBox into scene coordinates. */
function toScene(it: SceneItem, vo: VtObject, px: number, py: number): P2 {
  const [vx, vy, vw, vh] = vo.viewBox;
  let x = px - vx;
  let y = py - vy;
  if (it.mirror) x = vw - x;
  // Rotate about the box origin, then shift back into the positive quadrant.
  switch (it.rotation) {
    case 90:
      [x, y] = [vh - y, x];
      break;
    case 180:
      [x, y] = [vw - x, vh - y];
      break;
    case 270:
      [x, y] = [y, vw - x];
      break;
  }
  return [it.x + x, it.y + y];
}

function dirVec(it: SceneItem, deg: number): P2 {
  let d = deg;
  if (it.mirror) d = 180 - d;
  d += it.rotation;
  const r = (n: number) => Math.round(n * 1e6) / 1e6 + 0; // + 0 turns -0 into 0
  return [r(Math.cos(rad(d))), r(Math.sin(rad(d)))];
}

export function placeItem(it: SceneItem): PlacedItem {
  const vo = generate(it.generator, it.params, it.version);
  const [, , vw, vh] = vo.viewBox;
  const quarter = it.rotation === 90 || it.rotation === 270;
  return {
    item: it,
    vo,
    w: quarter ? vh : vw,
    h: quarter ? vw : vh,
    ports: vo.ports.map((p) => {
      const [sx, sy] = toScene(it, vo, p.x, p.y);
      return { ...p, sx, sy, dir: dirVec(it, p.direction) };
    }),
  };
}

/** Orthogonal route between two ports, leaving and entering along their directions. */
export function route2d(a: { sx: number; sy: number; dir: P2 }, b: { sx: number; sy: number; dir: P2 }, stub = 10): P2[] {
  const A0: P2 = [a.sx, a.sy];
  const B0: P2 = [b.sx, b.sy];
  const A1: P2 = [a.sx + a.dir[0] * stub, a.sy + a.dir[1] * stub];
  const B1: P2 = [b.sx + b.dir[0] * stub, b.sy + b.dir[1] * stub];
  const aH = Math.abs(a.dir[0]) > Math.abs(a.dir[1]);
  const bH = Math.abs(b.dir[0]) > Math.abs(b.dir[1]);
  let mid: P2[];
  if (aH && bH) {
    const mx = (A1[0] + B1[0]) / 2;
    mid = [
      [mx, A1[1]],
      [mx, B1[1]],
    ];
  } else if (!aH && !bH) {
    const my = (A1[1] + B1[1]) / 2;
    mid = [
      [A1[0], my],
      [B1[0], my],
    ];
  } else if (aH) mid = [[B1[0], A1[1]]];
  else mid = [[A1[0], B1[1]]];
  const pts = [A0, A1, ...mid, B1, B0];
  // Drop repeated and collinear points.
  const out: P2[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6) continue;
    const r = out[out.length - 2];
    if (q && r && ((Math.abs(r[0] - q[0]) < 1e-6 && Math.abs(q[0] - p[0]) < 1e-6) || (Math.abs(r[1] - q[1]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6))) out.pop();
    out.push(p);
  }
  return out.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
}

/* ------------------------------ 2D render ------------------------------ */

export interface SceneRenderOptions {
  style: StyleId;
  theme: ThemeId;
  tokens?: Partial<TokenSet>;
  animate?: boolean;
  /** Scene-space padding around the content. */
  padding?: number;
  idPrefix?: string;
  /** Draw every port (editor affordance). */
  showPorts?: boolean;
}

export function sceneBounds(placed: PlacedItem[], padding = 20): [number, number, number, number] {
  if (!placed.length) return [0, 0, 400, 240];
  const xs = placed.flatMap((p) => [p.item.x, p.item.x + p.w]);
  const ys = placed.flatMap((p) => [p.item.y, p.item.y + p.h + (p.item.rotation ? 16 : 0)]);
  const x0 = Math.min(...xs) - padding;
  const y0 = Math.min(...ys) - padding;
  return [x0, y0, Math.max(...xs) + padding - x0, Math.max(...ys) + padding - y0];
}

export function pipeRoutes(scene: Scene, placed = scene.items.map(placeItem)) {
  const byId = new Map(placed.map((p) => [p.item.id, p]));
  return scene.pipes.flatMap((pipe) => {
    const a = byId.get(pipe.from.item)?.ports.find((p) => p.id === pipe.from.port);
    const b = byId.get(pipe.to.item)?.ports.find((p) => p.id === pipe.to.port);
    if (!a || !b) return [];
    const size = Math.max(4, Math.min(a.size ?? 10, b.size ?? 10));
    const flowing = byId.get(pipe.from.item)?.item.state === "running" || byId.get(pipe.to.item)?.item.state === "running";
    return [{ pipe, points: route2d(a, b), size, flowing }];
  });
}

/** Upright label position: the symbol's own anchor (mirrored), or under the box once turned. */
function labelAt(item: SceneItem, vo: VtObject, w: number, h: number): P2 | null {
  if (!vo.anchors.label) return null;
  if (item.rotation) return [item.x + w / 2, item.y + h + 9];
  return toScene(item, vo, vo.anchors.label[0], vo.anchors.label[1]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function renderSceneSvg(scene: Scene, opts: SceneRenderOptions): string {
  const prefix = opts.idPrefix ?? "scene";
  const tokens = { ...getTheme(opts.theme).tokens, ...opts.tokens } as Record<TokenName, string>;
  const placed = scene.items.map(placeItem);
  const [bx, by, bw, bh] = sceneBounds(placed, opts.padding ?? 24);
  const routes = pipeRoutes(scene, placed);
  const animate = opts.animate ?? true;

  const pipes = routes
    .map(({ pipe, points, size, flowing }) => {
      const d = points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");
      const flow = flowing && animate ? ` class="vt-flow"` : "";
      return (
        `<g class="vt-pipe" data-pipe="${esc(pipe.id)}">` +
        `<path d="${d}" fill="none" stroke="${tokens["equipment.outline"]}" stroke-width="${size * 0.62 + 2.2}" stroke-linejoin="round" stroke-linecap="butt"/>` +
        `<path d="${d}" fill="none" stroke="${tokens["equipment.secondary"]}" stroke-width="${size * 0.62}" stroke-linejoin="round" stroke-linecap="butt"/>` +
        (flowing
          ? `<path${flow} d="${d}" fill="none" stroke="${tokens["process.liquid"]}" stroke-width="${Math.max(1.4, size * 0.22)}" stroke-dasharray="4 6" stroke-linecap="round"/>`
          : "") +
        `</g>`
      );
    })
    .join("");

  const items = placed
    .map(({ item, vo, w, h }) => {
      const [, , vw, vh] = vo.viewBox;
      // The label is drawn by the scene so it stays upright when the symbol turns.
      const inner = renderSvg(
        { ...vo, label: undefined },
        { style: opts.style, theme: opts.theme, tokens: opts.tokens, state: item.state, animate, idPrefix: `${prefix}-${item.id}`, embedRecipe: false } as RenderOptions,
      )
        .replace(/^<svg /, `<svg x="0" y="0" width="${vw}" height="${vh}" `)
        .replace(/ width="[\d.]+" height="[\d.]+"( class=)/, "$1");
      const t: string[] = [`translate(${item.x} ${item.y})`];
      if (item.rotation === 90) t.push(`translate(${w} 0) rotate(90)`);
      if (item.rotation === 180) t.push(`translate(${w} ${h}) rotate(180)`);
      if (item.rotation === 270) t.push(`translate(0 ${h}) rotate(270)`);
      if (item.mirror) t.push(`translate(${vw} 0) scale(-1 1)`);
      const at = labelAt(item, vo, w, h);
      const label =
        vo.label?.text && at
          ? `<text class="vt-label" x="${at[0]}" y="${at[1]}" text-anchor="middle" dominant-baseline="middle" font-family="${esc(FONT)}" font-size="8" font-weight="600" letter-spacing="0.4" fill="${tokens["text.primary"]}">${esc(vo.label.text)}</text>`
          : "";
      return `<g class="vt-item" data-item="${esc(item.id)}"><g transform="${t.join(" ")}">${inner}</g>${label}</g>`;
    })
    .join("");

  const ports = opts.showPorts
    ? placed
        .flatMap((p) =>
          p.ports.map(
            (q) =>
              `<circle class="vt-port" data-item="${esc(p.item.id)}" data-port="${esc(q.id)}" cx="${q.sx}" cy="${q.sy}" r="3.2" fill="${tokens["state.maintenance"]}" stroke="${tokens["surface.canvas"]}" stroke-width="1.2"/>`,
          ),
        )
        .join("")
    : "";

  const css = animate
    ? `<style>@keyframes ${prefix}-flow{to{stroke-dashoffset:-20}}#${prefix} .vt-flow{animation:${prefix}-flow .9s linear infinite}@media (prefers-reduced-motion:reduce){#${prefix} .vt-flow{animation:none}}</style>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" id="${prefix}" class="vt-scene" viewBox="${bx} ${by} ${bw} ${bh}" width="${bw}" height="${bh}" data-vt-scene="${SCENE_SCHEMA}">` +
    css +
    `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${tokens["surface.canvas"]}"/>` +
    pipes +
    items +
    ports +
    `</svg>`
  );
}

/* ------------------------------ 3D layout ------------------------------ */

/** Metres per 2D scene unit (a 156-unit pump symbol ≈ a 1.6 m pump set). */
export const METRES_PER_UNIT = 0.01;

export interface Placed3d {
  item: SceneItem;
  model: SpatialModel;
  /** World transform: translate then rotate about Y (radians). */
  position: Vec3;
  rotationY: number;
  mirror: boolean;
  ports: (SpatialPort & { world: Vec3; worldDir: Vec3 })[];
}

function modelBoundsXZ(m: SpatialModel) {
  let x0 = Infinity,
    x1 = -Infinity,
    z0 = Infinity,
    z1 = -Infinity;
  for (const n of m.nodes)
    for (let i = 0; i < n.mesh.positions.length; i += 3) {
      const x = n.mesh.positions[i]! + n.translation[0];
      const z = n.mesh.positions[i + 2]! + n.translation[2];
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

export function place3d(scene: Scene): Placed3d[] {
  return scene.items.flatMap((it) => {
    const gen = getGenerator(it.generator, it.version) ?? getGenerator(it.generator);
    if (!gen?.spatial) return [];
    const model = gen.spatial(it.params);
    const p = placeItem(it);
    const { cx, cz } = modelBoundsXZ(model);
    // Scene centre of the item's 2D box → world XZ. 2D +y (down the screen) maps to world +Z.
    const wx = (it.x + p.w / 2) * METRES_PER_UNIT;
    const wz = (it.y + p.h / 2) * METRES_PER_UNIT;
    const rotationY = -rad(it.rotation);
    const mirror = !!it.mirror;
    const xf = (v: Vec3, translate: boolean): Vec3 => {
      let x = v[0] - (translate ? cx : 0);
      const y = v[1];
      let z = v[2] - (translate ? cz : 0);
      if (mirror) x = -x;
      const c = Math.cos(rotationY);
      const s = Math.sin(rotationY);
      [x, z] = [x * c + z * s, -x * s + z * c];
      return translate ? [x + wx, y, z + wz] : [x, y, z];
    };
    return [
      {
        item: it,
        model,
        position: [wx, 0, wz],
        rotationY,
        mirror,
        ports: model.ports.map((q) => ({ ...q, world: xf(q.position, true), worldDir: xf(q.direction, false) })),
        // Consumers apply: T(position) · R_y(rotationY) · S(mirror ? -1 : 1, 1, 1) · T(-cx, 0, -cz)
        centre: [cx, 0, cz] as Vec3,
      } as Placed3d & { centre: Vec3 },
    ];
  });
}

/** 3D pipe runs: out of each port, up to a rack height, across, and down into the other port. */
export function pipeRuns3d(scene: Scene, placed = place3d(scene)) {
  const byId = new Map(placed.map((p) => [p.item.id, p]));
  return scene.pipes.flatMap((pipe) => {
    const a = byId.get(pipe.from.item)?.ports.find((p) => p.id === pipe.from.port);
    const b = byId.get(pipe.to.item)?.ports.find((p) => p.id === pipe.to.port);
    if (!a || !b) return [];
    const stub = 0.18;
    const A1: Vec3 = [a.world[0] + a.worldDir[0] * stub, a.world[1] + a.worldDir[1] * stub, a.world[2] + a.worldDir[2] * stub];
    const B1: Vec3 = [b.world[0] + b.worldDir[0] * stub, b.world[1] + b.worldDir[1] * stub, b.world[2] + b.worldDir[2] * stub];
    const rack = Math.max(A1[1], B1[1]) + 0.22;
    const pts: Vec3[] = [a.world, A1, [A1[0], rack, A1[2]], [B1[0], rack, A1[2]], [B1[0], rack, B1[2]], [B1[0], B1[1], B1[2]], b.world];
    const clean: Vec3[] = [];
    for (const p of pts) {
      const q = clean[clean.length - 1];
      if (q && Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-4) continue;
      clean.push(p);
    }
    const flowing = byId.get(pipe.from.item)?.item.state === "running" || byId.get(pipe.to.item)?.item.state === "running";
    return [{ pipe, points: filletPath(clean, 0.09), flowing }];
  });
}

/** Round the corners of a polyline with small arcs so swept pipes bend smoothly. */
export function filletPath(pts: Vec3[], r: number, steps = 6): Vec3[] {
  if (pts.length < 3) return pts;
  const out: Vec3[] = [pts[0]!];
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const len = (a: Vec3) => Math.hypot(...a);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const a = sub(pts[i - 1]!, p);
    const b = sub(pts[i + 1]!, p);
    const la = len(a);
    const lb = len(b);
    const rr = Math.min(r, la / 2, lb / 2);
    if (rr < 1e-4) {
      out.push(p);
      continue;
    }
    const ua = a.map((v) => v / la) as Vec3;
    const ub = b.map((v) => v / lb) as Vec3;
    const s: Vec3 = [p[0] + ua[0] * rr, p[1] + ua[1] * rr, p[2] + ua[2] * rr];
    const e: Vec3 = [p[0] + ub[0] * rr, p[1] + ub[1] * rr, p[2] + ub[2] * rr];
    // Quadratic Bézier through the corner approximates the bend.
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const q = (1 - t) * (1 - t);
      const m = 2 * (1 - t) * t;
      const w = t * t;
      out.push([q * s[0] + m * p[0] + w * e[0], q * s[1] + m * p[1] + w * e[1], q * s[2] + m * p[2] + w * e[2]]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Pipe meshes (world coordinates) for a scene: swept runs plus end flanges. */
export function pipeMeshes(scene: Scene, radius = 0.045): { id: string; mesh: Mesh; flowing: boolean; path: Vec3[] }[] {
  return pipeRuns3d(scene).map(({ pipe, points, flowing }) => {
    const m = emptyMesh();
    sweep(m, points, radius, 20, true);
    for (const [end, next] of [
      [points[0]!, points[1]!],
      [points[points.length - 1]!, points[points.length - 2]!],
    ] as const) {
      const d: Vec3 = [next[0] - end[0], next[1] - end[1], next[2] - end[2]];
      const ax = Math.abs(d[0]) >= Math.abs(d[1]) && Math.abs(d[0]) >= Math.abs(d[2]) ? "x" : Math.abs(d[1]) >= Math.abs(d[2]) ? "y" : "z";
      const sgn = Math.sign(ax === "x" ? d[0] : ax === "y" ? d[1] : d[2]) || 1;
      const w = ax === "x" ? end[0] : ax === "y" ? end[1] : end[2];
      const c: [number, number] = ax === "x" ? [end[1], end[2]] : ax === "y" ? [end[2], end[0]] : [end[0], end[1]];
      roundedDisc(m, ax, c, radius * 1.75, Math.min(w, w + sgn * 0.03), Math.max(w, w + sgn * 0.03), 0.004, 24);
    }
    void cylinder;
    return { id: pipe.id, mesh: m, flowing, path: points };
  });
}
