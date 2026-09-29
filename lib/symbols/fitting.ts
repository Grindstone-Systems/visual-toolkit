import { Geo, compose, identity, rotate90, type Frame } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { sanitizeParams } from "./params.ts";
import { PIPE, REDUCED, bar, bendOutline, boxWithLabel, endsParam, frameBox, sizeParam, type P2 } from "./pipe.ts";
import { pipeFitting3d } from "./fitting3d.ts";

/**
 * Pipe fittings — 90° / 45° long-radius elbows, equal tee, concentric reducer
 * and straight spool, flanged or butt-weld, in four rotations.
 *
 * Authored on a 100-unit grid with the fitting centre at (50, 50) and the
 * first end ("a") on the left; ends sit at 8 / 92. Every end is a port with
 * an outward direction and the pipe width as its size, so a layout tool can
 * snap pipes to it.
 */

export const FITTINGS = ["elbow-90", "elbow-45", "tee", "reducer", "spool"] as const;
export type FittingType = (typeof FITTINGS)[number];

const NAMES: Record<FittingType, string> = {
  "elbow-90": "90° elbow",
  "elbow-45": "45° elbow",
  tee: "Equal tee",
  reducer: "Concentric reducer",
  spool: "Pipe spool",
};

const C = 50;
const END = 8;
const d45 = Math.SQRT1_2;

interface End2 {
  id: string;
  at: P2;
  /** Outward direction in degrees (authored frame). */
  deg: number;
  px: number;
}

export const pipeFitting: Generator = {
  id: "pipe.fitting",
  version: 0,
  family: "pipe",
  name: "Pipe fitting",
  description: "Elbow, tee, reducer or spool in DN 50–150, flanged or butt-weld, with exact ports for pipe routing.",
  params: [
    {
      key: "fitting",
      label: "Fitting",
      type: "choice",
      options: FITTINGS.map((v) => ({ value: v, label: NAMES[v] })),
      default: "elbow-90",
    },
    sizeParam,
    endsParam,
    {
      key: "rotation",
      label: "Rotation",
      type: "choice",
      options: [
        { value: "0", label: "0°" },
        { value: "90", label: "90°" },
        { value: "180", label: "180°" },
        { value: "270", label: "270°" },
      ],
      default: "0",
    },
    { key: "length", label: "Spool length (mm)", type: "number", min: 150, max: 2000, step: 50, default: 500 },
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "" },
  ],
  spatial(raw) {
    return pipeFitting3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const type = p.fitting as FittingType;
    const flanged = p.ends === "flanged";
    const s = PIPE[String(p.size)]!;
    const small = PIPE[REDUCED[String(p.size)]!]!;
    const quarter = Number(p.rotation) / 90;
    let frame: Frame = identity();
    for (let k = 0; k < quarter; k++) frame = compose(rotate90(100), frame);
    const g = new Geo(frame);
    const regions: Region[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
      shapes.length && regions.push({ id, role, label, paint, shapes });

    const h = s.px / 2;
    const flangeW = s.px + 10;
    const hf = flangeW / 2;
    const ends: End2[] = [{ id: "a", at: [END, C], deg: 180, px: s.px }];
    let body: Shape;
    let badge: P2 = [21, 21];
    let bbox: [number, number, number, number] = [4, 4, 96, C + hf + 2];

    switch (type) {
      case "spool":
        body = g.rect(END, C - h, 100 - 2 * END, s.px);
        ends.push({ id: "b", at: [100 - END, C], deg: 0, px: s.px });
        badge = [19, C - hf - 11];
        bbox = [4, badge[1] - 10, 96, C + hf + 2];
        break;
      case "reducer": {
        const hs = small.px / 2;
        body = g.path().M(END, C - h).L(36, C - h).L(64, C - hs).L(100 - END, C - hs).L(100 - END, C + hs).L(64, C + hs).L(36, C + h).L(END, C + h).Z().shape();
        ends.push({ id: "b", at: [100 - END, C], deg: 0, px: small.px });
        badge = [19, C - hf - 11];
        bbox = [4, badge[1] - 10, 96, C + hf + 2];
        break;
      }
      case "elbow-90":
        body = bendOutline(g, [END, C], [C, C], [C, END], 26, h);
        ends.push({ id: "b", at: [C, END], deg: 270, px: s.px });
        bbox = [4, 4, C + hf + 2, C + hf + 2];
        break;
      case "elbow-45": {
        const b: P2 = [C + 42 * d45, C - 42 * d45];
        body = bendOutline(g, [END, C], [C, C], b, 30, h);
        ends.push({ id: "b", at: b, deg: 315, px: s.px });
        badge = [23, 27];
        bbox = [4, 4, 96, C + hf + 2];
        break;
      }
      case "tee": {
        const f = Math.min(3, h * 0.6);
        body = g
          .path()
          .M(END, C - h)
          .L(C - h - f, C - h)
          .Q(C - h, C - h, C - h, C - h - f)
          .L(C - h, END)
          .L(C + h, END)
          .L(C + h, C - h - f)
          .Q(C + h, C - h, C + h + f, C - h)
          .L(100 - END, C - h)
          .L(100 - END, C + h)
          .L(END, C + h)
          .Z()
          .shape();
        ends.push({ id: "b", at: [100 - END, C], deg: 0, px: s.px }, { id: "c", at: [C, END], deg: 270, px: s.px });
        badge = [22, 23];
        break;
      }
    }

    reg("body", "body", NAMES[type], "solid", [body]);

    const unit = (deg: number): P2 => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
    if (flanged) {
      reg(
        "flanges",
        "flange",
        "End flanges",
        "solid",
        ends.map((e) => {
          const u = unit(e.deg);
          const t = e.px >= 16 ? 5 : 4;
          return bar(g, [e.at[0] - u[0] * (t / 2), e.at[1] - u[1] * (t / 2)], e.deg, t, e.px + 10);
        }),
      );
    } else {
      // Butt-weld ends: a short weld seam across each end.
      const seams: Shape[] = [];
      for (const e of ends) {
        const u = unit(e.deg);
        const n: P2 = [-u[1], u[0]];
        const c: P2 = [e.at[0] - u[0] * 2.2, e.at[1] - u[1] * 2.2];
        const w = e.px / 2 + 1.6;
        const a = g.pt(c[0] + n[0] * w, c[1] + n[1] * w);
        const b = g.pt(c[0] - n[0] * w, c[1] - n[1] * w);
        seams.push({ type: "line", x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
      }
      reg("welds", "detail", "Weld seams", "line", seams);
    }

    // Fittings are passive: every end is bidirectional.
    const ports: Port[] = ends.map((e) => g.port(e.id, "bidirectional", e.at[0], e.at[1], e.deg, e.px));

    const [bx, by] = g.pt(...badge);
    const box = frameBox(g, ...bbox);
    const { viewBox, label, anchor } = boxWithLabel(box, p.label as string);

    return {
      schema: OBJECT_SCHEMA,
      id: "pipe-fitting",
      identity: {
        family: "pipe",
        kind: type,
        category: "process-equipment",
        name: `${NAMES[type]} DN ${s.dn}${type === "reducer" ? `×${small.dn}` : ""}`,
        tags: ["pipe", "fitting", String(p.ends)],
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
