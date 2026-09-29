// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { encodeShareCode } from "./share.ts";
import { RECIPE_SCHEMA, type Recipe } from "./types.ts";
import { defineVtSymbol, VtSymbolElement } from "./element.ts";

const pumpRecipe: Recipe = {
  schema: RECIPE_SCHEMA,
  generator: "pump.centrifugal",
  version: 0,
  params: { label: "P-101" },
  style: "modern-flat",
  theme: "light",
  state: "running",
};

function mount(attrs: Record<string, string>): VtSymbolElement {
  const el = document.createElement("vt-symbol");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.append(el);
  return el;
}

const once = (el: Element, type: "vt-ready" | "vt-error") =>
  new Promise<CustomEvent>((resolve) => el.addEventListener(type, (e) => resolve(e as CustomEvent), { once: true }));

async function ready(attrs: Record<string, string>) {
  const el = mount(attrs);
  const ev = await once(el, "vt-ready");
  return { el, ev, svg: el.shadowRoot!.querySelector("svg")! };
}

afterEach(() => document.body.replaceChildren());

describe("<vt-symbol>", () => {
  it("is defined, idempotently", () => {
    expect(customElements.get("vt-symbol")).toBe(VtSymbolElement);
    expect(defineVtSymbol()).toBe(VtSymbolElement);
  });

  it("renders a themable SVG from a share code", async () => {
    const code = await encodeShareCode(pumpRecipe);
    const { el, ev, svg } = await ready({ recipe: code });
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("data-vt-state")).toBe("running");
    expect(svg.getAttribute("data-vt-generator")).toBe("pump.centrifugal@0");
    expect(svg.hasAttribute("width")).toBe(false); // sizes to container via viewBox
    expect(svg.querySelector("style")!.textContent).toContain("var(--vt-");
    expect(ev.detail.recipe.params.label).toBe("P-101");
    expect(el.svg).toBe(svg);
  });

  it("renders from recipe JSON and from generator + params", async () => {
    const a = await ready({ recipe: JSON.stringify(pumpRecipe) });
    expect(a.svg.getAttribute("data-vt-state")).toBe("running");

    const b = await ready({ generator: "conveyor.belt", params: '{"length":4,"label":"CV-9"}', style: "outline", theme: "dark" });
    expect(b.svg.getAttribute("data-vt-generator")).toBe("conveyor.belt@0");
    expect(b.svg.getAttribute("data-vt-style")).toBe("outline");
    expect(b.svg.textContent).toContain("CV-9");
    expect(b.ev.detail.recipe.theme).toBe("dark");
  });

  it("changes state without replacing the SVG node", async () => {
    const { el, svg } = await ready({ generator: "pump.centrifugal", state: "normal" });
    expect(svg.getAttribute("data-vt-state")).toBe("normal");
    el.setAttribute("state", "fault");
    expect(el.shadowRoot!.querySelector("svg")).toBe(svg);
    expect(svg.getAttribute("data-vt-state")).toBe("fault");
    el.state = "comm-loss";
    expect(svg.getAttribute("data-vt-state")).toBe("comm-loss");
    expect(svg.querySelector("title")!.textContent).toContain("Communication loss");
  });

  it("reports an unknown state without dropping the symbol", async () => {
    const { el, svg } = await ready({ generator: "pump.centrifugal", state: "running" });
    const err = once(el, "vt-error");
    el.setAttribute("state", "exploded");
    expect((await err).detail.attribute).toBe("state");
    expect(svg.getAttribute("data-vt-state")).toBe("running");
    expect(el.shadowRoot!.querySelector("svg")).toBe(svg);
  });

  it("sets --vt-level from the level attribute", async () => {
    const { el, svg } = await ready({ generator: "tank.process", level: "0.25" });
    expect(svg.style.getPropertyValue("--vt-level")).toBe("0.25");
    el.setAttribute("level", "80%");
    expect(svg.style.getPropertyValue("--vt-level")).toBe("0.8");
    el.level = 7; // clamped
    expect(svg.style.getPropertyValue("--vt-level")).toBe("1");
    el.removeAttribute("level");
    expect(svg.style.getPropertyValue("--vt-level")).toBe("");
    expect(el.shadowRoot!.querySelector("svg")).toBe(svg);
  });

  it("re-renders when a structural attribute changes", async () => {
    const { el, svg } = await ready({ generator: "pump.centrifugal" });
    const next = once(el, "vt-ready");
    el.setAttribute("style", "high-performance");
    await next;
    const svg2 = el.shadowRoot!.querySelector("svg")!;
    expect(svg2).not.toBe(svg);
    expect(svg2.getAttribute("data-vt-style")).toBe("high-performance");
  });

  it("fires vt-error and shows readable text for a bad recipe", async () => {
    for (const recipe of ["z0.not-a-real-code", "{oops", '{"generator":"nope.none"}']) {
      const el = mount({ recipe });
      const ev = await once(el, "vt-error");
      expect(ev.detail.message).toBeTruthy();
      const p = el.shadowRoot!.querySelector(".error")!;
      expect(p.textContent).toMatch(/^vt-symbol: /);
      expect(el.shadowRoot!.querySelector("svg")).toBeNull();
    }
    const el = mount({ generator: "pump.centrifugal", theme: "neon" });
    expect((await once(el, "vt-error")).detail.message).toContain("theme");
  });

  it("gives every instance its own id prefix", async () => {
    const a = await ready({ generator: "pump.centrifugal" });
    const b = await ready({ generator: "pump.centrifugal" });
    const ids = (svg: SVGSVGElement) => [svg.id, ...[...svg.querySelectorAll("[id]")].map((n) => n.id)];
    const ia = ids(a.svg);
    const ib = ids(b.svg);
    expect(ia.length).toBeGreaterThan(3);
    expect(ia.filter((id) => ib.includes(id))).toEqual([]);
    expect(a.svg.id.startsWith((a.el as VtSymbolElement).idPrefix)).toBe(true);
  });

  it("keeps styles inside the shadow root so host --vt-* tokens inherit in", async () => {
    const { el } = await ready({ generator: "pump.centrifugal" });
    expect(el.shadowRoot!.querySelectorAll("style").length).toBeGreaterThanOrEqual(2);
    expect(document.head.querySelector("style")).toBeNull();
  });
});
