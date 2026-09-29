/**
 * Filleted extrusions: a closed 2D outline pushed along an axis with rounded
 * edges and rounded convex corners. Used for fan scrolls, screw-compressor
 * rotor housings and belt guards — shapes a lathe or box cannot make.
 */

import type { Mesh, Vec3 } from "../types.ts";
import type { Axis } from "./mesh.ts";

const r4 = (n: number) => {
  const v = Math.round(n * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
};

function push(m: Mesh, p: Vec3, n: Vec3): number {
  m.positions.push(r4(p[0]), r4(p[1]), r4(p[2]));
  m.normals.push(r4(n[0]), r4(n[1]), r4(n[2]));
  return m.positions.length / 3 - 1;
}

/** Same right-handed frames as `cylinder`: x-axis → (u, v) = (y, z), y → (z, x), z → (x, y). */
function frame(axis: Axis) {
  if (axis === "x") return (u: number, v: number, w: number): Vec3 => [w, u, v];
  if (axis === "y") return (u: number, v: number, w: number): Vec3 => [v, w, u];
  return (u: number, v: number, w: number): Vec3 => [u, v, w];
}

type P2 = [number, number];

const area2 = (pts: P2[]) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};

/** Ear-clipping triangulation of a simple CCW polygon (indices into `pts`). */
export function triangulate(pts: P2[]): [number, number, number][] {
  const idx = pts.map((_, i) => i);
  const out: [number, number, number][] = [];
  const cross = (a: P2, b: P2, c: P2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: P2, a: P2, b: P2, c: P2) => cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]!;
      const i1 = idx[k]!;
      const i2 = idx[(k + 1) % idx.length]!;
      const a = pts[i0]!;
      const b = pts[i1]!;
      const c = pts[i2]!;
      const cr = cross(a, b, c);
      if (cr <= 1e-12) {
        if (Math.abs(cr) <= 1e-12) {
          // Collinear point: drop it without emitting a sliver.
          idx.splice(k, 1);
          clipped = true;
          break;
        }
        continue;
      }
      let ear = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inside(pts[j]!, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}

/**
 * Extrude a closed outline (given in the plane perpendicular to `axis`, as
 * `cylinder` centres) from `w0` to `w1`. Edges get a quarter-round fillet of
 * radius `fillet`; convex corners sharper than `crease` degrees are rounded
 * with the same radius, so the part reads as cast or folded sheet metal.
 */
export function extrudeRounded(
  m: Mesh,
  axis: Axis,
  input: P2[],
  w0: number,
  w1: number,
  fillet: number,
  opts: { steps?: number; crease?: number } = {},
): Mesh {
  const f = frame(axis);
  const steps = opts.steps ?? 3;
  const crease = ((opts.crease ?? 30) * Math.PI) / 180;
  let pts = input.filter((p, i) => {
    const q = input[(i + 1) % input.length]!;
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7;
  });
  if (area2(pts) < 0) pts = pts.slice().reverse();
  const n = pts.length;
  const fr = Math.max(1e-4, Math.min(fillet, (w1 - w0) / 2 - 1e-5));

  // Outward edge normals (CCW outline → normal is the right of travel).
  const en: P2[] = pts.map((p, i) => {
    const q = pts[(i + 1) % n]!;
    const du = q[0] - p[0];
    const dv = q[1] - p[1];
    const l = Math.hypot(du, dv) || 1;
    return [dv / l, -du / l];
  });

  // Wall entries: an inset point plus an outward normal. Sharp convex corners
  // fan several normals around one inset point, which rounds the corner.
  const inset: P2[] = [];
  const entries: { i: number; n: P2 }[] = [];
  for (let i = 0; i < n; i++) {
    const a = en[(i + n - 1) % n]!;
    const b = en[i]!;
    const ang = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
    const bx = a[0] + b[0];
    const by = a[1] + b[1];
    const bl = Math.hypot(bx, by) || 1;
    const bis: P2 = [bx / bl, by / bl];
    const miter = fr / Math.max(0.25, Math.cos(ang / 2));
    const p = pts[i]!;
    inset.push([p[0] - bis[0] * miter, p[1] - bis[1] * miter]);
    if (ang > crease) {
      const k = Math.max(2, Math.ceil(ang / (Math.PI / 10)));
      const a0 = Math.atan2(a[1], a[0]);
      for (let s = 0; s <= k; s++) {
        const t = a0 + (ang * s) / k;
        entries.push({ i, n: [Math.cos(t), Math.sin(t)] });
      }
    } else {
      entries.push({ i, n: bis });
    }
  }

  // Profile across the thickness: [radial offset, w, normal-w, normal-radial].
  const prof: [number, number, number, number][] = [];
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * (Math.PI / 2);
    prof.push([fr * Math.sin(t), w0 + fr - fr * Math.cos(t), -Math.cos(t), Math.sin(t)]);
  }
  for (let s = 0; s <= steps; s++) {
    const t = (s / steps) * (Math.PI / 2);
    prof.push([fr * Math.cos(t), w1 - fr + Math.sin(t) * fr, Math.sin(t), Math.cos(t)]);
  }

  const L = entries.length;
  const rings: number[][] = prof.map(([r, w, nw, nr]) =>
    entries.map((e) => {
      const q = inset[e.i]!;
      return push(m, f(q[0] + e.n[0] * r, q[1] + e.n[1] * r, w), f(e.n[0] * nr, e.n[1] * nr, nw));
    }),
  );
  const P = (id: number): Vec3 => [m.positions[id * 3]!, m.positions[id * 3 + 1]!, m.positions[id * 3 + 2]!];
  const tri = (a: number, b: number, c: number) => {
    const A = P(a);
    const B = P(b);
    const C = P(c);
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const g = Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!);
    if (g > 1e-10) m.indices.push(a, b, c);
  };
  for (let s = 0; s + 1 < rings.length; s++) {
    const A = rings[s]!;
    const B = rings[s + 1]!;
    for (let j = 0; j < L; j++) {
      const k = (j + 1) % L;
      tri(A[j]!, A[k]!, B[k]!);
      tri(A[j]!, B[k]!, B[j]!);
    }
  }

  // Caps on the inset outline.
  const tris = triangulate(inset);
  for (const [w, dir] of [
    [w0, -1],
    [w1, 1],
  ] as const) {
    const nrm = f(0, 0, dir);
    const ids = inset.map((q) => push(m, f(q[0], q[1], w), nrm));
    for (const [a, b, c] of tris) {
      if (dir > 0) tri(ids[a]!, ids[b]!, ids[c]!);
      else tri(ids[a]!, ids[c]!, ids[b]!);
    }
  }
  return m;
}
