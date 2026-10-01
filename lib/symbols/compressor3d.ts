import { appendRotated, cylinder, emptyMesh, lathe, mirrorMeshX, roundedBox, roundedDisc, sweep, type Mesh, type ProfilePoint } from "../spatial/mesh.ts";
import { extrudeRounded } from "../spatial/extrude.ts";
import type { ParamValues, SpatialModel, SpatialNode, SpatialPort, Vec3 } from "../types.ts";
import { addBeacon, addMotorBody, type AddPart } from "./motor3d.ts";

/**
 * Stylised 3D rotary-screw air compressor from the same params as the 2D
 * symbol. The open skid shows the machinery: oil separator, twin-screw airend
 * with inlet filter, coupling, TEFC motor and an air or water cooler. The
 * enclosed package wraps a smaller copy of the same machinery in a cabinet
 * (control panel, louvres, cooler fan, roof exhaust); its cutaway opens the
 * cabinet and the airend so the screw rotors can be seen turning.
 * Metres, +Y up; the cooler is on +X unless "cooler: left" mirrors it.
 */

const HEX = 6;

type Flags = { section?: boolean; internal?: boolean };

/** Figure-eight outline of two meshing rotor bores, in the (y, z) plane. */
function twinBore(y1: number, r1: number, y2: number, r2: number, n = 28): [number, number][] {
  const d = y1 - y2;
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const b1 = Math.atan2(h, a);
  const b2 = Math.atan2(h, d - a);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = -(Math.PI - b1) + (i / n) * 2 * (Math.PI - b1);
    out.push([y1 + r1 * Math.cos(t), r1 * Math.sin(t)]);
  }
  for (let i = 1; i < n; i++) {
    const t = b2 + (i / n) * (2 * Math.PI - 2 * b2);
    out.push([y2 + r2 * Math.cos(t), r2 * Math.sin(t)]);
  }
  return out;
}

function flangedUp(m: Mesh, bolts: Mesh | null, x: number, z: number, r: number, y0: number, face: number, seg: number) {
  cylinder(m, "y", [z, x], r, y0, face - 0.03, seg);
  lathe(m, "y", [z, x], [[0, face - 0.07], [r + 0.002, face - 0.07], [r * 1.3, face - 0.03], [0, face - 0.03]], seg);
  roundedDisc(m, "y", [z, x], r * 1.9, face - 0.03, face, 0.004, seg);
  if (bolts) {
    for (let k = 0; k < 8; k++) {
      const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
      cylinder(bolts, "y", [z + Math.sin(t) * r * 1.58, x + Math.cos(t) * r * 1.58], 0.0075, face - 0.04, face + 0.01, HEX);
    }
  }
}

interface Machinery {
  motorTop: Vec3;
  discharge: Vec3;
  intake: Vec3;
  power: Vec3;
  animations: SpatialModel["animations"];
}

/**
 * Separator, airend with rotors, filter, coupling and motor along X. The
 * airend/motor centreline is at `AY`; x runs from about −0.95 to +0.62.
 */
