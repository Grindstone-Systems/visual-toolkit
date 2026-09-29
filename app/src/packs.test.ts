import { describe, expect, it } from "vitest";
import { parsePack, toPackFile, PACK_SCHEMA } from "./packs.ts";

const recipe = { schema: "vt.recipe/v0", generator: "pump.centrifugal", version: 0, params: {}, style: "modern-flat", theme: "light", state: "normal" };

describe("packs", () => {
  it("round-trips and keeps only safe theme tokens", () => {
    const file = toPackFile("Team", [{ title: "P-1", recipe } as never], { base: "dark", tokens: { "equipment.body": "#112233" } });
    const p = parsePack({ ...JSON.parse(file), theme: { base: "dark", tokens: { "equipment.body": "#112233", "state.fault": "#00ff00", "x": "#fff" } } });
    expect(p.schema).toBe(PACK_SCHEMA);
    expect(p.entries).toHaveLength(1);
    expect(p.theme).toEqual({ base: "dark", tokens: { "equipment.body": "#112233" } });
  });
  it("drops malformed entries and rejects non-packs", () => {
    expect(() => parsePack({ schema: "nope" })).toThrow(/Not a pack/);
    expect(() => parsePack({ schema: PACK_SCHEMA, entries: [{ title: "x" }] })).toThrow(/no usable designs/);
    const p = parsePack({ schema: PACK_SCHEMA, name: "<b>x</b>", entries: [{ title: "a".repeat(200), recipe }, { recipe: { schema: "bad" } }] });
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]!.title).toHaveLength(60);
  });
});
