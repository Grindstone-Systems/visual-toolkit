import { blade, cylinder, emptyMesh, lathe, roundedBox, roundedDisc, type Mesh } from "../spatial/mesh.ts";
import type { Finish, ParamValues, RegionRole, SpatialAnimation, SpatialModel, SpatialNode, Vec3 } from "../types.ts";
import { addBeacon } from "./motor3d.ts";

/**
 * Stylised 3D belt conveyor from the same params as the 2D symbol. Length is
 * procedural (0.5 m per section): frame, idlers, legs and product re-lay out.
 * Running: pulleys turn, belt cleats and product slide along seamlessly (each
 * loop grows items in at the tail and shrinks them out at the head).
 */

const SECTION = 0.5;
const WB = 0.5; // belt width
const RP = 0.09; // pulley radius

export function beltConveyor3d(p: ParamValues): SpatialModel {
  const n = Number(p.length);
  const L = n * SECTION;
  const s = p.direction === "left" ? -1 : 1;
  const H = p.supports ? 0.82 : 0.3; // belt top height
  const cy = H - RP - 0.008; // pulley centre
  const nodes: SpatialNode[] = [];
  const animations: SpatialAnimation[] = [];
  const add = (id: string, role: RegionRole, label: string, finish: Finish, build: (m: Mesh) => void, pivot: Vec3 = [0, 0, 0]) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot });
  };
  const tail = s > 0 ? 0 : L; // infeed end
  const head = s > 0 ? L : 0; // discharge end
  const drive = p.drive === "none" ? null : p.drive === "head" ? head : tail;

  // Side frames.
  add("side-frame", "base", "Side frames", "paint", (m) => {
    for (const z of [-(WB / 2 + 0.04), WB / 2 + 0.01]) roundedBox(m, [-0.12, cy - 0.12, z], [L + 0.12, cy + 0.035, z + 0.03], 0.008, 2);
    // Cross members under the carrying run.
    for (let i = 0; i <= n; i++) roundedBox(m, [i * SECTION - 0.02, cy - 0.12, -WB / 2 - 0.02], [i * SECTION + 0.02, cy - 0.09, WB / 2 + 0.02], 0.006, 2);
  });

  // Legs every metre (and at both ends) with feet and bracing.
  if (p.supports) {
    add("legs", "base", "Support legs", "paint", (m) => {
      const xs: number[] = [];
      for (let x = 0.1; x < L - 0.05; x += 1) xs.push(x);
      if (L - 0.1 - xs[xs.length - 1]! > 0.3) xs.push(L - 0.1);
      for (const x of xs) {
        for (const z of [-(WB / 2 + 0.035), WB / 2 + 0.005]) {
          roundedBox(m, [x - 0.025, 0.02, z], [x + 0.025, cy - 0.12, z + 0.03], 0.006, 2);
          roundedBox(m, [x - 0.06, 0, z - 0.03], [x + 0.06, 0.02, z + 0.06], 0.005, 2);
        }
        roundedBox(m, [x - 0.015, 0.22, -WB / 2 - 0.02], [x + 0.015, 0.25, WB / 2 + 0.02], 0.005, 2);
      }
    });
  }

  // Idlers under the carrying run.
  add("idlers", "detail", "Carrying idlers", "steel", (m) => {
    for (let x = SECTION / 2; x < L - 0.1; x += SECTION / 2) cylinder(m, "z", [x, cy + RP - 0.035], 0.028, -WB / 2, WB / 2, 20);
  });

  // Belt: a closed band around both pulleys (rubber).
  const loop = (r: number): [number, number][] => {
    const pts: [number, number][] = [];
    const arc = 16;
    for (let i = 0; i <= arc; i++) {
      const t = Math.PI / 2 - (i / arc) * Math.PI; // head pulley, over the top and down
      pts.push([L + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    for (let i = 0; i <= arc; i++) {
      const t = -Math.PI / 2 - (i / arc) * Math.PI; // tail pulley, under and up
      pts.push([Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    pts.push(pts[0]!);
    return pts;
  };
  add("belt", "base", "Belt", "rubber", (m) => blade(m, "z", loop(RP + 0.008), loop(RP), -WB / 2, WB / 2));

  // Pulleys (rotate with the belt).
  for (const [id, x] of [
    ["tail-pulley", 0],
    ["head-pulley", L],
  ] as const) {
    add(
      id,
      "rotor",
      id === "tail-pulley" ? "Tail pulley" : "Head pulley",
      "steel",
      (m) => {
        cylinder(m, "z", [0, 0], RP - 0.002, -WB / 2 - 0.005, WB / 2 + 0.005, 36);
        cylinder(m, "z", [0, 0], 0.025, -WB / 2 - 0.08, WB / 2 + 0.08, 20);
        for (const z of [-WB / 2 - 0.02, WB / 2 + 0.02]) roundedDisc(m, "z", [0, 0], 0.035, z - 0.012, z + 0.012, 0.004, 20); // hubs
        roundedBox(m, [-0.012, RP - 0.03, WB / 2 + 0.006], [0.012, RP - 0.006, WB / 2 + 0.012], 0.003, 1); // rotation mark
      },
      [x, cy, 0],
    );
    // Top of belt moves +X when running right → negative rotation about +Z.
    animations.push({ id: `${id}-spin`, node: id, axis: "z", reverse: s > 0, periodMs: 900, states: ["running"] });
  }

  // Cleats sliding along the belt top make the belt's motion visible.
  const cleatPitch = 0.25;
  const cleats = Math.round(L / cleatPitch);
  for (let i = 0; i < cleats; i++) {
    const x0 = s > 0 ? i * cleatPitch : L - i * cleatPitch;
    const id = `cleat-${i + 1}`;
    add(id, "detail", "Belt cleat", "rubber", (m) => roundedBox(m, [-0.008, 0, -WB / 2 + 0.03], [0.008, 0.012, WB / 2 - 0.03], 0.004, 1), [x0, H, 0]);
    animations.push({
      id: `${id}-flow`,
      type: "slide",
      node: id,
      vector: [s * cleatPitch, 0, 0],
      fadeIn: i === 0,
      fadeOut: i === cleats - 1,
      periodMs: 900 * (cleatPitch / (2 * Math.PI * RP)) * 1,
      states: ["running"],
    });
  }

  // Product riding on the belt.
  if (p.load !== "none") {
    const boxes = p.load === "boxes";
    const pitch = boxes ? 0.75 : 0.25;
    const count = Math.max(1, Math.floor((L - 0.2) / pitch));
    for (let i = 0; i < count; i++) {
      const x0 = s > 0 ? 0.15 + i * pitch : L - 0.15 - i * pitch;
      const id = `product-${i + 1}`;
      add(
        id,
        "product",
        boxes ? "Carton" : "Bulk material",
        boxes ? "paint" : "rubber",
        (m) => {
          if (boxes) {
            roundedBox(m, [-0.13, 0, -0.16], [0.13, 0.2, 0.16], 0.012, 2);
            roundedBox(m, [-0.132, 0.085, -0.162], [0.132, 0.115, 0.162], 0.004, 1); // tape band
          } else {
            lathe(m, "y", [0, 0], [[0, 0], [0.13, 0], [0.1, 0.035], [0.05, 0.065], [0, 0.075]], 20);
          }
        },
        [x0, H + 0.008, 0],
      );
      animations.push({
        id: `${id}-flow`,
        type: "slide",
        node: id,
        vector: [s * pitch, 0, 0],
        fadeIn: i === 0,
        fadeOut: i === count - 1,
        periodMs: (pitch / cleatPitch) * 900 * (cleatPitch / (2 * Math.PI * RP)),
        states: ["running"],
      });
    }
  }

  // Drive: gearmotor on the driven pulley's shaft, outboard of the frame.
  let beacon: Vec3 = [head, H + 0.04, WB / 2 + 0.06];
  if (drive !== null) {
    add("drive", "body-secondary", "Gearmotor", "paint", (m) => {
      roundedBox(m, [drive - 0.1, cy - 0.1, WB / 2 + 0.09], [drive + 0.1, cy + 0.1, WB / 2 + 0.22], 0.02, 3); // gearbox
      lathe(m, "y", [WB / 2 + 0.155, drive], [[0, cy - 0.34], [0.07, cy - 0.34], [0.08, cy - 0.32], [0.08, cy - 0.12], [0.07, cy - 0.1], [0, cy - 0.1]], 32);
    });
    beacon = [drive, cy + 0.1, WB / 2 + 0.155];
  }
  addBeacon((id, role, label, finish, build, pivot, flags) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot ?? [0, 0, 0], ...flags });
  }, beacon);

  return {
    nodes,
    ports: [
      { id: "infeed", kind: "inlet", position: [tail - s * 0.1, H + 0.1, 0], direction: [-s, 0, 0] },
      { id: "discharge", kind: "outlet", position: [head + s * 0.1, H + 0.1, 0], direction: [s, 0, 0] },
    ],
    animations,
    effects: [{ type: "vibration", states: ["warning"], amplitude: 0.0008, frequencyHz: 18 }],
    badge: [tail, H + 0.5, 0],
  };
}
