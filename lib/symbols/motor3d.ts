import { appendRotated, cylinder, emptyMesh, lathe, mirrorMeshX, roundedBox, roundedDisc, sweep, type Mesh } from "../spatial/mesh.ts";
import type { Finish, ParamValues, RegionRole, SpatialModel, SpatialNode, Vec3 } from "../types.ts";

type Flags = { section?: boolean; internal?: boolean };
export type AddPart = (id: string, role: RegionRole, label: string, finish: Finish, build: (m: Mesh) => void, pivot?: Vec3, flags?: Flags) => void;

export interface MotorSpec {
  /** Drive-end and fan-end x positions (drive end faces −X). */
  M0: number;
  M1: number;
  /** Shaft centreline height and frame radius. */
  AY: number;
  R: number;
  detail: string;
  seg: number;
  section?: boolean;
}

/**
 * TEFC motor frame, fins, fan cover and guard, terminal box. Shared by the
 * pump's driver and the standalone motor so both always match. Returns the
 * top of the terminal box, where the status beacon sits.
 */
export function addMotorBody(add: AddPart, s: MotorSpec): Vec3 {
  const { M0, M1, AY, R, detail, seg } = s;
  const fine = detail !== "simple";
  const k = R / 0.172;
  const flags: Flags = s.section ? { section: true } : {};
  const mid = (M0 + M1) / 2;
  add("motor", "body-secondary", "Motor", "paint", (m) => {
    lathe(m, "x", [AY, 0], [
      [0, M0],
      [0.58 * R, M0],
      [0.814 * R, M0 + 0.01 * k],
      [0.96 * R, M0 + 0.035 * k],
      [R, M0 + 0.06 * k],
      [R, M1 - 0.05 * k],
      [0.96 * R, M1 - 0.025 * k],
      [0.814 * R, M1],
      [0, M1],
    ], seg + 8);
    const hw = 0.08 * k;
    roundedBox(m, [mid - hw, AY + 0.14 * k, -hw], [mid + hw, AY + 0.25 * k, hw], 0.014 * k);
    roundedBox(m, [mid - hw - 0.008, AY + 0.245 * k, -hw - 0.008], [mid + hw + 0.008, AY + 0.265 * k, hw + 0.008], 0.008 * k, 2);
    cylinder(m, "z", [mid, AY + 0.19 * k], 0.018 * k, hw, hw + 0.03 * k, 20);
  }, [0, 0, 0], flags);
  if (fine) {
    add("motor-fins", "body-secondary", "Cooling fins", "paint", (m) => {
      const n = detail === "detailed" ? 28 : 20;
      const fin = emptyMesh();
      roundedBox(fin, [M0 + 0.07 * k, AY + R - 0.007, -0.006], [M1 - 0.06 * k, AY + R + 0.026 * k, 0.006], 0.004, 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (Math.cos(a) > 0.82) continue; // clear the terminal box on top
        appendRotated(m, fin, "x", a, [0, AY, 0]);
      }
    }, [0, 0, 0], flags);
  }
  add("fan-cover", "body-secondary", "Fan cover", "paint", (m) => {
    lathe(m, "x", [AY, 0], [
      [0, M1 - 0.01],
      [0.93 * R, M1 - 0.01],
      [0.977 * R, M1 + 0.01 * k],
      [0.977 * R, M1 + 0.09 * k],
      [0.9 * R, M1 + 0.115 * k],
      [0.7 * R, M1 + 0.125 * k],
      [0, M1 + 0.125 * k],
    ], seg);
  }, [0, 0, 0], flags);
  if (fine) {
    add("fan-grille", "detail", "Fan guard", "steel", (m) => {
      for (const rr of [0.2, 0.38, 0.55, 0.73]) {
        const ring: Vec3[] = [];
        for (let i = 0; i <= 48; i++) {
          const a = (i / 48) * Math.PI * 2;
          ring.push([M1 + 0.129 * k, AY + Math.cos(a) * rr * R, Math.sin(a) * rr * R]);
        }
        sweep(m, ring, 0.0045, 8, false);
      }
    });
  }
  return [mid, AY + 0.265 * k, 0];
}

