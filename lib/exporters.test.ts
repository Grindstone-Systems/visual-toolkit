import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractRecipe } from "./index.ts";
import { exportIgnitionKit, exportIgnitionMetadata, exportSvg, exportObject, zip } from "./index.ts";
import { generate } from "./index.ts";

const vo = generate("pump.centrifugal", { label: "P-7" });
const opts = { style: "high-performance", theme: "dark", state: "warning" } as const;

describe("exporters", () => {
  it("SVG export is a standalone document that carries its recipe", () => {
    const f = exportSvg(vo, opts);
    expect(f.filename).toBe("p-7-centrifugal-pump-high-performance-warning.svg");
    expect(f.content.startsWith('<?xml version="1.0"')).toBe(true);
    expect(extractRecipe(f.content)?.state).toBe("warning");
  });

  it("Ignition metadata lists every state file and region element id", () => {
    const meta = JSON.parse(exportIgnitionMetadata(vo, opts).content);
    expect(meta.states).toHaveLength(7);
    expect(meta.regions.find((r: { id: string }) => r.id === "casing").elementId).toBe("centrifugal-pump-casing");
  });

  it("visual object export embeds the recipe", () => {
    const doc = JSON.parse(exportObject(vo, opts).content);
    expect(doc.schema).toBe("vt.object/v0");
    expect(doc.recipe.generator).toBe("pump.centrifugal");
  });

  it("Ignition kit zips into a valid archive", () => {
    const kit = exportIgnitionKit(vo, opts);
    const bytes = zip(kit.files.map((f) => ({ path: f.filename, content: f.content })));
    const eocd = new DataView(bytes.buffer, bytes.length - 22);
    expect(eocd.getUint32(0, true)).toBe(0x06054b50);
    expect(eocd.getUint16(10, true)).toBe(kit.files.length);
    // Cross-check with the system unzip when present.
    try {
      const dir = mkdtempSync(join(tmpdir(), "vt-"));
      const file = join(dir, kit.filename);
      writeFileSync(file, bytes);
      const out = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
      expect(out).toContain("No errors detected");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  });
});
