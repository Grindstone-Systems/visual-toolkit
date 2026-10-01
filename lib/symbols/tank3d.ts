import { appendRotated, cylinder, emptyMesh, lathe, roundedBox, roundedDisc, type Mesh, type ProfilePoint } from "../spatial/mesh.ts";
import type { Finish, ParamValues, RegionRole, SpatialLevel, SpatialModel, SpatialNode, Vec3 } from "../types.ts";

/**
 * Stylised 3D process tank from the same params as the 2D symbol: vertical
 * (ellipsoidal or cone bottom) or horizontal vessel with nozzles, legs or
 * saddles, a sight glass whose liquid follows the level, and a top-entry
 * agitator. In cutaway the shell is sectioned to show the contents and the
 * impeller turning. Metres, +Y up.
 */

const HEX = 6;

export function processTank3d(p: ParamValues): SpatialModel {
  const vertical = p.orientation !== "horizontal";
  const level = Math.min(1, Math.max(0, Number(p.level) / 100));
  const nodes: SpatialNode[] = [];
  const levels: SpatialLevel[] = [];
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
  return vertical ? verticalTank(p, level, add, cut, levels, nodes) : horizontalTank(p, level, add, cut, levels, nodes);
}

type Add = (
  id: string,
  role: RegionRole,
  label: string,
  finish: Finish,
  build: (m: Mesh) => void,
  pivot?: Vec3,
  flags?: { section?: boolean; internal?: boolean },
) => void;

/** Ellipsoidal head profile points (2:1), from the tangent line toward the axis. */
function head(R: number, y: number, dir: 1 | -1, depth: number, steps = 12): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2);
    out.push([R * Math.cos(t), y + dir * depth * Math.sin(t)]);
  }
  return out;
}

function flangedNozzle(m: Mesh, axis: "x" | "y" | "z", c: [number, number], r: number, w0: number, w1: number, dir: 1 | -1) {
  cylinder(m, axis, c, r, w0, w1, 28);
  const f = dir > 0 ? w1 : w0;
  roundedDisc(m, axis, c, r * 1.75, f - (dir > 0 ? 0.02 : 0), f + (dir > 0 ? 0 : 0.02), 0.004, 32);
}