export function addBeacon(add: AddPart, at: Vec3) {
  const [bx, by, bz] = at;
  add("beacon-base", "body-secondary", "Beacon base", "paint", (m) => {
    roundedDisc(m, "y", [bz, bx], 0.03, by, by + 0.02, 0.004, 28);
  });
  add("status-hub", "indicator", "Status beacon", "lens", (m) => {
    const prof: [number, number][] = [[0, by + 0.018], [0.024, by + 0.018], [0.024, by + 0.05]];
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * (Math.PI / 2);
      prof.push([0.024 * Math.cos(t), by + 0.05 + 0.026 * Math.sin(t)]);
    }
    lathe(m, "y", [bz, bx], prof, 32);
  });
}

/** Standalone induction motor (same params as the 2D motor). */
export function inductionMotor3d(p: ParamValues): SpatialModel {
  const size = String(p.size);
  const R = size === "small" ? 0.13 : size === "large" ? 0.22 : 0.172;
  const len = size === "small" ? 0.4 : size === "large" ? 0.72 : 0.53;
  const detail = String(p.detail);
  const seg = detail === "simple" ? 24 : detail === "detailed" ? 56 : 44;
  const flange = p.mount === "flange";
  const AY = flange ? R * 1.45 : R + 0.14;
  const M0 = 0;
  const M1 = len;
  const nodes: SpatialNode[] = [];
  const add: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };

  if (!flange) {
    add("feet", "base", "Mounting feet", "cast", (m) => {
      for (const x of [M0 + len * 0.18, M1 - len * 0.18]) {
        roundedBox(m, [x - 0.05, 0, -R * 1.05], [x + 0.05, 0.03, R * 1.05], 0.008, 2);
        roundedBox(m, [x - 0.035, 0.02, -R * 0.55], [x + 0.035, AY - R * 0.55, R * 0.55], 0.012, 2);
      }
    });
  } else {
    add("flange", "flange", "Mounting flange", "cast", (m) => {
      roundedDisc(m, "x", [AY, 0], R * 1.32, M0 - 0.035, M0 + 0.005, 0.006, seg);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        cylinder(m, "x", [AY + Math.cos(a) * R * 1.18, Math.sin(a) * R * 1.18], 0.011, M0 - 0.05, M0 - 0.03, 6);
      }
    });
  }
  const beacon = addMotorBody(add, { M0, M1, AY, R, detail, seg, section: true });
  // Rotor (cutaway) and the drive shaft with its key (the visible rotation).
  add("rotor-core", "detail", "Rotor", "steel", (m) => {
    cylinder(m, "x", [0, 0], R * 0.52, M0 + 0.08, M1 - 0.08, 36);
    for (const x of [M0 + 0.07, M1 - 0.07]) roundedDisc(m, "x", [0, 0], R * 0.75, x - 0.012, x + 0.012, 0.004, 36); // winding end-turns
  }, [0, AY, 0], { internal: true });
  add("shaft", "rotor", "Drive shaft", "steel", (m) => {
    cylinder(m, "x", [0, 0], R * 0.2, -0.13, M1, 28);
    roundedBox(m, [-0.12, R * 0.17, -R * 0.05], [-0.02, R * 0.24, R * 0.05], 0.003, 2);
  }, [M0, AY, 0]);
  addBeacon(add, beacon);

  let model: SpatialModel = {
    nodes,
    ports: [
      { id: "shaft", kind: "mechanical", position: [M0 - 0.13, AY, 0], direction: [-1, 0, 0] },
      { id: "power", kind: "power", position: [beacon[0], AY + 0.19 * (R / 0.172), 0.1], direction: [0, 0, 1] },
    ],
    animations: [
      { id: "shaft-spin", node: "shaft", axis: "x", periodMs: 500, states: ["running"] },
      { id: "rotor-spin", node: "rotor-core", axis: "x", periodMs: 500, states: ["running"] },
    ],
    effects: [{ type: "vibration", states: ["warning"], amplitude: 0.001, frequencyHz: 25 }],
    badge: [M1 + 0.1, AY + R + 0.3, 0],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
  };
  // 2D default shows the shaft on the right; the 3D drive end is built on −X.
  if (p.shaft !== "left") model = mirror(model);
  return model;
}

function mirror(model: SpatialModel): SpatialModel {
  const mx = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
  return {
    ...model,
    nodes: model.nodes.map((n) => ({ ...n, mesh: mirrorMeshX(n.mesh), translation: mx(n.translation) })),
    ports: model.ports.map((q) => ({ ...q, position: mx(q.position), direction: mx(q.direction) })),
    badge: mx(model.badge),
  };
}
