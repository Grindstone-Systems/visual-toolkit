import { describe, expect, it } from "vitest";
import { hrefOf, parseHash } from "./tools.ts";

describe("parseHash", () => {
  it("routes the skid composer and its share links", () => {
    expect(hrefOf("skids")).toBe("#/skids");
    expect(parseHash("#/skids")).toEqual({ page: "skids" });
    expect(parseHash("#/skids/s/abc_123")).toEqual({ page: "skids", scene: "abc_123" });
  });

  it("keeps links from when the page was called Mimics", () => {
    expect(parseHash("#/mimics")).toEqual({ page: "skids" });
    expect(parseHash("#/mimics/s/abc_123")).toEqual({ page: "skids", scene: "abc_123" });
  });

  it("keeps symbol share links and falls back to the overview", () => {
    expect(parseHash("#/d/xyz")).toEqual({ page: "symbols.builder", code: "xyz" });
    expect(parseHash("#/nowhere")).toEqual({ page: "overview" });
  });
});
