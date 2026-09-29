/**
 * Tiny mesh toolkit for stylised equipment: boxes and cylinders with flat
 * caps and smooth sides, merged per region. Units are metres, Y up (glTF).
 * Output is rounded so generated models are deterministic byte-for-byte.
 */

import type { Mesh, Vec3 } from "../types.ts";

export type { Mesh, Vec3 };
export type Axis = "x" | "y" | "z";

export const emptyMesh = (): Mesh => ({ positions: [], normals: [], indices: [] });

const r4 = (n: number) => {
  const v = Math.round(n * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
};

function push(m: Mesh, p: Vec3, n: Vec3): number {
  m.positions.push(r4(p[0]), r4(p[1]), r4(p[2]));
  m.normals.push(r4(n[0]), r4(n[1]), r4(n[2]));
  return m.positions.length / 3 - 1;
}

/** Map a local (u, v, w) frame onto world axes: w runs along `axis`. */
function frame(axis: Axis) {
  // Right-handed frames so triangle winding stays outward-facing.
  if (axis === "x") return (u: number, v: number, w: number): Vec3 => [w, u, v];
  if (axis === "y") return (u: number, v: number, w: number): Vec3 => [v, w, u];
  return (u: number, v: number, w: number): Vec3 => [u, v, w];
}

/** Axis-aligned box from min corner to max corner. */
export function box(m: Mesh, min: Vec3, max: Vec3): Mesh {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const faces: [Vec3, Vec3[]][] = [
    [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
    [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
    [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, q] of faces) {
    const [a, b, c, d] = q.map((p) => push(m, p, n)) as [number, number, number, number];
    m.indices.push(a, b, c, a, c, d);
  }
  return m;
}

/**
 * Cylinder along `axis` from `from` to `to`, through `center` given in the
 * other two coordinates: x-axis → [y, z], y-axis → [z, x], z-axis → [x, y].
 * Smooth sides, flat caps.
 */
export function cylinder(m: Mesh, axis: Axis, center: [number, number], radius: number, from: number, to: number, segments = 32): Mesh {
  const f = frame(axis);
  const [cu, cv] = center;
  const w0 = Math.min(from, to);
  const w1 = Math.max(from, to);
  const ring = (w: number) => {
    const ids: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      const u = Math.cos(t);
      const v = Math.sin(t);
      ids.push(push(m, f(cu + u * radius, cv + v * radius, w), f(u, v, 0)));
    }
    return ids;
  };
  // Sides (smooth normals).
  const a = ring(w0);
  const b = ring(w1);
  for (let i = 0; i < segments; i++) m.indices.push(a[i]!, b[i + 1]!, b[i]!, a[i]!, a[i + 1]!, b[i + 1]!);
  // Caps.
  for (const [w, dir] of [
    [w0, -1],
    [w1, 1],
  ] as const) {
    const n = f(0, 0, dir);
    const c = push(m, f(cu, cv, w), n);
    const ids: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      ids.push(push(m, f(cu + Math.cos(t) * radius, cv + Math.sin(t) * radius, w), n));
    }
    for (let i = 0; i < segments; i++) {
      if (dir > 0) m.indices.push(c, ids[i]!, ids[i + 1]!);
      else m.indices.push(c, ids[i + 1]!, ids[i]!);
    }
  }
  return m;
}

/** Mirror across the YZ plane (x → −x), keeping faces outward. */
export function mirrorMeshX(m: Mesh): Mesh {
  const out = emptyMesh();
  for (let i = 0; i < m.positions.length; i += 3) {
    out.positions.push(r4(-m.positions[i]!), m.positions[i + 1]!, m.positions[i + 2]!);
    out.normals.push(r4(-m.normals[i]!), m.normals[i + 1]!, m.normals[i + 2]!);
  }
  for (let i = 0; i < m.indices.length; i += 3) out.indices.push(m.indices[i]!, m.indices[i + 2]!, m.indices[i + 1]!);
  return out;
}

export function bounds(meshes: { mesh: Mesh; translation: Vec3 }[]): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { mesh, translation } of meshes) {
    for (let i = 0; i < mesh.positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = mesh.positions[i + k]! + translation[k]!;
        if (v < min[k]!) min[k] = v;
        if (v > max[k]!) max[k] = v;
      }
    }
  }
  return { min, max };
}

