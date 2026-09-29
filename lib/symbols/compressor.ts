import { Geo, identity, mirrorX } from "../geometry.ts";
import { OBJECT_SCHEMA, type AnimationHint, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { airCompressor3d } from "./compressor3d.ts";

/**
 * Air compressor — rotary-screw machine, either as a packaged (enclosed)
 * unit or open on a skid (separator vessel, airend, coupled motor, cooler).
 * Air-cooled units show the cooler fan turning; the skid airend shows its
 * screw lobes travelling when running. Authored with the cooler on the
 * right; "cooler left" mirrors the drawing.
 */

export const airCompressor: Generator = {
  id: "compressor.air",
  version: 0,
  family: "compressor",
  name: "Air compressor",
  description: "Rotary-screw air compressor, packaged enclosure or open skid, air- or water-cooled.",
  params: [
    {
      key: "package",
      label: "Package",
      type: "choice",
      options: [
        { value: "enclosed", label: "Enclosed" },
        { value: "skid", label: "Open skid" },
      ],
      default: "enclosed",
    },
    {
      key: "cooling",
      label: "Cooling",
      type: "choice",
      options: [
        { value: "air", label: "Air-cooled" },
        { value: "water", label: "Water-cooled" },
      ],
      default: "air",
    },
    {
      key: "cooler",
      label: "Cooler side",
      type: "choice",
      options: [
        { value: "right", label: "Right" },
        { value: "left", label: "Left" },
      ],
      default: "right",
    },
    {
      key: "detail",
      label: "Detail",
      type: "choice",
      options: [
        { value: "simple", label: "Simple" },
        { value: "standard", label: "Standard" },
        { value: "detailed", label: "Detailed" },
      ],
      default: "standard",
    },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "C-701" },
  ],
  spatial(raw) {
    return airCompressor3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const parts = p.package === "skid" ? skid(p) : enclosed(p);
    const { height, label, anchor } = labelLayout(94, parts.width, p.label as string);
    return {
      schema: OBJECT_SCHEMA,
      id: "air-compressor",
      identity: {
        family: "compressor",
        kind: "screw-compressor",
        category: "process-equipment",
        name: "Air compressor",
        tags: ["compressor", "rotary-screw", "compressed-air", String(p.cooling)],
      },
      viewBox: [0, 4, parts.width, height - 4],
      regions: parts.regions,
      ports: parts.ports,
      anchors: { badge: parts.badge, ...(anchor ? { label: anchor } : {}) },
      states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
      animations: parts.animations,
      ...(label ? { label } : {}),
      generator: { id: this.id, version: this.version, params: p },
    };
  },
};

type P = ReturnType<typeof sanitizeParams>;
interface Parts {
  width: number;
  regions: Region[];
  ports: Port[];
  animations: AnimationHint[];
  badge: [number, number];
}

function builder(p: P, W: number) {
  const g = new Geo(p.cooler === "left" ? mirrorX(W) : identity());
  const regions: Region[] = [];
  const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[], extra: Partial<Region> = {}) =>
    regions.push({ id, role, label, paint, shapes, ...extra });
  return { g, regions, reg };
}

/** Cooler fan behind a guard: blades (rotation target) and guard rings. */
function fan(g: Geo, cx: number, cy: number, r: number, detail: string) {
  const blades: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const t = (k / 5) * Math.PI * 2;
    const at = (rr: number, d: number): [number, number] => [cx + Math.cos(t + d) * rr, cy + Math.sin(t + d) * rr];
    blades.push(g.path().M(...at(3.5, 0)).Q(...at(r * 0.7, 0.35), ...at(r * 0.92, 0.12)).L(...at(r * 0.9, -0.22)).Q(...at(r * 0.55, -0.12), ...at(3.5, -0.5)).shape());
  }
  const guard: Shape[] = [g.circle(cx, cy, r)];
  if (detail !== "simple") guard.push(g.circle(cx, cy, r * 0.62));
  if (detail === "detailed") guard.push(g.line(cx - r, cy, cx + r, cy), g.line(cx, cy - r, cx, cy + r));
  return { blades, guard };
}

