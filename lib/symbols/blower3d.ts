import { appendRotated, blade, cylinder, emptyMesh, lathe, mirrorMeshX, roundedBox, roundedDisc, sweep, type Mesh, type ProfilePoint } from "../spatial/mesh.ts";
import { extrudeRounded } from "../spatial/extrude.ts";
import type { ParamValues, SpatialModel, SpatialNode, SpatialPort, Vec3 } from "../types.ts";
import { addBeacon, addMotorBody, type AddPart } from "./motor3d.ts";
import { scrollOutline } from "./blower.ts";

/**
 * Stylised 3D centrifugal blower from the same params as the 2D symbol.
 *
 * The wheel axis runs along Z with the inlet cone facing +Z (the 2D symbol's
 * point of view) and the drive behind on −Z. The scroll is the 2D outline
 * extruded with filleted edges, so both tiers share one housing shape. In
 * cutaway the housing is sectioned to show the backward-curved wheel turning.
 * Metres, +Y up.
 */

const HEX = 6;
const S = 0.011; // metres per 2D unit
const HW = 0.13; // housing half-width (along the axis)

/** Convex hull (monotone chain), CCW. */
function hull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (const q of p.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function centrifugalBlower3d(p: ParamValues): SpatialModel {
  const up = p.discharge !== "side";
  const drive = String(p.drive);
  const detail = String(p.detail);
  const fine = detail !== "simple";
  const seg = detail === "simple" ? 28 : detail === "detailed" ? 56 : 44;
  const nodes: SpatialNode[] = [];
  const add: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };
  const cut = { section: true } as const;

  // Housing outline in metres, discharge-up frame, wheel centre at the origin.
  const outline2 = scrollOutline(5).map(([x, y]) => [x * S, -y * S] as [number, number]);
  // "Side" turns the scroll a quarter anticlockwise (seen from the inlet).
  const turn = (x: number, y: number): [number, number] => (up ? [x, y] : [-y, x]);
  const outline = outline2.map(([x, y]) => turn(x, y));
  const xR = Math.max(...outline.map((q) => q[0]));
  const xL = Math.min(...outline.map((q) => q[0]));
  const yB = Math.min(...outline.map((q) => q[1]));
  const AY = -yB + 0.12; // wheel centre height
  const FLOOR = 0.06; // skid height
  const centre: Vec3 = [0, AY, 0];

  /* ---------------- scroll housing ---------------- */
  // Parts built in the discharge-up frame and turned with the scroll.
  const turned = (build: (m: Mesh) => void) => (m: Mesh) => {
    if (up) return build(m);
    const t = emptyMesh();
    build(t);
    appendRotated(m, t, "z", Math.PI / 2, [0, 0, 0]);
  };
  add("housing", "body", "Scroll housing", "paint", (m) => {
    extrudeRounded(m, "z", outline, -HW, HW, 0.02, { steps: 3 });
  }, centre, cut);

  const mouthO = outline2[outline2.length - 2]!;
  const mouthI = outline2[outline2.length - 1]!;
  const top = mouthO[1];
  const x0 = mouthO[0];
  const x1 = mouthI[0];
  add("discharge-flange", "flange", "Discharge flange", "cast", turned((m) => {
    roundedBox(m, [x0 - 0.04, top - 0.005, -HW - 0.04], [x1 + 0.04, top + 0.03, HW + 0.04], 0.008, 2);
  }), centre, cut);
  if (fine) {
    add("discharge-bolts", "detail", "Flange bolts", "steel", turned((m) => {
      const bolt = (x: number, z: number) => cylinder(m, "y", [z, x], 0.009, top + 0.02, top + 0.042, HEX);
      for (let i = 0; i <= 4; i++) {
        const x = x0 - 0.022 + (i / 4) * (x1 - x0 + 0.044);
        bolt(x, -HW - 0.022);
        bolt(x, HW + 0.022);
      }
      for (const x of [x0 - 0.022, x1 + 0.022]) for (const z of [-HW * 0.33, HW * 0.33]) bolt(x, z);
    }), centre, cut);
  }

  /* ---------------- inlet cone ---------------- */
  const bell: ProfilePoint[] = [
    [0.172, HW - 0.004],
    [0.174, HW + 0.03],
    [0.186, HW + 0.075],
    [0.21, HW + 0.108],
    [0.236, HW + 0.124],
    [0.24, HW + 0.138],
    [0.222, HW + 0.142],
    [0.19, HW + 0.128],
    [0.166, HW + 0.095],
    [0.155, HW + 0.05],
    [0.152, HW - 0.004],
    [0.172, HW - 0.004],
  ];
  add("inlet-cone", "nozzle", "Inlet cone", "cast", (m) => {
    lathe(m, "z", [0, 0], bell, seg);
    lathe(m, "z", [0, 0], [[0.17, HW - 0.002], [0.262, HW - 0.002], [0.262, HW + 0.014], [0.17, HW + 0.014], [0.17, HW - 0.002]], seg);
  }, centre, cut);
  add("wheel-eye", "base", "Wheel eye", "rubber", (m) => {
    roundedDisc(m, "z", [0, 0], 0.153, HW - 0.01, HW + 0.002, 0.002, seg);
  }, centre, cut);
  if (fine) {
    add("inlet-bolts", "detail", "Inlet bolts", "steel", (m) => {
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        cylinder(m, "z", [Math.cos(t) * 0.24, Math.sin(t) * 0.24], 0.0085, HW + 0.01, HW + 0.028, HEX);
      }
    }, centre, cut);
    add("inlet-guard", "detail", "Inlet guard", "steel", (m) => {
      const w = HW + 0.146;
      for (const rr of [0.07, 0.14, 0.205]) {
        const ring: Vec3[] = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          ring.push([Math.cos(a) * rr, Math.sin(a) * rr, w]);
        }
        sweep(m, ring, 0.0045, 8, false);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        sweep(m, [[0, 0, w], [Math.cos(a) * 0.235, Math.sin(a) * 0.235, w - 0.004]], 0.005, 8);
      }
    }, centre, cut);
  }

  /* ---------------- wheel (cutaway) ---------------- */
  add("impeller", "detail", "Fan wheel", "cast", (m) => {
    const rw = 0.2;
    const back = -HW + 0.03;
    const front = HW - 0.03;
    roundedDisc(m, "z", [0, 0], rw, back, back + 0.012, 0.004, seg);
    lathe(m, "z", [0, 0], [[0, back - 0.03], [0.045, back - 0.03], [0.05, back + 0.05], [0.03, back + 0.07], [0, back + 0.07]], 28);
    // Front shroud: a conical ring round the eye.
    lathe(m, "z", [0, 0], [[0.14, front], [0.2, front - 0.03], [0.2, front - 0.042], [0.14, front - 0.012], [0.14, front]], seg);
    const n = fine ? 12 : 9;
    for (let k = 0; k < n; k++) {
      const t0 = (k / n) * Math.PI * 2;
      const A: [number, number][] = [];
      const B: [number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const r = 0.1 + (i / 12) * (rw - 0.006 - 0.1);
        const th = t0 + (r - 0.1) * 4.2; // tip trails a clockwise wheel
        const tt = th - 0.007 / r;
        A.push([Math.cos(th) * r, Math.sin(th) * r]);
        B.push([Math.cos(tt) * r, Math.sin(tt) * r]);
      }
      blade(m, "z", A, B, back + 0.01, front - 0.024);
    }
  }, centre, { internal: true });

  /* ---------------- drive ---------------- */
  // Motor bodies are authored along +X by `addMotorBody`; turn them onto −Z.
  const along = (dx: number): AddPart => (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) =>
    add(id, role, label, finish, (m) => {
      const t = emptyMesh();
      build(t);
      appendRotated(m, t, "y", Math.PI / 2, [0, 0, 0]);
    }, [pivot[2] + dx, pivot[1], -pivot[0]], flags);
  const base: [number, number, number, number][] = []; // x0, x1, z0, z1 footprints for the skid
  let beacon: Vec3;
  const ports: SpatialPort[] = [];
  const animations: SpatialModel["animations"] = [
    { id: "wheel-spin", node: "impeller", axis: "z", reverse: true, periodMs: 600, states: ["running"] },
  ];
  const zB0 = -HW - 0.03;
  const pedestal = (z0: number, z1: number) => {
    add("bearing-pedestal", "body-secondary", "Bearing pedestal", "paint", (m) => {
      for (const z of [z0 - 0.04, z1 + 0.04]) {
        lathe(m, "z", [0, AY], [[0, z - 0.035], [0.05, z - 0.035], [0.062, z - 0.022], [0.062, z + 0.022], [0.05, z + 0.035], [0, z + 0.035]], 32);
        roundedBox(m, [-0.05, FLOOR, z - 0.03], [0.05, AY - 0.03, z + 0.03], 0.01, 2);
        roundedBox(m, [-0.1, FLOOR, z - 0.05], [0.1, FLOOR + 0.025, z + 0.05], 0.006, 2);
      }
      roundedBox(m, [-0.03, FLOOR + 0.02, z1], [0.03, AY - 0.06, z0], 0.008, 2);
    });
    add("shaft", "detail", "Shaft", "steel", (m) => cylinder(m, "z", [0, AY], 0.026, z1 - 0.02, -HW + 0.04, 24));
  };

  if (drive === "direct") {
    const zp1 = -HW - 0.26;
    pedestal(zB0, zp1);
    const M0 = HW + 0.33;
    const M1 = M0 + 0.46;
    add("coupling", "rotor", "Coupling", "steel", (m) => {
      roundedDisc(m, "z", [0, 0], 0.07, -0.026, -0.004, 0.005, seg);
      roundedDisc(m, "z", [0, 0], 0.07, 0.004, 0.026, 0.005, seg);
      const lug = emptyMesh();
      roundedBox(lug, [-0.022, 0.054, -0.014], [0.022, 0.078, 0.014], 0.005, 2);
      for (let k = 0; k < 4; k++) appendRotated(m, lug, "z", (k * Math.PI) / 2, [0, 0, 0]);
    }, [0, AY, -M0 + 0.035]);
    animations.push({ id: "coupling-spin", node: "coupling", axis: "z", reverse: true, periodMs: 600, states: ["running"] });
    const top = addMotorBody(along(0), { M0, M1, AY, R: 0.15, detail, seg });
    beacon = [top[2], top[1], -top[0]];
    add("motor-feet", "base", "Motor feet", "cast", (m) => {
      for (const z of [-M0 - 0.09, -M1 + 0.09]) roundedBox(m, [-0.13, FLOOR, z - 0.045], [0.13, AY - 0.1, z + 0.045], 0.012, 2);
    });
    base.push([-0.22, 0.22, -M1 - 0.16, 0]);
    ports.push({ id: "power", kind: "power", position: [-0.11, AY + 0.17, -(M0 + M1) / 2], direction: [-1, 0, 0] });
  } else if (drive === "belt") {
    // Motor beside the housing, lower, driving through a guard on the back face.
    const XM = xR + 0.27;
    const AM = 0.25;
    const RM = 0.115;
    const gz0 = -HW - 0.13;
    const gz1 = -HW - 0.04;
    pedestal(gz0 - 0.02, gz0 - 0.3);
    const circle = (cx: number, cy: number, r: number) => Array.from({ length: 24 }, (_, i) => [cx + Math.cos((i / 24) * Math.PI * 2) * r, cy + Math.sin((i / 24) * Math.PI * 2) * r] as [number, number]);
    add("belt-guard", "flange", "Belt guard", "paint", (m) => {
      extrudeRounded(m, "z", hull([...circle(0, AY, 0.12), ...circle(XM, AM, 0.1)]), gz0, gz1, 0.014);
    });
    const M0 = -gz0;
    const M1 = M0 + 0.36;
    const top = addMotorBody(along(XM), { M0, M1, AY: AM, R: RM, detail, seg });
    beacon = [top[2] + XM, top[1], -top[0]];
    add("motor-feet", "base", "Motor feet", "cast", (m) => {
      for (const z of [-M0 - 0.07, -M1 + 0.07]) roundedBox(m, [XM - 0.1, FLOOR, z - 0.035], [XM + 0.1, AM - 0.07, z + 0.035], 0.01, 2);
    });
    add("shaft-end", "rotor", "Drive pulley hub", "steel", (m) => {
      cylinder(m, "z", [0, 0], 0.026, -0.03, 0.03, 20);
      roundedBox(m, [-0.008, 0.02, -0.03], [0.008, 0.032, 0.03], 0.003, 2);
    }, [0, AY, gz0 - 0.38]);
    animations.push({ id: "shaft-spin", node: "shaft-end", axis: "z", reverse: true, periodMs: 600, states: ["running"] });
    base.push([-0.22, XM + 0.16, -M1 - 0.12, 0]);
    ports.push({ id: "power", kind: "power", position: [XM - 0.08, AM + 0.13, -(M0 + M1) / 2], direction: [-1, 0, 0] });
  } else {
    const zp1 = -HW - 0.26;
    pedestal(zB0, zp1);
    add("shaft-end", "rotor", "Shaft end", "steel", (m) => {
      cylinder(m, "z", [0, 0], 0.026, -0.08, 0.02, 24);
      roundedBox(m, [-0.008, 0.02, -0.075], [0.008, 0.032, -0.01], 0.003, 2);
    }, [0, AY, zp1 - 0.06]);
    animations.push({ id: "shaft-spin", node: "shaft-end", axis: "z", reverse: true, periodMs: 600, states: ["running"] });
    beacon = [0.0, AY + 0.062, zB0 - 0.04];
    base.push([-0.2, 0.2, zp1 - 0.16, 0]);
    ports.push({ id: "shaft", kind: "mechanical", position: [0, AY, zp1 - 0.14], direction: [0, 0, -1] });
  }

  /* ---------------- skid and housing feet ---------------- */
  add("base", "base", "Base frame", "paint", (m) => {
    const bx0 = Math.min(xL - 0.02, ...base.map((b) => b[0]));
    const bx1 = Math.max(xR + 0.02, ...base.map((b) => b[1]));
    const bz0 = Math.min(...base.map((b) => b[2]));
    roundedBox(m, [bx0, 0, bz0], [bx1, FLOOR, HW + 0.1], 0.014, 3);
    for (const s of [-1, 1]) roundedBox(m, [-0.16, FLOOR - 0.01, s > 0 ? HW - 0.05 : -HW - 0.02], [0.16, AY + yB + 0.09, s > 0 ? HW + 0.02 : -HW + 0.05], 0.01, 2);
    if (fine) {
      for (const [x, z] of [[bx0 + 0.05, bz0 + 0.05], [bx1 - 0.05, bz0 + 0.05], [bx0 + 0.05, HW + 0.05], [bx1 - 0.05, HW + 0.05]] as const) {
        cylinder(m, "y", [z, x], 0.014, FLOOR - 0.005, FLOOR + 0.016, HEX);
      }
    }
  });

  addBeacon(add, beacon);

  const mouthC = turn((x0 + x1) / 2, top + 0.03);
  ports.unshift(
    { id: "inlet", kind: "inlet", position: [0, AY, HW + 0.142], direction: [0, 0, 1] },
    { id: "discharge", kind: "outlet", position: [mouthC[0], AY + mouthC[1], 0], direction: up ? [0, 1, 0] : [-1, 0, 0] },
  );

  const model: SpatialModel = {
    nodes,
    ports,
    animations,
    effects: [{ type: "vibration", states: ["warning"], amplitude: 0.0012, frequencyHz: 20 }],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
    badge: [up ? xR - 0.05 : xL + 0.05, AY + (up ? top : Math.max(...outline.map((q) => q[1]))) + 0.28, 0],
  };
  return p.rotation === "ccw" ? mirror(model) : model;
}

function mirror(model: SpatialModel): SpatialModel {
  const mx = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
  return {
    ...model,
    nodes: model.nodes.map((n) => ({ ...n, mesh: mirrorMeshX(n.mesh), translation: mx(n.translation) })),
    ports: model.ports.map((q) => ({ ...q, position: mx(q.position), direction: mx(q.direction) })),
    animations: model.animations.map((a) => (a.type === "slide" ? a : { ...a, reverse: !a.reverse })),
    badge: mx(model.badge),
  };
}
