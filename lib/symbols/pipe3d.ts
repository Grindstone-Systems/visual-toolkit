import { bounds, cylinder, emptyMesh, lathe, sweep, type Mesh, type ProfilePoint } from "../spatial/mesh.ts";
import type { SpatialModel, Vec3 } from "../types.ts";
import type { PipeSize } from "./pipe.ts";

/**
 * 3D piping helpers shared by fittings, the static mixer and instrument
 * process connections. End features (flanges, weld bevels) are built along a
 * local +X axis with the connection face at x = 0 and the pipe on −X, then
 * placed at a port with `appendAt`, so every end sits exactly on its port.
 */

export const HEX = 6;

const r4 = (n: number) => {
  const v = Math.round(n * 1e4) / 1e4;
  return Object.is(v, -0) ? 0 : v;
};

export function pushVertex(m: Mesh, p: Vec3, n: Vec3): number {
  m.positions.push(r4(p[0]), r4(p[1]), r4(p[2]));
  m.normals.push(r4(n[0]), r4(n[1]), r4(n[2]));
  return m.positions.length / 3 - 1;
}

/**
 * Triangle whose winding is chosen to agree with its vertex normals, so
 * hand-built surfaces always face outward.
 */
export function tri(m: Mesh, a: number, b: number, c: number) {
  const P = m.positions;
  const N = m.normals;
  const u = [0, 1, 2].map((k) => P[b * 3 + k]! - P[a * 3 + k]!);
  const v = [0, 1, 2].map((k) => P[c * 3 + k]! - P[a * 3 + k]!);
  const g = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  const s = [0, 1, 2].map((k) => N[a * 3 + k]! + N[b * 3 + k]! + N[c * 3 + k]!);
  if (g[0]! * s[0]! + g[1]! * s[1]! + g[2]! * s[2]! >= 0) m.indices.push(a, b, c);
  else m.indices.push(a, c, b);
}

export function quad(m: Mesh, a: number, b: number, c: number, d: number) {
  tri(m, a, b, c);
  tri(m, a, c, d);
}

/** Turn a mesh inside out (for bores): reversed winding, negated normals. */
export function inverted(src: Mesh): Mesh {
  return {
    positions: src.positions.slice(),
    normals: src.normals.map((v) => (v === 0 ? 0 : -v)),
    indices: src.indices.map((_, i) => src.indices[i - (i % 3) + [0, 2, 1][i % 3]!]!),
  };
}

export function append(m: Mesh, part: Mesh) {
  const base = m.positions.length / 3;
  m.positions.push(...part.positions);
  m.normals.push(...part.normals);
  for (const i of part.indices) m.indices.push(base + i);
}

/** Append `part` rotated by `angle` about +Z, then moved to `at`. */
export function appendAt(m: Mesh, part: Mesh, angle: number, at: Vec3) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const base = m.positions.length / 3;
  for (let i = 0; i < part.positions.length; i += 3) {
    const [x, y, z] = [part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!];
    const [nx, ny, nz] = [part.normals[i]!, part.normals[i + 1]!, part.normals[i + 2]!];
    pushVertex(m, [x * c - y * s + at[0], x * s + y * c + at[1], z + at[2]], [nx * c - ny * s, nx * s + ny * c, nz]);
  }
  for (const i of part.indices) m.indices.push(base + i);
}

/** Angle about +Z of a direction in the XY plane. */
export const heading = (d: Vec3) => Math.atan2(d[1], d[0]);

/** Hollow straight tube along X from w0 to w1 (both end annuli closed). */
export function tubeX(m: Mesh, ro: number, ri: number, w0: number, w1: number, seg = 40): Mesh {
  return lathe(m, "x", [0, 0], [
    [ri, w0],
    [ro, w0],
    [ro, w1],
    [ri, w1],
    [ri, w0],
  ], seg);
}

/** Open hollow bend along a centreline (no end annuli; ends meet end pieces). */
export function hollowSweep(m: Mesh, path: Vec3[], ro: number, ri: number, seg = 40) {
  sweep(m, path, ro, seg, false);
  const inner = emptyMesh();
  sweep(inner, path, ri, seg, false);
  append(m, inverted(inner));
}