function verticalTank(p: ParamValues, level: number, add: Add, cut: { section: true }, levels: SpatialLevel[], nodes: SpatialNode[]): SpatialModel {
  const cone = p.bottom === "cone";
  const R = 0.46;
  const y0 = p.supports ? 0.55 : 0.12; // bottom tangent line
  const y1 = y0 + 1.1; // top tangent line
  const hd = R * 0.5; // 2:1 head depth
  const bottomDepth = cone ? 0.42 : hd;
  const yBottom = y0 - bottomDepth;
  const yTop = y1 + hd;

  // Shell: bottom head (or cone) → cylinder → top head, as one lathe.
  const bottom: ProfilePoint[] = cone
    ? [
        [0.06, yBottom],
        [R - 0.02, y0 - 0.01],
        [R, y0],
      ]
    : head(R, y0, -1, hd).reverse();
  const profile: ProfilePoint[] = [[0, yBottom], ...bottom, [R, y1], ...head(R, y1, 1, hd).slice(1), [0, yTop]];
  add("shell", "body", "Vessel shell", "paint", (m) => lathe(m, "y", [0, 0], profile, 64), [0, 0, 0], cut);
  add("tangent-lines", "detail", "Head seams", "paint", (m) => {
    for (const y of cone ? [y1] : [y0, y1]) roundedDisc(m, "y", [0, 0], R + 0.006, y - 0.006, y + 0.006, 0.003, 64);
  }, [0, 0, 0], cut);

  // Contents (cutaway): a heel filling the bottom head, plus a flat-topped
  // column over the straight side that follows the level.
  const ri = R - 0.012;
  add(
    "contents-heel",
    "fill",
    "Contents",
    "lens",
    (m) => lathe(m, "y", [0, 0], [...bottom.map(([r, y]) => [Math.max(0, r - 0.012), y] as ProfilePoint), [0, y0]], 56),
    [0, 0, 0],
    { internal: true, section: true },
  );
  add("contents", "fill", "Contents", "lens", (m) => cylinder(m, "y", [0, 0], ri, 0, y1 - y0, 56), [0, y0, 0], { internal: true, section: true });
  levels.push({ node: "contents", bottom: y0, top: y1, value: level });

  // Legs with base plates.
  if (p.supports) {
    add("legs", "base", "Support legs", "paint", (m) => {
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const x = Math.cos(a) * (R - 0.01);
        const z = Math.sin(a) * (R - 0.01);
        // Legs stop at the shell (bottom tangent line) so they never show inside a cutaway.
        cylinder(m, "y", [z, x], 0.035, 0.02, y0 - 0.004, 20);
        roundedBox(m, [x - 0.07, 0, z - 0.07], [x + 0.07, 0.025, z + 0.07], 0.008, 2);
      }
    });
  }

  // Nozzles: bottom outlet, top inlet, manway.
  add("outlet-nozzle", "nozzle", "Outlet nozzle", "cast", (m) => flangedNozzle(m, "y", [0, 0], 0.045, yBottom - 0.14, yBottom + 0.05, -1));
  add("inlet-nozzle", "nozzle", "Inlet nozzle", "cast", (m) => flangedNozzle(m, "y", [0.2, 0.2], 0.04, yTop - 0.12, yTop + 0.1, 1));
  add("manway", "flange", "Manway", "cast", (m) => {
    cylinder(m, "y", [-0.22, -0.12], 0.12, yTop - 0.12, yTop + 0.02, 40);
    roundedDisc(m, "y", [-0.22, -0.12], 0.15, yTop + 0.02, yTop + 0.05, 0.006, 40);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      cylinder(m, "y", [-0.22 + Math.sin(a) * 0.135, -0.12 + Math.cos(a) * 0.135], 0.009, yTop + 0.05, yTop + 0.07, HEX);
    }
  });

  // Sight glass on the side: guard frame + liquid column that follows the level.
  const gx = R + 0.07;
  const g0 = y0 + 0.05;
  const g1 = y1 - 0.05;
  add("sight-glass-frame", "flange", "Sight glass", "steel", (m) => {
    for (const y of [g0 - 0.04, g1 + 0.04]) cylinder(m, "x", [y, 0], 0.018, R - 0.02, gx + 0.02, 16);
    for (const dz of [-0.022, 0.022]) cylinder(m, "y", [dz, gx], 0.006, g0 - 0.05, g1 + 0.05, 10);
    roundedBox(m, [gx - 0.02, g0 - 0.06, -0.03], [gx + 0.02, g0 - 0.03, 0.03], 0.006, 2);
    roundedBox(m, [gx - 0.02, g1 + 0.03, -0.03], [gx + 0.02, g1 + 0.06, 0.03], 0.006, 2);
  });
  add("sight-glass-tube", "detail", "Sight glass tube", "lens", (m) => cylinder(m, "y", [0, gx], 0.013, g0 - 0.03, g1 + 0.03, 16));
  add("sight-glass-level", "fill", "Sight glass level", "lens", (m) => cylinder(m, "y", [0, gx], 0.0145, 0, g1 - g0, 16), [0, g0, 0]);
  levels.push({ node: "sight-glass-level", bottom: g0, top: g1, value: level });

  // Agitator: drive on top, shaft and pitched-blade impeller inside.
  const animations: SpatialModel["animations"] = [];
  if (p.agitator) {
    add("agitator-drive", "body-secondary", "Agitator drive", "paint", (m) => {
      roundedDisc(m, "y", [0, 0], 0.14, yTop - 0.02, yTop + 0.04, 0.008, 40); // mounting flange
      lathe(m, "y", [0, 0], [[0, yTop + 0.04], [0.1, yTop + 0.04], [0.11, yTop + 0.06], [0.11, yTop + 0.16], [0.09, yTop + 0.18], [0, yTop + 0.18]], 36);
      // Vertical motor above the gearbox.
      lathe(m, "y", [0, 0], [[0, yTop + 0.18], [0.09, yTop + 0.18], [0.095, yTop + 0.2], [0.095, yTop + 0.42], [0.085, yTop + 0.44], [0, yTop + 0.44]], 36);
    });
    add("agitator-fins", "body-secondary", "Motor fins", "paint", (m) => {
      const fin = emptyMesh();
      roundedBox(fin, [0.092, yTop + 0.21, -0.005], [0.112, yTop + 0.41, 0.005], 0.003, 2);
      for (let k = 0; k < 16; k++) appendRotated(m, fin, "y", (k / 16) * Math.PI * 2, [0, 0, 0]);
    });
    const iy = yBottom + (cone ? 0.35 : 0.3);
    add(
      "impeller",
      "detail",
      "Agitator impeller",
      "steel",
      (m) => {
        cylinder(m, "y", [0, 0], 0.022, 0, yTop - iy, 20); // shaft
        roundedDisc(m, "y", [0, 0], 0.05, -0.02, 0.02, 0.006, 24); // hub
        const bladeMesh = emptyMesh();
        roundedBox(bladeMesh, [0.04, -0.015, -0.035], [0.2, 0.015, 0.035], 0.006, 2);
        for (let k = 0; k < 4; k++) {
          const tilted = emptyMesh();
          appendRotated(tilted, bladeMesh, "x", Math.PI / 4, [0, 0, 0]); // 45° pitch
          appendRotated(m, tilted, "y", (k * Math.PI) / 2, [0, 0, 0]);
        }
      },
      [0, iy, 0],
      { internal: true },
    );
    animations.push({ id: "agitator-spin", node: "impeller", axis: "y", periodMs: 1800, states: ["running"] });
  }

  // Status beacon on a small bracket near the top.
  const by = y1 - 0.1;
  add("beacon-base", "body-secondary", "Beacon base", "paint", (m) => {
    roundedBox(m, [-0.03, by - 0.02, R - 0.01], [0.03, by + 0.02, R + 0.05], 0.006, 2);
  });
  add("status-hub", "indicator", "Status beacon", "lens", (m) => {
    lathe(m, "z", [0, by], [[0, R + 0.05], [0.022, R + 0.05], [0.022, R + 0.075], [0.016, R + 0.088], [0, R + 0.092]], 28);
  });

  return {
    nodes,
    ports: [
      { id: "inlet", kind: "inlet", position: [0.2, yTop + 0.1, 0.2], direction: [0, 1, 0] },
      { id: "outlet", kind: "outlet", position: [0, yBottom - 0.14, 0], direction: [0, -1, 0] },
    ],
    animations,
    levels,
    badge: [-R - 0.1, yTop + 0.25, 0],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
  };
}

