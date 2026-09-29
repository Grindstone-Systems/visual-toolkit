import { cylinder, emptyMesh, roundedBox, type Mesh } from "../spatial/mesh.ts";
import type { Finish, ParamValues, RegionRole, SpatialModel, SpatialNode, SpatialPort, Vec3 } from "../types.ts";
import { addBeacon, type AddPart } from "./motor3d.ts";
import { PIPE } from "./pipe.ts";
import { appendAt, endLength, orientAndSeat, pushVertex, quad, tubeX, weldEnd, weldNeckFlange } from "./pipe3d.ts";

/**
 * Stylised 3D static mixer from the same params as the 2D symbol.
 *
 * A straight housing of line size along X (flow +X) with weld-neck flanges or
 * butt-weld ends, pipe supports, an optional DN 25 dosing quill and a status
 * beacon. The cutaway sections the housing to show the element train: flat
 * plates twisted 180° over 1.5 D, alternating hand and each turned 90° to the
 * one before (the classic helical-element layout). Vertical runs are turned
 * so flow runs downward, like the 2D symbol.
 */

const SEG = 44;

export function staticMixer3d(p: ParamValues): SpatialModel {
  const s = PIPE[String(p.size)]!;
  const q = PIPE["25"]!;
  const n = Number(p.elements);
  const flanged = p.ends === "flanged";
  const vertical = p.orientation === "vertical";
  const supports = !!p.supports && !vertical;
  const ro = s.od / 2;
  const ri = ro - s.wall;
  const Le = 1.5 * 2 * ri;
  const train = n * Le;
  const L = train + 2 * Math.max(0.6 * 2 * ri, 0.08); // butt-weld end to end
  const AY = s.flange.d / 2 + 0.07;
  const nodes: SpatialNode[] = [];
  const add: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };
  const cut = { section: true };
  const inset = flanged ? 0 : endLength(s, false);

  add("housing", "body", "Mixer housing", "paint", (m) => tubeX(m, ro, ri, -L / 2 + inset, L / 2 - inset, SEG), [0, AY, 0], cut);

  const ports: SpatialPort[] = [];
  const ends: [string, "inlet" | "outlet", number][] = [
    ["inlet", "inlet", -1],
    ["outlet", "outlet", 1],
  ];
  if (flanged) {
    const fl = emptyMesh();
    const bolts = emptyMesh();
    for (const [id, kind, sg] of ends) {
      const face: Vec3 = [sg * (L / 2 + s.flange.h), AY, 0];
      const [f, b] = weldNeckFlange(s, SEG);
      appendAt(fl, f, sg < 0 ? Math.PI : 0, face);
      appendAt(bolts, b, sg < 0 ? Math.PI : 0, face);
      ports.push({ id, kind, position: face, direction: [sg, 0, 0], size: s.od });
    }
    nodes.push({ id: "flanges", role: "flange", label: "End flanges", finish: "cast", mesh: fl, translation: [0, 0, 0], section: true });
    nodes.push({ id: "flange-bolts", role: "detail", label: "Flange nuts", finish: "steel", mesh: bolts, translation: [0, 0, 0], section: true });
  } else {
    const w = emptyMesh();
    for (const [id, kind, sg] of ends) {
      const at: Vec3 = [sg * (L / 2), AY, 0];
      appendAt(w, weldEnd(s, SEG), sg < 0 ? Math.PI : 0, at);
      ports.push({ id, kind, position: at, direction: [sg, 0, 0], size: s.od });
    }
    nodes.push({ id: "welds", role: "detail", label: "Weld bevels", finish: "steel", mesh: w, translation: [0, 0, 0], section: true });
  }

  /* ---------------- helical elements (cutaway) ---------------- */
  add(
    "elements",
    "detail",
    "Mixing elements",
    "cast",
    (m) => {
      const half = ri * 0.965;
      const th = Math.max(0.0025, ri * 0.06);
      for (let k = 0; k < n; k++) helicalElement(m, -train / 2 + k * Le, Le, half, th, (k * Math.PI) / 2, k % 2 ? -1 : 1);
    },
    [0, AY, 0],
    { internal: true },
  );

  /* ---------------- dosing quill ---------------- */
  const qx = -train / 2 - Math.max(0.6 * 2 * ri, 0.08) / 2;
  if (p.injection) {
    const qro = q.od / 2;
    const top = ro + 0.07;
    const base = Math.sqrt(Math.max(0, ri * ri - qro * qro)) - 0.001;
    add("injection-nozzle", "nozzle", "Quill nozzle", "paint", (m) => {
      const tube = emptyMesh();
      tubeX(tube, qro, qro - q.wall, base, top - q.flange.h, 32);
      appendAt(m, tube, Math.PI / 2, [qx, AY, 0]);
    }, [0, 0, 0], cut);
    add("injection-flange", "flange", "Quill flange", "cast", (m) => {
      const [f, b] = weldNeckFlange(q, 36);
      appendAt(m, f, Math.PI / 2, [qx, AY + top, 0]);
      appendAt(m, b, Math.PI / 2, [qx, AY + top, 0]);
    }, [0, 0, 0], cut);
    add("quill", "detail", "Dosing quill tube", "steel", (m) => {
      cylinder(m, "y", [0, qx], q.od * 0.22, AY - ri * 0.1, AY + top - 0.004, 20);
    }, [0, 0, 0], { internal: true });
    ports.push({ id: "injection", kind: "inlet", position: [qx, AY + top, 0], direction: [0, 1, 0], size: q.od });
  }

  /* ---------------- supports ---------------- */
  if (supports) {
    add("supports", "base", "Pipe supports", "paint", (m) => {
      for (const sx of [-1, 1]) {
        const x = sx * L * 0.3;
        const w = Math.max(0.05, ro * 0.9);
        roundedBox(m, [x - w, 0, -ro - 0.04], [x + w, 0.014, ro + 0.04], 0.005, 2);
        roundedBox(m, [x - 0.022, 0.01, -ro * 0.55], [x + 0.022, AY - ro - 0.004, ro * 0.55], 0.006, 2);
        roundedBox(m, [x - 0.028, AY - ro - 0.016, -ro - 0.012], [x + 0.028, AY - ro - 0.002, ro + 0.012], 0.004, 2);
      }
    });
    add("clamps", "detail", "Pipe clamps", "steel", (m) => {
      for (const sx of [-1, 1]) tubeX(m, ro + 0.006, ro, sx * L * 0.3 - 0.018, sx * L * 0.3 + 0.018, SEG);
    });
  }

  let model: SpatialModel = { nodes, ports, animations: [], badge: [0, 0, 0], sectionPlane: { normal: [0, 0, 1], offset: 0 } };
  model = orientAndSeat(model, vertical ? -Math.PI / 2 : 0, 0.18);

  /* ---------------- status beacon (added upright after orienting) ---------------- */
  const a = model.ports.find((x) => x.id === "inlet")!.position;
  const b = model.ports.find((x) => x.id === "outlet")!.position;
  const t = vertical ? 0.72 : 0.78;
  const c: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0];
  const pad = (id: string, role: RegionRole, label: string, finish: Finish, build: (m: Mesh) => void) =>
    model.nodes.push({ id, role, label, finish, mesh: (() => { const m = emptyMesh(); build(m); return m; })(), translation: [0, 0, 0] });
  let beacon: Vec3;
  if (vertical) {
    pad("beacon-pad", "body-secondary", "Beacon bracket", "paint", (m) => roundedBox(m, [c[0] + ro * 0.6, c[1] - 0.012, -0.03], [c[0] + ro + 0.07, c[1] + 0.006, 0.03], 0.004, 2));
    beacon = [c[0] + ro + 0.04, c[1] + 0.006, 0];
  } else {
    pad("beacon-pad", "body-secondary", "Beacon pad", "paint", (m) => roundedBox(m, [c[0] - 0.032, c[1] + ro * 0.75, -0.032], [c[0] + 0.032, c[1] + ro + 0.012, 0.032], 0.005, 2));
    beacon = [c[0], c[1] + ro + 0.012, 0];
  }
  addBeacon((id, role, label, finish, build) => pad(id, role, label, finish, build), beacon);
  model.badge = [model.badge[0], Math.max(model.badge[1], beacon[1] + 0.16), 0];
  return model;
}

