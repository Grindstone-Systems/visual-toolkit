import type { Geo } from "../geometry.ts";
import type { Shape } from "../types.ts";

/**
 * A tiny single-stroke font for text that is part of a symbol's geometry
 * (ISA tag letters and loop numbers inside instrument bubbles). Glyphs are
 * drawn on a 4 × 6 cell (y down) with M / L / Q commands, so they render as
 * ordinary stroked paths in every style and export target, with no font
 * dependency. Unsupported characters are skipped as spaces.
 */

const G: Record<string, string> = {
  A: "M0 6L2 0L4 6M0.7 4L3.3 4",
  B: "M0 6L0 0L2.5 0Q3.9 0 3.9 1.5Q3.9 3 2.5 3L0 3M2.5 3Q4 3 4 4.5Q4 6 2.5 6L0 6",
  C: "M4 1Q3.4 0 2.1 0Q0 0 0 3Q0 6 2.1 6Q3.4 6 4 5",
  D: "M0 0L0 6L1.8 6Q4 6 4 3Q4 0 1.8 0L0 0",
  E: "M4 0L0 0L0 6L4 6M0 3L3 3",
  F: "M4 0L0 0L0 6M0 3L3 3",
  G: "M4 1Q3.4 0 2.1 0Q0 0 0 3Q0 6 2.1 6Q4 6 4 3.6L2.3 3.6",
  H: "M0 0L0 6M4 0L4 6M0 3L4 3",
  I: "M2 0L2 6M1 0L3 0M1 6L3 6",
  J: "M3.4 0L3.4 4.3Q3.4 6 1.8 6Q0.4 6 0 4.7",
  K: "M0 0L0 6M4 0L0 3.8M1.4 2.7L4 6",
  L: "M0 0L0 6L4 6",
  M: "M0 6L0 0L2 3.8L4 0L4 6",
  N: "M0 6L0 0L4 6L4 0",
  O: "M2 0Q0 0 0 3Q0 6 2 6Q4 6 4 3Q4 0 2 0",
  P: "M0 6L0 0L2.5 0Q4 0 4 1.6Q4 3.2 2.5 3.2L0 3.2",
  Q: "M2 0Q0 0 0 3Q0 6 2 6Q4 6 4 3Q4 0 2 0M2.6 4.4L4 6.2",
  R: "M0 6L0 0L2.5 0Q4 0 4 1.6Q4 3.2 2.5 3.2L0 3.2M2.2 3.2L4 6",
  S: "M3.8 0.9Q3.2 0 2 0Q0.2 0 0.2 1.5Q0.2 2.7 2 3Q3.8 3.3 3.8 4.5Q3.8 6 2 6Q0.7 6 0.1 5",
  T: "M0 0L4 0M2 0L2 6",
  U: "M0 0L0 4Q0 6 2 6Q4 6 4 4L4 0",
  V: "M0 0L2 6L4 0",
  W: "M0 0L1 6L2 2L3 6L4 0",
  X: "M0 0L4 6M4 0L0 6",
  Y: "M0 0L2 3L4 0M2 3L2 6",
  Z: "M0 0L4 0L0 6L4 6",
  "0": "M2 0Q0 0 0 3Q0 6 2 6Q4 6 4 3Q4 0 2 0",
  "1": "M0.8 1.2L2.2 0L2.2 6M0.8 6L3.6 6",
  "2": "M0.2 1.2Q0.8 0 2 0Q3.8 0 3.8 1.7Q3.8 2.9 2 3.9L0 6L4 6",
  "3": "M0.3 0.6Q1 0 2 0Q3.8 0 3.8 1.5Q3.8 3 1.8 3Q4 3 4 4.5Q4 6 2 6Q0.8 6 0.1 5.3",
  "4": "M3 6L3 0L0 4.2L4 4.2",
  "5": "M3.8 0L0.6 0L0.3 2.8Q1 2.3 2 2.3Q4 2.3 4 4.15Q4 6 2 6Q0.8 6 0.1 5.3",
  "6": "M3.5 0.5Q2.9 0 2 0Q0 0 0 3.5Q0 6 2 6Q4 6 4 4.1Q4 2.3 2 2.3Q0.6 2.3 0 3.6",
  "7": "M0 0L4 0L1.5 6",
  "8": "M2 3Q0.3 3 0.3 1.5Q0.3 0 2 0Q3.7 0 3.7 1.5Q3.7 3 2 3Q0 3 0 4.5Q0 6 2 6Q4 6 4 4.5Q4 3 2 3",
  "9": "M0.5 5.5Q1.1 6 2 6Q4 6 4 2.5Q4 0 2 0Q0 0 0 1.9Q0 3.7 2 3.7Q3.4 3.7 4 2.4",
  "-": "M0.8 3L3.2 3",
  "/": "M0.5 6L3.5 0",
  ".": "M1.8 5.9L2.2 5.9",
};

const ADVANCE = 5.4;
const CELL_W = 4;

/** Width of `text` in glyph units (before scaling). */
export const glyphWidth = (text: string) => (text.length ? text.length * ADVANCE - (ADVANCE - CELL_W) : 0);

/**
 * Stroked paths for `text`, centred on `cx`, with cap height `height`, the
 * baseline at `cy + height / 2`; squeezed to `maxWidth` when needed.
 */
export function glyphText(g: Geo, text: string, cx: number, cy: number, height: number, maxWidth: number): Shape[] {
  const t = text.toUpperCase();
  let s = height / 6;
  const w = glyphWidth(t) * s;
  if (w > maxWidth) s *= maxWidth / w;
  const x0 = cx - (glyphWidth(t) * s) / 2;
  const y0 = cy - 3 * s;
  const shapes: Shape[] = [];
  [...t].forEach((ch, i) => {
    const d = G[ch];
    if (!d) return;
    const ox = x0 + i * ADVANCE * s;
    const b = g.path();
    for (const [, cmd, args] of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
      const n = args!.trim().split(/[\s,]+/).map(Number).map((v, k) => (k % 2 ? y0 + v * s : ox + v * s));
      if (cmd === "M") b.M(n[0]!, n[1]!);
      else if (cmd === "L") b.L(n[0]!, n[1]!);
      else b.Q(n[0]!, n[1]!, n[2]!, n[3]!);
    }
    shapes.push(b.shape());
  });
  return shapes;
}
