import { emptyMesh, lathe, type Mesh } from "../spatial/mesh.ts";
import type { ParamValues, SpatialModel, SpatialNode, SpatialPort, Vec3 } from "../types.ts";
import { PIPE, REDUCED, type PipeSize } from "./pipe.ts";
import { appendAt, arcPath, endLength, heading, hollowSweep, orientAndSeat, pushVertex, quad, tubeX, weldEnd, weldNeckFlange } from "./pipe3d.ts";

/**
 * Stylised 3D pipe fittings from the same params as the 2D symbol.
 *
 * Authored in the XY plane (the 2D drawing plane, +Y up) with the fitting's
 * reference point (centreline intersection, or the midpoint of a spool or
 * reducer) at the origin and end "a" facing −X; the 2D rotation turns the
 * fitting about Z, then the model is seated on y = 0. Sizes are real
 * (ISO pipe OD, ASME B16.9 centre-to-end, EN 1092-1 PN 16 weld-neck
 * flanges), so a DN 80 port mates with any other DN 80 port.
 *
 * Butt-weld ends put the bevel at the B16.9 centre-to-end distance; flanged
 * ends add a weld-neck flange beyond it, so the port (the flange face) is at
 * centre-to-end + flange height.
 */

const SEG = 44;

interface End3 {
  id: string;
  /** Butt-weld end position (fitting body stops here, or just inside for bevels). */
  at: Vec3;
  dir: Vec3;
  size: PipeSize;
}

export function pipeFitting3d(p: ParamValues): SpatialModel {
  const type = String(p.fitting);
  const flanged = p.ends === "flanged";
  const s = PIPE[String(p.size)]!;
  const small = PIPE[REDUCED[String(p.size)]!]!;
  const ro = s.od / 2;
  const ri = ro - s.wall;
  const nodes: SpatialNode[] = [];
  const body = emptyMesh();
  // Welded ends keep their bevel inside the centre-to-end length.
  const inset = (sz: PipeSize) => (flanged ? 0 : endLength(sz, false));
  const ends: End3[] = [];

  if (type === "spool" || type === "reducer") {
    const far = type === "reducer" ? small : s;
    // Spool length is face to face; the reducer is its B16.9 length plus any flanges.
    const L =
      type === "spool"
        ? Math.max(Number(p.length) / 1000, endLength(s, flanged) * 2 + 0.03) - (flanged ? 2 * s.flange.h : 0)
        : s.reducer;
    const x0 = -L / 2;
    const x1 = L / 2;
    ends.push({ id: "a", at: [x0, 0, 0], dir: [-1, 0, 0], size: s }, { id: "b", at: [x1, 0, 0], dir: [1, 0, 0], size: far });
    const w0 = x0 + inset(s);
    const w1 = x1 - inset(far);
    if (type === "spool") tubeX(body, ro, ri, w0, w1, SEG);
    else {
      const r2 = far.od / 2;
      const i2 = r2 - far.wall;
      const a = w0 + (w1 - w0) * 0.2;
      const b = w1 - (w1 - w0) * 0.2;
      lathe(body, "x", [0, 0], [
        [ri, w0],
        [ro, w0],
        [ro, a],
        [r2, b],
        [r2, w1],
        [i2, w1],
        [i2, b],
        [ri, a],
        [ri, w0],
      ], SEG);
    }
  } else if (type === "elbow-90" || type === "elbow-45") {
    const turn = type === "elbow-90" ? Math.PI / 2 : Math.PI / 4;
    const C = type === "elbow-90" ? s.elbow90 : s.elbow45;
    const T = C - inset(s);
    const R = T / Math.tan(turn / 2);
    const out: Vec3 = [Math.cos(turn), Math.sin(turn), 0];
    ends.push({ id: "a", at: [-C, 0, 0], dir: [-1, 0, 0], size: s }, { id: "b", at: [out[0] * C, out[1] * C, 0], dir: out, size: s });
    hollowSweep(body, arcPath([-T, 0, 0], 0, R, turn, type === "elbow-90" ? 36 : 20), ro, ri, SEG);
  } else {
    // Equal tee: run along X, branch up +Y, the branch meeting the run on its saddle curve.
    const C = s.tee;
    const T = C - inset(s);
    ends.push(
      { id: "a", at: [-C, 0, 0], dir: [-1, 0, 0], size: s },
      { id: "b", at: [C, 0, 0], dir: [1, 0, 0], size: s },
      { id: "c", at: [0, C, 0], dir: [0, 1, 0], size: s },
    );
    teeBody(body, ro, ri, T);
  }

  nodes.push({ id: "body", role: "body", label: "Fitting body", finish: "paint", mesh: body, translation: [0, 0, 0] });

  const flangeMesh = emptyMesh();
  const bolts = emptyMesh();
  const welds = emptyMesh();
  const ports: SpatialPort[] = [];
  for (const e of ends) {
    const ang = heading(e.dir);
    if (flanged) {
      const [f, b] = weldNeckFlange(e.size, SEG);
      const face: Vec3 = [e.at[0] + e.dir[0] * e.size.flange.h, e.at[1] + e.dir[1] * e.size.flange.h, 0];
      appendAt(flangeMesh, f, ang, face);
      appendAt(bolts, b, ang, face);
      ports.push({ id: e.id, kind: "bidirectional", position: face, direction: e.dir, size: e.size.od });
    } else {
      appendAt(welds, weldEnd(e.size, SEG), ang, e.at);
      ports.push({ id: e.id, kind: "bidirectional", position: e.at, direction: e.dir, size: e.size.od });
    }
  }
  if (flanged) {
    nodes.push({ id: "flanges", role: "flange", label: "Weld-neck flanges", finish: "cast", mesh: flangeMesh, translation: [0, 0, 0] });
    nodes.push({ id: "flange-bolts", role: "detail", label: "Flange nuts", finish: "steel", mesh: bolts, translation: [0, 0, 0] });
  } else {
    nodes.push({ id: "welds", role: "detail", label: "Weld bevels", finish: "steel", mesh: welds, translation: [0, 0, 0] });
  }

  const model: SpatialModel = { nodes, ports, animations: [], badge: [0, 0, 0] };
  return orientAndSeat(model, (-Number(p.rotation) * Math.PI) / 180, 0.14);
}