function machinery(add: AddPart, detail: string, seg: number, AY: number, floor: number, flags: Flags): Machinery {
  const fine = detail !== "simple";
  const sec: Flags = { ...flags, section: true };
  const bolts = fine ? emptyMesh() : null;

  // Oil separator vessel (vertical, ellipsoidal heads).
  const SXc = -0.77;
  const SR = 0.15;
  const s0 = floor + 0.12;
  const s1 = floor + 0.64;
  const head = (w: number, dir: 1 | -1): ProfilePoint[] =>
    Array.from({ length: 11 }, (_, k) => {
      const t = (k / 10) * (Math.PI / 2);
      return [SR * Math.cos(t), w + dir * SR * 0.5 * Math.sin(t)] as ProfilePoint;
    });
  add("separator", "body-secondary", "Oil separator", "paint", (m) => {
    lathe(m, "y", [0, SXc], [[0, s0 - SR * 0.5], ...head(s0, -1).reverse().slice(1), [SR, s1], ...head(s1, 1).slice(1)], seg);
    for (const y of [s0, s1]) roundedDisc(m, "y", [0, SXc], SR + 0.005, y - 0.006, y + 0.006, 0.003, seg);
  }, [0, 0, 0], flags);
  add("separator-legs", "base", "Separator legs", "paint", (m) => {
    for (let k = 0; k < 3; k++) {
      const t = (k / 3) * Math.PI * 2 + Math.PI / 6;
      cylinder(m, "y", [Math.sin(t) * SR * 0.8, SXc + Math.cos(t) * SR * 0.8], 0.02, floor, s0 - SR * 0.3, 14);
    }
  }, [0, 0, 0], flags);
  const dTop = s1 + SR * 0.5;
  add("discharge-nozzle", "nozzle", "Discharge nozzle", "cast", (m) => flangedUp(m, bolts, SXc, 0, 0.04, dTop - 0.03, dTop + 0.14, seg), [0, 0, 0], flags);
  add("discharge-pipe", "nozzle", "Airend discharge", "cast", (m) => {
    sweep(m, [[-0.5, AY + 0.06, 0], [-0.56, AY + 0.06, 0], [-0.6, AY + 0.1, 0], [SXc + SR * 0.6, AY + 0.1, 0]], 0.032, 20);
  }, [0, 0, 0], flags);

  // Airend: twin-bore casing along X with end covers.
  const A0 = -0.52;
  const A1 = -0.1;
  const yM = 0.065;
  const yF = -0.07;
  add("airend", "body", "Screw airend", "cast", (m) => {
    extrudeRounded(m, "x", twinBore(AY + yM, 0.12, AY + yF, 0.1), A0 + 0.03, A1 - 0.03, 0.016);
    extrudeRounded(m, "x", twinBore(AY + yM, 0.132, AY + yF, 0.112), A0, A0 + 0.035, 0.008);
    extrudeRounded(m, "x", twinBore(AY + yM, 0.132, AY + yF, 0.112), A1 - 0.035, A1, 0.008);
    // Inlet housing on top, feeding the filter.
    roundedBox(m, [-0.4, AY + 0.14, -0.07], [-0.22, AY + 0.21, 0.07], 0.02, 3);
  }, [0, 0, 0], sec);
  add("airend-foot", "base", "Airend foot", "cast", (m) => {
    roundedBox(m, [-0.44, floor, -0.14], [-0.18, AY - 0.12, 0.14], 0.016, 2);
  }, [0, 0, 0], flags);
  if (bolts) {
    for (let k = 0; k < 10; k++) {
      const t = (k / 10) * Math.PI * 2;
      for (const x of [A0 - 0.008, A1 - 0.027]) cylinder(bolts, "x", [AY + yM * 0.2 + Math.cos(t) * 0.17, Math.sin(t) * 0.1], 0.008, x, x + 0.035, HEX);
    }
  }
  add("air-filter", "body-secondary", "Inlet filter", "paint", (m) => {
    const fx = -0.31;
    const y0 = AY + 0.21;
    lathe(m, "y", [0, fx], [[0, y0], [0.045, y0], [0.05, y0 + 0.04], [0.1, y0 + 0.05], [0.105, y0 + 0.06], [0.105, y0 + 0.21], [0.095, y0 + 0.225], [0, y0 + 0.225]], seg);
    if (fine) for (const y of [y0 + 0.09, y0 + 0.17]) roundedDisc(m, "y", [0, fx], 0.108, y - 0.005, y + 0.005, 0.002, seg);
  }, [0, 0, 0], flags);

  // Rotors (cutaway): lobed screws as helical crests round a core.
  const rotor = (id: string, label: string, r: number, lobes: number, hand: 1 | -1, y: number) => {
    add(id, "detail", label, "steel", (m) => {
      cylinder(m, "x", [0, 0], r * 0.62, A0 + 0.04, A1 - 0.04, 24);
      for (let k = 0; k < lobes; k++) {
        const path: Vec3[] = [];
        for (let i = 0; i <= 32; i++) {
          const x = A0 + 0.045 + (i / 32) * (A1 - A0 - 0.09);
          const t = (k / lobes) * Math.PI * 2 + hand * (x - A0) * 11;
          path.push([x, Math.cos(t) * r * 0.72, Math.sin(t) * r * 0.72]);
        }
        sweep(m, path, r * 0.24, 10);
      }
      cylinder(m, "x", [0, 0], 0.024, A0 - 0.02, A1 + (y > 0 ? 0.08 : 0), 16);
    }, [0, AY + y, 0], { ...flags, internal: true });
  };
  rotor("male-rotor", "Male rotor", 0.1, 4, 1, yM);
  rotor("female-rotor", "Female rotor", 0.085, 6, -1, yF);

  // Coupling and motor.
  const M0 = 0.03;
  const M1 = 0.56;
  add("coupling", "rotor", "Coupling", "steel", (m) => {
    roundedDisc(m, "x", [0, 0], 0.075, -0.028, -0.004, 0.005, seg);
    roundedDisc(m, "x", [0, 0], 0.075, 0.004, 0.028, 0.005, seg);
    const lug = emptyMesh();
    roundedBox(lug, [-0.024, 0.058, -0.015], [0.024, 0.082, 0.015], 0.005, 2);
    for (let k = 0; k < 4; k++) appendRotated(m, lug, "x", (k * Math.PI) / 2, [0, 0, 0]);
  }, [-0.035, AY + yM, 0], flags);
  const motorAdd: AddPart = (id, role, label, finish, build, pivot, f = {}) => add(id, role, label, finish, build, pivot, { ...f, ...flags });
  const top = addMotorBody(motorAdd, { M0, M1, AY: AY + yM, R: 0.17, detail, seg });
  add("motor-feet", "base", "Motor feet", "cast", (m) => {
    for (const x of [M0 + 0.1, M1 - 0.1]) roundedBox(m, [x - 0.05, floor, -0.2], [x + 0.05, AY + yM - 0.12, 0.2], 0.012, 2);
  }, [0, 0, 0], flags);
  if (bolts) nodes(add, "machine-bolts", bolts, flags);

  return {
    motorTop: top,
    discharge: [SXc, dTop + 0.14, 0],
    intake: [-0.31, AY + 0.435, 0],
    power: [(M0 + M1) / 2, AY + yM + 0.19, 0.11],
    animations: [
      { id: "coupling-spin", node: "coupling", axis: "x", periodMs: 500, states: ["running"] },
      { id: "male-rotor-spin", node: "male-rotor", axis: "x", periodMs: 500, states: ["running"] },
      { id: "female-rotor-spin", node: "female-rotor", axis: "x", reverse: true, periodMs: 750, states: ["running"] },
    ],
  };
}

