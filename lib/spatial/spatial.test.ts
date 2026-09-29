import { describe, expect, it } from "vitest";
// @ts-expect-error — the validator ships without types
import validator from "gltf-validator";
import { centrifugalPump, readGlbJson, spatialGlb, defaultParams } from "../index.ts";
import type { SpatialModel } from "../types.ts";

const opts = { style: "modern-flat", theme: "light", state: "running" } as const;
const combos = (() => {
  const out: Record<string, string | boolean>[] = [];
  for (const discharge of ["top", "side"])
    for (const inlet of ["left", "right"])
      for (const driver of ["motor", "none"])
        for (const base of [true, false])
          for (const detail of ["simple", "standard", "detailed"]) out.push({ discharge, inlet, driver, base, detail });
  return out;
})();

describe("pump 3D (glTF)", () => {
  it("passes the Khronos glTF validator with no errors for every configuration", async () => {
    for (const c of combos) {
      const p = { ...defaultParams(centrifugalPump.params), ...c };
      const glb = spatialGlb(centrifugalPump.generate(p), centrifugalPump.spatial!(p), opts);
      const report = await validator.validateBytes(glb);
      if (report.issues.numErrors) throw new Error(`${JSON.stringify(c)}: ${JSON.stringify(report.issues.messages.slice(0, 3))}`);
    }
  }, 30000);

  it("has outward-facing triangles", () => {
    const model: SpatialModel = centrifugalPump.spatial!({ inlet: "right" });
    let bad = 0;
    let total = 0;
    for (const n of model.nodes) {
      const { positions: P, normals: N, indices: I } = n.mesh;
      for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t]!, I[t + 1]!, I[t + 2]!].map((i) => i * 3);
        const u = [0, 1, 2].map((k) => P[b! + k]! - P[a! + k]!);
        const v = [0, 1, 2].map((k) => P[c! + k]! - P[a! + k]!);
        const g = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const s = [0, 1, 2].map((k) => N[a! + k]! + N[b! + k]! + N[c! + k]!);
        if (Math.hypot(...g) < 1e-12) continue;
        total++;
        if (g[0]! * s[0]! + g[1]! * s[1]! + g[2]! * s[2]! <= 0) bad++;
      }
    }
    expect(total).toBeGreaterThan(1000);
    expect(bad).toBe(0);
  });

  it("carries the same part names and every state for runtime switching", () => {
    const p = defaultParams(centrifugalPump.params);
    const json = readGlbJson(spatialGlb(centrifugalPump.generate(p), centrifugalPump.spatial!(p), opts)) as {
      nodes: { name: string }[];
      animations: { name: string }[];
      extras: { vt: { schema: string; states: Record<string, { roles: Record<string, { color: string }>; badge?: string }> } };
    };
    const names = json.nodes.map((n) => n.name);
    for (const id of ["casing", "suction-nozzle", "discharge-flange", "status-hub", "coupling"]) expect(names).toContain(id);
    expect(json.animations.map((a) => a.name)).toEqual(["impeller-spin"]);
    expect(json.extras.vt.schema).toBe("vt.spatial/v0");
    expect(Object.keys(json.extras.vt.states)).toHaveLength(7);
    expect(json.extras.vt.states.fault!.badge).toBe("fault");
    expect(json.extras.vt.states.fault!.roles.indicator!.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("is deterministic", () => {
    const p = defaultParams(centrifugalPump.params);
    const a = spatialGlb(centrifugalPump.generate(p), centrifugalPump.spatial!(p), opts);
    const b = spatialGlb(centrifugalPump.generate(p), centrifugalPump.spatial!(p), opts);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