/**
 * Tee run (hollow, X from −t to t) with the branch opening cut out, and the
 * branch (hollow, up to y = t) whose outer and inner walls start on the
 * run's outer and inner saddle curves.
 */
function teeBody(m: Mesh, ro: number, ri: number, t: number) {
  const NX = 64;
  const NT = 48;
  const cyl = (r: number, inward: boolean, hole: number) => {
    const ids: number[][] = [];
    const inside: boolean[][] = [];
    for (let i = 0; i <= NX; i++) {
      const x = -t + (2 * t * i) / NX;
      ids.push([]);
      inside.push([]);
      for (let j = 0; j <= NT; j++) {
        const a = (j / NT) * Math.PI * 2;
        const y = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const n: Vec3 = inward ? [0, -Math.cos(a), -Math.sin(a)] : [0, Math.cos(a), Math.sin(a)];
        ids[i]!.push(pushVertex(m, [x, y, z], n));
        inside[i]!.push(y > 0 && x * x + z * z < hole * hole - 1e-9);
      }
    }
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NT; j++) {
        if (inside[i]![j] && inside[i + 1]![j] && inside[i + 1]![j + 1] && inside[i]![j + 1]) continue;
        quad(m, ids[i]![j]!, ids[i + 1]![j]!, ids[i + 1]![j + 1]!, ids[i]![j + 1]!);
      }
    }
  };
  cyl(ro, false, ro);
  cyl(ri, true, ri);
  // Branch walls, from the saddle up to the branch end.
  const branch = (r: number, run: number, inward: boolean) => {
    const rows = 8;
    const ids: number[][] = [];
    for (let k = 0; k <= rows; k++) {
      ids.push([]);
      for (let j = 0; j <= NT; j++) {
        const a = (j / NT) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const y0 = Math.sqrt(Math.max(0, run * run - z * z));
        const y = y0 + ((t - y0) * k) / rows;
        const n: Vec3 = inward ? [-Math.cos(a), 0, -Math.sin(a)] : [Math.cos(a), 0, Math.sin(a)];
        ids[k]!.push(pushVertex(m, [x, y, z], n));
      }
    }
    for (let k = 0; k < rows; k++) for (let j = 0; j < NT; j++) quad(m, ids[k]![j]!, ids[k + 1]![j]!, ids[k + 1]![j + 1]!, ids[k]![j + 1]!);
  };
  branch(ro, ro, false);
  branch(ri, ri, true);
}
