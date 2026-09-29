import { appendRotated, cylinder, emptyMesh, lathe, roundedBox, roundedDisc, sweep, type Mesh, type ProfilePoint } from "../spatial/mesh.ts";
import type { Finish, ParamValues, RegionRole, SpatialModel, SpatialNode, Vec3 } from "../types.ts";
import { addBeacon } from "./motor3d.ts";

/**
 * Stylised 3D two-way valve from the same params as the 2D symbol: cast body
 * with flanged ends, bonnet and stem, and a pneumatic, motor or handwheel
 * actuator. Cutaway reveals the gate wedge or the bored ball.
 */

const HEX = 6;

export function processValve3d(p: ParamValues): SpatialModel {
  const vertical = p.orientation === "vertical";
  const ball = p.body === "ball";
  const act = String(p.actuator);
  const AY = vertical ? 0.55 : 0.32; // pipe centreline (vertical runs stand taller)
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
  const cut = { section: true } as const;
  const rp = 0.055;

  // Pipe stubs and end flanges.
  add("pipe-stubs", "nozzle", "Pipe connections", "cast", (m) => {
    cylinder(m, "x", [AY, 0], rp, -0.36, -0.16, 32);
    cylinder(m, "x", [AY, 0], rp, 0.16, 0.36, 32);
  }, [0, 0, 0], cut);
  if (p.flanges) {
    add("flanges", "flange", "End flanges", "cast", (m) => {
      for (const [a, b] of [
        [-0.3, -0.26],
        [0.26, 0.3],
      ]) {
        roundedDisc(m, "x", [AY, 0], 0.115, a!, b!, 0.005, 36);
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
          cylinder(m, "x", [AY + Math.cos(t) * 0.093, Math.sin(t) * 0.093], 0.01, a! - 0.012, b! + 0.012, HEX);
        }
      }
    }, [0, 0, 0], cut);
  }

  // Cast body: a bulged barrel along the pipe.
  const body: ProfilePoint[] = [[0, -0.2], [0.075, -0.2], [0.1, -0.16], [0.13, -0.09], [0.14, 0], [0.13, 0.09], [0.1, 0.16], [0.075, 0.2], [0, 0.2]];
  add("body", "body", "Valve body", "paint", (m) => {
    lathe(m, "x", [AY, 0], ball ? body.map(([r, w]) => [r * 1.08, w * 0.85] as ProfilePoint) : body, 48);
    // Bonnet neck and flange.
    const neckTop = AY + (ball ? 0.2 : 0.3);
    if (ball) cylinder(m, "y", [0, 0], 0.06, AY, neckTop, 32);
    else roundedBox(m, [-0.085, AY, -0.06], [0.085, neckTop, 0.06], 0.025, 3);
    roundedDisc(m, "y", [0, 0], ball ? 0.08 : 0.1, neckTop - 0.01, neckTop + 0.025, 0.005, 36);
  }, [0, 0, 0], cut);
  const neckTop = AY + (ball ? 0.2 : 0.3) + 0.025;

  // Internals (cutaway): gate wedge or bored ball.
  add(
    "closure",
    "detail",
    ball ? "Ball" : "Gate wedge",
    "steel",
    (m) => {
      if (ball) {
        const prof: ProfilePoint[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = -Math.PI / 2 + (k / 16) * Math.PI;
          prof.push([Math.cos(t) * 0.1, Math.sin(t) * 0.1]);
        }
        lathe(m, "y", [0, 0], prof, 40);
      } else {
        roundedBox(m, [-0.02, -0.085, -0.075], [0.02, 0.085, 0.075], 0.012, 2);
      }
    },
    [0, AY, 0],
    { internal: true },
  );
  if (ball) {
    // The bore through the ball, as a dark sleeve along the pipe axis.
    add("ball-bore", "base", "Ball bore", "cast", (m) => cylinder(m, "x", [AY, 0], rp * 0.92, -0.1, 0.1, 28), [0, 0, 0], { internal: true });
  }

  // Stem.
  const stemTop = act === "none" ? neckTop + 0.06 : neckTop + (act === "pneumatic" ? 0.16 : 0.12);
  add("stem", "detail", "Stem", "steel", (m) => cylinder(m, "y", [0, 0], 0.014, AY + 0.05, stemTop, 20));

  // Actuator.
  let beacon: Vec3 = [0, stemTop, 0];
  if (act === "pneumatic") {
    add("yoke", "body-secondary", "Yoke", "paint", (m) => {
      for (const x of [-0.06, 0.06]) roundedBox(m, [x - 0.012, neckTop, -0.018], [x + 0.012, neckTop + 0.17, 0.018], 0.006, 2);
    });
    add("actuator", "body-secondary", "Diaphragm actuator", "paint", (m) => {
      const y = neckTop + 0.16;
      roundedDisc(m, "y", [0, 0], 0.19, y, y + 0.035, 0.012, 48);
      lathe(m, "y", [0, 0], [[0, y + 0.03], [0.18, y + 0.03], [0.16, y + 0.075], [0.1, y + 0.105], [0, y + 0.115]], 48);
      for (let k = 0; k < 12; k++) {
        const t = (k / 12) * Math.PI * 2;
        cylinder(m, "y", [Math.sin(t) * 0.175, Math.cos(t) * 0.175], 0.008, y + 0.035, y + 0.05, HEX);
      }
    });
    beacon = [0.09, neckTop + 0.26, 0];
  } else if (act === "motor") {
    add("actuator", "body-secondary", "Motor operator", "paint", (m) => {
      roundedBox(m, [-0.12, neckTop + 0.1, -0.09], [0.12, neckTop + 0.26, 0.09], 0.02, 3);
      lathe(m, "z", [0.05, neckTop + 0.18], [[0, 0.09], [0.06, 0.09], [0.065, 0.1], [0.065, 0.26], [0.055, 0.275], [0, 0.275]], 32);
    });
    add("handwheel", "detail", "Handwheel", "steel", (m) => {
      const ring: Vec3[] = [];
      for (let k = 0; k <= 48; k++) {
        const t = (k / 48) * Math.PI * 2;
        ring.push([-0.12 - 0.035, neckTop + 0.18 + Math.cos(t) * 0.07, Math.sin(t) * 0.07]);
      }
      sweep(m, ring, 0.008, 10, false);
      cylinder(m, "x", [neckTop + 0.18, 0], 0.012, -0.155, -0.12, 16);
    });
    beacon = [0, neckTop + 0.26, 0];
  } else if (act === "manual") {
    add("handwheel", "detail", "Handwheel", "steel", (m) => {
      const y = stemTop;
      const ring: Vec3[] = [];
      for (let k = 0; k <= 56; k++) {
        const t = (k / 56) * Math.PI * 2;
        ring.push([Math.cos(t) * 0.14, y, Math.sin(t) * 0.14]);
      }
      sweep(m, ring, 0.011, 12, false);
      const spoke = emptyMesh();
      cylinder(spoke, "x", [y, 0], 0.007, 0.02, 0.135, 10);
      for (let k = 0; k < 4; k++) appendRotated(m, spoke, "y", (k * Math.PI) / 2, [0, 0, 0]);
      roundedDisc(m, "y", [0, 0], 0.03, y - 0.015, y + 0.015, 0.005, 24);
    });
    beacon = [0.09, neckTop - 0.005, 0.045];
  }
  addBeacon((id, role, label, finish, build, pivot, flags) => add(id, role, label, finish, build, pivot, flags), beacon);

  let model: SpatialModel = {
    nodes,
    ports: [
      { id: "inlet", kind: "inlet", position: [-0.36, AY, 0], direction: [-1, 0, 0] },
      { id: "outlet", kind: "outlet", position: [0.36, AY, 0], direction: [1, 0, 0] },
    ],
    animations: [],
    effects: [{ type: "vibration", states: ["warning"], amplitude: 0.0008, frequencyHz: 30 }],
    badge: [-0.3, stemTop + 0.25, 0],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
  };
  if (vertical) model = uprightRun(model, AY);
  return model;
}

/** Turn a horizontal run vertical (pipe along Y, actuator pointing −X). */
function uprightRun(model: SpatialModel, ay: number): SpatialModel {
  const pivot: Vec3 = [0, ay, 0];
  const rot = (v: Vec3, translate = true): Vec3 => {
    const [x, y, z] = translate ? [v[0] - pivot[0], v[1] - pivot[1], v[2]] : v;
    const r: Vec3 = [-y, x, z]; // +90° about Z
    return translate ? [r[0] + pivot[0], r[1] + pivot[1], r[2]] : r;
  };
  return {
    ...model,
    nodes: model.nodes.map((n) => {
      const m = emptyMesh();
      // Mesh vertices are relative to the node pivot; rotate about the pivot's own origin.
      appendRotated(m, n.mesh, "z", Math.PI / 2, [0, 0, 0]);
      return { ...n, mesh: m, translation: rot(n.translation) };
    }),
    ports: model.ports.map((q) => ({ ...q, position: rot(q.position), direction: rot(q.direction, false) })),
    badge: rot(model.badge),
  };
}