function horizontalTank(p: ParamValues, level: number, add: Add, cut: { section: true }, levels: SpatialLevel[], nodes: SpatialNode[]): SpatialModel {
  const R = 0.38;
  const x0 = -0.62;
  const x1 = 0.62;
  const hd = R * 0.5;
  const cy = p.supports ? R + 0.22 : R + 0.04;
  const profile: ProfilePoint[] = [[0, x0 - hd], ...head(R, x0, -1, hd).reverse(), [R, x1], ...head(R, x1, 1, hd).slice(1), [0, x1 + hd]];
  add("shell", "body", "Vessel shell", "paint", (m) => lathe(m, "x", [cy, 0], profile, 64), [0, 0, 0], cut);
  add("tangent-lines", "detail", "Head seams", "paint", (m) => {
    for (const x of [x0, x1]) roundedDisc(m, "x", [cy, 0], R + 0.006, x - 0.006, x + 0.006, 0.003, 64);
  }, [0, 0, 0], cut);
  if (p.supports) {
    add("saddles", "base", "Saddles", "paint", (m) => {
      for (const x of [-0.38, 0.38]) {
        roundedBox(m, [x - 0.07, 0, -R * 0.8], [x + 0.07, 0.03, R * 0.8], 0.008, 2);
        roundedBox(m, [x - 0.02, 0.03, -R * 0.7], [x + 0.02, cy - R * 0.55, R * 0.7], 0.006, 2);
      }
    });
  }
  add("inlet-nozzle", "nozzle", "Inlet nozzle", "cast", (m) => flangedNozzle(m, "y", [0, -0.3], 0.04, cy + R - 0.05, cy + R + 0.14, 1));
  add("outlet-nozzle", "nozzle", "Outlet nozzle", "cast", (m) => flangedNozzle(m, "y", [0, 0.05], 0.045, cy - R - 0.14, cy - R + 0.05, -1));

  // Sight glass on the end head.
  const gx = x1 + hd + 0.06;
  const g0 = cy - R * 0.75;
  const g1 = cy + R * 0.75;
  add("sight-glass-frame", "flange", "Sight glass", "steel", (m) => {
    for (const y of [g0 - 0.03, g1 + 0.03]) cylinder(m, "x", [y, 0], 0.016, x1 + hd * 0.4, gx + 0.02, 16);
    for (const dz of [-0.02, 0.02]) cylinder(m, "y", [dz, gx], 0.005, g0 - 0.04, g1 + 0.04, 10);
  });
  add("sight-glass-tube", "detail", "Sight glass tube", "lens", (m) => cylinder(m, "y", [0, gx], 0.012, g0 - 0.02, g1 + 0.02, 16));
  add("sight-glass-level", "fill", "Sight glass level", "lens", (m) => cylinder(m, "y", [0, gx], 0.0135, 0, g1 - g0, 16), [0, g0, 0]);
  levels.push({ node: "sight-glass-level", bottom: g0, top: g1, value: level });

  add("beacon-base", "body-secondary", "Beacon base", "paint", (m) => roundedDisc(m, "y", [0.18, 0.3], 0.03, cy + R - 0.02, cy + R + 0.01, 0.004, 24));
  add("status-hub", "indicator", "Status beacon", "lens", (m) => {
    lathe(m, "y", [0.18, 0.3], [[0, cy + R + 0.01], [0.022, cy + R + 0.01], [0.022, cy + R + 0.035], [0.016, cy + R + 0.05], [0, cy + R + 0.054]], 28);
  });
  return {
    nodes,
    ports: [
      { id: "inlet", kind: "inlet", position: [-0.3, cy + R + 0.14, 0], direction: [0, 1, 0] },
      { id: "outlet", kind: "outlet", position: [0.05, cy - R - 0.14, 0], direction: [0, -1, 0] },
    ],
    animations: [],
    levels,
    badge: [x0 - hd, cy + R + 0.3, 0],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
  };
}
