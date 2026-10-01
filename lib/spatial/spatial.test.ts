import { describe, expect, it } from "vitest";
// @ts-expect-error — the validator ships without types
import validator from "gltf-validator";
import { GENERATORS, bounds, centrifugalPump, defaultParams, pipeFitting, readGlbJson, spatialGlb } from "../index.ts";
import { PIPE, REDUCED } from "../symbols/pipe.ts";
import type { Generator, ParamValues, SpatialModel } from "../types.ts";

const opts = { style: "modern-flat", theme: "light", state: "running" } as const;
const spatialGenerators = GENERATORS.filter((g) => g.spatial);

/** Every choice/toggle combination (numbers at default, min and max). */
function combos(gen: Generator): ParamValues[] {
  let out: ParamValues[] = [defaultParams(gen.params)];
  for (const d of gen.params) {
    const values =
      d.type === "choice" ? d.options.map((o) => o.value) : d.type === "toggle" ? [true, false] : d.type === "number" ? [d.min, d.default, d.max] : null;
    if (!values) continue;
    out = out.flatMap((p) => values.map((v) => ({ ...p, [d.key]: v })));
  }
  return out;
}

function outwardFailures(model: SpatialModel): { bad: number; total: number } {
  let bad = 0;
  let total = 0;
  for (const n of model.nodes) {
    const { positions: P, normals: N, indices: I } = n.mesh;
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t]!, I[t + 1]!, I[t + 2]!].map((i) => i * 3) as [number, number, number];
      const u = [0, 1, 2].map((k) => P[b + k]! - P[a + k]!);
      const v = [0, 1, 2].map((k) => P[c + k]! - P[a + k]!);
      const g = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const s = [0, 1, 2].map((k) => N[a + k]! + N[b + k]! + N[c + k]!);
      if (Math.hypot(...g) < 1e-12) continue;
      total++;
      if (g[0]! * s[0]! + g[1]! * s[1]! + g[2]! * s[2]! <= 0) bad++;
    }
  }
  return { bad, total };
}

it("covers the families that have 3D models", () => {
  expect(spatialGenerators.map((g) => g.id)).toEqual(
    expect.arrayContaining([
      "pump.centrifugal",
      "valve.two-way",
      "motor.induction",
      "tank.process",
      "conveyor.belt",
      "exchanger.shell-tube",
      "blower.centrifugal",
      "compressor.air",
      "mixer.static",
      "instrument.transmitter",
      "pipe.fitting",
    ]),
  );
});

describe.each(spatialGenerators.map((g) => [g.id, g] as const))("%s 3D (glTF)", (_, gen) => {
  it("passes the Khronos glTF validator with no errors for every configuration", async () => {
    for (const p of combos(gen)) {
      const glb = spatialGlb(gen.generate(p), gen.spatial!(p), opts);
      const report = await validator.validateBytes(glb);
      if (report.issues.numErrors) throw new Error(`${JSON.stringify(p)}: ${JSON.stringify(report.issues.messages.slice(0, 3))}`);
    }
  }, 60000);

  it("has outward-facing triangles in every configuration", () => {
    for (const p of combos(gen)) {
      const { bad, total } = outwardFailures(gen.spatial!(p));
      expect(total).toBeGreaterThan(200);
      if (bad) throw new Error(`${JSON.stringify(p)}: ${bad}/${total} inward triangles`);
    }
  });

  it("is deterministic and carries every state", () => {
    const p = defaultParams(gen.params);
    const a = spatialGlb(gen.generate(p), gen.spatial!(p), opts);
    const b = spatialGlb(gen.generate(p), gen.spatial!(p), opts);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    const json = readGlbJson(a) as { extras: { vt: { schema: string; states: Record<string, unknown> } } };
    expect(json.extras.vt.schema).toBe("vt.spatial/v0");
    expect(Object.keys(json.extras.vt.states)).toHaveLength(7);
  });

  it("references only nodes that exist", () => {
    for (const p of combos(gen)) {
      const m = gen.spatial!(p);
      const ids = new Set(m.nodes.map((n) => n.id));
      expect(ids.size).toBe(m.nodes.length);
      for (const a of m.animations) expect(ids).toContain(a.node);
      for (const l of m.levels ?? []) expect(ids).toContain(l.node);
    }
  });
});