/**
 * One helical element along +X: a plate of half-width `half` and thickness
 * `th` twisted by 180° (hand `hand`) over `len`, starting at angle `a0`.
 */
function helicalElement(m: Mesh, x0: number, len: number, half: number, th: number, a0: number, hand: number) {
  const NS = 28;
  const NU = 8;
  const k = (hand * Math.PI) / len; // twist rate (rad per metre)
  const at = (i: number) => {
    const x = x0 + (len * i) / NS;
    const a = a0 + k * (x - x0);
    return { x, e: [0, Math.cos(a), Math.sin(a)] as Vec3, n: [0, -Math.sin(a), Math.cos(a)] as Vec3 };
  };
  const P = (x: number, e: Vec3, nn: Vec3, u: number, side: number): Vec3 => [x, e[1] * u + nn[1] * side * th * 0.5, e[2] * u + nn[2] * side * th * 0.5];
  for (const side of [1, -1]) {
    const ids: number[][] = [];
    for (let i = 0; i <= NS; i++) {
      const { x, e, n } = at(i);
      ids.push([]);
      for (let j = 0; j <= NU; j++) {
        const u = -half + (2 * half * j) / NU;
        // Surface normal of the helicoid: n − u·k·x̂ (normalised), flipped for the back face.
        const l = Math.hypot(1, u * k);
        const nrm: Vec3 = [(-u * k * side) / l, (n[1] * side) / l, (n[2] * side) / l];
        ids[i]!.push(pushVertex(m, P(x, e, n, u, side), nrm));
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NU; j++) quad(m, ids[i]![j]!, ids[i + 1]![j]!, ids[i + 1]![j + 1]!, ids[i]![j + 1]!);
  }
  // Long edges.
  for (const ue of [-1, 1]) {
    const row: [number, number][] = [];
    for (let i = 0; i <= NS; i++) {
      const { x, e, n } = at(i);
      const nrm: Vec3 = [0, e[1] * ue, e[2] * ue];
      row.push([pushVertex(m, P(x, e, n, ue * half, 1), nrm), pushVertex(m, P(x, e, n, ue * half, -1), nrm)]);
    }
    for (let i = 0; i < NS; i++) quad(m, row[i]![0], row[i + 1]![0], row[i + 1]![1], row[i]![1]);
  }
  // Leading and trailing edges.
  for (const [i, sx] of [
    [0, -1],
    [NS, 1],
  ] as const) {
    const { x, e, n } = at(i);
    const nrm: Vec3 = [sx, 0, 0];
    const v = [P(x, e, n, -half, 1), P(x, e, n, half, 1), P(x, e, n, half, -1), P(x, e, n, -half, -1)].map((q) => pushVertex(m, q, nrm));
    quad(m, v[0]!, v[1]!, v[2]!, v[3]!);
  }
}