/* ------------------------------------------------------------------ */
/* Higher-fidelity primitives                                          */
/* ------------------------------------------------------------------ */

/** A profile point for `lathe`: radius from the axis, and position along it. */
export type ProfilePoint = [r: number, w: number];

/**
 * Surface of revolution around `axis` (centre as in `cylinder`). The profile
 * runs from the axis at the low end, outwards, along, and back to the axis at
 * the high end. Normals are smooth where the profile turns gently and crisp at
 * real corners, which gives machined parts their highlights.
 */
export function lathe(m: Mesh, axis: Axis, center: [number, number], input: ProfilePoint[], segments = 40, crease = 34): Mesh {
  const f = frame(axis);
  // Drop repeated points: zero-length segments would produce zero normals.
  const profile = input.filter((p, i) => i === 0 || Math.hypot(p[0] - input[i - 1]![0], p[1] - input[i - 1]![1]) > 1e-7);
  const [cu, cv] = center;
  // Per-segment normal in the (w, r) plane: n = (-dr, dw) → (n_w, n_r).
  const seg = profile.slice(0, -1).map((p, i) => {
    const q = profile[i + 1]!;
    const dw = q[1] - p[1];
    const dr = q[0] - p[0];
    const l = Math.hypot(dw, dr) || 1;
    return [-dr / l, dw / l] as [number, number]; // [n_w, n_r]
  });
  const cosCrease = Math.cos((crease * Math.PI) / 180);
  const nAt = (i: number, side: 0 | 1): [number, number] => {
    const own = seg[i]!;
    const j = side === 0 ? i - 1 : i + 1;
    const other = seg[j];
    if (!other || own[0] * other[0] + own[1] * other[1] < cosCrease) return own;
    const a = own[0] + other[0];
    const b = own[1] + other[1];
    const l = Math.hypot(a, b) || 1;
    return [a / l, b / l];
  };
  for (let i = 0; i < seg.length; i++) {
    const p0 = profile[i]!;
    const p1 = profile[i + 1]!;
    if (p0[0] === 0 && p1[0] === 0) continue;
    const n0 = nAt(i, 0);
    const n1 = nAt(i, 1);
    const ring = (p: ProfilePoint, n: [number, number]) => {
      const ids: number[] = [];
      for (let k = 0; k <= segments; k++) {
        const t = (k / segments) * Math.PI * 2;
        const c = Math.cos(t);
        const s = Math.sin(t);
        ids.push(push(m, f(cu + c * p[0], cv + s * p[0], p[1]), f(c * n[1], s * n[1], n[0])));
      }
      return ids;
    };
    const a = ring(p0, n0);
    const b = ring(p1, n1);
    for (let k = 0; k < segments; k++) {
      if (p0[0] > 0) m.indices.push(a[k]!, a[k + 1]!, b[k + 1]!);
      if (p1[0] > 0) m.indices.push(a[k]!, b[k + 1]!, b[k]!);
    }
  }
  return m;
}

/** Profile for a disc/cylinder with rounded (filleted) outer edges. */
export function roundedDiscProfile(r: number, w0: number, w1: number, fillet: number, steps = 5): ProfilePoint[] {
  const f = Math.min(fillet, r * 0.9, (w1 - w0) / 2);
  const out: ProfilePoint[] = [[0, w0]];
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2);
    out.push([r - f + Math.sin(t) * f, w0 + f - Math.cos(t) * f]);
  }
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2);
    out.push([r - f + Math.cos(t) * f, w1 - f + Math.sin(t) * f]);
  }
  out.push([0, w1]);
  return out;
}

export function roundedDisc(m: Mesh, axis: Axis, center: [number, number], r: number, w0: number, w1: number, fillet: number, segments = 40): Mesh {
  return lathe(m, axis, center, roundedDiscProfile(r, w0, w1, fillet), segments);
}

