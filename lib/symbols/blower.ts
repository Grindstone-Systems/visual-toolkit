import { Geo, identity, mirrorX } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { centrifugalBlower3d } from "./blower3d.ts";

/**
 * Centrifugal blower — scroll housing seen from the inlet side, with the
 * drive train beside it in elevation (the same mixed projection the pump
 * symbol uses). Authored clockwise; counter-clockwise mirrors the drawing.
 * Discharge is top-vertical or bottom-horizontal (the scroll turned a
 * quarter), and the drive is direct-coupled, belt-driven or bare shaft.
 */

const CX = 48;
const R0 = 21; // scroll radius at the cut-off
const R1 = 33; // scroll radius at the discharge
const PHI0 = -110; // cut-off angle (screen degrees, 0 = +x, 90 = down)
const PHI1 = 180; // scroll end, where the discharge leaves tangentially
const OUT = 38; // discharge length beyond the centre

export const scrollRadius = (phi: number) => R0 + ((R1 - R0) * (phi - PHI0)) / (PHI1 - PHI0);

/**
 * Housing outline in the "discharge up" frame, relative to the wheel centre
 * (x right, y down): spiral from the cut-off round to the discharge, then up
 * the outer wall, across the mouth and down the inner wall.
 */
export function scrollOutline(stepDeg = 7.5): [number, number][] {
  const pts: [number, number][] = [];
  for (let phi = PHI0; phi <= PHI1 + 1e-9; phi += stepDeg) {
    const a = (phi * Math.PI) / 180;
    const r = scrollRadius(phi);
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const xin = R0 * Math.cos((PHI0 * Math.PI) / 180);
  pts.push([-R1, -OUT], [xin, -OUT]);
  return pts;
}

export const centrifugalBlower: Generator = {
  id: "blower.centrifugal",
  version: 0,
  family: "blower",
  name: "Centrifugal blower",
  description: "Scroll-housing fan with inlet cone, top or bottom discharge, direct, belt or bare-shaft drive.",
  params: [
    {
      key: "discharge",
      label: "Discharge",
      type: "choice",
      options: [
        { value: "up", label: "Top vertical" },
        { value: "side", label: "Bottom horizontal" },
      ],
      default: "up",
    },
    {
      key: "rotation",
      label: "Rotation",
      type: "choice",
      options: [
        { value: "cw", label: "Clockwise" },
        { value: "ccw", label: "Counter-clockwise" },
      ],
      default: "cw",
    },
    {
      key: "drive",
      label: "Drive",
      type: "choice",
      options: [
        { value: "direct", label: "Direct motor" },
        { value: "belt", label: "Belt drive" },
        { value: "none", label: "Bare shaft" },
      ],
      default: "direct",
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
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "B-601" },
  ],
  spatial(raw) {
    return centrifugalBlower3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const up = p.discharge !== "side";
    const drive = p.drive as "direct" | "belt" | "none";
    const detail = p.detail as string;
    const CY = up ? 52 : 46;
    // "Side" turns the scroll a quarter anticlockwise: discharge runs left along the bottom.
    const turn = (x: number, y: number): [number, number] => (up ? [CX + x, CY + y] : [CX + y, CY - x]);
    const outline = scrollOutline().map(([x, y]) => turn(x, y));
    const xR = Math.max(...outline.map((q) => q[0]));
    const yB = Math.max(...outline.map((q) => q[1]));
    const W = drive === "direct" ? Math.ceil(xR + 82) : drive === "belt" ? Math.ceil(xR + 64) : Math.ceil(xR + 32);
    const g = new Geo(p.rotation === "ccw" ? mirrorX(W) : identity());
    const regions: Region[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
      regions.push({ id, role, label, paint, shapes });
    const poly = (pts: [number, number][], close = true) => {
      const b = g.path().M(...pts[0]!);
      for (const q of pts.slice(1)) b.L(...q);
      return (close ? b.Z() : b).shape();
    };
    const BASE = 86;

    // Skid, housing foot and drive supports.
    const base: Shape[] = [g.rect(CX - 34, BASE, W - (CX - 34) - 4, 5, 1.2)];
    const footTop = up ? yB - 8 : yB - 3;
    base.push(g.path().M(CX - 16, footTop).L(CX + 16, footTop).L(CX + 21, BASE).L(CX - 21, BASE).Z().shape());
    if (drive !== "belt") base.push(g.path().M(xR + 4, CY + 6).L(xR + 16, CY + 6).L(xR + 19, BASE).L(xR + 1, BASE).Z().shape());
    if (drive === "direct") base.push(g.path().M(xR + 32, CY + 16).L(xR + 64, CY + 16).L(xR + 68, BASE).L(xR + 28, BASE).Z().shape());
    if (drive === "belt") base.push(g.path().M(xR + 20, 80).L(xR + 50, 80).L(xR + 53, BASE).L(xR + 17, BASE).Z().shape());
    reg("base", "base", "Base frame", "solid", base);

    // Drive train (behind the housing edge).
    const ports: Port[] = [];
    if (drive !== "belt") reg("bearing-pedestal", "body-secondary", "Bearing pedestal", "solid", [g.rect(xR - 2, CY - 7, 20, 14, 1.5)]);
    if (drive === "direct") {
      reg("coupling", "flange", "Coupling", "solid", [g.rect(xR + 17, CY - 11, 6, 22, 1.2)]);
      reg("motor", "body-secondary", "Motor", "solid", [g.rect(xR + 23, CY - 21, 48, 42, 5), g.rect(xR + 70, CY - 14, 6, 28, 2)]);
      reg("terminal-box", "body-secondary", "Terminal box", "solid", [g.rect(xR + 38, CY - 29, 17, 9, 1.5)]);
      if (detail !== "simple") {
        const xs = detail === "detailed" ? [8, 14, 20, 26, 32, 38] : [11, 20, 29, 38];
        reg("motor-fins", "detail", "Cooling fins", "line", xs.map((x) => g.line(xR + 23 + x, CY - 16, xR + 23 + x, CY + 16)));
      }
      ports.push(g.port("power", "power", xR + 46.5, CY - 29, 270));
    } else if (drive === "belt") {
      reg("motor", "body-secondary", "Motor", "solid", [g.rect(xR + 15, 57, 36, 26, 4), g.rect(xR + 50, 62, 5, 16, 1.5)]);
      reg("terminal-box", "body-secondary", "Terminal box", "solid", [g.rect(xR + 26, 51, 12, 7, 1.2)]);
      if (detail !== "simple") reg("motor-fins", "detail", "Cooling fins", "line", [22, 29, 36, 43].map((x) => g.line(xR + x, 61, xR + x, 79)));
      reg("belt-guard", "flange", "Belt guard", "solid", [g.rect(xR + 1, CY - 8, 13, 88 - CY - 2, 6.5)]);
      if (detail !== "simple") reg("belt-guard-mesh", "detail", "Guard mesh", "line", [g.line(xR + 4.5, CY + 2, xR + 4.5, 72), g.line(xR + 10.5, CY + 2, xR + 10.5, 72)]);
      ports.push(g.port("power", "power", xR + 32, 51, 270));
    } else {
      reg("shaft", "nozzle", "Shaft end", "solid", [g.rect(xR + 18, CY - 3.5, 9, 7, 1)]);
      ports.push(g.port("shaft", "mechanical", xR + 27, CY, 0, 7));
    }

    // Scroll housing with its discharge flange.
    reg("housing", "body", "Scroll housing", "solid", [poly(outline)]);
    const mouth = scrollOutline().slice(-2);
    const [ox, oy] = mouth[0]!;
    const [ix] = mouth[1]!;
    const fl: [number, number][] = [
      [ox - 3, oy + 4],
      [ox - 3, oy],
      [ix + 3, oy],
      [ix + 3, oy + 4],
    ];
    reg("discharge-flange", "flange", "Discharge flange", "solid", [poly(fl.map(([x, y]) => turn(x, y - 4)))]);
    const outC = turn((ox + ix) / 2, oy - 4);
    ports.push(g.port("discharge", "outlet", outC[0], outC[1], up ? 270 : 180, Math.round(ix - ox)));

    if (detail !== "simple") {
      // Side-plate seam, inset from the scroll edge.
      const seam: [number, number][] = [];
      for (let phi = PHI0 + 22.5; phi <= PHI1 + 1e-9; phi += 7.5) {
        const a = (phi * Math.PI) / 180;
        const r = scrollRadius(phi) - 4;
        seam.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      seam.push([-R1 + 4, -OUT + 1]);
      const shapes: Shape[] = [poly(seam.map(([x, y]) => turn(x, y)), false)];
      if (detail === "detailed") {
        for (const x of [ox + 3, ix - 3]) shapes.push(poly([turn(x, oy - 4.5), turn(x, oy + 0.5)], false));
      }
      reg("housing-seam", "detail", "Side-plate seam", "line", shapes);
    }

    // Inlet cone, wheel (rotation target) and status hub.
    reg("inlet-cone", "nozzle", "Inlet cone", "solid", [g.circle(CX, CY, 15)]);
    if (detail !== "simple") {
      const blades: Shape[] = [];
      const n = detail === "detailed" ? 10 : 8;
      const at = (r: number, deg: number): [number, number] => [CX + r * Math.cos((deg * Math.PI) / 180), CY + r * Math.sin((deg * Math.PI) / 180)];
      for (let k = 0; k < n; k++) {
        const t = (k * 360) / n;
        // Backward-curved: the tip trails the root for clockwise rotation.
        blades.push(g.path().M(...at(6, t)).Q(...at(10.5, t - 6), ...at(12.8, t - 30)).shape());
      }
      if (detail === "detailed") blades.push(g.circle(CX, CY, 13.2));
      reg("impeller", "rotor", "Fan wheel", "line", blades);
    }
    reg("status-hub", "indicator", "Status hub", "solid", [g.circle(CX, CY, 5)]);
    ports.unshift(g.port("inlet", "inlet", CX - 15, CY, 180, 28));

    const { height, label, anchor } = labelLayout(BASE + 7, W, p.label as string);
    const [bx, by] = up ? g.pt(xR - 4, 22) : g.pt(12, 18);
    const [cx, cy] = g.pt(CX, CY);
    return {
      schema: OBJECT_SCHEMA,
      id: "centrifugal-blower",
      identity: {
        family: "blower",
        kind: "centrifugal-blower",
        category: "process-equipment",
        name: "Centrifugal blower",
        tags: ["blower", "fan", "rotating-equipment", "air"],
      },
      viewBox: [0, 4, W, height - 4],
      regions,
      ports,
      anchors: { badge: [bx, by], ...(anchor ? { label: anchor } : {}) },
      states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
      animations:
        detail !== "simple"
          ? [{ id: "wheel-spin", type: "rotate", region: "impeller", origin: [cx, cy], states: ["running"], periodMs: 900 }]
          : [],
      ...(label ? { label } : {}),
      generator: { id: this.id, version: this.version, params: p },
    };
  },
};
