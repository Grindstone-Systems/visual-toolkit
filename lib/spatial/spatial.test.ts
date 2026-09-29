import { describe, expect, it } from "vitest";
// @ts-expect-error — the validator ships without types
import validator from "gltf-validator";
import { GENERATORS, centrifugalPump, defaultParams, readGlbJson, spatialGlb } from "../index.ts";
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
  expect(spatialGenerators.map((g) => g.id)).toEqual(expect.arrayContaining(["pump.centrifugal", "valve.two-way", "motor.induction", "tank.process", "conveyor.belt", "exchanger.shell-tube", "blower.centrifugal", "compressor.air"]));
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
