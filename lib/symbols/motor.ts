import { Geo, identity, mirrorX } from "../geometry.ts";
import { OBJECT_SCHEMA, type AnimationHint, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { inductionMotor3d } from "./motor3d.ts";

/**
 * Induction motor (TEFC). Side elevation or fan-end view.
 *
 * Side view is authored with the drive shaft on the right; frame length
 * follows the size parameter so a family of motors stays proportional.
 * The fan-end view shows the cooling fan turning behind its guard.
 */

const LENGTH = { small: 50, medium: 64, large: 80 } as const;

export const inductionMotor: Generator = {
  id: "motor.induction",
  version: 0,
  family: "motor",
  name: "Induction motor",
  description: "Totally enclosed fan-cooled motor, side or fan-end view, foot or flange mount.",
  params: [
    {
      key: "view",
      label: "View",
      type: "choice",
      options: [
        { value: "side", label: "Side" },
        { value: "end", label: "Fan end" },
      ],
      default: "side",
    },
    {
      key: "size",
      label: "Frame size",
      type: "choice",
      options: [
        { value: "small", label: "Small" },
        { value: "medium", label: "Medium" },
        { value: "large", label: "Large" },
      ],
      default: "medium",
    },
    {
      key: "mount",
      label: "Mounting",
      type: "choice",
      options: [
        { value: "foot", label: "Foot" },
        { value: "flange", label: "Flange" },
      ],
      default: "foot",
    },
    {
      key: "shaft",
      label: "Shaft",
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
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "M-101" },
  ],
  spatial(raw) {
    return inductionMotor3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    return p.view === "end" ? endView(this, p) : sideView(this, p);
  },
};

type P = ReturnType<typeof sanitizeParams>;

function finish(gen: Generator, p: P, parts: {
  width: number;
  bottom: number;
  top: number;
  regions: Region[];
  ports: Port[];
  badge: [number, number];
  animations: AnimationHint[];
}): VtObject {
  const { height, label, anchor } = labelLayout(parts.bottom, parts.width, p.label as string);
  return {
    schema: OBJECT_SCHEMA,
    id: "induction-motor",
    identity: {
      family: "motor",
      kind: "induction-motor",
      category: "electrical",
      name: "Induction motor",
      tags: ["motor", "drive", "rotating-equipment"],
    },
    viewBox: [0, parts.top, parts.width, height - parts.top],
    regions: parts.regions,
    ports: parts.ports,
    anchors: { badge: parts.badge, ...(anchor ? { label: anchor } : {}) },
    states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
    animations: parts.animations,
    ...(label ? { label } : {}),
    generator: { id: gen.id, version: gen.version, params: p },
  };
}

function sideView(gen: Generator, p: P): VtObject {
  const len = LENGTH[p.size as keyof typeof LENGTH];
  const detail = p.detail as string;
  const flange = p.mount === "flange";
  const x0 = 28; // stator start (after fan cover)
  const x1 = x0 + len; // stator end / drive-end bell
  const W = x1 + 30;
  const g = new Geo(p.shaft === "left" ? mirrorX(W) : identity());
  const regions: Region[] = [];
  const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
    regions.push({ id, role, label, paint, shapes });
  const mid = x0 + len / 2;

  if (!flange) {
    reg("feet", "base", "Mounting feet", "solid", [
      g.path().M(x0 + 6, 72).L(x0 + 20, 72).L(x0 + 22, 84).L(x0 + 4, 84).Z().shape(),
      g.path().M(x1 - 20, 72).L(x1 - 6, 72).L(x1 - 4, 84).L(x1 - 22, 84).Z().shape(),
    ]);
  }
  reg("shaft", "nozzle", "Drive shaft", "solid", [g.rect(x1 + 6, 48, 18, 8, 1)]);
  reg("fan-cover", "body-secondary", "Fan cover", "solid", [
    g.path().M(x0, 34).L(x0 - 12, 37).Q(x0 - 18, 38, x0 - 18, 44).L(x0 - 18, 60).Q(x0 - 18, 66, x0 - 12, 67).L(x0, 70).Z().shape(),
  ]);
  reg("end-bells", "body-secondary", "End shields", "solid", [g.rect(x0 - 2, 31, 6, 42, 2), g.rect(x1 - 4, 31, 10, 42, 2.5)]);
  reg("stator", "body", "Stator frame", "solid", [g.rect(x0 + 2, 28, len - 4, 48, 6)]);

  if (detail !== "simple") {
    const fins: Shape[] = [];
    const step = detail === "detailed" ? 5 : 7;
    for (let y = 34; y <= 70; y += step) {
      fins.push(g.line(x0 + 7, y, mid - 11, y), g.line(mid + 11, y, x1 - 7, y));
    }
    reg("cooling-fins", "detail", "Cooling fins", "line", fins);
    const grille: Shape[] = [g.line(x0 - 12, 44, x0 - 12, 60), g.line(x0 - 7, 41, x0 - 7, 63)];
    reg("fan-guard", "detail", "Fan guard", "line", grille);
  }
  if (flange) reg("flange", "flange", "Mounting flange", "solid", [g.rect(x1 + 4, 22, 5, 60, 1.5)]);
  reg("terminal-box", "body-secondary", "Terminal box", "solid", [g.rect(mid - 11, 17, 22, 12, 2)]);
  reg("cable-gland", "flange", "Cable gland", "solid", [g.rect(mid + 11, 20, 4, 6, 1)]);
  reg("nameplate", "body-secondary", "Nameplate", "solid", [g.rect(mid - 9, 43, 18, 18, 3)]);
  reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(mid, 52, 4.5)]);

  const ports = [g.port("shaft", "mechanical", x1 + 24, 52, 0, 8), g.port("power", "power", mid + 15, 23, 0)];
  return finish(gen, p, {
    width: W,
    top: 10,
    bottom: 90,
    regions,
    ports,
    badge: g.pt(x0 - 8, 22),
    animations: [],
  });
}