function enclosed(p: P): Parts {
  const detail = p.detail as string;
  const air = p.cooling === "air";
  const W = air ? 130 : 136;
  const { g, regions, reg } = builder(p, W);
  const animations: AnimationHint[] = [];

  reg("skid", "base", "Base frame", "solid", [g.rect(8, 84, 114, 5, 1.2)]);
  if (detail !== "simple") reg("fork-pockets", "detail", "Fork pockets", "line", [g.rect(22, 85.2, 16, 2.6, 0.6), g.rect(92, 85.2, 16, 2.6, 0.6)]);

  // Discharge nozzle and cable gland on the roof (behind the cabinet edge).
  reg("discharge-nozzle", "nozzle", "Discharge nozzle", "solid", [g.rect(56, 12, 8, 13)]);
  reg("discharge-flange", "flange", "Discharge flange", "solid", [g.rect(53, 9, 14, 4, 1)]);
  reg("cable-gland", "flange", "Cable gland", "solid", [g.rect(27, 20, 7, 5, 1)]);
  const ports: Port[] = [g.port("discharge", "outlet", 60, 9, 270, 8), g.port("power", "power", 30.5, 20, 270), g.port("air-intake", "inlet", 10, 73, 180, 10)];
  if (air) reg("exhaust-hood", "body-secondary", "Cooling air exhaust", "solid", [g.rect(78, 15, 36, 10, 2)]);
  else {
    for (const [id, name, y] of [["water-outlet", "Water outlet", 44], ["water-inlet", "Water inlet", 64]] as const) {
      reg(`${id}-nozzle`, "nozzle", `${name} nozzle`, "solid", [g.rect(119, y - 3, 9, 6)]);
      reg(`${id}-flange`, "flange", `${name} flange`, "solid", [g.rect(127, y - 6, 4, 12, 1)]);
    }
    ports.push(g.port("water-inlet", "inlet", 131, 64, 0, 6), g.port("water-outlet", "outlet", 131, 44, 0, 6));
  }

  reg("enclosure", "body", "Enclosure", "solid", [g.rect(10, 24, 110, 60, 3)]);
  reg("control-panel", "body-secondary", "Control panel", "solid", [g.rect(16, 30, 28, 33, 2)]);
  reg("cooler-grille", "body-secondary", "Cooler grille", "solid", [g.rect(78, 30, 36, 48, 2)]);

  const lines: Shape[] = [];
  if (detail !== "simple") {
    lines.push(g.rect(20, 34, 20, 11, 1)); // display
    for (let y = 68; y <= 79; y += 3.6) lines.push(g.line(16, y, 44, y)); // intake louvres
    lines.push(g.line(50, 29, 50, 80), g.line(72, 29, 72, 80)); // door seams
    if (air) for (let x = 83; x <= 110; x += 4.5) lines.push(g.line(x, 17.5, x, 22.5));
  }
  if (detail === "detailed") {
    lines.push(g.line(47, 50, 47, 58), g.line(69, 50, 69, 58)); // door handles
    lines.push(g.circle(24, 56, 1.8), g.circle(36, 56, 1.8)); // push buttons
  }
  if (!air && detail !== "simple") for (let y = 36; y <= 73; y += 5) lines.push(g.line(82, y, 110, y));
  if (lines.length) reg("panel-detail", "detail", "Louvres and panel detail", "line", lines);

  if (air) {
    const f = fan(g, 96, 54, 15, detail);
    reg("fan-guard", "detail", "Fan guard", "line", f.guard);
    reg("cooler-fan", "rotor", "Cooler fan", "line", f.blades);
    const [ox, oy] = g.pt(96, 54);
    animations.push({ id: "fan-spin", type: "rotate", region: "cooler-fan", origin: [ox, oy], states: ["running"], periodMs: 800 });
  }
  reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(30, 54, 4.2)]);

  return { width: W, regions, ports, animations, badge: g.pt(10, 14) };
}

