import { Geo } from "../geometry.ts";
import { OBJECT_SCHEMA, type AnimationHint, type Generator, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { beltConveyor3d } from "./conveyor3d.ts";

/**
 * Belt conveyor. Length is procedural: stretch it and the carrying idlers,
 * legs and chevrons re-lay out on a 20-unit pitch. When running, pulleys
 * turn, direction chevrons travel and (optionally) product rides the belt.
 */

const PITCH = 20;
const CY = 44; // belt centreline
const HALF = 9; // belt half-thickness around the pulleys

export const beltConveyor: Generator = {
  id: "conveyor.belt",
  version: 0,
  family: "conveyor",
  name: "Belt conveyor",
  description: "Procedural-length belt conveyor with drive, direction flow, product and supports.",
  params: [
    { key: "length", label: "Length (sections)", type: "number", min: 3, max: 12, step: 1, default: 6 },
    {
      key: "direction",
      label: "Direction",
      type: "choice",
      options: [
        { value: "right", label: "→ Right" },
        { value: "left", label: "← Left" },
      ],
      default: "right",
    },
    {
      key: "drive",
      label: "Drive",
      type: "choice",
      options: [
        { value: "head", label: "Head" },
        { value: "tail", label: "Tail" },
        { value: "none", label: "None" },
      ],
      default: "head",
    },
    {
      key: "load",
      label: "Product",
      type: "choice",
      options: [
        { value: "boxes", label: "Boxes" },
        { value: "bulk", label: "Bulk" },
        { value: "none", label: "None" },
      ],
      default: "boxes",
    },
    { key: "supports", label: "Supports", type: "toggle", default: true },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "CV-401" },
  ],
  spatial(raw) {
    return beltConveyor3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const g = new Geo();
    const n = Number(p.length);
    const right = p.direction === "right";
    const L = 26; // tail pulley centre
    const R = L + n * PITCH; // head pulley centre
    // Head is the discharge end: the right pulley when running right.
    const headX = right ? R : L;
    const drive = p.drive === "none" ? null : p.drive === "head" ? headX : right ? L : R;
    const W = R + 26;
    const regions: Region[] = [];
    const animations: AnimationHint[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[], extra: Partial<Region> = {}) =>
      regions.push({ id, role, label, paint, shapes, ...extra });

    // Frame and legs.
    if (p.supports) {
      const legs: Shape[] = [];
      const xs: number[] = [];
      for (let x = L + 8; x <= R - 8; x += PITCH * 2) xs.push(x);
      if (xs[xs.length - 1]! < R - 20) xs.push(R - 8);
      for (const x of xs) legs.push(g.rect(x - 2, CY + 13, 4, 26), g.rect(x - 5, CY + 38, 10, 3, 1));
      reg("legs", "base", "Support legs", "solid", legs);
      if (n >= 5) {
        const braces: Shape[] = [];
        for (let i = 0; i + 1 < xs.length; i++) braces.push(g.line(xs[i]!, CY + 36, xs[i + 1]!, CY + 16));
        reg("bracing", "detail", "Cross bracing", "line", braces);
      }
    }
    reg("side-frame", "base", "Side frame", "solid", [g.rect(L - 6, CY + 10, R - L + 12, 5, 1.5)]);

    // Drive: gearmotor hung below the driven pulley.
    if (drive !== null) {
      const dx = drive === R ? R + 2 : L - 20;
      reg("gearbox", "flange", "Gearbox", "solid", [g.rect(drive === R ? R - 6 : L - 2, CY + 14, 8, 12, 1.5)]);
      reg("drive-motor", "body-secondary", "Drive motor", "solid", [g.rect(dx, CY + 13, 18, 14, 3)]);
      reg("drive-fins", "detail", "Motor fins", "line", [g.line(dx + 4, CY + 17, dx + 14, CY + 17), g.line(dx + 4, CY + 20, dx + 14, CY + 20), g.line(dx + 4, CY + 23, dx + 14, CY + 23)]);
    }

    // Belt: a capsule wrapping both pulleys.
    const belt = g.path().M(L, CY - HALF).L(R, CY - HALF).A(HALF, HALF, 0, 1, R, CY + HALF).L(L, CY + HALF).A(HALF, HALF, 0, 1, L, CY - HALF).Z().shape();
    reg("belt", "body", "Belt", "solid", [belt]);

    // Direction chevrons travel along the belt window when running.
    const win = g.rect(L + 10, CY - 5, R - L - 20, 10);
    const chevrons: Shape[] = [];
    const s = right ? 1 : -1;
    for (let x = L - 10; x <= R + 10; x += 10) {
      chevrons.push(g.path().M(x - 1.8 * s, CY - 3.2).L(x + 1.8 * s, CY).L(x - 1.8 * s, CY + 3.2).shape());
    }
    reg("flow-marks", "detail", "Direction of travel", "line", chevrons, { clip: win });
    animations.push({ id: "belt-flow", type: "flow", region: "flow-marks", vector: [10 * s, 0], states: ["running"], periodMs: 600 });

    // Pulleys with spokes that turn.
    reg("pulleys", "body-secondary", "Pulleys", "solid", [g.circle(L, CY, 6.5), g.circle(R, CY, 6.5)]);
    for (const [id, x] of [["tail-spokes", L], ["head-spokes", R]] as const) {
      reg(id, "rotor", "Pulley spokes", "line", [g.line(x - 4.5, CY, x + 4.5, CY), g.line(x, CY - 4.5, x, CY + 4.5)]);
      animations.push({ id: `${id}-spin`, type: "rotate", region: id, origin: [x, CY], states: ["running"], periodMs: 1200 });
    }

    // Product riding on the belt.
    if (p.load !== "none") {
      const lane = g.rect(L - HALF, CY - HALF - 14, R - L + HALF * 2, 14);
      const items: Shape[] = [];
      const pitch = p.load === "boxes" ? 40 : 12;
      for (let x = L - pitch; x <= R + pitch; x += pitch) {
        items.push(
          p.load === "boxes"
            ? g.rect(x - 6, CY - HALF - 11, 12, 11, 1.5)
            : g.path().M(x - 6, CY - HALF).Q(x, CY - HALF - 8, x + 6, CY - HALF).Z().shape(),
        );
      }
      reg("product", "product", p.load === "boxes" ? "Cartons" : "Bulk material", "solid", items, { clip: lane });
      animations.push({ id: "product-flow", type: "flow", region: "product", vector: [pitch * s, 0], states: ["running"], periodMs: pitch * 60 });
    }

    const lampX = drive === null ? headX : drive === R ? R + 11 : L - 11;
    const lampY = drive === null ? CY : CY + 20;
    reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(lampX, lampY, drive === null ? 2.4 : 3.2)]);

    const bottom = p.supports ? CY + 44 : CY + 30;
    const { height, label, anchor } = labelLayout(bottom, W, p.label as string);
    return {
      schema: OBJECT_SCHEMA,
      id: "belt-conveyor",
      identity: {
        family: "conveyor",
        kind: "belt-conveyor",
        category: "material-handling",
        name: "Belt conveyor",
        tags: ["conveyor", "material-handling", String(p.load)],
      },
      viewBox: [0, 4, W, height - 4],
      regions,
      ports: [
        g.port("infeed", "inlet", right ? L - HALF : R + HALF, CY - HALF - 6, right ? 180 : 0, 12),
        g.port("discharge", "outlet", right ? R + HALF : L - HALF, CY - HALF - 6, right ? 0 : 180, 12),
      ],
      anchors: { badge: [right ? W - 12 : 12, 13], ...(anchor ? { label: anchor } : {}) },
      states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
      animations,
      ...(label ? { label } : {}),
      generator: { id: this.id, version: this.version, params: p },
    };
  },
};
