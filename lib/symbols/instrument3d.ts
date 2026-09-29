import { cylinder, emptyMesh, lathe, roundedBox, roundedDisc, type ProfilePoint } from "../spatial/mesh.ts";
import type { ParamValues, SpatialModel, SpatialNode, SpatialPort } from "../types.ts";
import type { AddPart } from "./motor3d.ts";
import { PIPE } from "./pipe.ts";
import { HEX, appendAt, orientAndSeat, tubeX, weldNeckFlange } from "./pipe3d.ts";

/**
 * Stylised 3D field transmitter from the same params as the 2D bubble.
 *
 * A dual-compartment housing (axis along Z, display facing +Z) on a neck and
 * sensor module, over a process connection chosen by the measured variable:
 *
 * - P (PT, PIT): DN 25 flange and a two-valve block, port down.
 * - PD / F (PDT, FT, FIT): coplanar body on a three-valve manifold with
 *   high / low impulse connections, ports down.
 * - L (LT, LIT): DN 80 side flange for a vessel nozzle, port facing −X.
 * - T / A (TT, TIT, AT): DN 25 flange over a thermowell or analyser probe
 *   that reaches into the line, port down at the flange face.
 *
 * With the local display on, the LCD is the lit status indicator; with it
 * off, a blind cover and a small status LED. Cutaway sections the housing
 * to show the electronics stack.
 */

const SEG = 40;

