import { Geo, identity, mirrorX, type PathBuilder } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { centrifugalPump3d } from "./pump3d.ts";

/**
 * Centrifugal pump — end-suction volute with optional coupled motor.
 *
 * Authored once with suction on the left; mirrored for "inlet: right".
 * Geometry is laid out on a 100-unit grid (156 wide with motor).
 */

const CX = 52;
const CY = 54;
const R = 22;

const params = [
  {
    key: "discharge",
    label: "Discharge",
    type: "choice",
    options: [
      { value: "top", label: "Top" },
      { value: "side", label: "Side" },
    ],
    default: "top",
  },
  {
    key: "inlet",
    label: "Suction",
    type: "choice",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    default: "left",
  },
  {
    key: "driver",
    label: "Driver",
    type: "choice",
    options: [
      { value: "motor", label: "Coupled motor" },
      { value: "none", label: "None" },
    ],
    default: "motor",
  },
  { key: "base", label: "Baseplate", type: "toggle", default: true },
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
  { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "P-101" },
] as const satisfies Generator["params"];

const polar = (r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};

function region(id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]): Region {
  return { id, role, label, paint, shapes };
}

export const centrifugalPump: Generator = {
  id: "pump.centrifugal",
  version: 0,
  family: "pump",
  name: "Centrifugal pump",
  description: "End-suction volute pump with optional coupled motor and baseplate.",
  params: [...params],
  spatial(raw) {
    return centrifugalPump3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const motor = p.driver === "motor";
    const detail = p.detail as "simple" | "standard" | "detailed";
    const top = p.discharge === "top";
    const W = motor ? 156 : 100;
    const g = new Geo(p.inlet === "right" ? mirrorX(W) : identity());
    const regions: Region[] = [];

    // Baseplate and feet (drawn first so the casing sits on top).
    if (p.base) {
      const plate = g.rect(motor ? 18 : 22, 86, motor ? 134 : 60, 5, 1.2);
      const feet: Shape[] = [g.path().M(38, 70).L(66, 70).L(72, 86).L(32, 86).Z().shape()];
      if (motor) feet.push(g.path().M(100, 70).L(134, 70).L(138, 86).L(96, 86).Z().shape());
      regions.push(region("baseplate", "base", "Baseplate", "solid", [...feet, plate]));
    }

    // Suction nozzle + flange.
    regions.push(region("suction-nozzle", "nozzle", "Suction nozzle", "solid", [g.rect(13, 45, 20, 18)]));
    regions.push(region("suction-flange", "flange", "Suction flange", "solid", [g.rect(9, 41, 5, 26, 1)]));

    // Driver train sits behind the casing.
    if (motor) {
      regions.push(region("bearing-frame", "body-secondary", "Bearing frame", "solid", [g.rect(70, 46, 18, 16, 1.5)]));
      regions.push(region("coupling", "flange", "Coupling", "solid", [g.rect(87, 43, 6, 22, 1.2)]));
      const motorShapes: Shape[] = [g.rect(93, 32, 48, 42, 5), g.rect(140, 39, 6, 28, 2)];
      regions.push(region("motor", "body-secondary", "Motor", "solid", motorShapes));
      regions.push(region("terminal-box", "body-secondary", "Terminal box", "solid", [g.rect(108, 24, 17, 9, 1.5)]));
      if (detail !== "simple") {
        const fins: Shape[] = [];
        const xs = detail === "detailed" ? [101, 107, 113, 119, 125, 131] : [104, 113, 122, 131];
        for (const x of xs) fins.push(g.line(x, 37, x, 69));
        regions.push(region("motor-fins", "detail", "Cooling fins", "line", fins));
      }
    }

    // Volute casing with integral discharge nozzle.
    let casing: PathBuilder;
    if (top) {
      const x0 = 58;
      const y0 = CY - Math.sqrt(R * R - (x0 - CX) ** 2);
      casing = g.path().M(x0, 17).L(x0, y0).A(R, R, 1, 0, CX + R, CY).L(CX + R, 17).Z();
    } else {
      const y1 = 46;
      const x1 = CX + Math.sqrt(R * R - (y1 - CY) ** 2);
      casing = g.path().M(90, CY - R).L(CX, CY - R).A(R, R, 1, 0, x1, y1).L(90, y1).Z();
    }
    regions.push(region("casing", "body", "Volute casing", "solid", [casing.shape()]));

    const flange = top ? g.rect(55, 12, 22, 5, 1) : g.rect(89, CY - R - 3, 5, 20, 1);
    regions.push(region("discharge-flange", "flange", "Discharge flange", "solid", [flange]));

    if (detail === "detailed") {
      const seam = g.path().M(...polar(R - 4, 150)).A(R - 4, R - 4, 0, 0, ...polar(R - 4, 30)).shape();
      const bolts: Shape[] = top
        ? [g.line(59, 12, 59, 17), g.line(73, 12, 73, 17)]
        : [g.line(89, CY - R + 1, 94, CY - R + 1), g.line(89, CY - R + 13, 94, CY - R + 13)];
      bolts.push(g.line(9, 45, 14, 45), g.line(9, 63, 14, 63));
      regions.push(region("casing-detail", "detail", "Casing seam and bolting", "line", [seam, ...bolts]));
    }

    // Impeller vanes (rotation target) and status hub.
    if (detail !== "simple") {
      const vanes: Shape[] = [];
      for (let k = 0; k < 5; k++) {
        const t = k * 72;
        vanes.push(g.path().M(...polar(6.5, t)).Q(...polar(13, t + 12), ...polar(15.5, t + 52)).shape());
      }
      if (detail === "detailed") vanes.push(g.circle(CX, CY, 16.5));
      regions.push(region("impeller", "rotor", "Impeller", "line", vanes));
    }
    regions.push(region("status-hub", "indicator", "Status hub", "solid", [g.circle(CX, CY, 5.5)]));

    const ports = [
      g.port("suction", "inlet", 9, CY, 180, 18),
      top ? g.port("discharge", "outlet", 66, 12, 270, 16) : g.port("discharge", "outlet", 94, CY - R + 7, 0, 14),
    ];
    if (motor) ports.push(g.port("power", "power", 116.5, 24, 270));

    const { height, label, anchor } = labelLayout(94, W, p.label as string);
    const [bx, by] = g.pt(24, 24);
    const [ox, oy] = g.pt(CX, CY);

    return {
      schema: OBJECT_SCHEMA,
      id: "centrifugal-pump",
      identity: {
        family: "pump",
        kind: "centrifugal-pump",
        category: "process-equipment",
        name: "Centrifugal pump",
        tags: ["pump", "rotating-equipment", "liquid"],
      },
      viewBox: [0, 4, W, height - 4],
      regions,
      ports,
      anchors: { badge: [bx, by], ...(anchor ? { label: anchor } : {}) },
      states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
      animations:
        detail !== "simple"
          ? [{ id: "impeller-spin", type: "rotate", region: "impeller", origin: [ox, oy], states: ["running"], periodMs: 1400 }]
          : [],
      ...(label ? { label } : {}),
      generator: { id: this.id, version: this.version, params: p },
    };
  },
};
