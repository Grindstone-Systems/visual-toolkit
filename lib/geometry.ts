import type { Port, PortKind, Shape } from "./types.ts";

/**
 * Affine frame used by generators to author geometry once and emit it in any
 * orientation (mirror / quarter rotations) with correct arc sweeps, rects and
 * port directions. Output coordinates are rounded to keep SVGs small and
 * byte-for-byte deterministic.
 */
export interface Frame {
  /** [a, b, c, d, e, f] — x' = a*x + c*y + e, y' = b*x + d*y + f */
  m: [number, number, number, number, number, number];
}

export const identity = (): Frame => ({ m: [1, 0, 0, 1, 0, 0] });

/** Mirror horizontally about x = width / 2. */
export const mirrorX = (width: number): Frame => ({ m: [-1, 0, 0, 1, width, 0] });

/** Rotate 90° clockwise, mapping a (w × h) box onto an (h × w) box. */
export const rotate90 = (h: number): Frame => ({ m: [0, 1, -1, 0, h, 0] });

export function compose(outer: Frame, inner: Frame): Frame {
  const [a1, b1, c1, d1, e1, f1] = outer.m;
  const [a2, b2, c2, d2, e2, f2] = inner.m;
  return {
    m: [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1,
    ],
  };
}

export const round = (n: number): number => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export class Geo {
  constructor(readonly frame: Frame = identity()) {}

  pt(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.frame.m;
    return [round(a * x + c * y + e), round(b * x + d * y + f)];
  }

  private get flipsWinding(): boolean {
    const [a, b, c, d] = this.frame.m;
    return a * d - b * c < 0;
  }

  path(): PathBuilder {
    return new PathBuilder(this, this.flipsWinding);
  }

  rect(x: number, y: number, width: number, height: number, rx?: number): Shape {
    const [x1, y1] = this.pt(x, y);
    const [x2, y2] = this.pt(x + width, y + height);
    const r: Shape = {
      type: "rect",
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: round(Math.abs(x2 - x1)),
      height: round(Math.abs(y2 - y1)),
    };
    if (rx) r.rx = rx;
    return r;
  }

  circle(cx: number, cy: number, r: number): Shape {
    const [x, y] = this.pt(cx, cy);
    return { type: "circle", cx: x, cy: y, r };
  }

  line(x1: number, y1: number, x2: number, y2: number): Shape {
    const [a, b] = this.pt(x1, y1);
    const [c, d] = this.pt(x2, y2);
    return { type: "line", x1: a, y1: b, x2: c, y2: d };
  }

  /** Transform an outward direction (degrees) through the frame. */
  dir(deg: number): number {
    const rad = (deg * Math.PI) / 180;
    const [a, b, c, d] = this.frame.m;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const out = (Math.atan2(b * dx + d * dy, a * dx + c * dy) * 180) / Math.PI;
    return round((out + 360) % 360);
  }

  port(id: string, kind: PortKind, x: number, y: number, direction: number, size?: number): Port {
    const [px, py] = this.pt(x, y);
    const p: Port = { id, kind, x: px, y: py, direction: this.dir(direction) };
    if (size !== undefined) p.size = size;
    return p;
  }
}

export class PathBuilder {
  private parts: string[] = [];
  constructor(
    private geo: Geo,
    private flip: boolean,
  ) {}

  M(x: number, y: number): this {
    const [a, b] = this.geo.pt(x, y);
    this.parts.push(`M${a} ${b}`);
    return this;
  }
  L(x: number, y: number): this {
    const [a, b] = this.geo.pt(x, y);
    this.parts.push(`L${a} ${b}`);
    return this;
  }
  /** Quadratic curve. */
  Q(cx: number, cy: number, x: number, y: number): this {
    const [a, b] = this.geo.pt(cx, cy);
    const [c, d] = this.geo.pt(x, y);
    this.parts.push(`Q${a} ${b} ${c} ${d}`);
    return this;
  }
  /** Cubic curve. */
  C(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    const [a, b] = this.geo.pt(c1x, c1y);
    const [c, d] = this.geo.pt(c2x, c2y);
    const [e, f] = this.geo.pt(x, y);
    this.parts.push(`C${a} ${b} ${c} ${d} ${e} ${f}`);
    return this;
  }
  /** Circular/elliptical arc (axis-aligned radii). */
  A(rx: number, ry: number, large: 0 | 1, sweep: 0 | 1, x: number, y: number): this {
    const [a, b] = this.geo.pt(x, y);
    // Quarter rotations swap radii; mirrors flip the sweep direction.
    const [m0] = this.geo.frame.m;
    const swapped = Math.abs(m0) < 0.5;
    const s = this.flip ? (1 - sweep) : sweep;
    this.parts.push(`A${swapped ? ry : rx} ${swapped ? rx : ry} 0 ${large} ${s} ${a} ${b}`);
    return this;
  }
  Z(): this {
    this.parts.push("Z");
    return this;
  }
  shape(): Shape {
    return { type: "path", d: this.parts.join("") };
  }
}
