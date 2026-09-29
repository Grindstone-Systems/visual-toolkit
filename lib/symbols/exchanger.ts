import { Geo, identity, rotate90 } from "../geometry.ts";
import { OBJECT_SCHEMA, type Generator, type Port, type Region, type Shape, type VtObject } from "../types.ts";
import { labelLayout, sanitizeParams } from "./params.ts";
import { shellTubeExchanger3d } from "./exchanger3d.ts";

/**
 * Shell-and-tube heat exchanger (TEMA-style, fixed tubesheet).
 *
 * Authored horizontally with the front (channel) head on the left and the
 * rear head on the right; the vertical variant is the same drawing turned a
 * quarter clockwise so the channel sits on top. Tube passes decide where the
 * tube-side outlet is: rear head for one pass, the channel for two or four.
 */

const CY = 50;
const R = 17; // shell half-height
const S0 = 44; // shell start (front tubesheet)
const S1 = 118; // shell end (rear tubesheet)
const W = 152; // authored width
const H = 100; // authored height (width of the vertical variant)

export const shellTubeExchanger: Generator = {
  id: "exchanger.shell-tube",
  version: 0,
  family: "exchanger",
  name: "Shell-and-tube heat exchanger",
  description: "Fixed-tubesheet exchanger with bonnet or channel head, 1/2/4 tube passes, saddles or lugs.",
  params: [
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
    {
      key: "head",
      label: "Front head",
      type: "choice",
      options: [
        { value: "bonnet", label: "Bonnet" },
        { value: "channel", label: "Channel + cover" },
      ],
      default: "bonnet",
    },
    {
      key: "passes",
      label: "Tube passes",
      type: "choice",
      options: [
        { value: "1", label: "1 pass" },
        { value: "2", label: "2 passes" },
        { value: "4", label: "4 passes" },
      ],
      default: "2",
    },
    { key: "supports", label: "Saddles / lugs", type: "toggle", default: true },
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
    { key: "label", label: "Tag label", type: "text", maxLength: 12, default: "E-501" },
  ],
  spatial(raw) {
    return shellTubeExchanger3d(sanitizeParams(this.params, raw));
  },
  generate(raw): VtObject {
    const p = sanitizeParams(this.params, raw);
    const vertical = p.orientation === "vertical";
    const g = new Geo(vertical ? rotate90(H) : identity());
    const detail = p.detail as string;
    const passes = Number(p.passes);
    const bonnet = p.head === "bonnet";
    const regions: Region[] = [];
    const reg = (id: string, role: Region["role"], label: string, paint: Region["paint"], shapes: Shape[]) =>
      regions.push({ id, role, label, paint, shapes });
    const top = CY - R;
    const bot = CY + R;

    // Supports first so the shell sits over them.
    if (p.supports && !vertical) {
      const saddles: Shape[] = [];
      for (const x of [72, 102]) {
        saddles.push(g.path().M(x - 7, bot - 6).L(x + 7, bot - 6).L(x + 10, 87).L(x - 10, 87).Z().shape());
        saddles.push(g.rect(x - 13, 86, 26, 3.5, 1));
      }
      reg("saddles", "base", "Saddles", "solid", saddles);
    } else if (p.supports) {
      // Vertical units hang from brackets: gusset + bearing plate each side.
      const lugs: Shape[] = [];
      for (const [y, d] of [
        [top, -1],
        [bot, 1],
      ] as const) {
        lugs.push(g.path().M(74, y).L(88, y).L(88, y + d * 10).L(84, y + d * 10).Z().shape());
        lugs.push(g.rect(88, d < 0 ? y - 12 : y, 3.5, 12, 0.8));
      }
      reg("support-lugs", "base", "Support lugs", "solid", lugs);
    }

    // Nozzles (behind the shell and heads) and their flanges.
    const nozzle = (id: string, name: string, x: number, up: boolean) => {
      reg(`${id}-nozzle`, "nozzle", `${name} nozzle`, "solid", [up ? g.rect(x - 4, 19, 8, top - 18) : g.rect(x - 4, bot - 1, 8, 81 - bot + 1)]);
      reg(`${id}-flange`, "flange", `${name} flange`, "solid", [up ? g.rect(x - 7, 16, 14, 4, 1) : g.rect(x - 7, 80, 14, 4, 1)]);
    };
    const tubeOutX = passes === 1 ? 126 : 32;
    nozzle("tube-inlet", "Tube inlet", 32, true);
    nozzle("tube-outlet", "Tube outlet", tubeOutX, false);
    nozzle("shell-inlet", "Shell inlet", 108, true);
    nozzle("shell-outlet", "Shell outlet", 54, false);

    // Shell, front head (bonnet or channel with bolted cover) and rear bonnet.
    reg("shell", "body", "Shell", "solid", [g.rect(S0, top, S1 - S0, 2 * R, 1)]);
    const front = bonnet
      ? g.path().M(40, top).L(24, top).A(8, R, 0, 0, 24, bot).L(40, bot).Z().shape()
      : g.rect(22, top, 18, 2 * R);
    reg("channel", "body-secondary", bonnet ? "Bonnet" : "Channel", "solid", [front]);
    reg("rear-head", "body-secondary", "Rear head", "solid", [g.path().M(122, top).L(130, top).A(6, R, 0, 1, 130, bot).L(122, bot).Z().shape()]);
    const flanges: Shape[] = [g.rect(40, CY - 21, 4, 42, 1), g.rect(S1, CY - 21, 4, 42, 1)];
    if (!bonnet) flanges.push(g.rect(17, CY - 21, 5, 42, 1.2));
    reg("girth-flanges", "flange", bonnet ? "Tubesheet flanges" : "Tubesheet flanges and cover", "solid", flanges);

    if (detail !== "simple") {
      // Tube bundle (broken around the nameplate) and head seams.
      const ys = detail === "detailed" ? [-12, -6, 0, 6, 12] : [-10, 0, 10];
      const tubes: Shape[] = [];
      for (const dy of ys) {
        if (Math.abs(dy) < 8) tubes.push(g.line(S0 + 3, CY + dy, 71, CY + dy), g.line(91, CY + dy, S1 - 3, CY + dy));
        else tubes.push(g.line(S0 + 3, CY + dy, S1 - 3, CY + dy));
      }
      reg("tube-bundle", "detail", "Tube bundle", "line", tubes);
      const seams: Shape[] = [g.line(130, top, 130, bot)];
      if (bonnet) seams.push(g.line(24, top, 24, bot));
      reg("head-seams", "detail", "Head seams", "line", seams);
      if (passes > 1) {
        const x0 = bonnet ? 24 : 22;
        const parts: Shape[] = passes === 2 ? [g.line(x0, CY, 40, CY)] : [g.line(x0, CY - 8.5, 40, CY - 8.5), g.line(x0, CY + 8.5, 40, CY + 8.5), g.line(122, CY, 130, CY)];
        reg("pass-partitions", "detail", "Pass partitions", "line", parts);
      }
    }
    if (detail === "detailed") {
      const baffles: Shape[] = [];
      [58, 66, 96, 106].forEach((x, i) => baffles.push(i % 2 ? g.line(x, bot, x, CY - 7) : g.line(x, top, x, CY + 7)));
      reg("baffles", "detail", "Segmental baffles", "line", baffles);
      const bolts: Shape[] = [];
      for (const x of [40, S1]) for (const y of [CY - 18.5, CY + 18.5]) bolts.push(g.line(x - 1, y, x + 5, y));
      if (!bonnet) for (const y of [CY - 18.5, CY + 18.5]) bolts.push(g.line(16, y, 23, y));
      reg("flange-bolts", "detail", "Flange bolting", "line", bolts);
    }

    reg("nameplate", "body-secondary", "Nameplate", "solid", [g.rect(72, CY - 7.5, 18, 15, 2.5)]);
    reg("status-lamp", "indicator", "Status lamp", "solid", [g.circle(81, CY, 4.2)]);

    const ports: Port[] = [
      g.port("tube-inlet", "inlet", 32, 16, 270, 8),
      g.port("tube-outlet", "outlet", tubeOutX, 84, 90, 8),
      g.port("shell-inlet", "inlet", 108, 16, 270, 8),
      g.port("shell-outlet", "outlet", 54, 84, 90, 8),
    ];

    const contentBottom = vertical ? 144 : p.supports ? 92 : 88;
    const width = vertical ? H : W;
    const { height, label, anchor } = labelLayout(contentBottom, width, p.label as string);
    const [bx, by] = g.pt(12, 24);

    return {
      schema: OBJECT_SCHEMA,
      id: "shell-tube-exchanger",
      identity: {
        family: "exchanger",
        kind: "shell-tube-exchanger",
        category: "process-equipment",
        name: "Shell-and-tube heat exchanger",
        tags: ["heat-exchanger", "thermal", `${passes}-pass`],
      },
      viewBox: [0, 8, width, height - 8],
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
