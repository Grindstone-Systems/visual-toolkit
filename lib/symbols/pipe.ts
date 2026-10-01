import type { Geo } from "../geometry.ts";
import type { ParamDef, Shape } from "../types.ts";

/**
 * Shared pipe sizes for piping families (fittings, static mixer, instrument
 * process connections), so that a DN 80 port on one object always mates
 * with a DN 80 port on another.
 *
 * 3D values are metres: outside diameter per ISO 4200 / ASME B36.10, weld-neck
 * flange per EN 1092-1 PN 16, butt-weld fitting dimensions per ASME B16.9
 * (long-radius elbows). 2D `px` is the drawn pipe width in viewBox units.
 */
export interface PipeSize {
  dn: number;
  /** Outside diameter. */
  od: number;
  /** Wall thickness (stylised, never thinner than 4 mm so bores read). */
  wall: number;
  flange: { d: number; t: number; rf: number; pcd: number; bolts: number; nut: number; hub: number; h: number };
  /** Centre-to-end: 90° long-radius elbow (= bend radius), 45° elbow, equal tee. */
  elbow90: number;
  elbow45: number;
  tee: number;
  /** Concentric reducer length down to the next smaller size. */
  reducer: number;
  /** Drawn pipe width in 2D viewBox units. */
  px: number;
}

const mm = (v: number) => v / 1000;

function size(dn: number, od: number, wall: number, f: [number, number, number, number, number, number, number, number], e90: number, e45: number, tee: number, red: number, px: number): PipeSize {
  const [d, t, rf, pcd, bolts, nutAf, hub, h] = f;
  return {
    dn,
    od: mm(od),
    wall: mm(Math.max(4, wall)),
    // Nut across-flats → hexagon circumradius (six-sided cylinders).
    flange: { d: mm(d), t: mm(t), rf: mm(rf), pcd: mm(pcd), bolts, nut: mm(nutAf / Math.sqrt(3)), hub: mm(hub), h: mm(h) },
    elbow90: mm(e90),
    elbow45: mm(e45),
    tee: mm(tee),
    reducer: mm(red),
    px,
  };
}

export const PIPE: Record<string, PipeSize> = {
  "25": size(25, 33.4, 3.4, [115, 16, 68, 85, 4, 19, 42, 38], 38, 22, 38, 51, 6),
  "40": size(40, 48.3, 3.7, [150, 18, 88, 110, 4, 24, 64, 45], 57, 29, 57, 64, 7),
  "50": size(50, 60.3, 3.9, [165, 18, 102, 125, 4, 24, 75, 45], 76, 35, 64, 76, 8),
  "80": size(80, 88.9, 5.5, [200, 20, 138, 160, 8, 24, 105, 50], 114, 51, 86, 89, 10),
  "100": size(100, 114.3, 6, [220, 20, 158, 180, 8, 24, 131, 52], 152, 64, 105, 102, 12),
  "150": size(150, 168.3, 7.1, [285, 22, 212, 240, 8, 30, 184, 55], 229, 95, 143, 140, 16),
};

/** Sizes offered as a parameter. */
export const LINE_SIZES = ["50", "80", "100", "150"] as const;

/** One size down (concentric reducer outlet). */
export const REDUCED: Record<string, string> = { "50": "40", "80": "50", "100": "80", "150": "100" };

export const sizeParam: ParamDef = {
  key: "size",
  label: "Line size",
  type: "choice",
  options: LINE_SIZES.map((v) => ({ value: v, label: `DN ${v}` })),
  default: "80",
};

export const endsParam: ParamDef = {
  key: "ends",
  label: "Ends",
  type: "choice",
  options: [
    { value: "flanged", label: "Flanged" },
    { value: "welded", label: "Butt-weld" },
  ],
  default: "flanged",
};

/* ------------------------------------------------------------------ */
/* 2D helpers (authored coordinates, emitted through a Geo frame)      */
/* ------------------------------------------------------------------ */

export type P2 = [number, number];

const add = (a: P2, b: P2, k = 1): P2 => [a[0] + b[0] * k, a[1] + b[1] * k];
const unit = (deg: number): P2 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

/** Rectangle of `len` × `w` centred on `c`, its length along `deg` (a rotated flange or stub). */
export function bar(g: Geo, c: P2, deg: number, len: number, w: number): Shape {
  const u = unit(deg);
  const n: P2 = [-u[1], u[0]];
  const pts = [add(add(c, u, -len / 2), n, -w / 2), add(add(c, u, len / 2), n, -w / 2), add(add(c, u, len / 2), n, w / 2), add(add(c, u, -len / 2), n, w / 2)];
  const b = g.path().M(...pts[0]!);
  for (const p of pts.slice(1)) b.L(...p);
  return b.Z().shape();
}

/**
 * Outline of a pipe bend of width `2h`: straight from `a` towards the tangent
 * intersection `p`, an arc of centreline radius `r`, then straight to `b`.
 */
export function bendOutline(g: Geo, a: P2, p: P2, b: P2, r: number, h: number): Shape {
  const d1 = norm([p[0] - a[0], p[1] - a[1]]);
  const d2 = norm([b[0] - p[0], b[1] - p[1]]);
  const turn = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])));
  const t = r * Math.tan(turn / 2);
  const s1 = add(p, d1, -t);
  const s2 = add(p, d2, t);
  // Left normal of travel; which side the arc centre is on decides the sweep.
  const cross = d1[0] * d2[1] - d1[1] * d2[0];
  const n1: P2 = [-d1[1], d1[0]];
  const n2: P2 = [-d2[1], d2[0]];
  const side = cross > 0 ? 1 : -1; // +1: centre on the +n side
  const inner = (q: P2, n: P2) => add(q, n, side * h);
  const outer = (q: P2, n: P2) => add(q, n, -side * h);
  const sweep = (cross > 0 ? 1 : 0) as 0 | 1;
  return g
    .path()
    .M(...inner(a, n1))
    .L(...inner(s1, n1))
    .A(r - h, r - h, 0, sweep, ...inner(s2, n2))
    .L(...inner(b, n2))
    .L(...outer(b, n2))
    .L(...outer(s2, n2))
    .A(r + h, r + h, 0, (1 - sweep) as 0 | 1, ...outer(s1, n1))
    .L(...outer(a, n1))
    .Z()
    .shape();
}

function norm(v: P2): P2 {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}

/** Axis-aligned bounds of authored points after the frame, as a viewBox [x, y, w, h]. */
export function frameBox(g: Geo, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] {
  const pts = [g.pt(x0, y0), g.pt(x1, y0), g.pt(x0, y1), g.pt(x1, y1)];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return [minX, minY, Math.max(...xs) - minX, Math.max(...ys) - minY];
}

/** viewBox + label placement under the content (like labelLayout, for any origin). */
export function boxWithLabel(box: [number, number, number, number], text: string) {
  const [x, y, w, h] = box;
  const t = text.trim();
  if (!t) return { viewBox: box, label: undefined, anchor: undefined };
  return {
    viewBox: [x, y, w, h + 14] as [number, number, number, number],
    label: { text: t },
    anchor: [x + w / 2, y + h + 7] as [number, number],
  };
}
