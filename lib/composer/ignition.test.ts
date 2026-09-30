import { describe, expect, it } from "vitest";
import { STATES } from "../types.ts";
import { demoScene, renderSceneSvg } from "./scene.ts";
import { exportIgnitionSampleProject, SAMPLE_PROJECT_VERSION } from "./ignition.ts";

const opts = { style: "high-performance", theme: "light" } as const;
const text = (c: string | Uint8Array) => (typeof c === "string" ? c : new TextDecoder().decode(c));

/** Standalone SVG must be XML: no start tag may repeat an attribute. */
function duplicateAttributes(svg: string): string[] {
  const bad: string[] = [];
  for (const [, tag, attrs] of svg.matchAll(/<([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*\/?>/g)) {
    const names = [...attrs!.matchAll(/([\w:-]+)="/g)].map((m) => m[1]!);
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    if (dup) bad.push(`<${tag} ${dup}>`);
  }
  return bad;
}

const kit = () => exportIgnitionSampleProject(demoScene(), opts);
const file = (k: ReturnType<typeof kit>, suffix: string) => text(k.entries.find((e) => e.path.endsWith(suffix))!.content);
const view = (k: ReturnType<typeof kit>) => JSON.parse(file(k, "/view.json"));
const svgOf = (uri: string) => decodeURIComponent(uri.slice(uri.indexOf(",") + 1));

describe("renderSceneSvg", () => {
  it("writes well-formed standalone SVG (one width/height per nested symbol)", () => {
    expect(duplicateAttributes(renderSceneSvg(demoScene(), opts))).toEqual([]);
  });

  it("draws only the included items and pipes, without the canvas when asked", () => {
    const svg = renderSceneSvg(demoScene(), { ...opts, include: { items: ["pump-1"], pipes: [] }, background: false });
    expect(svg.match(/class="vt-item"/g)).toHaveLength(1);
    expect(svg).toContain('data-item="pump-1"');
    expect(svg).not.toContain("vt-pipe");
    expect(svg).not.toMatch(/<rect x="[-\d.]+" y="[-\d.]+" width="[\d.]+" height="[\d.]+" fill="#/);
  });
});

describe("exportIgnitionSampleProject", () => {
  it("is deterministic", () => {
    expect(kit().bytes).toEqual(kit().bytes);
    expect(SAMPLE_PROJECT_VERSION).toBe(1);
  });

  it("lays out an 8.3 project, page config and tag definitions", () => {
    const k = kit();
    expect(k.projectName).toBe("VisualToolkit_TransferSkid");
    const paths = k.entries.map((e) => e.path);
    const p = "project/VisualToolkit_TransferSkid/";
    expect(paths).toContain(`${p}project.json`);
    expect(paths).toContain(`${p}com.inductiveautomation.perspective/views/VisualToolkit/TransferSkid/view.json`);
    expect(paths).toContain(`${p}com.inductiveautomation.perspective/views/VisualToolkit/TransferSkid/resource.json`);
    expect(JSON.parse(file(k, "page-config/config.json")).pages["/"].viewPath).toBe("VisualToolkit/TransferSkid");
    for (const t of ["TK-101", "XV-101", "P-101", "XV-102"]) {
      const tags = JSON.parse(file(k, `tag-definition/default/VisualToolkit/TransferSkid/${t}/tags.json`));
      expect(tags[0]).toMatchObject({ name: "State", tagType: "AtomicTag", valueSource: "memory", dataType: "String" });
    }
    expect(paths).toContain("VisualToolkit_TransferSkid.zip");
    expect(paths).toContain("tags/tags-import.json");
  });

  it("binds each item to its tag with a case over every state, comm-loss last", () => {
    const v = view(kit());
    const pump = v.root.children.find((c: { meta: { name: string } }) => c.meta.name === "item_pump_1");
    const expr: string = pump.propConfig["props.source"].binding.config.expression;
    expect(expr.startsWith("case({[default]VisualToolkit/TransferSkid/P-101/State}, ")).toBe(true);
    for (const s of STATES.filter((s) => s !== "comm-loss")) expect(expr).toContain(`"${s}", {view.custom.vt.items.pump_1.${s}}`);
    expect(expr.endsWith("{view.custom.vt.items.pump_1.comm_loss})")).toBe(true);
    expect(Object.keys(v.custom.vt.items.pump_1)).toEqual(STATES.map((s) => s.replace("-", "_")));
  });

  it("gives each pipe idle and flowing images switched by its end tags", () => {
    const v = view(kit());
    const pipe = v.root.children.find((c: { meta: { name: string } }) => c.meta.name === "pipe_l_2");
    expect(pipe.propConfig["props.source"].binding.config.expression).toBe(
      'if({[default]VisualToolkit/TransferSkid/XV-101/State} = "running" || {[default]VisualToolkit/TransferSkid/P-101/State} = "running", {view.custom.vt.pipes.l_2.flowing}, {view.custom.vt.pipes.l_2.idle})',
    );
    expect(svgOf(v.custom.vt.pipes.l_2.flowing)).toContain("vt-flow");
    expect(svgOf(v.custom.vt.pipes.l_2.idle)).not.toContain("stroke-dasharray");
  });

  it("embeds well-formed SVG data URIs", () => {
    const v = view(kit());
    const uris = [...Object.values(v.custom.vt.items).flatMap((s) => Object.values(s as Record<string, string>)), ...Object.values(v.custom.vt.pipes).flatMap((p) => Object.values(p as Record<string, string>))];
    expect(uris.length).toBe(4 * STATES.length + 3 * 2);
    for (const u of uris) {
      expect(u.startsWith("data:image/svg+xml;utf8,")).toBe(true);
      expect(duplicateAttributes(svgOf(u))).toEqual([]);
    }
  });

  it("adds a bidirectional state dropdown per item", () => {
    const v = view(kit());
    const dd = v.root.children.filter((c: { type: string }) => c.type === "ia.input.dropdown");
    expect(dd).toHaveLength(4);
    expect(dd[2].propConfig["props.value"].binding).toEqual({ type: "tag", config: { mode: "direct", tagPath: "[default]VisualToolkit/TransferSkid/P-101/State", bidirectional: true } });
  });

  it("de-duplicates tag names and honours the provider", () => {
    const s = demoScene();
    s.items[3]!.params = { label: "XV-101" };
    const k = exportIgnitionSampleProject(s, { ...opts, provider: "plant" });
    const index = JSON.parse(file(k, "sample.json"));
    expect(index.items.map((i: { tag: string }) => i.tag)).toEqual([
      "[plant]VisualToolkit/TransferSkid/TK-101/State",
      "[plant]VisualToolkit/TransferSkid/XV-101/State",
      "[plant]VisualToolkit/TransferSkid/P-101/State",
      "[plant]VisualToolkit/TransferSkid/XV-101-2/State",
    ]);
  });
});
