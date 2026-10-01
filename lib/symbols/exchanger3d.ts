import { appendRotated, blade, cylinder, emptyMesh, lathe, roundedBox, roundedDisc, type ProfilePoint } from "../spatial/mesh.ts";
import type { ParamValues, SpatialModel, SpatialNode, SpatialPort, Vec3 } from "../types.ts";
import { addBeacon, type AddPart } from "./motor3d.ts";

/**
 * Stylised 3D shell-and-tube exchanger from the same params as the 2D symbol.
 *
 * Built horizontally with the shell along X (front head on −X): shell with
 * bolted girth flanges, bonnet or channel-and-cover front head, bonnet rear
 * head, flanged nozzles and saddles. The cutaway sections the shell and heads
 * to reveal the tube bundle, segmental baffles and pass partitions. The
 * vertical variant is the same assembly stood on end (channel on top), on
 * lugs and legs. Metres, +Y up.
 */

const HEX = 6;
const RS = 0.24; // shell radius
const SX = 0.6; // shell half-length
const RF = RS + 0.055; // girth flange radius

/** 2:1 ellipsoidal head profile from the tangent line (w) to the crown. */
function dish(r: number, w: number, dir: 1 | -1, depth: number, steps = 12): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * (Math.PI / 2);
    out.push([r * Math.cos(t), w + dir * depth * Math.sin(t)]);
  }
  return out;
}

