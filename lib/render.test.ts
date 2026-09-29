import { describe, expect, it } from "vitest";
import { decodeShareCode, encodeShareCode, extractRecipe, recipeFor, renderSvg } from "./index.ts";
import { STATES, type Recipe } from "./index.ts";
import { generate, generateFromRecipe } from "./index.ts";
import { lightTheme } from "./index.ts";

const pump = generate("pump.centrifugal", {});
const base = { style: "high-performance", theme: "light", state: "normal" } as const;

describe("renderSvg (resolved)", () => {
  it("emits semantic, well-formed SVG with literal colours", () => {
    const svg = renderSvg(pump, base);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain('data-region="casing"');
    expect(svg).toContain("vt-role--body");
    expect(svg).toContain(`fill="${lightTheme.tokens["equipment.body"]}"`);
    expect(svg).not.toContain("var(--");
  });

  it("gives every abnormal state a shape-coded badge (not colour alone)", () => {
    for (const state of ["warning", "fault", "maintenance", "disabled", "comm-loss"] as const) {
      expect(renderSvg(pump, { ...base, state })).toContain(`vt-badge--${state}`);
    }
    expect(renderSvg(pump, base)).not.toContain("vt-badge");
  });

  it("animates the impeller only while running", () => {
    expect(renderSvg(pump, { ...base, state: "running" })).toContain("@keyframes");
    expect(renderSvg(pump, base)).not.toContain("@keyframes");
    expect(renderSvg(pump, { ...base, state: "running", animate: false })).not.toContain("@keyframes");
  });

  it("escapes label text", () => {
    const vo = { ...pump, label: { text: "A&B<" } };
    expect(renderSvg(vo, base)).toContain("A&amp;B&lt;");
  });

  it("honours token overrides", () => {
    const svg = renderSvg(pump, { ...base, tokens: { "equipment.body": "#123456" } });
    expect(svg).toContain('fill="#123456"');
  });
});

describe("renderSvg (themable)", () => {
  it("embeds every state, switched by data-vt-state, with CSS variable fallbacks", () => {
    const svg = renderSvg(pump, { ...base, mode: "themable" });
    for (const s of STATES) expect(svg).toContain(`[data-vt-state="${s}"]`);
    expect(svg).toContain(`var(--vt-equipment-body,${lightTheme.tokens["equipment.body"]})`);
    expect(svg).toContain("vt-badge--fault");
  });
});

describe("recipes", () => {
  const recipe: Recipe = recipeFor(generate("valve.two-way", { body: "ball", label: "XV-9" }), {
    ...base,
    state: "fault",
    tokens: { "state.fault": "#ff0000" },
  });

  it("round-trip through share codes", async () => {
    const code = await encodeShareCode(recipe);
    expect(code).toMatch(/^z0\.[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(200);
    expect(await decodeShareCode(code)).toEqual(recipe);
  });

  it("round-trip through exported SVG metadata", () => {
    const vo = generateFromRecipe(recipe);
    const svg = renderSvg(vo, recipe);
    expect(extractRecipe(svg)).toEqual(recipe);
  });

  it("regenerate identical SVG from a recipe", () => {
    const a = renderSvg(generateFromRecipe(recipe), recipe);
    const b = renderSvg(generateFromRecipe(structuredClone(recipe)), recipe);
    expect(a).toBe(b);
  });

  it("rejects garbage share codes", async () => {
    await expect(decodeShareCode("zz.nope")).rejects.toThrow();
    await expect(decodeShareCode("j0." + btoa("[1,2]"))).rejects.toThrow();
  });
});

describe("smart behaviours", () => {
  const tank = generate("tank.process", { level: 40 });
  const conveyor = generate("conveyor.belt", {});

  it("bakes the tank level into resolved SVG and clips liquid to the shell", () => {
    const svg = renderSvg(tank, { ...base, state: "normal" });
    expect(svg).toContain('<clipPath id="process-tank-contents-clip">');
    expect(svg).toMatch(/id="process-tank-contents"[^>]*transform="matrix\(1 0 0 0\.4 0 /);
  });

  it("exposes the level as --vt-level in smart SVG", () => {
    const svg = renderSvg(tank, { ...base, mode: "themable" });
    expect(svg).toContain("var(--vt-level,0.4)");
  });

  it("slides conveyor flow and product only while running", () => {
    const running = renderSvg(conveyor, { ...base, state: "running" });
    expect(running).toContain("@keyframes belt-conveyor-belt-flow");
    expect(running).toContain("@keyframes belt-conveyor-product-flow");
    expect(renderSvg(conveyor, base)).not.toContain("@keyframes");
  });

  it("turns the agitator in side view", () => {
    expect(renderSvg(tank, { ...base, state: "running" })).toContain("@keyframes process-tank-turn");
  });
});

describe("smart SVG isolation", () => {
  it("scopes every rule to its own root so symbols can share a page", () => {
    const svg = renderSvg(pump, { ...base, mode: "themable", idPrefix: "a" });
    const css = svg.match(/<style>([\s\S]*?)<\/style>/)![1]!;
    const selectors = css
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "")
      .replace(/@media[^{]+\{[^}]*\{[^}]*\}\}/g, "")
      .split("}")
      .map((r) => r.split("{")[0]!.trim())
      .filter(Boolean);
    for (const sel of selectors) for (const part of sel.split(",")) expect(part.trim()).toMatch(/^#a[\s[-]/);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox=');
    expect(svg).toContain('id="a" class="vt-object"');
  });
});