describe("pump 3D specifics", () => {
  it("keeps 2D part names and ships the cutaway impeller", () => {
    const p = defaultParams(centrifugalPump.params);
    const json = readGlbJson(spatialGlb(centrifugalPump.generate(p), centrifugalPump.spatial!(p), opts)) as {
      nodes: { name: string; extras?: { vt?: { internal?: boolean; section?: boolean } } }[];
      extras: { vt: { states: Record<string, { badge?: string; roles: Record<string, { color: string }> }>; sectionPlane?: unknown } };
    };
    const names = json.nodes.map((n) => n.name);
    for (const id of ["casing", "suction-nozzle", "discharge-flange", "status-hub", "coupling", "impeller"]) expect(names).toContain(id);
    expect(json.nodes.find((n) => n.name === "impeller")!.extras!.vt!.internal).toBe(true);
    expect(json.nodes.find((n) => n.name === "casing")!.extras!.vt!.section).toBe(true);
    expect(json.extras.vt.sectionPlane).toBeTruthy();
    expect(json.extras.vt.states.fault!.badge).toBe("fault");
  });
});

describe("pipe fitting 3D ports", () => {
  const faces = (m: SpatialModel, id: string) => m.nodes.filter((n) => n.id === id).flatMap((n) => {
    const out: [number, number, number][] = [];
    for (let i = 0; i < n.mesh.positions.length; i += 3) out.push([n.mesh.positions[i]! + n.translation[0], n.mesh.positions[i + 1]! + n.translation[1], n.mesh.positions[i + 2]! + n.translation[2]]);
    return out;
  });

  it("puts every port on a pipe end, facing out, with the line size", () => {
    for (const p of combos(pipeFitting)) {
      const m = pipeFitting.spatial!(p);
      const flanged = p.ends === "flanged";
      const pts = faces(m, flanged ? "flanges" : "welds");
      const all = bounds(m.nodes);
      expect(all.min[1]).toBeCloseTo(0, 4);
      expect(m.ports.length).toBe(p.fitting === "tee" ? 3 : 2);
      for (const port of m.ports) {
        const d = port.direction;
        expect(Math.hypot(...d)).toBeCloseTo(1, 6);
        const size = p.fitting === "reducer" && port.id === "b" ? PIPE[REDUCED[String(p.size)]!]! : PIPE[String(p.size)]!;
        expect(port.size).toBeCloseTo(size.od, 6);
        // The end face lies in the plane through the port, and nothing reaches beyond it.
        const along = pts.map((q) => (q[0] - port.position[0]) * d[0] + (q[1] - port.position[1]) * d[1] + (q[2] - port.position[2]) * d[2]);
        expect(Math.max(...along)).toBeCloseTo(0, 3);
        // The face is centred on the port: points in that plane span the bore radius around it.
        const onFace = pts.filter((_, i) => Math.abs(along[i]!) < 1e-3);
        const radial = onFace.map((q) => Math.hypot(q[0] - port.position[0], q[1] - port.position[1], q[2] - port.position[2]));
        expect(Math.min(...radial)).toBeCloseTo(size.od / 2 - size.wall, 3);
        // Outward: the fitting body lies behind the face.
        const body = faces(m, "body").map((q) => (q[0] - port.position[0]) * d[0] + (q[1] - port.position[1]) * d[1] + (q[2] - port.position[2]) * d[2]);
        expect(Math.max(...body)).toBeLessThan(1e-4);
      }
    }
  });

  it("makes flanged ports sit one flange height beyond the butt-weld ends", () => {
    const w = pipeFitting.spatial!({ ...defaultParams(pipeFitting.params), fitting: "elbow-90", ends: "welded" });
    const f = pipeFitting.spatial!({ ...defaultParams(pipeFitting.params), fitting: "elbow-90", ends: "flanged" });
    const s = PIPE["80"]!;
    const span = (m: SpatialModel) => Math.hypot(...[0, 1, 2].map((k) => m.ports[0]!.position[k]! - m.ports[1]!.position[k]!));
    expect(span(w)).toBeCloseTo(s.elbow90 * Math.SQRT2, 3);
    expect(span(f)).toBeCloseTo((s.elbow90 + s.flange.h) * Math.SQRT2, 3);
  });
});
