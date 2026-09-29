import {
  appendRotated,

  cylinder,
  emptyMesh,
  lathe,
  mirrorMeshX,
  roundedBox,
  roundedDisc,
  sweep,
  type Mesh,
} from "../spatial/mesh.ts";
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

  const add = (id: string, role: RegionRole, label: string, finish: Finish, build: (m: Mesh) => void, pivot: Vec3 = [0, 0, 0]) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot });
  };

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
  });
  add("suction-flange", "flange", "Suction flange", "cast", (m) => {
    roundedDisc(m, "x", [AY, 0], 0.125, -0.345, -0.31, 0.006, seg);
    roundedDisc(m, "x", [AY, 0], 0.095, -0.352, -0.34, 0.003, seg); // raised face
  });
  if (fine) {
    add("suction-bolts", "detail", "Flange bolts", "steel", (m) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        cylinder(m, "x", [AY + Math.cos(a) * 0.105, Math.sin(a) * 0.105], 0.011, -0.36, -0.3, HEX);
      }
    });
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
  });
  const outlet = place([0, nozzleLen, rhoEnd]);
  add("discharge-flange", "flange", "Discharge flange", "cast", (m) => {
    const c: [number, number] = top ? [outlet[2], outlet[0]] : [outlet[0], outlet[1]];
    const ax = top ? "y" : "z";
    const w = top ? outlet[1] : outlet[2];
    roundedDisc(m, ax, c, 0.11, w - 0.005, w + 0.03, 0.006, seg);
    roundedDisc(m, ax, c, 0.082, w + 0.028, w + 0.038, 0.003, seg);
  });
  if (fine) {
    add("discharge-bolts", "detail", "Flange bolts", "steel", (m) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const d = 0.094;
        if (top) cylinder(m, "y", [outlet[2] + Math.sin(a) * d, outlet[0] + Math.cos(a) * d], 0.01, outlet[1] - 0.01, outlet[1] + 0.045, HEX);
        else cylinder(m, "z", [outlet[0] + Math.cos(a) * d, outlet[1] + Math.sin(a) * d], 0.01, outlet[2] - 0.01, outlet[2] + 0.045, HEX);
      }
    });
    add("casing-bolts", "detail", "Casing bolts", "steel", (m) => {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        cylinder(m, "x", [AY + Math.cos(a) * 0.14, Math.sin(a) * 0.14], 0.009, 0.066, 0.084, HEX);
      }
    });
  }

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
    cylinder(m, "x", [AY, 0], 0.024, 0.34, motor ? 0.4 : 0.47, 24);
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

  /* ---------------- motor ---------------- */
  if (motor) {
    const M0 = 0.455;
    const M1 = 0.98;
    add("motor", "body-secondary", "Motor", "paint", (m) => {
      lathe(m, "x", [AY, 0], [
        [0, M0],
        [0.1, M0],
        [0.14, M0 + 0.01],
        [0.165, M0 + 0.035],
        [0.172, M0 + 0.06],
        [0.172, M1 - 0.05],
        [0.165, M1 - 0.025],
        [0.14, M1],
        [0, M1],
      ], seg + 8);
      // Terminal box with lid and cable gland.
      roundedBox(m, [0.64, AY + 0.14, -0.08], [0.8, AY + 0.25, 0.08], 0.014);
      roundedBox(m, [0.632, AY + 0.245, -0.088], [0.808, AY + 0.265, 0.088], 0.008, 2);
      cylinder(m, "z", [0.72, AY + 0.19], 0.018, 0.08, 0.11, 20);
    });
    if (fine) {
      add("motor-fins", "body-secondary", "Cooling fins", "paint", (m) => {
        const n = detail === "detailed" ? 28 : 20;
        const fin = emptyMesh();
        roundedBox(fin, [M0 + 0.07, AY + 0.165, -0.006], [M1 - 0.06, AY + 0.198, 0.006], 0.004, 2);
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          if (Math.cos(a) > 0.82) continue; // clear the terminal box on top
          appendRotated(m, fin, "x", a, [0, AY, 0]);
        }
      });
    }
    add("fan-cover", "body-secondary", "Fan cover", "paint", (m) => {
      lathe(m, "x", [AY, 0], [
        [0, M1 - 0.01],
        [0.16, M1 - 0.01],
        [0.168, M1 + 0.01],
        [0.168, M1 + 0.09],
        [0.155, M1 + 0.115],
        [0.12, M1 + 0.125],
        [0, M1 + 0.125],
      ], seg);
    });
    if (fine) {
      add("fan-grille", "detail", "Fan guard", "steel", (m) => {
        for (const rr of [0.035, 0.065, 0.095, 0.125]) {
          const ring: Vec3[] = [];
          for (let k = 0; k <= 48; k++) {
            const a = (k / 48) * Math.PI * 2;
            ring.push([M1 + 0.129, AY + Math.cos(a) * rr, Math.sin(a) * rr]);
          }
          sweep(m, ring, 0.0045, 8, false);
        }
      });
    }
  }

  /* ---------------- status beacon ---------------- */
  const bx = motor ? 0.72 : 0.28;
  const by = motor ? AY + 0.265 : AY + 0.085;
  add("beacon-base", "body-secondary", "Beacon base", "paint", (m) => {
    roundedDisc(m, "y", [0, bx], 0.03, by, by + 0.02, 0.004, 28);
  });
  add("status-hub", "indicator", "Status beacon", "lens", (m) => {
    const prof: [number, number][] = [[0, by + 0.018], [0.024, by + 0.018]];
    for (let k = 0; k <= 8; k++) {
      const t = (k / 8) * (Math.PI / 2);
      prof.push([0.024 * Math.cos(t), by + 0.05 + 0.026 * Math.sin(t)]);
    }
    prof.splice(2, 0, [0.024, by + 0.05]);
    lathe(m, "y", [0, bx], prof, 32);
  });

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
    animations: [{ id: "impeller-spin", node: "coupling", axis: "x", periodMs: 700, states: ["running"] }],
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
  };
}

