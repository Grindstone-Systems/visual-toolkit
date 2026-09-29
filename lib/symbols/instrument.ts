import { Geo } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { glyphText } from "./glyphs.ts";
import { sanitizeParams } from "./params.ts";
import { boxWithLabel, frameBox } from "./pipe.ts";
import { transmitter3d } from "./instrument3d.ts";

/**
 * ISA 5.1-style instrument / field transmitter.
 *
 * 2D: the instrument bubble — discrete (circle), shared display / control
 * (circle in a square), computer function (hexagon) or PLC (diamond in a
 * square) — with the location line (none = field, solid = main panel,
 * dashed = behind the panel, double = auxiliary panel), the functional
 * identification letters over the loop number, a status dot and an optional
 * process tap line. Letters are drawn as strokes so the symbol needs no font.
 *
 * 3D: a stylised transmitter whose process connection follows the measured
 * variable (see instrument3d.ts).
 */

const FUNCTIONS = ["PT", "PIT", "PDT", "FT", "FIT", "LT", "LIT", "TT", "TIT", "AT"] as const;
const VARIABLE: Record<string, string> = { P: "Pressure", F: "Flow", L: "Level", T: "Temperature", A: "Analyser" };

const CX = 40;
const CY = 38;
const R = 18;

export const isaTransmitter: Generator = {
  id: "instrument.transmitter",
  version: 0,
  family: "instrument",
  name: "Instrument / transmitter",
  description: "ISA 5.1 instrument bubble with tag letters, loop number and location, plus a 3D field transmitter.",
  params: [
    {
      key: "function",
      label: "Function",
      type: "choice",
      options: FUNCTIONS.map((v) => ({ value: v, label: v })),
      default: "PT",
    },
    { key: "loop", label: "Loop number", type: "text", maxLength: 6, default: "101" },
    {
      key: "mounting",
      label: "Location",
      type: "choice",
      options: [
        { value: "field", label: "Field mounted" },
        { value: "panel", label: "Main panel" },
        { value: "behind-panel", label: "Behind panel" },
        { value: "auxiliary", label: "Auxiliary panel" },
      ],
      default: "field",
    },
    {
      key: "symbol",
      label: "Symbol",
      type: "choice",
      options: [
        { value: "discrete", label: "Discrete instrument" },
        { value: "shared", label: "Shared display" },
        { value: "computer", label: "Computer function" },
        { value: "plc", label: "PLC" },
      ],
      default: "discrete",
    },
    { key: "display", label: "Local display", type: "toggle", default: true },
    { key: "tap", label: "Process tap line", type: "toggle", default: true },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "" },
  ],
  spatial(raw) {
    return transmitter3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const fn = String(p.function);
    const loop = String(p.loop).trim().toUpperCase();
    const symbol = String(p.symbol);
    const g = new Geo();
    const regions: Region[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
      regions.push({ id, role, label, paint, shapes });

    const square = symbol === "shared" || symbol === "plc";
    const hexH = R * Math.sin(Math.PI / 3);
    const bottom = symbol === "computer" ? CY + hexH : CY + R;

    if (p.tap) {
      reg("process-tap", "nozzle", "Process connection", "line", [g.line(CX, bottom, CX, 78)]);
      reg("tap-point", "nozzle", "Process tap", "solid", [g.circle(CX, 78, 1.8)]);
    }

    const outline: Shape[] = [];
    if (square) outline.push(g.rect(CX - R, CY - R, 2 * R, 2 * R, 1.2));
    if (symbol === "computer") {
      outline.push(g.path().M(CX - R, CY).L(CX - R / 2, CY - hexH).L(CX + R / 2, CY - hexH).L(CX + R, CY).L(CX + R / 2, CY + hexH).L(CX - R / 2, CY + hexH).Z().shape());
    } else if (symbol === "plc") {
      outline.push(g.path().M(CX, CY - R).L(CX + R, CY).L(CX, CY + R).L(CX - R, CY).Z().shape());
    } else {
      outline.push(g.circle(CX, CY, R));
    }
    // Location line across the symbol.
    const m = String(p.mounting);
    if (m === "panel") outline.push(g.line(CX - R, CY, CX + R, CY));
    if (m === "auxiliary") outline.push(g.line(CX - R, CY - 1.3, CX + R, CY - 1.3), g.line(CX - R, CY + 1.3, CX + R, CY + 1.3));
    if (m === "behind-panel") for (let x = CX - R; x < CX + R - 0.1; x += 6) outline.push(g.line(x + 0.8, CY, Math.min(x + 4, CX + R), CY));
    reg("bubble", "body", "Instrument bubble", "solid", outline);

    reg("tag-letters", "detail", "Functional identification", "line", glyphText(g, fn, CX, CY - 7, 7.5, symbol === "computer" ? 19 : 24));
    if (loop) reg("loop-number", "detail", "Loop number", "line", glyphText(g, loop, CX, CY + 7.2, 6.5, symbol === "computer" ? 21 : 25));

    const dot: [number, number] = square ? [CX + R, CY - R] : [CX + R * Math.SQRT1_2, CY - R * Math.SQRT1_2];
    reg("status-hub", "indicator", "Status indicator", "solid", [g.circle(dot[0], dot[1], 3.4)]);

    const ports: Port[] = [g.port("signal", "signal", CX + R, CY, 0)];
    if (p.tap) ports.push(g.port("process", "bidirectional", CX, 78, 90, 3.6));

    const box = frameBox(g, 6, 7, 74, p.tap ? 82 : bottom + 4);
    const { viewBox, label, anchor } = boxWithLabel(box, p.label as string);
    const variable = fn.startsWith("PD") ? "Differential pressure" : (VARIABLE[fn[0]!] ?? "Process");
    const kind = fn.endsWith("T") ? "transmitter" : "instrument";

    return {
      schema: OBJECT_SCHEMA,
      id: "instrument",
      identity: {
        family: "instrument",
        kind: `${variable.toLowerCase().replace(/ /g, "-")}-${kind}`,
        category: "instrument",
        name: `${variable} ${kind} ${fn}${loop ? `-${loop}` : ""}`,
        tags: ["instrument", "isa-5.1", fn.toLowerCase(), String(p.mounting)],
      },
      viewBox,
      regions,
      ports,
      anchors: { badge: [18, 17], ...(anchor ? { label: anchor } : {}) },
      states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
      animations: [],
      ...(label ? { label } : {}),
      generator: { id: this.id, version: this.version, params: p },
    };
  },
};