function skid(p: P): Parts {
  const detail = p.detail as string;
  const air = p.cooling === "air";
  const W = 168;
  const { g, regions, reg } = builder(p, W);
  const animations: AnimationHint[] = [];
  const AY = 57; // airend / motor centreline

  // Base, feet and supports.
  reg("skid", "base", "Base frame", "solid", [
    g.rect(6, 84, 156, 5, 1.2),
    g.path().M(48, 70).L(76, 70).L(80, 84).L(44, 84).Z().shape(),
    g.path().M(94, 72).L(126, 72).L(130, 84).L(90, 84).Z().shape(),
    ...(air ? [] : [g.path().M(138, 62).L(158, 62).L(161, 84).L(135, 84).Z().shape()]),
  ]);

  // Separator vessel with its discharge nozzle.
  reg("discharge-nozzle", "nozzle", "Discharge nozzle", "solid", [g.rect(18, 13, 8, 12)]);
  reg("discharge-flange", "flange", "Discharge flange", "solid", [g.rect(15, 10, 14, 4, 1)]);
  reg("separator", "body-secondary", "Oil separator", "solid", [g.rect(10, 22, 24, 62, 11)]);
  reg("discharge-pipe", "nozzle", "Airend discharge", "solid", [g.rect(33, 47, 10, 8)]);

  // Airend (the screw block) with the inlet filter on top.
  reg("air-filter", "body-secondary", "Inlet filter", "solid", [g.rect(51, 22, 22, 17, 3), g.rect(57, 38, 10, 4)]);
  reg("airend", "body", "Screw airend", "solid", [g.rect(42, 40, 40, 34, 6)]);
  const ports: Port[] = [g.port("discharge", "outlet", 22, 10, 270, 8), g.port("air-intake", "inlet", 62, 22, 270, 10)];

  // Screw lobes: diagonal crests that travel when running.
  if (detail !== "simple") {
    const lobes: Shape[] = [];
    for (let x = 30; x <= 96; x += 8) lobes.push(g.line(x, 68, x + 9, 46));
    reg("screw-rotors", "rotor", "Screw rotors", "line", lobes, { clip: g.rect(47, 45, 30, 24, 3) });
    const s = p.cooler === "left" ? -1 : 1;
    animations.push({ id: "rotor-flow", type: "flow", region: "screw-rotors", vector: [8 * s, 0], states: ["running"], periodMs: 500 });
  }

  // Coupling, motor, terminal box.
  reg("coupling", "flange", "Coupling", "solid", [g.rect(82, AY - 11, 6, 22, 1.2)]);
  reg("motor", "body-secondary", "Motor", "solid", [g.rect(88, AY - 21, 44, 42, 5), g.rect(131, AY - 14, 6, 28, 2)]);
  reg("terminal-box", "body-secondary", "Terminal box", "solid", [g.rect(102, AY - 29, 16, 9, 1.5)]);
  ports.push(g.port("power", "power", 110, AY - 29, 270));
  if (detail !== "simple") {
    const xs = detail === "detailed" ? [95, 101, 107, 113, 119, 125] : [98, 106, 114, 122];
    reg("motor-fins", "detail", "Cooling fins", "line", xs.map((x) => g.line(x, AY - 16, x, AY + 16)));
  }

  // Cooler: radiator with fan, or a small shell-and-tube water cooler.
  if (air) {
    reg("cooler", "body-secondary", "Oil / air cooler", "solid", [g.rect(141, 24, 22, 60, 2)]);
    const f = fan(g, 152, 50, 9.5, detail);
    const core: Shape[] = [];
    if (detail !== "simple") for (let y = 64; y <= 79; y += 3) core.push(g.line(144, y, 160, y));
    reg("fan-guard", "detail", "Fan guard and core", "line", [...f.guard, ...core]);
    reg("cooler-fan", "rotor", "Cooler fan", "line", f.blades);
    const [ox, oy] = g.pt(152, 50);
    animations.push({ id: "fan-spin", type: "rotate", region: "cooler-fan", origin: [ox, oy], states: ["running"], periodMs: 800 });
  } else {
    for (const [id, name, x] of [["water-inlet", "Water inlet", 143], ["water-outlet", "Water outlet", 155]] as const) {
      reg(`${id}-nozzle`, "nozzle", `${name} nozzle`, "solid", [g.rect(x - 3, 38, 6, 10)]);
      reg(`${id}-flange`, "flange", `${name} flange`, "solid", [g.rect(x - 5.5, 35, 11, 3.5, 1)]);
    }
    reg("cooler", "body-secondary", "Water cooler", "solid", [g.rect(138, 46, 24, 18, 9)]);
    if (detail !== "simple") reg("cooler-seams", "detail", "Cooler flanges", "line", [g.line(145, 46, 145, 64), g.line(155, 46, 155, 64)]);
    ports.push(g.port("water-inlet", "inlet", 143, 35, 270, 6), g.port("water-outlet", "outlet", 155, 35, 270, 6));
  }

  if (detail !== "simple") reg("separator-seams", "detail", "Head seams", "line", [g.line(10, 33, 34, 33), g.line(10, 73, 34, 73)]);
  reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(22, 44, 3.8)]);

  return { width: W, regions, ports, animations, badge: g.pt(44, 16) };
}
