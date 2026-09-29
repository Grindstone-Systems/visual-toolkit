import { Geo, identity, rotate90 } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Region, type Shape, type VtObject } from "../types.ts";
import { sanitizeParams } from "./params.ts";
import { PIPE, bar, boxWithLabel, endsParam, frameBox, sizeParam } from "./pipe.ts";
import { staticMixer3d } from "./mixer3d.ts";

/**
 * Static inline mixer — a pipe section housing a train of twisted helical
 * elements (alternating hand, each turned 90° to the last), with optional
 * dosing quill. Authored horizontal (flow left → right) and rotated for
 * vertical runs; the housing width grows with the element count.
 */

const CY = 46;
const HT = 15; // housing half height
const X0 = 30; // first element
const PITCH = 10;
const H = 76; // authored height used for the vertical rotation

export const staticMixer: Generator = {
  id: "mixer.static",
  version: 0,
  family: "mixer",
  name: "Static mixer",
  description: "Inline static mixer: pipe housing with helical mixing elements, optional dosing quill, flanged or butt-weld.",
  params: [
    { key: "elements", label: "Elements", type: "number", min: 3, max: 12, step: 1, default: 6 },
    sizeParam,
    endsParam,
    {
      key: "orientation",
      label: "Orientation",
      type: "choice",
      options: [
        { value: "horizontal", label: "Horizontal" },
        { value: "vertical", label: "Vertical" },
      ],
      default: "horizontal",
    },
    { key: "injection", label: "Dosing quill", type: "toggle", default: true },
    { key: "supports", label: "Pipe supports", type: "toggle", default: true },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "MX-301" },
  ],
  spatial(raw) {
    return staticMixer3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const n = Number(p.elements);
    const vertical = p.orientation === "vertical";
    const flanged = p.ends === "flanged";
    const s = PIPE[String(p.size)]!;
    const g = new Geo(vertical ? rotate90(H) : identity());
    const regions: Region[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
      regions.push({ id, role, label, paint, shapes });

    const XE = X0 + n * PITCH; // end of the element train
    const W = XE + 30;
    const h = s.px / 2;

    // Line connections either side of the housing.
    reg("pipe-stubs", "nozzle", "Line connections", "solid", [g.rect(10, CY - h, 12, s.px), g.rect(XE + 8, CY - h, W - 10 - XE - 8, s.px)]);
    if (flanged) {
      reg("flanges", "flange", "End flanges", "solid", [g.rect(8, CY - h - 5, 4, s.px + 10, 1), g.rect(W - 12, CY - h - 5, 4, s.px + 10, 1)]);
    } else {
      reg("welds", "detail", "Weld seams", "line", [g.line(10.2, CY - h - 1.6, 10.2, CY + h + 1.6), g.line(W - 10.2, CY - h - 1.6, W - 10.2, CY + h + 1.6)]);
    }

    // Dosing quill on top, upstream of the elements.
    if (p.injection) {
      reg("injection-nozzle", "nozzle", "Dosing quill", "solid", [g.rect(23, 21, 6, CY - HT - 21 + 1)]);
      reg("injection-flange", "flange", "Quill flange", "solid", [bar(g, [26, 20], 0, 14, 3.5)]);
    }

    reg("housing", "body", "Mixer housing", "solid", [g.rect(20, CY - HT, XE + 10 - 20, HT * 2, 3)]);
    reg("end-collars", "flange", "Housing collars", "solid", [g.rect(18.5, CY - HT - 2, 4, HT * 2 + 4, 1.2), g.rect(XE + 7.5, CY - HT - 2, 4, HT * 2 + 4, 1.2)]);

    // Twisted elements: each a half-turn ribbon, hand alternating, edges crossing mid-element.
    const yt = CY - HT + 3.5;
    const yb = CY + HT - 3.5;
    const els: Shape[] = [];
    for (let k = 0; k < n; k++) {
      const a = X0 + k * PITCH;
      const b = a + PITCH;
      const m = (a + b) / 2;
      els.push(g.path().M(a, yt).C(m, yt, m, yb, b, yb).shape());
      els.push(g.path().M(a, yb).C(m, yb, m, yt, b, yt).shape());
      // Leading edge of each element (turned 90° to the trailing edge of the one before).
      els.push(g.line(a, yt - 1, a, yb + 1));
    }
    els.push(g.line(XE, yt - 1, XE, yb + 1));
    reg("elements", "detail", "Mixing elements", "line", els);
    reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(XE + 4.2, CY, 2.8)]);

    const ports = [g.port("inlet", "inlet", 8, CY, 180, s.px), g.port("outlet", "outlet", W - 8, CY, 0, s.px)];
    if (p.injection) ports.push(g.port("injection", "inlet", 26, 18.25, 270, PIPE["25"]!.px));

    const box = frameBox(g, 4, 10, W - 4, CY + HT + 5);
    const { viewBox, label, anchor } = boxWithLabel(box, p.label as string);
    const [bx, by] = g.pt(XE + 1, 21);

    return {
      schema: OBJECT_SCHEMA,
      id: "static-mixer",
      identity: {
        family: "mixer",
        kind: "static-mixer",
        category: "process-equipment",
        name: "Static mixer",
        tags: ["mixer", "inline", "pipe"],
      },
      viewBox,
      regions,
      ports,
      anchors: { badge: [bx, by], ...(anchor ? { label: anchor } : {}) },
      states: ["normal", "running", "warning", "fault", "maintenance", "disabled", "comm-loss"],
      animations: [],
      ...(label ? { label } : {}),
      generator: { id: this.id, version: this.version, params: p },
    };
  },
};