export function transmitter3d(p: ParamValues): SpatialModel {
  const fn = String(p.function);
  const v = fn.startsWith("PD") || fn[0] === "F" ? "dp" : fn[0] === "L" ? "level" : fn[0] === "T" || fn[0] === "A" ? "probe" : "gauge";
  const display = !!p.display;
  const nodes: SpatialNode[] = [];
  const add: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };
  const q = PIPE["25"]!;
  const ports: SpatialPort[] = [];
  const up = -Math.PI / 2; // local +X → −Y (a face looking down)

  /** Sensor module (lathed, with a hex collar) from y0; returns its top. */
  const sensorModule = (y0: number, x = 0) => {
    add("sensor-module", "body-secondary", "Sensor module", "paint", (m) => {
      lathe(m, "y", [0, x], [
        [0, y0],
        [0.03, y0],
        [0.034, y0 + 0.006],
        [0.034, y0 + 0.062],
        [0.028, y0 + 0.072],
        [0.018, y0 + 0.074],
        [0, y0 + 0.074],
      ], SEG);
    });
    add("sensor-collar", "detail", "Sensor hex", "steel", (m) => cylinder(m, "y", [0, x], 0.04, y0 - 0.004, y0 + 0.012, HEX));
    return y0 + 0.074;
  };

  let neck0: number;
  if (v === "gauge") {
    const [f, b] = weldNeckFlange(q, SEG);
    add("process-flange", "flange", "Process flange DN 25", "cast", (m) => appendAt(m, f, up, [0, 0, 0]));
    add("flange-bolts", "detail", "Flange nuts", "steel", (m) => appendAt(m, b, up, [0, 0, 0]));
    const y1 = q.flange.h + 0.028;
    add("process-nozzle", "nozzle", "Process connection", "paint", (m) => {
      const t = emptyMesh();
      tubeX(t, q.od / 2, q.od / 2 - q.wall, -y1 - 0.004, -q.flange.h + 0.002, 32);
      appendAt(m, t, up, [0, 0, 0]);
    });
    add("manifold", "body-secondary", "Two-valve block", "cast", (m) => roundedBox(m, [-0.036, y1, -0.03], [0.036, y1 + 0.058, 0.03], 0.006, 2));
    add("valve-handles", "detail", "Valve handles", "steel", (m) => {
      cylinder(m, "z", [0, y1 + 0.029], 0.006, 0.03, 0.05, 16);
      roundedBox(m, [-0.03, y1 + 0.024, 0.05], [0.03, y1 + 0.034, 0.058], 0.003, 2);
      cylinder(m, "x", [y1 + 0.029, 0], 0.005, -0.052, -0.036, 16);
      cylinder(m, "x", [y1 + 0.029, 0], 0.009, -0.058, -0.05, HEX);
    });
    neck0 = sensorModule(y1 + 0.062);
    ports.push({ id: "process", kind: "bidirectional", position: [0, 0, 0], direction: [0, -1, 0], size: q.od });
  } else if (v === "dp") {
    const y1 = 0.075;
    add("process-nozzle", "nozzle", "Impulse connections", "steel", (m) => {
      for (const x of [-0.027, 0.027]) {
        cylinder(m, "y", [0, x], 0.0107, 0, y1 - 0.02, 24);
        cylinder(m, "y", [0, x], 0.016, y1 - 0.026, y1 + 0.002, HEX);
      }
    });
    add("manifold", "body-secondary", "Three-valve manifold", "cast", (m) => roundedBox(m, [-0.07, y1, -0.036], [0.07, y1 + 0.05, 0.036], 0.006, 2));
    add("valve-handles", "detail", "Valve handles", "steel", (m) => {
      for (const x of [-0.045, 0, 0.045]) {
        cylinder(m, "z", [x, y1 + 0.025], 0.0055, 0.036, 0.056, 16);
        roundedBox(m, [x - 0.018, y1 + 0.021, 0.056], [x + 0.018, y1 + 0.029, 0.063], 0.003, 2);
      }
    });
    add("process-flange", "flange", "Coplanar flange", "cast", (m) => roundedBox(m, [-0.048, y1 + 0.05, -0.034], [0.048, y1 + 0.082, 0.034], 0.005, 2));
    add("flange-bolts", "detail", "Flange bolts", "steel", (m) => {
      for (const x of [-0.036, 0.036]) for (const z of [-0.022, 0.022]) cylinder(m, "y", [z, x], 0.0075, y1 + 0.082, y1 + 0.092, HEX);
    });
    neck0 = sensorModule(y1 + 0.082);
    for (const [id, x] of [
      ["process-high", -0.027],
      ["process-low", 0.027],
    ] as const) ports.push({ id, kind: "bidirectional", position: [x, 0, 0], direction: [0, -1, 0], size: 0.0213 });
  } else if (v === "level") {
    const L = PIPE["80"]!;
    const yf = L.flange.d / 2;
    const fx = -0.13;
    const [f, b] = weldNeckFlange(L, SEG);
    add("process-flange", "flange", "Process flange DN 80", "cast", (m) => appendAt(m, f, Math.PI, [fx, yf, 0]));
    add("flange-bolts", "detail", "Flange nuts", "steel", (m) => appendAt(m, b, Math.PI, [fx, yf, 0]));
    add("sensor-module", "body-secondary", "Sensor capsule", "paint", (m) => {
      lathe(m, "x", [yf, 0], [
        [0, fx + L.flange.h - 0.004],
        [0.036, fx + L.flange.h - 0.004],
        [0.04, fx + L.flange.h + 0.002],
        [0.04, -0.012],
        [0.032, 0],
        [0, 0],
      ], SEG);
      cylinder(m, "y", [0, -0.02], 0.03, yf, yf + 0.058, SEG);
    });
    add("sensor-collar", "detail", "Sensor hex", "steel", (m) => cylinder(m, "x", [yf, 0], 0.046, fx + L.flange.h - 0.004, fx + L.flange.h + 0.012, HEX));
    neck0 = yf + 0.056;
    ports.push({ id: "process", kind: "bidirectional", position: [fx, yf, 0], direction: [-1, 0, 0], size: L.od });
  } else {
    const analyser = fn[0] === "A";
    const Lw = analyser ? 0.2 : 0.17;
    add("thermowell", "detail", analyser ? "Analyser probe" : "Thermowell", "steel", (m) => {
      const r0 = analyser ? 0.013 : 0.0115;
      const r1 = analyser ? 0.013 : 0.0075;
      const prof: ProfilePoint[] = [[0, 0]];
      for (let i = 1; i <= 6; i++) {
        const t = (i / 6) * (Math.PI / 2);
        prof.push([r1 * Math.sin(t), r1 * (1 - Math.cos(t))]);
      }
      prof.push([r0, Lw * 0.85], [r0, Lw + 0.01], [0, Lw + 0.01]);
      lathe(m, "y", [0, 0], prof, 28);
      if (analyser) for (const y of [0.03, 0.05]) roundedDisc(m, "y", [0, 0], 0.017, y - 0.004, y + 0.004, 0.002, 28);
    });
    const [f, b] = weldNeckFlange(q, SEG);
    add("process-flange", "flange", "Process flange DN 25", "cast", (m) => appendAt(m, f, up, [0, Lw, 0]));
    add("flange-bolts", "detail", "Flange nuts", "steel", (m) => appendAt(m, b, up, [0, Lw, 0]));
    const y1 = Lw + q.flange.h;
    add("process-nozzle", "nozzle", "Extension nipple", "paint", (m) => {
      cylinder(m, "y", [0, 0], 0.011, y1 - 0.004, y1 + 0.06, 24);
      cylinder(m, "y", [0, 0], 0.019, y1 + 0.028, y1 + 0.044, HEX);
    });
    neck0 = y1 + 0.06;
    ports.push({ id: "process", kind: "bidirectional", position: [0, Lw, 0], direction: [0, -1, 0], size: q.od });
  }

  /* ---------------- neck and housing ---------------- */
  const neckX = v === "level" ? -0.02 : 0;
  const HC = neck0 + 0.04 + 0.05;
  const hx = neckX;
  add("neck", "body-secondary", "Housing neck", "paint", (m) => cylinder(m, "y", [0, hx], 0.018, neck0 - 0.004, HC - 0.04, 28));
  const cut = { section: true };
  add("housing", "body", "Transmitter housing", "paint", (m) => {
    lathe(m, "z", [hx, HC], [
      [0, -0.05],
      [0.044, -0.05],
      [0.05, -0.044],
      [0.052, -0.03],
      [0.052, 0.03],
      [0.05, 0.044],
      [0.044, 0.05],
      [0, 0.05],
    ], SEG + 8);
    cylinder(m, "y", [0, hx], 0.026, HC - 0.066, HC - 0.03, SEG);
    cylinder(m, "x", [HC, 0], 0.017, hx + 0.03, hx + 0.068, 28);
    cylinder(m, "x", [HC, 0], 0.017, hx - 0.068, hx - 0.03, 28);
  }, [0, 0, 0], cut);
  add("covers", "body-secondary", "Housing covers", "paint", (m) => {
    // Rear cover (blind) and front cover: an open bezel round the display, or blind.
    roundedDisc(m, "z", [hx, HC], 0.055, -0.072, -0.049, 0.006, SEG + 8);
    if (display) {
      lathe(m, "z", [hx, HC], [
        [0.036, 0.049],
        [0.055, 0.049],
        [0.055, 0.065],
        [0.05, 0.072],
        [0.04, 0.072],
        [0.036, 0.068],
        [0.036, 0.049],
      ], SEG + 8);
    } else {
      roundedDisc(m, "z", [hx, HC], 0.055, 0.049, 0.072, 0.006, SEG + 8);
    }
  }, [0, 0, 0], cut);
  add("cable-gland", "detail", "Electrical entry", "steel", (m) => {
    cylinder(m, "x", [HC, 0], 0.017, hx + 0.066, hx + 0.08, HEX);
    lathe(m, "x", [HC, 0], [[0, hx + 0.079], [0.013, hx + 0.079], [0.013, hx + 0.09], [0.009, hx + 0.097], [0, hx + 0.097]], 24);
    cylinder(m, "x", [HC, 0], 0.016, hx - 0.078, hx - 0.066, HEX); // blanking plug
  });
  add("electronics", "detail", "Electronics stack", "cast", (m) => {
    cylinder(m, "z", [hx, HC], 0.042, -0.036, 0.036, SEG);
    roundedBox(m, [hx - 0.03, HC - 0.022, 0.036], [hx + 0.03, HC + 0.022, 0.044], 0.003, 2);
  }, [0, 0, 0], { internal: true });
  if (display) {
    add("status-hub", "indicator", "Local display", "lens", (m) => roundedDisc(m, "z", [hx, HC], 0.036, 0.046, 0.06, 0.003, SEG));
    // Seven-segment "88.8" readout and a bar graph printed on the LCD.
    add("display-digits", "detail", "Display readout", "paint", (m) => {
      const z0 = 0.0598;
      const z1 = 0.0608;
      const seg = (x0: number, y0: number, x1: number, y1: number) => roundedBox(m, [hx + x0, HC + y0, z0], [hx + x1, HC + y1, z1], 0.0004, 1);
      const w = 0.011;
      const hgt = 0.02;
      const t = 0.0022;
      for (const [k, cx] of [-0.016, 0, 0.018].entries()) {
        const x0 = cx - w / 2;
        const y0 = -0.004;
        seg(x0 + t, y0 + hgt - t, x0 + w - t, y0 + hgt);
        seg(x0 + t, y0 + hgt / 2 - t / 2, x0 + w - t, y0 + hgt / 2 + t / 2);
        seg(x0 + t, y0, x0 + w - t, y0 + t);
        for (const x of [x0, x0 + w - t]) {
          seg(x, y0 + t, x + t, y0 + hgt / 2 - t / 2);
          seg(x, y0 + hgt / 2 + t / 2, x + t, y0 + hgt - t);
        }
        if (k === 1) seg(x0 + w + 0.0018, y0, x0 + w + 0.0018 + t, y0 + t);
      }
      seg(-0.022, -0.013, 0.012, -0.009);
    });
  } else {
    add("status-hub", "indicator", "Status LED", "lens", (m) => {
      const prof: ProfilePoint[] = [[0, HC + 0.05]];
      for (let i = 0; i <= 6; i++) {
        const t = (i / 6) * (Math.PI / 2);
        prof.push([0.009 * Math.cos(t), HC + 0.052 + 0.008 * Math.sin(t)]);
      }
      lathe(m, "y", [0.02, hx], prof, 24);
    });
  }
  ports.push({ id: "signal", kind: "signal", position: [hx + 0.097, HC, 0], direction: [1, 0, 0] });

  const model: SpatialModel = { nodes, ports, animations: [], badge: [0, 0, 0], sectionPlane: { normal: [0, 0, 1], offset: 0 } };
  const seated = orientAndSeat(model, 0, 0.14);
  // Tall and slender: float the badge beside the head rather than above it.
  const hc = seated.ports.find((x) => x.id === "signal")!.position;
  seated.badge = [hc[0] - 0.19, hc[1] + 0.03, 0];
  return seated;
}