function nodes(add: AddPart, id: string, mesh: Mesh, flags: Flags) {
  add(id, "detail", "Bolting", "steel", (m) => {
    m.positions.push(...mesh.positions);
    m.normals.push(...mesh.normals);
    m.indices.push(...mesh.indices);
  }, [0, 0, 0], flags);
}

/** Axial fan: hub and swept blades, spinning about `axis` at its pivot. */
function fanRotor(m: Mesh, r: number, seg: number) {
  roundedDisc(m, "z", [0, 0], r * 0.22, -0.02, 0.02, 0.006, seg);
  const bladeMesh = emptyMesh();
  roundedBox(bladeMesh, [r * 0.18, -r * 0.1, -0.004], [r * 0.95, r * 0.1, 0.004], 0.004, 2);
  for (let k = 0; k < 5; k++) {
    const pitched = emptyMesh();
    appendRotated(pitched, bladeMesh, "x", 0.45, [0, 0, 0]);
    appendRotated(m, pitched, "z", (k / 5) * Math.PI * 2, [0, 0, 0]);
  }
}

function guardRings(m: Mesh, cx: number, cy: number, z: number, r: number) {
  for (const rr of [0.3, 0.62, 0.95]) {
    const ring: Vec3[] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push([cx + Math.cos(a) * rr * r, cy + Math.sin(a) * rr * r, z]);
    }
    sweep(m, ring, 0.004, 8, false);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    sweep(m, [[cx, cy, z], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]], 0.0045, 8);
  }
}

