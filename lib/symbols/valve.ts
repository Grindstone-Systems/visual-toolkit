import { Geo, identity, rotate90 } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";

/**
 * Two-way process valve — gate or ball body with optional actuator.
 * Authored horizontal on a 100 × 80 grid; rotated for vertical runs.
 */

const CX = 50;
const CY = 56;
const W = 100;
const H = 80;

export const processValve: Generator = {
  id: "valve.two-way",
  version: 0,
  family: "valve",
  name: "Process valve",
  description: "Two-way gate or ball valve with manual, pneumatic or motor actuator.",
  params: [
    {
      key: "body",
      label: "Body",
      type: "choice",
      options: [
        { value: "gate", label: "Gate" },
        { value: "ball", label: "Ball" },
      ],
      default: "gate",
    },
    {
      key: "actuator",
      label: "Actuator",
      type: "choice",
      options: [
        { value: "pneumatic", label: "Pneumatic" },
        { value: "motor", label: "Motor" },
        { value: "manual", label: "Handwheel" },
        { value: "none", label: "None" },
      ],
      default: "pneumatic",
    },
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
    { key: "flanges", label: "Flanges", type: "toggle", default: true },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "XV-201" },
  ],
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const vertical = p.orientation === "vertical";
    const g = new Geo(vertical ? rotate90(H) : identity());
    const regions: Region[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
      regions.push({ id, role, label, paint, shapes });

    reg("pipe-stubs", "nozzle", "Pipe connections", "solid", [g.rect(10, CY - 5, 14, 10), g.rect(76, CY - 5, 14, 10)]);
    if (p.flanges) reg("flanges", "flange", "End flanges", "solid", [g.rect(7, CY - 10, 4, 20, 1), g.rect(89, CY - 10, 4, 20, 1)]);

    // Actuator + stem (behind the body).
    const act = p.actuator as string;
    if (act !== "none") {
      const stemTop = act === "manual" ? 31 : act === "motor" ? 36 : 38;
      reg("stem", "detail", "Stem", "line", [g.line(CX, CY, CX, stemTop)]);
      if (act === "pneumatic") {
        reg("actuator", "body-secondary", "Diaphragm actuator", "solid", [
          g.path().M(CX - 17, 38).A(17, 13, 0, 1, CX + 17, 38).Z().shape(),
        ]);
      } else if (act === "motor") {
        reg("actuator", "body-secondary", "Motor operator", "solid", [g.rect(CX - 13, 18, 26, 18, 2.5)]);
        // The "M" glyph stays upright whatever the orientation.
        const [mx, my] = g.pt(CX, 27);
        const up = new Geo(identity());
        reg("actuator-mark", "detail", "Motor mark", "line", [
          up.path().M(mx - 5, my + 4).L(mx - 5, my - 4).L(mx, my + 1).L(mx + 5, my - 4).L(mx + 5, my + 4).shape(),
        ]);
      } else {
        reg("actuator", "body-secondary", "Handwheel", "solid", [g.rect(CX - 13, 27, 26, 4.5, 2.25)]);
      }
    }

    reg("body", "body", "Valve body", "solid", [
      g.path().M(23, CY - 14).L(CX, CY).L(23, CY + 14).Z().M(77, CY - 14).L(CX, CY).L(77, CY + 14).Z().shape(),
    ]);
    if (p.body === "ball") reg("ball", "body-secondary", "Ball", "solid", [g.circle(CX, CY, 8.5)]);
    reg("position-indicator", "indicator", "Position indicator", "solid", [g.circle(CX, CY, 4.2)]);

    const ports = [g.port("inlet", "inlet", 7, CY, 180, 10), g.port("outlet", "outlet", 93, CY, 0, 10)];
    if (act === "pneumatic") ports.push(g.port("air", "signal", CX, 25, 270));
    if (act === "motor") ports.push(g.port("power", "power", CX, 18, 270));

    const width = vertical ? H : W;
    const contentH = vertical ? W : 72;
    const { height, label, anchor } = labelLayout(contentH, width, p.label as string);
    const [bx, by] = g.pt(18, 30);

    return {
      schema: OBJECT_SCHEMA,
      id: "process-valve",
      identity: {
        family: "valve",
        kind: p.body === "ball" ? "ball-valve" : "gate-valve",
        category: "valve",
        name: p.body === "ball" ? "Ball valve" : "Gate valve",
        tags: ["valve", "on-off", String(p.actuator)],
      },
      viewBox: vertical ? [0, 0, width, height] : [0, 12, width, height - 12],
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