/** Box with rounded edges and corners (radius `r`), smooth-shaded. */
export function roundedBox(m: Mesh, min: Vec3, max: Vec3, r: number, steps = 3): Mesh {
  const rad = Math.min(r, ...[0, 1, 2].map((k) => (max[k]! - min[k]!) / 2 - 1e-6));
  const coords = (k: number) => {
    const lo = min[k]!;
    const hi = max[k]!;
    const out: number[] = [];
    for (let s = 0; s <= steps; s++) out.push(lo + rad - Math.cos((s / steps) * (Math.PI / 2)) * rad);
    for (let s = 0; s <= steps; s++) out.push(hi - rad + Math.sin((s / steps) * (Math.PI / 2)) * rad);
    return out;
  };
  const C = [coords(0), coords(1), coords(2)];
  const surf = (p: Vec3): [Vec3, Vec3] => {
    const inner = p.map((v, k) => Math.min(max[k]! - rad, Math.max(min[k]! + rad, v))) as Vec3;
    const d = p.map((v, k) => v - inner[k]!) as Vec3;
    const l = Math.hypot(...d) || 1;
    const n = d.map((v) => v / l) as Vec3;
    return [inner.map((v, k) => v + n[k]! * rad) as Vec3, n];
  };
  // [fixed axis, value, u axis, v axis] with u × v = outward normal.
  const faces: [number, number, number, number][] = [
    [0, max[0], 1, 2],
    [0, min[0], 2, 1],
    [1, max[1], 2, 0],
    [1, min[1], 0, 2],
    [2, max[2], 0, 1],
    [2, min[2], 1, 0],
  ];
  for (const [fa, val, ua, va] of faces) {
    const us = C[ua]!;
    const vs = C[va]!;
    const ids: number[][] = [];
    for (let i = 0; i < us.length; i++) {
      ids.push([]);
      for (let j = 0; j < vs.length; j++) {
        const p = [0, 0, 0] as Vec3;
        p[fa] = val;
        p[ua] = us[i]!;
        p[va] = vs[j]!;
        const [pos, n] = surf(p);
        ids[i]!.push(push(m, pos, n));
      }
    }
    for (let i = 0; i + 1 < us.length; i++) {
      for (let j = 0; j + 1 < vs.length; j++) {
        if (Math.abs(us[i + 1]! - us[i]!) < 1e-9 || Math.abs(vs[j + 1]! - vs[j]!) < 1e-9) continue;
        const a = ids[i]![j]!;
        const b = ids[i + 1]![j]!;
        const c = ids[i + 1]![j + 1]!;
        const d = ids[i]![j + 1]!;
        m.indices.push(a, b, c, a, c, d);
      }
    }
  }
  return m;
}

/**
 * Tube swept along a polyline with per-point radii (rotation-minimising
 * frames). Used for volute scrolls, elbows and pipe runs.
 */
export function sweep(m: Mesh, path: Vec3[], radii: number[] | number, segments = 28, caps = true): Mesh {
  const n = path.length;
  const rad = (i: number) => (Array.isArray(radii) ? radii[i]! : radii);
  const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a: Vec3): Vec3 => {
    const l = Math.hypot(...a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const T = path.map((_, i) => norm(sub(path[Math.min(n - 1, i + 1)]!, path[Math.max(0, i - 1)]!)));
  const t0 = T[0]!;
  let N = norm(Math.abs(t0[1]) < 0.9 ? cross(t0, [0, 1, 0]) : cross(t0, [1, 0, 0]));
  const rings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = T[i]!;
    N = norm(sub(N, t.map((v) => v * dot(N, t)) as Vec3));
    const B = cross(t, N);
    const ids: number[] = [];
    for (let k = 0; k <= segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      const dir: Vec3 = [0, 1, 2].map((j) => Math.cos(a) * N[j]! + Math.sin(a) * B[j]!) as Vec3;
      ids.push(push(m, path[i]!.map((v, j) => v + dir[j]! * rad(i)) as Vec3, dir));
    }
    rings.push(ids);
  }
  for (let i = 0; i + 1 < n; i++) {
    const a = rings[i]!;
    const b = rings[i + 1]!;
    for (let k = 0; k < segments; k++) m.indices.push(a[k]!, a[k + 1]!, b[k + 1]!, a[k]!, b[k + 1]!, b[k]!);
  }
  if (caps) {
    for (const [i, sign] of [
      [0, -1],
      [n - 1, 1],
    ] as const) {
      const t = T[i]!.map((v) => v * sign) as Vec3;
      const c = push(m, path[i]!, t);
      const ring = rings[i]!.map((id) => push(m, [m.positions[id * 3]!, m.positions[id * 3 + 1]!, m.positions[id * 3 + 2]!], t));
      for (let k = 0; k < segments; k++) {
        if (sign > 0) m.indices.push(c, ring[k]!, ring[k + 1]!);
        else m.indices.push(c, ring[k + 1]!, ring[k]!);
      }
    }
  }
  return m;
}

