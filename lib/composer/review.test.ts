import { describe, expect, it } from "vitest";
import { reviewScene } from "./review.ts";
import { demoScene, emptyScene } from "./scene.ts";

const byId = (f: ReturnType<typeof reviewScene>, id: string) => f.find((x) => x.id === id);

describe("reviewScene", () => {
  it("passes the demo skid on the core checks", () => {
    const f = reviewScene(demoScene(), { style: "high-performance", theme: "light" });
    for (const id of ["style", "shape-coding", "motion", "tags", "overlap"]) expect(byId(f, id)?.level).toBe("pass");
    // Amber is pale on the light canvas; the dark badge glyph carries it.
    expect(byId(f, "contrast")?.level).toBe("info");
  });

  it("notes a non-HP style without failing it", () => {
    expect(byId(reviewScene(demoScene(), { style: "modern-flat", theme: "light" }), "style")?.level).toBe("info");
  });

  it("flags duplicate tags, untagged items and overlaps", () => {
    const s = demoScene();
    s.items[1]!.params = { ...s.items[1]!.params, label: "TK-101" };
    s.items[3]!.params = { ...s.items[3]!.params, label: "" };
    s.items[2]!.x = s.items[1]!.x;
    s.items[2]!.y = s.items[1]!.y;
    const f = reviewScene(s, { style: "high-performance", theme: "light" });
    expect(byId(f, "duplicate-tags")?.level).toBe("warn");
    expect(byId(f, "untagged")?.items).toEqual(["valve-2"]);
    expect(byId(f, "overlap")?.level).toBe("warn");
  });

  it("warns when too many items move at once", () => {
    const s = demoScene();
    s.items = Array.from({ length: 6 }, (_, i) => ({ ...s.items[2]!, id: `pump-${i}`, x: i * 220, params: { label: `P-${i}` }, state: "running" as const }));
    s.pipes = [];
    expect(byId(reviewScene(s, { style: "high-performance", theme: "light" }), "motion")?.level).toBe("warn");
  });

  it("warns on low-contrast state colours", () => {
    const f = reviewScene(demoScene(), { style: "high-performance", theme: "light", tokens: { "surface.canvas": "#f5a623", "state.on-warning": "#f5a623", "state.on-alarm": "#f5a623" } });
    expect(byId(f, "contrast")?.level).toBe("warn");
  });

  it("handles an empty scene", () => {
    expect(reviewScene(emptyScene(), { style: "outline", theme: "dark" })[0]!.id).toBe("empty");
  });
});