export function airCompressor3d(p: ParamValues): SpatialModel {
  const air = p.cooling === "air";
  const detail = String(p.detail);
  const fine = detail !== "simple";
  const seg = detail === "simple" ? 24 : detail === "detailed" ? 52 : 40;
  const list: SpatialNode[] = [];
  const add: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
    const m = emptyMesh();
    build(m);
    list.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };
  const ports: SpatialPort[] = [];
  let animations: SpatialModel["animations"] = [];
  let badge: Vec3;
  const bolts = fine ? emptyMesh() : null;

  if (p.package === "skid") {
    const FLOOR = 0.09;
    const AY = 0.43;
    add("skid", "base", "Base frame", "paint", (m) => {
      for (const z of [-0.3, 0.3]) roundedBox(m, [-1.0, 0, z - 0.05], [1.24, FLOOR, z + 0.05], 0.01, 2);
      for (const x of [-0.95, -0.3, 0.3, 0.8, 1.19]) roundedBox(m, [x - 0.04, 0.012, -0.3], [x + 0.04, FLOOR - 0.012, 0.3], 0.008, 2);
      roundedBox(m, [-1.0, FLOOR - 0.012, -0.34], [1.24, FLOOR, 0.34], 0.004, 2);
    });
    const mach = machinery(add, detail, seg, AY, FLOOR, {});
    animations = mach.animations;
    // Cooler beyond the motor fan end.
    if (air) {
      const CX = 0.97;
      add("cooler", "body-secondary", "Oil / air cooler", "paint", (m) => {
        roundedBox(m, [CX - 0.2, FLOOR, -0.1], [CX + 0.2, FLOOR + 0.76, 0.06], 0.02, 3);
        roundedBox(m, [CX - 0.17, FLOOR + 0.08, 0.05], [CX + 0.17, FLOOR + 0.72, 0.1], 0.03, 3); // fan shroud
      });
      if (fine) {
        add("cooler-core", "detail", "Cooler core", "cast", (m) => {
          for (let i = 0; i < 16; i++) {
            const x = CX - 0.17 + (i / 15) * 0.34;
            roundedBox(m, [x - 0.004, FLOOR + 0.04, -0.106], [x + 0.004, FLOOR + 0.72, -0.098], 0.002, 1);
          }
        });
      }
      const fy = FLOOR + 0.4;
      add("fan-guard", "detail", "Fan guard", "steel", (m) => guardRings(m, CX, fy, 0.118, 0.155));
      add("cooler-fan", "detail", "Cooler fan", "cast", (m) => fanRotor(m, 0.15, seg), [CX, fy, 0.085]);
      animations.push({ id: "fan-spin", node: "cooler-fan", axis: "z", reverse: true, periodMs: 400, states: ["running"] });
    } else {
      const CX = 0.98;
      const cy = 0.46;
      add("cooler", "body-secondary", "Water cooler", "paint", (m) => {
        lathe(m, "x", [cy, 0], [[0, CX - 0.24], [0.1, CX - 0.24], [0.11, CX - 0.225], [0.11, CX + 0.225], [0.1, CX + 0.24], [0, CX + 0.24]], seg);
        for (const x of [CX - 0.13, CX + 0.13]) roundedDisc(m, "x", [cy, 0], 0.135, x - 0.015, x + 0.015, 0.004, seg);
      });
      add("cooler-stand", "base", "Cooler stand", "paint", (m) => {
        for (const x of [CX - 0.13, CX + 0.13]) roundedBox(m, [x - 0.03, FLOOR, -0.09], [x + 0.03, cy - 0.08, 0.09], 0.008, 2);
      });
      for (const [id, name, x, kind] of [["water-inlet", "Water inlet", CX - 0.07, "inlet"], ["water-outlet", "Water outlet", CX + 0.07, "outlet"]] as const) {
        add(`${id}-nozzle`, "nozzle", `${name} nozzle`, "cast", (m) => flangedUp(m, bolts, x, 0, 0.028, cy + 0.08, cy + 0.24, seg));
        ports.push({ id, kind, position: [x, cy + 0.24, 0], direction: [0, 1, 0] });
      }
    }
    addBeacon(add, mach.motorTop);
    ports.unshift(
      { id: "discharge", kind: "outlet", position: mach.discharge, direction: [0, 1, 0] },
      { id: "air-intake", kind: "inlet", position: mach.intake, direction: [0, 1, 0] },
      { id: "power", kind: "power", position: mach.power, direction: [0, 0, 1] },
    );
    badge = [-0.77, 1.35, 0];
  } else {
    // Enclosed package: cabinet with the machinery inside at 0.62 scale.
    const X0 = -0.78;
    const X1 = 0.78;
    const Y0 = 0.08;
    const Y1 = 0.92;
    const Z = 0.46;
    const cut = { section: true } as const;
    add("skid", "base", "Base frame", "paint", (m) => {
      roundedBox(m, [X0 - 0.02, 0, -Z - 0.02], [X1 + 0.02, Y0, Z + 0.02], 0.01, 2);
    });
    if (fine) {
      add("fork-pockets", "detail", "Fork pockets", "rubber", (m) => {
        for (const x of [-0.42, 0.42]) roundedBox(m, [x - 0.12, 0.014, Z + 0.012], [x + 0.12, Y0 - 0.014, Z + 0.024], 0.004, 1);
      });
    }
    add("enclosure", "body", "Enclosure", "paint", (m) => {
      roundedBox(m, [X0, Y0, -Z], [X1, Y1, Z], 0.03, 4);
    }, [0, 0, 0], cut);
    // Control panel door, display and buttons on the front (+Z).
    const px0 = -0.7;
    const px1 = -0.3;
    add("control-panel", "body-secondary", "Control panel", "paint", (m) => {
      roundedBox(m, [px0, 0.4, Z - 0.01], [px1, 0.84, Z + 0.018], 0.012, 2);
    }, [0, 0, 0], cut);
    if (fine) {
      add("panel-detail", "detail", "Display and controls", "lens", (m) => {
        roundedBox(m, [px0 + 0.06, 0.66, Z + 0.016], [px1 - 0.06, 0.8, Z + 0.024], 0.006, 2);
        for (const x of [px0 + 0.1, px1 - 0.1]) cylinder(m, "z", [x, 0.52], 0.018, Z + 0.016, Z + 0.03, 20);
      }, [0, 0, 0], cut);
    }
    // Intake louvres (lower left) and door seams.
    add("louvres", "detail", "Louvres", "cast", (m) => {
      for (let i = 0; i < 5; i++) {
        const y = 0.14 + i * 0.045;
        roundedBox(m, [px0, y, Z - 0.005], [px1, y + 0.022, Z + 0.016], 0.006, 2);
      }
      for (const x of [-0.2, 0.1]) roundedBox(m, [x - 0.004, Y0 + 0.06, Z - 0.004], [x + 0.004, Y1 - 0.06, Z + 0.006], 0.002, 1);
    }, [0, 0, 0], cut);
    // Cooler grille on the front right.
    const gx0 = 0.18;
    const gx1 = 0.7;
    add("cooler-grille", "body-secondary", "Cooler grille", "paint", (m) => {
      roundedBox(m, [gx0, 0.16, Z - 0.01], [gx1, 0.82, Z + 0.02], 0.014, 2);
      if (!air) for (let i = 0; i < 9; i++) roundedBox(m, [gx0 + 0.03, 0.2 + i * 0.066, Z + 0.016], [gx1 - 0.03, 0.2 + i * 0.066 + 0.026, Z + 0.034], 0.008, 2);
    }, [0, 0, 0], cut);
    const discharge: Vec3 = [-0.1, Y1 + 0.2, -0.2];
    add("discharge-nozzle", "nozzle", "Discharge nozzle", "cast", (m) => flangedUp(m, bolts, discharge[0], discharge[2], 0.036, Y1 - 0.01, discharge[1], seg));
    if (air) {
      const fc: [number, number] = [(gx0 + gx1) / 2, 0.49];
      const fr = 0.22;
      add("fan-guard", "detail", "Fan guard", "steel", (m) => guardRings(m, fc[0], fc[1], Z + 0.05, fr), [0, 0, 0], cut);
      add("fan-shroud", "detail", "Fan shroud", "cast", (m) => {
        lathe(m, "z", fc, [[fr + 0.005, Z + 0.015], [fr + 0.03, Z + 0.015], [fr + 0.03, Z + 0.045], [fr + 0.005, Z + 0.045], [fr + 0.005, Z + 0.015]], seg);
      }, [0, 0, 0], cut);
      add("cooler-fan", "detail", "Cooler fan", "cast", (m) => fanRotor(m, fr - 0.01, seg), [fc[0], fc[1], Z + 0.03], cut);
      animations.push({ id: "fan-spin", node: "cooler-fan", axis: "z", reverse: true, periodMs: 400, states: ["running"] });
      add("exhaust-hood", "body-secondary", "Cooling air exhaust", "paint", (m) => {
        roundedBox(m, [gx0, Y1 - 0.01, -0.3], [gx1, Y1 + 0.1, 0.3], 0.02, 3);
        if (fine) for (let i = 0; i < 8; i++) roundedBox(m, [gx0 + 0.03 + i * 0.058, Y1 + 0.095, -0.26], [gx0 + 0.058 + i * 0.058, Y1 + 0.11, 0.26], 0.005, 2);
      });
    } else {
      for (const [id, name, y, kind] of [["water-outlet", "Water outlet", 0.62, "outlet"], ["water-inlet", "Water inlet", 0.34, "inlet"]] as const) {
        add(`${id}-nozzle`, "nozzle", `${name} nozzle`, "cast", (m) => {
          cylinder(m, "x", [y, 0.1], 0.028, X1 - 0.01, X1 + 0.1, seg);
          roundedDisc(m, "x", [y, 0.1], 0.055, X1 + 0.1, X1 + 0.125, 0.004, seg);
          if (bolts) for (let k = 0; k < 6; k++) {
            const t = (k / 6) * Math.PI * 2;
            cylinder(bolts, "x", [y + Math.cos(t) * 0.043, 0.1 + Math.sin(t) * 0.043], 0.007, X1 + 0.09, X1 + 0.133, HEX);
          }
        });
        ports.push({ id, kind, position: [X1 + 0.125, y, 0.1], direction: [1, 0, 0] });
      }
    }
    addBeacon(add, [-0.5, Y1, -0.1]);

    // Internal machinery, built full size and shrunk into the cabinet.
    const inner: SpatialNode[] = [];
    const addIn: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
      const m = emptyMesh();
      build(m);
      inner.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
    };
    const mach = machinery(addIn, detail === "detailed" ? "standard" : detail, seg, 0.43, 0, { internal: true });
    const k = 0.62;
    const off: Vec3 = [-0.12, Y0, -0.02];
    for (const n of inner) {
      const pos = n.mesh.positions.map((v) => Math.round(v * k * 1e4) / 1e4);
      list.push({ ...n, id: n.id === "discharge-nozzle" ? "separator-nozzle" : n.id, mesh: { ...n.mesh, positions: pos }, translation: [n.translation[0] * k + off[0], n.translation[1] * k + off[1], n.translation[2] * k + off[2]], internal: true });
    }
    animations = mach.animations.concat(animations);
    ports.unshift(
      { id: "discharge", kind: "outlet", position: discharge, direction: [0, 1, 0] },
      { id: "power", kind: "power", position: [-0.62, Y1, 0.2], direction: [0, 1, 0] },
      { id: "air-intake", kind: "inlet", position: [(px0 + px1) / 2, 0.22, Z + 0.016], direction: [0, 0, 1] },
    );
    badge = [X0 + 0.1, Y1 + 0.42, 0];
  }
  if (bolts && bolts.indices.length) list.push({ id: "flange-bolts", role: "detail", label: "Flange bolts", finish: "steel", mesh: bolts, translation: [0, 0, 0] });

  const model: SpatialModel = {
    nodes: list,
    ports,
    animations,
    effects: [{ type: "vibration", states: ["warning"], amplitude: 0.0011, frequencyHz: 24 }],
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
    badge,
  };
  return p.cooler === "left" ? mirror(model) : model;
}

function mirror(model: SpatialModel): SpatialModel {
  const mx = (v: Vec3): Vec3 => [v[0] === 0 ? 0 : -v[0], v[1], v[2]];
  return {
    ...model,
    nodes: model.nodes.map((n) => ({ ...n, mesh: mirrorMeshX(n.mesh), translation: mx(n.translation) })),
    ports: model.ports.map((q) => ({ ...q, position: mx(q.position), direction: mx(q.direction) })),
    animations: model.animations.map((a) => (a.type === "slide" || a.axis === "x" ? a : { ...a, reverse: !a.reverse })),
    badge: mx(model.badge),
  };
}