/** Append `part` rotated about an axis through `pivot` (for radial fins, lugs). */
export function appendRotated(m: Mesh, part: Mesh, axis: Axis, angle: number, pivot: Vec3): Mesh {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (v: Vec3, translate: boolean): Vec3 => {
    const [x, y, z] = translate ? [v[0] - pivot[0], v[1] - pivot[1], v[2] - pivot[2]] : v;
    const r: Vec3 = axis === "x" ? [x, y * c - z * s, y * s + z * c] : axis === "y" ? [x * c + z * s, y, -x * s + z * c] : [x * c - y * s, x * s + y * c, z];
    return translate ? [r[0] + pivot[0], r[1] + pivot[1], r[2] + pivot[2]] : r;
  };
  const base = m.positions.length / 3;
  for (let i = 0; i < part.positions.length; i += 3) {
    push(
      m,
      rot([part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!], true),
      rot([part.normals[i]!, part.normals[i + 1]!, part.normals[i + 2]!], false),
    );
  }
  for (const idx of part.indices) m.indices.push(base + idx);
  return m;
}

/**
 * Curved blade: a strip between two curves in the plane perpendicular to
 * `axis`, extruded from w0 to w1. Curves are [u, v] points (as `cylinder`
 * centres) and must have the same length. Used for impeller vanes.
 */
export function blade(m: Mesh, axis: Axis, a: [number, number][], b: [number, number][], w0: number, w1: number): Mesh {
  const f = frame(axis);
  const n = a.length;
  const outline = [...a, ...b.slice().reverse()];
  const L = outline.length;
  let area = 0;
  for (let i = 0; i < L; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % L]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const ccw = area > 0;
  // Caps (strip triangulation, safe for thin concave crescents); winding
  // follows the outline direction so caps face outward either way round.
  for (const [w, dir] of [
    [w0, -1],
    [w1, 1],
  ] as const) {
    const nrm = f(0, 0, dir);
    const A = a.map((p) => push(m, f(p[0], p[1], w), nrm));
    const B = b.map((p) => push(m, f(p[0], p[1], w), nrm));
    const forward = (dir > 0) === ccw;
    for (let i = 0; i + 1 < n; i++) {
      if (forward) m.indices.push(A[i]!, A[i + 1]!, B[i + 1]!, A[i]!, B[i + 1]!, B[i]!);
      else m.indices.push(A[i]!, B[i + 1]!, A[i + 1]!, A[i]!, B[i]!, B[i + 1]!);
    }
  }
  // Sides: flat-shaded walls around the outline.
  for (let i = 0; i < L; i++) {
    const p = outline[i]!;
    const q = outline[(i + 1) % L]!;
    const du = q[0] - p[0];
    const dv = q[1] - p[1];
    const len = Math.hypot(du, dv) || 1;
    const nu = (ccw ? dv : -dv) / len;
    const nv = (ccw ? -du : du) / len;
    const nrm = f(nu, nv, 0);
    const i0 = push(m, f(p[0], p[1], w0), nrm);
    const i1 = push(m, f(q[0], q[1], w0), nrm);
    const i2 = push(m, f(q[0], q[1], w1), nrm);
    const i3 = push(m, f(p[0], p[1], w1), nrm);
    if (ccw) m.indices.push(i0, i1, i2, i0, i2, i3);
    else m.indices.push(i0, i2, i1, i0, i3, i2);
  }
  return m;
}