function endView(gen: Generator, p: P): VtObject {
  const g = new Geo();
  const detail = p.detail as string;
  const scale = p.size === "small" ? 0.86 : p.size === "large" ? 1.1 : 1;
  const C = 50;
  const CY = 52;
  const R = 30 * scale;
  const regions: Region[] = [];
  const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
    regions.push({ id, role, label, paint, shapes });

  if (p.mount === "foot") {
    const foot = (dir: 1 | -1) =>
      g.path()
        .M(C + dir * R * 0.5, CY + R * 0.8)
        .L(C + dir * R * 0.86, CY + R * 0.42)
        .L(C + dir * (R + 5), CY + R + 7)
        .L(C + dir * R * 0.42, CY + R + 7)
        .Z()
        .shape();
    reg("feet", "base", "Mounting feet", "solid", [foot(-1), foot(1), g.rect(C - R - 9, CY + R + 6, 2 * R + 18, 4, 1.5)]);
  }
  reg("terminal-box", "body-secondary", "Terminal box", "solid", [g.rect(C - 11, CY - R - 10, 22, 14, 2)]);

  // Finned frame: an outer fin ring with fine radial ribs reads as TEFC.
  reg("fin-ring", "body-secondary", "Cooling fin ring", "solid", [g.circle(C, CY, R + 3)]);
  if (detail !== "simple") {
    const fins: Shape[] = [];
    const n = detail === "detailed" ? 48 : 32;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      fins.push(g.line(C + Math.cos(a) * R, CY + Math.sin(a) * R, C + Math.cos(a) * (R + 2.6), CY + Math.sin(a) * (R + 2.6)));
    }
    reg("fin-ribs", "detail", "Cooling fins", "line", fins);
  }
  reg("frame", "body", "Motor frame", "solid", [g.circle(C, CY, R)]);
  reg("fan-cover", "body-secondary", "Fan cover", "solid", [g.circle(C, CY, R * 0.76)]);

  // Fan blades behind the guard — the rotation target.
  const blades: Shape[] = [];
  const rb = R * 0.68;
  for (let k = 0; k < 7; k++) {
    const t = (k / 7) * Math.PI * 2;
    const at = (r: number, d: number): [number, number] => [C + Math.cos(t + d) * r, CY + Math.sin(t + d) * r];
    blades.push(g.path().M(...at(5, 0)).Q(...at(rb * 0.62, 0.32), ...at(rb, 0.18)).shape());
  }
  reg("fan", "rotor", "Cooling fan", "line", blades);

  const guard: Shape[] = [g.circle(C, CY, R * 0.52), g.circle(C, CY, R * 0.28)];
  if (detail === "detailed") guard.push(g.line(C - R * 0.76, CY, C + R * 0.76, CY), g.line(C, CY - R * 0.76, C, CY + R * 0.76));
  reg("fan-guard", "detail", "Fan guard", "line", guard);
  reg("status-hub", "indicator", "Status hub", "solid", [g.circle(C, CY, 5)]);

  return finish(gen, p, {
    width: 100,
    top: CY - R - 16,
    bottom: CY + R + 16,
    regions,
    ports: [g.port("power", "power", C, CY - R - 10, 270)],
    badge: [C - R - 4, CY - R - 4],
    animations: [{ id: "fan-spin", type: "rotate", region: "fan", origin: [C, CY], states: ["running"], periodMs: 900 }],
  });
}