/** Arc centreline in the XY plane from `a` (heading `d1`) turning by `turn` rad (+ = counter-clockwise). */
export function arcPath(a: Vec3, d1: number, radius: number, turn: number, steps: number): Vec3[] {
  const side = Math.sign(turn) || 1;
  const cx = a[0] - Math.sin(d1) * radius * side;
  const cy = a[1] + Math.cos(d1) * radius * side;
  const start = Math.atan2(a[1] - cy, a[0] - cx);
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + (turn * i) / steps;
    out.push([cx + Math.cos(t) * radius, cy + Math.sin(t) * radius, a[2]]);
  }
  return out;
}

/**
 * Weld-neck flange along local +X: raised face at x = 0, hub tapering down to
 * the pipe at x = −h, hexagon nuts on the back face. Returns [flange, bolts].
 */
export function weldNeckFlange(s: PipeSize, seg = 48): [Mesh, Mesh] {
  const f = s.flange;
  const ro = s.od / 2;
  const ri = ro - s.wall;
  const rfH = 0.002;
  const back = -(rfH + f.t);
  const c = Math.min(0.003, f.t / 5);
  const hubR = f.hub / 2;
  const prof: ProfilePoint[] = [
    [ri, -f.h],
    [ro, -f.h],
    [ro + 0.0015, -f.h + 0.004],
    [hubR, back - 0.006],
    [hubR + 0.004, back],
    [f.d / 2 - c, back],
    [f.d / 2, back + c],
    [f.d / 2, -rfH - c],
    [f.d / 2 - c, -rfH],
    [f.rf / 2, -rfH],
    [f.rf / 2, 0],
    [ri, 0],
    [ri, -f.h],
  ];
  const flange = lathe(emptyMesh(), "x", [0, 0], prof, seg);
  const bolts = emptyMesh();
  const nutH = f.nut * 1.4;
  const stud = f.nut * 0.55;
  for (let k = 0; k < f.bolts; k++) {
    const a = ((k + 0.5) / f.bolts) * Math.PI * 2;
    const cy = Math.cos(a) * (f.pcd / 2);
    const cz = Math.sin(a) * (f.pcd / 2);
    cylinder(bolts, "x", [cy, cz], f.nut, back - nutH, back, HEX);
    cylinder(bolts, "x", [cy, cz], stud, back - nutH - stud * 1.2, back - nutH, 12);
  }
  return [flange, bolts];
}

/** Butt-weld end along local +X: a short length with a 37.5° bevel at x = 0. */
export function weldEnd(s: PipeSize, seg = 48): Mesh {
  const ro = s.od / 2;
  const ri = ro - s.wall;
  const bev = s.wall * 0.62;
  const len = Math.max(0.008, s.wall * 1.8);
  return lathe(emptyMesh(), "x", [0, 0], [
    [ri, -len],
    [ro, -len],
    [ro, -bev * 1.3],
    [ro - bev, 0],
    [ri, 0],
    [ri, -len],
  ], seg);
}

/** Length an end feature occupies behind its face. */
export const endLength = (s: PipeSize, flanged: boolean) => (flanged ? s.flange.h : Math.max(0.008, s.wall * 1.8));

/**
 * Rotate a model about +Z (through the origin), then lift it so it sits on
 * y = 0, re-anchoring the badge above it. Ports, pivots and meshes all move.
 */
export function orientAndSeat(model: SpatialModel, angle: number, badgeLift = 0.16): SpatialModel {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = (v: Vec3): Vec3 => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  const nodes = model.nodes.map((n) => {
    if (!angle) return n;
    const m = emptyMesh();
    appendAt(m, n.mesh, angle, [0, 0, 0]);
    return { ...n, mesh: m, translation: rot(n.translation) };
  });
  const b = bounds(nodes);
  const lift = -b.min[1];
  const up = (v: Vec3): Vec3 => [r4(v[0]), r4(v[1] + lift), r4(v[2])];
  // Directions stay exact unit vectors (only float noise is snapped away).
  const clean = (v: Vec3): Vec3 => v.map((x) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12)) as Vec3;
  return {
    ...model,
    nodes: nodes.map((n) => ({ ...n, translation: up(n.translation) })),
    ports: model.ports.map((p) => ({ ...p, position: up(rot(p.position)), direction: clean(rot(p.direction)) })),
    // Keep the badge close enough for the camera framing of small parts.
    badge: [r4(b.min[0] + (b.max[0] - b.min[0]) * 0.1), r4(b.max[1] - b.min[1] + Math.min(badgeLift, 0.03 * Math.hypot(...b.max.map((v, k) => v - b.min[k]!)))), 0],
  };
}
