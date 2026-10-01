import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { objectSchema } from "../index.ts";
import { GENERATORS, defaultParams, generate, sanitizeParams } from "../index.ts";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(objectSchema);

/** Every combination of choice/toggle params for a generator. */
function* combos(gen: (typeof GENERATORS)[number]) {
  const axes = gen.params
    .filter((d) => d.type === "choice" || d.type === "toggle")
    .map((d) => (d.type === "choice" ? d.options.map((o) => [d.key, o.value]) : [[d.key, true], [d.key, false]]));
  const walk = function* (i: number, acc: Record<string, string | boolean>): Generator<Record<string, string | boolean>> {
    if (i === axes.length) return yield { ...acc };
    for (const [k, v] of axes[i]!) yield* walk(i + 1, { ...acc, [k as string]: v as string | boolean });
  };
  yield* walk(0, {});
}

describe.each(GENERATORS.map((g) => [`${g.id}@${g.version}`, g] as const))("%s", (_, gen) => {
  it("produces schema-valid visual objects for every parameter combination", () => {
    let n = 0;
    for (const params of combos(gen)) {
      const vo = gen.generate({ ...defaultParams(gen.params), ...params });
      const ok = validate(vo);
      if (!ok) throw new Error(`${JSON.stringify(params)}: ${ajv.errorsText(validate.errors)}`);
      n++;
    }
    expect(n).toBeGreaterThan(1);
  });

  it("is deterministic", () => {
    const p = defaultParams(gen.params);
    expect(JSON.stringify(gen.generate(p))).toBe(JSON.stringify(gen.generate({ ...p })));
  });

  it("uses unique region ids and references existing regions in animations", () => {
    for (const params of combos(gen)) {
      const vo = gen.generate(params);
      const ids = vo.regions.map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of vo.animations ?? []) if ("region" in a) expect(ids).toContain(a.region);
    }
  });

  it("keeps ports inside the viewBox", () => {
    for (const params of combos(gen)) {
      const vo = gen.generate(params);
      const [x, y, w, h] = vo.viewBox;
      for (const p of vo.ports) {
        expect(p.x).toBeGreaterThanOrEqual(x);
        expect(p.x).toBeLessThanOrEqual(x + w);
        expect(p.y).toBeGreaterThanOrEqual(y);
        expect(p.y).toBeLessThanOrEqual(y + h);
      }
    }
  });
});

describe("pump geometry", () => {
  it("mirrors ports when suction is on the right", () => {
    const left = generate("pump.centrifugal", { inlet: "left" });
    const right = generate("pump.centrifugal", { inlet: "right" });
    const w = left.viewBox[2];
    const sL = left.ports.find((p) => p.id === "suction")!;
    const sR = right.ports.find((p) => p.id === "suction")!;
    expect(sR.x).toBe(w - sL.x);
    expect(sL.direction).toBe(180);
    expect(sR.direction).toBe(0);
  });
});

describe("sanitizeParams", () => {
  const gen = GENERATORS[0]!;
  it("falls back to defaults for invalid input and strips unsafe label characters", () => {
    const p = sanitizeParams(gen.params, { discharge: "sideways", base: "yes", label: '<script>"P-1', extra: 1 } as never);
    expect(p.discharge).toBe("top");
    expect(p.base).toBe(true);
    expect(p.label).toBe("scriptP-1");
    expect(p).not.toHaveProperty("extra");
  });
});
