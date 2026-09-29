import { Geo } from "../geometry.ts";
import { OBJECT_SCHEMA, type AnimationHint, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { processTank3d } from "./tank3d.ts";

/**
 * Process tank — vertical (dished or cone bottom) or horizontal vessel with a
 * live liquid level, optional top-entry agitator, legs/saddles and a level
 * gauge. The liquid is a level-driven fill region: resolved SVGs bake the
 * level in, smart SVGs expose it as the --vt-level custom property.
 */

export const processTank: Generator = {
  id: "tank.process",
  version: 0,
  family: "tank",
  name: "Process tank",
  description: "Vertical or horizontal vessel with live level, agitator, supports and level gauge.",
  params: [
    {
      key: "orientation",
      label: "Orientation",
      type: "choice",
      options: [
        { value: "vertical", label: "Vertical" },
        { value: "horizontal", label: "Horizontal" },
      ],
      default: "vertical",
    },
    {
      key: "bottom",
      label: "Bottom head",
      type: "choice",
      options: [
        { value: "dished", label: "Dished" },
        { value: "cone", label: "Cone" },
      ],
      default: "dished",
    },
    { key: "level", label: "Level %", type: "number", min: 0, max: 100, step: 1, default: 64 },
    { key: "agitator", label: "Agitator", type: "toggle", default: true },
    { key: "supports", label: "Legs / saddles", type: "toggle", default: true },
    { key: "gauge", label: "Level gauge", type: "toggle", default: true },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "TK-301" },
  ],
  spatial(raw) {
    return processTank3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const parts = p.orientation === "horizontal" ? horizontal(p) : vertical(p);
    const { height, label, anchor } = labelLayout(parts.bottom, 100, p.label as string);
    return {
      schema: OBJECT_SCHEMA,
      id: "process-tank",
      identity: {
        family: "tank",
        kind: p.orientation === "horizontal" ? "horizontal-tank" : "vertical-tank",
        category: "process-equipment",
        name: p.orientation === "horizontal" ? "Horizontal tank" : "Vertical tank",
        tags: ["tank", "vessel", "storage"],
      },
      viewBox: [0, parts.top, 100, height - parts.top],
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
  regions: Region[];
  ports: Port[];
  animations: AnimationHint[];
  badge: [number, number];
  top: number;
  bottom: number;
}

const g = new Geo();

function builder() {
  const regions: Region[] = [];
  const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[], extra: Partial<Region> = {}) =>
    regions.push({ id, role, label, paint, shapes, ...extra });
  return { regions, reg };
}

function gauge(x: number, top: number, bottom: number): Shape[] {
  const out: Shape[] = [g.line(x, top, x, bottom)];
  for (let i = 0; i <= 4; i++) {
    const y = bottom - (i / 4) * (bottom - top);
    out.push(g.line(x, y, x + (i % 2 ? 2.5 : 4.5), y));
  }
  return out;
}

function vertical(p: P): Parts {
  const { regions, reg } = builder();
  const cone = p.bottom === "cone";
  const L = 26;
  const R = 74;
  const TOP = 24; // top tangent line
  const BOT = 86; // bottom tangent line
  const HEAD = 9;
  const interiorTop = TOP - HEAD;
  const interiorBottom = cone ? 104 : BOT + HEAD;
  const outletTop = interiorBottom - 5;
  const flangeBottom = outletTop + 14;

  const shell = cone
    ? g.path().M(L, TOP).A(24, HEAD, 0, 1, R, TOP).L(R, BOT).L(54, interiorBottom).L(46, interiorBottom).L(L, BOT).Z().shape()
    : g.path().M(L, TOP).A(24, HEAD, 0, 1, R, TOP).L(R, BOT).A(24, HEAD, 0, 1, L, BOT).Z().shape();

  if (p.supports) {
    const legBottom = flangeBottom + 4;
    reg("legs", "base", "Support legs", "solid", [
      g.rect(29, BOT - 10, 5, legBottom - (BOT - 10)),
      g.rect(66, BOT - 10, 5, legBottom - (BOT - 10)),
      g.rect(26, legBottom - 1, 11, 3, 1),
      g.rect(63, legBottom - 1, 11, 3, 1),
    ]);
  }
  reg("outlet-nozzle", "nozzle", "Outlet nozzle", "solid", [g.rect(46, outletTop, 8, 11)]);
  reg("outlet-flange", "flange", "Outlet flange", "solid", [g.rect(43, outletTop + 10, 14, 4, 1)]);
  reg("inlet-nozzle", "nozzle", "Inlet nozzle", "solid", [g.rect(62, 8, 8, 12)]);
  reg("inlet-flange", "flange", "Inlet flange", "solid", [g.rect(59, 5, 14, 4, 1)]);

  reg("shell", "body", "Vessel shell", "solid", [shell]);
  const level = Number(p.level) / 100;
  reg("contents", "fill", "Contents", "solid", [g.rect(L - 6, interiorTop, R - L + 12, interiorBottom - interiorTop)], {
    clip: shell,
    level: { value: level, bottom: interiorBottom },
  });
  reg("shell-edge", "body", "Vessel outline", "line", [shell]);
  reg("tangent-lines", "detail", "Head seams", "line", cone ? [g.line(L, TOP, R, TOP)] : [g.line(L, TOP, R, TOP), g.line(L, BOT, R, BOT)]);

  const animations: AnimationHint[] = [];
  let top = 0;
  if (p.agitator) {
    const iy = cone ? 82 : 80;
    reg("agitator-drive", "body-secondary", "Agitator drive", "solid", [g.rect(39, -5, 18, 12, 2.5), g.rect(43, 6, 10, 7, 1)]);
    reg("agitator-shaft", "detail", "Agitator shaft", "line", [g.line(48, 13, 48, iy)]);
    reg("impeller", "rotor", "Impeller", "line", [
      g.path().M(38, iy - 3).L(38, iy + 3).M(38, iy).L(58, iy).M(58, iy - 3).L(58, iy + 3).shape(),
    ]);
    animations.push({ id: "impeller-turn", type: "turn", region: "impeller", origin: [48, iy], states: ["running"], periodMs: 1100 });
    top = -10;
  }
  if (p.gauge) reg("level-gauge", "detail", "Level gauge", "line", gauge(80, interiorTop, interiorBottom));
  reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(34, 33, 3.6)]);

  return {
    regions,
    animations,
    ports: [g.port("inlet", "inlet", 66, 5, 270, 8), g.port("outlet", "outlet", 50, outletTop + 14, 90, 8)],
    badge: [13, top + 12],
    top,
    bottom: (p.supports ? flangeBottom + 6 : flangeBottom) + 4,
  };
}