export function shellTubeExchanger3d(p: ParamValues): SpatialModel {
  const vertical = p.orientation === "vertical";
  const bonnet = p.head !== "channel";
  const passes = Number(p.passes);
  const detail = String(p.detail);
  const fine = detail !== "simple";
  const seg = detail === "simple" ? 28 : detail === "detailed" ? 56 : 44;
  // Horizontal units sit on saddles; vertical ones are built along X at the
  // origin and stood up at the end.
  const AY = vertical ? 0 : p.supports ? 0.62 : 0.5;
  const nodes: SpatialNode[] = [];
  const add: AddPart = (id, role, label, finish, build, pivot = [0, 0, 0], flags = {}) => {
    const m = emptyMesh();
    build(m);
    nodes.push({ id, role, label, finish, mesh: m, translation: pivot, ...flags });
  };
  const cut = { section: true } as const;

  /* ---------------- shell ---------------- */
  add("shell", "body", "Shell", "paint", (m) => {
    lathe(m, "x", [AY, 0], [
      [0, -SX],
      [RS - 0.012, -SX],
      [RS, -SX + 0.012],
      [RS, SX - 0.012],
      [RS - 0.012, SX],
      [0, SX],
    ], seg + 8);
  }, [0, 0, 0], cut);

  /* ---------------- heads ---------------- */
  const F0 = -SX - 0.092; // front head flange face
  const R0 = SX + 0.092; // rear head flange face
  const frontEnd = bonnet ? -0.84 : -0.87;
  add("channel", "body-secondary", bonnet ? "Bonnet" : "Channel", "paint", (m) => {
    if (bonnet) {
      lathe(m, "x", [AY, 0], [[0, frontEnd - 0.12], ...dish(RS, frontEnd, -1, 0.12).reverse().slice(1), [RS, F0], [0, F0]], seg + 8);
    } else {
      lathe(m, "x", [AY, 0], [[0, frontEnd], [RS, frontEnd], [RS, F0], [0, F0]], seg + 8);
    }
  }, [0, 0, 0], cut);
  add("rear-head", "body-secondary", "Rear head", "paint", (m) => {
    lathe(m, "x", [AY, 0], [[0, R0], [RS, R0], [RS, 0.84], ...dish(RS, 0.84, 1, 0.11).slice(1), [0, 0.95]], seg + 8);
  }, [0, 0, 0], cut);

  // Girth flanges: shell flange + tubesheet rim + head flange at each end.
  add("girth-flanges", "flange", bonnet ? "Tubesheet flanges" : "Tubesheet flanges and cover", "cast", (m) => {
    for (const s of [-1, 1]) {
      const a = s * SX;
      roundedDisc(m, "x", [AY, 0], RF, Math.min(a, a + s * 0.04), Math.max(a, a + s * 0.04), 0.005, seg);
      roundedDisc(m, "x", [AY, 0], RF - 0.012, Math.min(a + s * 0.04, a + s * 0.052), Math.max(a + s * 0.04, a + s * 0.052), 0.002, seg);
      roundedDisc(m, "x", [AY, 0], RF, Math.min(a + s * 0.052, a + s * 0.092), Math.max(a + s * 0.052, a + s * 0.092), 0.005, seg);
    }
    if (!bonnet) {
      roundedDisc(m, "x", [AY, 0], RF, frontEnd - 0.04, frontEnd, 0.005, seg); // channel flange
      roundedDisc(m, "x", [AY, 0], RF, frontEnd - 0.082, frontEnd - 0.042, 0.008, seg); // flat cover
      if (fine) {
        // Lifting lug on the cover.
        roundedBox(m, [frontEnd - 0.1, AY + 0.12, -0.012], [frontEnd - 0.078, AY + 0.18, 0.012], 0.006, 2);
      }
    }
  }, [0, 0, 0], cut);

  const bolts = emptyMesh();
  if (fine) {
    const ring = (w0: number, w1: number, n: number) => {
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2 + Math.PI / n;
        cylinder(bolts, "x", [AY + Math.cos(t) * (RS + 0.033), Math.sin(t) * (RS + 0.033)], 0.0105, w0, w1, HEX);
      }
    };
    const n = detail === "detailed" ? 20 : 16;
    ring(-SX - 0.1, -SX + 0.008, n);
    ring(SX - 0.008, SX + 0.1, n);
    if (!bonnet) ring(frontEnd - 0.09, frontEnd + 0.008, n);
  }

  /* ---------------- nozzles ---------------- */
  const tubeX = -0.775;
  const tubeOutX = passes === 1 ? 0.77 : tubeX;
  const ports: SpatialPort[] = [];
  const nozzle = (id: string, name: string, kind: "inlet" | "outlet", x: number, up: boolean, r: number) => {
    const d = up ? 1 : -1;
    const y0 = AY + d * (RS - 0.02);
    const face = AY + d * (RS + 0.15);
    const back = face - d * 0.034;
    add(`${id}-nozzle`, "nozzle", `${name} nozzle`, "cast", (m) => {
      cylinder(m, "y", [0, x], r, Math.min(y0, back), Math.max(y0, back), seg);
    }, [0, 0, 0], cut);
    add(`${id}-flange`, "flange", `${name} flange`, "cast", (m) => {
      const hub: ProfilePoint[] = up
        ? [[0, back - 0.05], [r + 0.002, back - 0.05], [r * 1.32, back], [0, back]]
        : [[0, back], [r * 1.32, back], [r + 0.002, back + 0.05], [0, back + 0.05]];
      lathe(m, "y", [0, x], hub, seg);
      roundedDisc(m, "y", [0, x], r * 1.9, Math.min(back, face), Math.max(back, face), 0.005, seg);
      const rf = up ? [face, face + 0.007] : [face - 0.007, face];
      roundedDisc(m, "y", [0, x], r * 1.34, rf[0]!, rf[1]!, 0.002, seg); // raised face
    }, [0, 0, 0], cut);
    if (fine) {
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const lo = up ? back - 0.012 : face - 0.01;
        const hi = up ? face + 0.01 : back + 0.012;
        cylinder(bolts, "y", [Math.sin(t) * r * 1.6, x + Math.cos(t) * r * 1.6], 0.0085, lo, hi, HEX);
      }
    }
    ports.push({ id, kind, position: [x, face + d * 0.007, 0], direction: [0, d, 0] });
  };
  nozzle("tube-inlet", "Tube inlet", "inlet", tubeX, true, 0.058);
  nozzle("tube-outlet", "Tube outlet", "outlet", tubeOutX, false, 0.058);
  nozzle("shell-inlet", "Shell inlet", "inlet", 0.44, true, 0.066);
  nozzle("shell-outlet", "Shell outlet", "outlet", -0.44, false, 0.066);
  if (fine) nodes.push({ id: "flange-bolts", role: "detail", label: "Flange bolting", finish: "steel", mesh: bolts, translation: [0, 0, 0], section: true });

  /* ---------------- supports ---------------- */
  // Vertical units stand on legs: the floor sits at pre-rotation x = LIFT.
  const LIFT = 1.28;
  if (p.supports && !vertical) {
    add("saddles", "base", "Saddles", "paint", (m) => {
      for (const x of [-0.14, 0.34]) {
        const zc = RS * 0.84;
        const A: [number, number][] = [];
        const B: [number, number][] = [];
        const Wp: [number, number][] = [];
        const Wq: [number, number][] = [];
        for (let i = 0; i <= 16; i++) {
          const z = -zc + (i / 16) * 2 * zc;
          A.push([AY - Math.sqrt((RS + 0.012) ** 2 - z * z), z]);
          B.push([0.03, z]);
          const phi = -1.05 + (i / 16) * 2.1;
          Wp.push([AY - Math.cos(phi) * (RS + 0.013), Math.sin(phi) * (RS + 0.013)]);
          Wq.push([AY - Math.cos(phi) * (RS - 0.002), Math.sin(phi) * (RS - 0.002)]);
        }
        blade(m, "x", A, B, x - 0.011, x + 0.011); // web
        blade(m, "x", Wq, Wp, x - 0.085, x + 0.085); // wear plate
        roundedBox(m, [x - 0.09, 0, -RS * 0.95], [x + 0.09, 0.03, RS * 0.95], 0.008, 2); // base plate
        for (const s of [-1, 1]) {
          const z = s * RS * 0.66;
          roundedBox(m, [x - 0.075, 0.03, z - 0.008], [x + 0.075, AY - Math.sqrt(RS * RS - z * z) + 0.004, z + 0.008], 0.004, 2);
        }
      }
    });
    if (fine) {
      add("anchor-bolts", "detail", "Anchor bolts", "steel", (m) => {
        for (const x of [-0.14, 0.34]) for (const z of [-RS * 0.82, RS * 0.82]) for (const dx of [-0.055, 0.055]) cylinder(m, "y", [z, x + dx], 0.011, 0.03, 0.052, HEX);
      });
    }
  } else if (p.supports) {
    add("support-lugs", "base", "Support lugs and legs", "paint", (m) => {
      for (let k = 0; k < 4; k++) {
        const t = Math.PI / 4 + (k * Math.PI) / 2;
        const lug = emptyMesh();
        // Two gussets, a bearing plate and a leg, built at angle 0 then turned.
        for (const dz of [-0.035, 0.035]) roundedBox(lug, [-0.1, RS - 0.01, dz - 0.007], [0.04, RS + 0.1, dz + 0.007], 0.003, 2);
        roundedBox(lug, [0.04, RS - 0.005, -0.06], [0.064, RS + 0.13, 0.06], 0.005, 2);
        cylinder(lug, "x", [RS + 0.07, 0], 0.036, 0.064, LIFT - 0.02, 20);
        roundedBox(lug, [LIFT - 0.022, RS - 0.01, -0.08], [LIFT, RS + 0.15, 0.08], 0.006, 2);
        appendRotated(m, lug, "x", t, [0, 0, 0]);
      }
    });
  }

  /* ---------------- nameplate ---------------- */
  add("nameplate", "body-secondary", "Nameplate", "paint", (m) => {
    roundedBox(m, [-0.08, AY - 0.05, RS - 0.006], [0.08, AY + 0.05, RS + 0.012], 0.005, 2);
  }, [0, 0, 0], cut);

  /* ---------------- internals (cutaway) ---------------- */
  const inner = { internal: true } as const;
  add("tube-bundle", "detail", "Tube bundle", "steel", (m) => {
    const pitch = fine ? 0.04 : 0.058;
    const rt = fine ? 0.0105 : 0.014;
    const lim = RS - 0.035;
    const rows = Math.ceil(lim / (pitch * 0.866));
    for (let j = -rows; j <= rows; j++) {
      const y = j * pitch * 0.866;
      const off = (j & 1) * pitch * 0.5;
      for (let i = -12; i <= 12; i++) {
        const z = i * pitch + off;
        if (Math.hypot(y, z) > lim) continue;
        if (passes > 1 && Math.abs(y) < pitch * 0.35) continue; // pass lane
        cylinder(m, "x", [AY + y, z], rt, -SX - 0.05, SX + 0.05, fine ? 10 : 8);
      }
    }
  }, [0, 0, 0], inner);
  add("baffles", "detail", "Segmental baffles", "cast", (m) => {
    const r = RS - 0.009;
    [-0.42, -0.21, 0, 0.21, 0.42].forEach((x, k) => {
      const A: [number, number][] = [];
      const B: [number, number][] = [];
      const cutAt = r * 0.45;
      for (let i = 0; i <= 24; i++) {
        const z = -r + (i / 24) * 2 * r;
        const h = Math.sqrt(Math.max(0, r * r - z * z));
        // Alternate cuts: bottom-open then top-open, as in the 2D drawing.
        const hi = k % 2 ? Math.min(h, cutAt) : h;
        const lo = k % 2 ? -h : Math.max(-h, -cutAt);
        if (hi <= lo) continue;
        A.push([AY + hi, z]);
        B.push([AY + lo, z]);
      }
      blade(m, "x", A, B, x - 0.006, x + 0.006);
    });
    // Tie rods through the baffles.
    for (const [y, z] of [[0.17, 0.07], [-0.17, -0.07], [0.07, -0.17], [-0.07, 0.17]] as const) cylinder(m, "x", [AY + y, z], 0.007, -SX + 0.01, SX - 0.01, 8);
  }, [0, 0, 0], inner);
  if (passes > 1) {
    add("pass-partitions", "detail", "Pass partitions", "cast", (m) => {
      const plate = (x0: number, x1: number, dy: number) => {
        const hz = Math.sqrt(RS * RS - dy * dy) - 0.008;
        roundedBox(m, [x0, AY + dy - 0.006, -hz], [x1, AY + dy + 0.006, hz], 0.003, 2);
      };
      const fx = bonnet ? frontEnd + 0.004 : frontEnd;
      if (passes === 2) plate(fx, -SX - 0.052, 0);
      else {
        plate(fx, -SX - 0.052, RS * 0.42);
        plate(fx, -SX - 0.052, -RS * 0.42);
        plate(SX + 0.052, 0.836, 0);
      }
    }, [0, 0, 0], { internal: true, section: true });
  }

  /* ---------------- assemble ---------------- */
  let badge: Vec3 = [-0.62, AY + RS + 0.52, 0];
  if (!vertical) {
    addBeacon(add, [0.12, AY + RS - 0.004, 0]);
    return {
      nodes,
      ports,
      animations: [],
      badge,
      sectionPlane: { normal: [0, 0, 1], offset: 0 },
    };
  }

  // Stand the unit up: pre-rotation +X becomes −Y (rear head down, channel up).
  const rot = (v: Vec3): Vec3 => [v[1], -v[0], v[2]];
  const up = (v: Vec3): Vec3 => [v[0], v[1] + LIFT, v[2]];
  const stood = nodes.map((n) => {
    const m = emptyMesh();
    appendRotated(m, n.mesh, "z", -Math.PI / 2, [0, 0, 0]);
    return { ...n, mesh: m, translation: up(rot(n.translation)) };
  });
  nodes.length = 0;
  nodes.push(...stood);
  const topY = LIFT - (bonnet ? frontEnd - 0.12 : frontEnd - 0.082);
  addBeacon(add, [0, topY - (bonnet ? 0.004 : 0), 0.0]);
  badge = [0.55, topY + 0.3, 0];
  return {
    nodes,
    ports: ports.map((q) => ({ ...q, position: up(rot(q.position)), direction: rot(q.direction) })),
    animations: [],
    badge,
    sectionPlane: { normal: [0, 0, 1], offset: 0 },
  };
}

