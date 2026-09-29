import {
  appendRotated,
  blade,

  cylinder,
  emptyMesh,
  lathe,
  mirrorMeshX,
  roundedBox,
  roundedDisc,
  sweep,
  type Mesh,
} from "../spatial/mesh.ts";
import { addBeacon, addMotorBody } from "./motor3d.ts";
import type { Finish, ParamValues, RegionRole, SpatialModel, SpatialNode, SpatialPort, Vec3 } from "../types.ts";

/**
 * Stylised 3D centrifugal pump from the same params as the 2D symbol.
 *
 * End-suction arrangement: shaft along +X, axial suction on −X, spiral volute
 * scrolling into a tangential discharge (up, or sideways along +Z), bearing
 * frame and coupled TEFC motor on +X, all on a grouted baseplate. Metres, +Y
 * up. Part ids match the 2D regions so one vocabulary drives both.
 */

const AY = 0.42; // shaft centreline height
const RD = 0.18; // volute disc radius
const HEX = 6; // hex bolts/nuts

export function centrifugalPump3d(p: ParamValues): SpatialModel {
  const motor = p.driver === "motor";
  const top = p.discharge !== "side";
  const detail = String(p.detail);
  const fine = detail !== "simple";
  const seg = detail === "simple" ? 24 : detail === "detailed" ? 56 : 44;
  const mirror = p.inlet === "right";
  const floor = p.base ? 0.07 : 0;
  const nodes: SpatialNode[] = [];

  const add = (
    id: string,
    role: RegionRole,
    label: string,
    finish: Finish,
    build: (m: Mesh) => void,
    pivot: Vec3 = [0, 0, 0],
    flags: { section?: boolean; internal?: boolean } = {},
  ) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };
  const cut = { section: true };

  const x1 = motor ? 1.1 : 0.5;

  /* ---------------- baseplate ---------------- */
  if (p.base) {
    add("baseplate", "base", "Baseplate", "paint", (m) => {
      roundedBox(m, [-0.46, 0, -0.3], [x1 + 0.08, 0.07, 0.3], 0.018);
      if (fine) {
        // Anchor bolts along both long edges.
        const n = motor ? 4 : 2;
        for (let i = 0; i < n; i++) {
          const x = -0.38 + (i * (x1 + 0.0)) / Math.max(1, n - 1);
          for (const z of [-0.25, 0.25]) cylinder(m, "y", [z, x], 0.018, 0.07, 0.092, HEX);
        }
      }
    });
  }

  /* ---------------- feet and pedestals ---------------- */
  add("pedestal", "base", "Casing foot and supports", "cast", (m) => {
    roundedBox(m, [-0.09, floor, -0.15], [0.09, AY - RD + 0.03, 0.15], 0.02);
    roundedBox(m, [0.2, floor, -0.1], [0.34, AY - 0.07, 0.1], 0.016);
    if (motor) {
      roundedBox(m, [0.52, floor, -0.2], [0.62, AY - 0.15, 0.2], 0.014);
      roundedBox(m, [0.86, floor, -0.2], [0.96, AY - 0.15, 0.2], 0.014);
    }
  });

  /* ---------------- suction ---------------- */
  add("suction-nozzle", "nozzle", "Suction nozzle", "cast", (m) => {
    // Slight reducer taper into the casing eye.
    lathe(m, "x", [AY, 0], [
      [0, -0.31],
      [0.07, -0.31],
      [0.07, -0.2],
      [0.085, -0.12],
      [0.095, -0.06],
      [0, -0.06],
    ], seg);
  }, [0, 0, 0], cut);
  add("suction-flange", "flange", "Suction flange", "cast", (m) => {
    roundedDisc(m, "x", [AY, 0], 0.125, -0.345, -0.31, 0.006, seg);
    roundedDisc(m, "x", [AY, 0], 0.095, -0.352, -0.34, 0.003, seg); // raised face
  }, [0, 0, 0], cut);
  if (fine) {
    add("suction-bolts", "detail", "Flange bolts", "steel", (m) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        cylinder(m, "x", [AY + Math.cos(a) * 0.105, Math.sin(a) * 0.105], 0.011, -0.36, -0.3, HEX);
      }
    }, [0, 0, 0], cut);
  }

  /* ---------------- volute ---------------- */
  // Scroll centreline in the casing plane; radius grows toward the discharge.
  const turns = 0.88;
  const steps = fine ? 72 : 36;
  const rEnd = 0.07;
  const scroll: Vec3[] = [];
  const radii: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const phi = -Math.PI * 2 * turns * (1 - t);
    const r = 0.028 + (rEnd - 0.028) * t;
    const rho = RD + r * 0.25;
    scroll.push([0, rho * Math.sin(phi), rho * Math.cos(phi)]);
    radii.push(r);
  }
  const rhoEnd = RD + rEnd * 0.25;
  const nozzleLen = 0.3;
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    scroll.push([0, t * nozzleLen, rhoEnd]);
    radii.push(rEnd - 0.008 * t);
  }
  // Top discharge exits +Y; side discharge swaps Y/Z so it exits +Z at the top.
  const place = (v: Vec3): Vec3 => (top ? [v[0], AY + v[1], v[2]] : [v[0], AY + v[2], v[1]]);
  add("casing", "body", "Volute casing", "paint", (m) => {
    // Main casing disc with rounded rims, back cover and stuffing box.
    lathe(m, "x", [AY, 0], [
      [0, -0.07],
      [0.1, -0.07],
      [RD - 0.03, -0.068],
      [RD - 0.006, -0.055],
      [RD, -0.035],
      [RD, 0.035],
      [RD - 0.006, 0.055],
      [RD - 0.03, 0.068],
      [0.15, 0.07],
      [0.15, 0.1],
      [0.13, 0.115],
      [0.085, 0.12],
      [0.075, 0.2],
      [0, 0.2],
    ], seg + 8);
    sweep(m, scroll.map(place), radii, fine ? 32 : 18);
  }, [0, 0, 0], cut);
  const outlet = place([0, nozzleLen, rhoEnd]);
  add("discharge-flange", "flange", "Discharge flange", "cast", (m) => {
    const c: [number, number] = top ? [outlet[2], outlet[0]] : [outlet[0], outlet[1]];
    const ax = top ? "y" : "z";
    const w = top ? outlet[1] : outlet[2];
    roundedDisc(m, ax, c, 0.11, w - 0.005, w + 0.03, 0.006, seg);
    roundedDisc(m, ax, c, 0.082, w + 0.028, w + 0.038, 0.003, seg);
  }, [0, 0, 0], cut);
  if (fine) {
    add("discharge-bolts", "detail", "Flange bolts", "steel", (m) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const d = 0.094;
        if (top) cylinder(m, "y", [outlet[2] + Math.sin(a) * d, outlet[0] + Math.cos(a) * d], 0.01, outlet[1] - 0.01, outlet[1] + 0.045, HEX);
        else cylinder(m, "z", [outlet[0] + Math.cos(a) * d, outlet[1] + Math.sin(a) * d], 0.01, outlet[2] - 0.01, outlet[2] + 0.045, HEX);
      }
    }, [0, 0, 0], cut);
    add("casing-bolts", "detail", "Casing bolts", "steel", (m) => {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        cylinder(m, "x", [AY + Math.cos(a) * 0.14, Math.sin(a) * 0.14], 0.009, 0.066, 0.084, HEX);
      }
    }, [0, 0, 0], cut);
  }

  /* ---------------- impeller (visible in cutaway) ---------------- */
  add(
    "impeller",
    "detail", // cast-metal grey in every style; rotation comes from its animation
    "Impeller",
    "cast",
    (m) => {
      const vanes = fine ? 6 : 5;
      // Back shroud, hub and front shroud ring with the eye open to the suction.
      roundedDisc(m, "x", [0, 0], 0.15, 0.028, 0.04, 0.004, seg);
      lathe(m, "x", [0, 0], [[0, -0.02], [0.03, -0.02], [0.034, 0.028], [0, 0.028]], 28);
      lathe(m, "x", [0, 0], [[0.062, -0.042], [0.15, -0.036], [0.15, -0.028], [0.066, -0.032], [0.062, -0.042]], seg);
      for (let k = 0; k < vanes; k++) {
        const t0 = (k / vanes) * Math.PI * 2;
        const A: [number, number][] = [];
        const B: [number, number][] = [];
        for (let i = 0; i <= 14; i++) {
          const r = 0.036 + (i / 14) * (0.148 - 0.036);
          const th = t0 + (r - 0.036) * 6.2; // backward-curved
          const tt = th + 0.0075 / r;
          A.push([Math.cos(th) * r, Math.sin(th) * r]);
          B.push([Math.cos(tt) * r, Math.sin(tt) * r]);
        }
        blade(m, "x", A, B, -0.032, 0.03);
      }
    },
    [0, AY, 0],
    { internal: true },
  );

  /* ---------------- bearing frame and shaft ---------------- */
  add("bearing-frame", "body-secondary", "Bearing frame", "paint", (m) => {
    lathe(m, "x", [AY, 0], [
      [0, 0.2],
      [0.07, 0.2],
      [0.085, 0.215],
      [0.085, 0.33],
      [0.07, 0.345],
      [0.05, 0.35],
      [0, 0.35],
    ], seg);
    if (fine) {
      // Stiffening ribs.
      const rib = emptyMesh();
      roundedBox(rib, [0.215, AY + 0.07, -0.008], [0.33, AY + 0.1, 0.008], 0.004, 2);
      for (let k = 0; k < 4; k++) appendRotated(m, rib, "x", (k * Math.PI) / 2 + Math.PI / 4, [0, AY, 0]);
    }
  });
  add("shaft", "detail", "Shaft", "steel", (m) => {
    cylinder(m, "x", [AY, 0], 0.024, -0.02, motor ? 0.4 : 0.47, 24);
  });

  /* ---------------- rotating element ---------------- */
  const rotorX = motor ? 0.425 : 0.46;
  add(
    "coupling",
    "rotor",
    motor ? "Coupling" : "Shaft end",
    "steel",
    (m) => {
      if (motor) {
        roundedDisc(m, "x", [0, 0], 0.085, -0.03, -0.004, 0.006, seg);
        roundedDisc(m, "x", [0, 0], 0.085, 0.004, 0.03, 0.006, seg);
        const lug = emptyMesh();
        roundedBox(lug, [-0.028, 0.066, -0.016], [0.028, 0.094, 0.016], 0.006, 2);
        for (let k = 0; k < 4; k++) appendRotated(m, lug, "x", (k * Math.PI) / 2, [0, 0, 0]);
      } else {
        cylinder(m, "x", [0, 0], 0.024, -0.02, 0.07, 24);
        roundedBox(m, [0.0, 0.018, -0.008], [0.06, 0.03, 0.008], 0.003, 2);
      }
    },
    [rotorX, AY, 0],
  );

  /* ---------------- motor and beacon ---------------- */
  const beaconAt: Vec3 = motor
    ? addMotorBody(add, { M0: 0.455, M1: 0.98, AY, R: 0.172, detail, seg })
    : [0.28, AY + 0.085, 0];
  addBeacon(add, beaconAt);

  const ports: SpatialPort[] = [
    { id: "suction", kind: "inlet", position: [-0.352, AY, 0], direction: [-1, 0, 0] },
    {
      id: "discharge",
      kind: "outlet",
      position: top ? [outlet[0], outlet[1] + 0.038, outlet[2]] : [outlet[0], outlet[1], outlet[2] + 0.038],
      direction: top ? [0, 1, 0] : [0, 0, 1],
    },
  ];
  if (motor) ports.push({ id: "power", kind: "power", position: [0.72, AY + 0.19, 0.11], direction: [0, 0, 1] });

  const model: SpatialModel = {
    nodes,
    ports,
    animations: [
      { id: "impeller-spin", node: "coupling", axis: "x", periodMs: 700, states: ["running"] },
      { id: "impeller-inner-spin", node: "impeller", axis: "x", periodMs: 700, states: ["running"] },
    ],
    effects: [{ type: "vibration", states: ["warning"], amplitude: 0.0012, frequencyHz: 22 }],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
    badge: [-0.24, AY + RD + 0.34, 0],
  };
  return mirror ? mirrorModel(model) : model;
}

function mirrorModel(model: SpatialModel): SpatialModel {
  const mx = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
  return {
    nodes: model.nodes.map((n) => ({ ...n, mesh: mirrorMeshX(n.mesh), translation: mx(n.translation) })),
    ports: model.ports.map((p) => ({ ...p, position: mx(p.position), direction: mx(p.direction) })),
    animations: model.animations,
    badge: mx(model.badge),
    ...(model.effects ? { effects: model.effects } : {}),
    ...(model.sectionPlane ? { sectionPlane: model.sectionPlane } : {}),
  };
}