function horizontal(p: P): Parts {
  const { regions, reg } = builder();
  const TOP = 30;
  const BOT = 74;
  const shell = g.path().M(22, TOP).L(78, TOP).A(12, 22, 0, 1, 78, BOT).L(22, BOT).A(12, 22, 0, 1, 22, TOP).Z().shape();

  if (p.supports) {
    reg("saddles", "base", "Saddles", "solid", [
      g.path().M(26, 66).L(40, 66).L(43, 84).L(23, 84).Z().shape(),
      g.path().M(60, 66).L(74, 66).L(77, 84).L(57, 84).Z().shape(),
    ]);
  }
  reg("inlet-nozzle", "nozzle", "Inlet nozzle", "solid", [g.rect(29, 19, 8, 13)]);
  reg("inlet-flange", "flange", "Inlet flange", "solid", [g.rect(26, 16, 14, 4, 1)]);
  reg("outlet-nozzle", "nozzle", "Outlet nozzle", "solid", [g.rect(46, 72, 8, 12)]);
  reg("outlet-flange", "flange", "Outlet flange", "solid", [g.rect(43, 83, 14, 4, 1)]);
  reg("shell", "body", "Vessel shell", "solid", [shell]);
  reg("contents", "fill", "Contents", "solid", [g.rect(6, TOP, 88, BOT - TOP)], {
    clip: shell,
    level: { value: Number(p.level) / 100, bottom: BOT },
  });
  reg("shell-edge", "body", "Vessel outline", "line", [shell]);
  reg("tangent-lines", "detail", "Head seams", "line", [g.line(22, TOP, 22, BOT), g.line(78, TOP, 78, BOT)]);
  if (p.gauge) reg("level-gauge", "detail", "Level gauge", "line", gauge(94, TOP, BOT));
  reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(68, 40, 3.6)]);

  return {
    regions,
    animations: [],
    ports: [g.port("inlet", "inlet", 33, 16, 270, 8), g.port("outlet", "outlet", 50, 87, 90, 8)],
    badge: [12, 22],
    top: 10,
    bottom: 92,
  };
}
