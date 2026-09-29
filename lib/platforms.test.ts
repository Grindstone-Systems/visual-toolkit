import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERATORS,
  STATES,
  STYLES,
  darkTheme,
  defaultParams,
  exportIconRepository,
  exportIconRepositoryKit,
  exportOptixAdvancedSvg,
  exportOptixKit,
  exportOptixMap,
  exportPerspectiveDrawingSvg,
  exportPerspectiveThemeCss,
  exportWinccUnifiedKit,
  exportWinccUnifiedMap,
  exportWinccUnifiedSvg,
  generate,
  iconItemsForStates,
  iconItemsFromRecipes,
  recipeFor,
  zip,
  type ExportKit,
  type StyleId,
  type VtObject,
} from "./index.ts";

/* ---------------- a small DOM-less XML well-formedness check ---------------- */

interface XmlInfo {
  root: string;
  ids: string[];
  elements: string[];
  attrs: string[];
}

/** Throws on malformed XML; returns element names, attribute names and ids. */
function checkXml(src: string): XmlInfo {
  let s = src.replace(/^<\?xml[^?]*\?>\s*/, "");
  s = s.replace(/<!DOCTYPE[^>]*>/, "");
  for (const c of s.matchAll(/<!--([\s\S]*?)-->/g)) if (/--|-$/.test(c[1]!)) throw new Error("'--' inside comment");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  const tag = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*\s*=\s*"[^"<]*")*)\s*(\/?)>/g;
  const stack: string[] = [];
  const info: XmlInfo = { root: "", ids: [], elements: [], attrs: [] };
  let last = 0;
  let roots = 0;
  for (let m; (m = tag.exec(s)); ) {
    const text = s.slice(last, m.index);
    if (/[<>]/.test(text)) throw new Error(`stray markup near: ${text.slice(0, 60)}`);
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(text)) throw new Error("unescaped & in text");
    if (!stack.length && text.trim()) throw new Error("text outside root");
    last = tag.lastIndex;
    const [, close, name, attrText, selfClose] = m;
    if (close) {
      if (stack.pop() !== name) throw new Error(`mismatched </${name}>`);
      continue;
    }
    if (!stack.length) {
      roots++;
      info.root = name!;
    }
    info.elements.push(name!);
    const seen = new Set<string>();
    for (const a of attrText!.matchAll(/([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
      if (seen.has(a[1]!)) throw new Error(`duplicate attribute ${a[1]} on <${name}>`);
      seen.add(a[1]!);
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(a[2]!)) throw new Error("unescaped & in attribute");
      info.attrs.push(a[1]!);
      if (a[1] === "id") info.ids.push(a[2]!);
    }
    if (!selfClose) stack.push(name!);
  }
  const rest = s.slice(last);
  if (rest.trim()) throw new Error(`trailing content: ${rest.slice(0, 60)}`);
  if (stack.length) throw new Error(`unclosed <${stack.join("><")}>`);
  if (roots !== 1) throw new Error(`expected one root element, found ${roots}`);
  return info;
}

const unique = (xs: string[]) => new Set(xs).size === xs.length;

function checkZip(kit: ExportKit) {
  const bytes = zip(kit.files.map((f) => ({ path: f.filename, content: f.content })));
  const eocd = new DataView(bytes.buffer, bytes.length - 22);
  expect(eocd.getUint32(0, true)).toBe(0x06054b50);
  expect(eocd.getUint16(10, true)).toBe(kit.files.length);
  expect(new Set(kit.files.map((f) => f.filename)).size).toBe(kit.files.length);
  try {
    const dir = mkdtempSync(join(tmpdir(), "vt-"));
    const file = join(dir, kit.filename);
    writeFileSync(file, bytes);
    const out = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
    expect(out).toContain("No errors detected");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
}

/* ------------------------------------------------------------------ */

const pump = generate("pump.centrifugal", { label: "P-7" });
const tank = generate("tank.process", { label: "TK-1" });
const opts = { style: "high-performance", theme: "dark", state: "fault" } as const;
const everyObject: VtObject[] = GENERATORS.map((g) => g.generate({ ...defaultParams(g.params), label: "A&B <1>" }));
const STYLE_IDS = Object.keys(STYLES) as StyleId[];

describe("checkXml (test helper)", () => {
  it("rejects malformed input", () => {
    expect(() => checkXml("<a><b></a>")).toThrow();
    expect(() => checkXml('<a x="1" x="2"/>')).toThrow();
    expect(() => checkXml("<a>&</a>")).toThrow();
    expect(() => checkXml("<a/><b/>")).toThrow();
    expect(checkXml('<a id="x"><b id="y"/></a>').ids).toEqual(["x", "y"]);
  });
});

describe("Perspective icon repository", () => {
  const items = iconItemsForStates(pump);

  it("is one well-formed SVG with one documented <svg id viewBox> child per item", () => {
    const f = exportIconRepository(items, { library: "Grindstone Pumps", ...opts });
    expect(f.filename).toBe("grindstone-pumps.svg");
    const info = checkXml(f.content);
    expect(info.root).toBe("svg");
    const icons = [...f.content.matchAll(/<svg viewBox="[^"]+" id="([^"]+)">/g)].map((m) => m[1]);
    expect(icons).toHaveLength(items.length);
    expect(icons).toContain("centrifugal-pump-running");
    expect(icons).toEqual(STATES.map((s) => `centrifugal-pump-${s}`));
    expect(unique(info.ids)).toBe(true);
    expect(f.content).not.toMatch(/<style|var\(|<metadata|<symbol/);
  });

  it("keeps ids unique across mixed recipes and disambiguates collisions", () => {
    const recipes = [
      recipeFor(pump, { ...opts, state: "running" }),
      recipeFor(generate("pump.centrifugal", { label: "P-8" }), { ...opts, state: "running" }),
      recipeFor(tank, { style: "outline", theme: "light", state: "warning" }),
    ];
    const f = exportIconRepository(iconItemsFromRecipes(recipes), { library: "mix", ...opts });
    const info = checkXml(f.content);
    expect(unique(info.ids)).toBe(true);
    const icons = [...f.content.matchAll(/<svg viewBox="[^"]+" id="([^"]+)">/g)].map((m) => m[1]);
    expect(icons).toEqual(["centrifugal-pump-running", "centrifugal-pump-running-2", "vertical-tank-warning"]);
  });

  it("monochrome variant uses currentColor only", () => {
    const f = exportIconRepository(items, { library: "p", ...opts, variant: "mono" });
    checkXml(f.content);
    const colours = [...f.content.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
    for (const c of colours) expect(c === "currentColor" || c === "none" || c!.startsWith("url(#")).toBe(true);
    expect(f.content).not.toMatch(/#[0-9a-f]{6}/i);
  });

  it("colour variant resolves theme colours", () => {
    const f = exportIconRepository(items, { library: "p", ...opts });
    expect(f.content).toContain(darkTheme.tokens["state.fault"]);
  });

  it("kit zips colour + mono repositories, 8.3 resource files and an unverified README", () => {
    const kit = exportIconRepositoryKit(items, { library: "vt", ...opts });
    const names = kit.files.map((f) => f.filename);
    expect(names).toEqual(
      expect.arrayContaining([
        "ignition-8.1/vt.svg",
        "ignition-8.1/vt-mono.svg",
        "ignition-8.3/vt/vt.svg",
        "ignition-8.3/vt/config.json",
        "ignition-8.3/vt/resource.json",
        "ignition-8.3/vt-mono/config.json",
        "icons.json",
        "README.txt",
      ]),
    );
    expect(JSON.parse(kit.files.find((f) => f.filename === "ignition-8.3/vt-mono/config.json")!.content)).toEqual({
      svgFileName: "vt-mono.svg",
    });
    const res = JSON.parse(kit.files.find((f) => f.filename === "ignition-8.3/vt/resource.json")!.content);
    expect(res.files).toEqual(["config.json", "vt.svg"]);
    expect(kit.files.find((f) => f.filename === "README.txt")!.content).toMatch(/UNVERIFIED ON A GATEWAY/);
    expect(JSON.parse(kit.files.find((f) => f.filename === "icons.json")!.content).icons).toHaveLength(items.length);
    checkZip(kit);
  });
});

describe("Perspective Drawing profile", () => {
  it("uses presentation attributes only and region ids as element ids, for every generator/style/state", () => {
    for (const vo of everyObject)
      for (const style of STYLE_IDS)
        for (const state of vo.states) {
          const f = exportPerspectiveDrawingSvg(vo, { style, theme: "light", state });
          const info = checkXml(f.content);
          expect(f.content).not.toMatch(/<style|var\(|<metadata|@keyframes|animation|class=|data-/);
          expect(unique(info.ids)).toBe(true);
          const regionIds = vo.regions.map((r) => r.id);
          for (const id of regionIds) expect(info.ids).toContain(id);
          const extra = info.ids.filter((id) => !regionIds.includes(id));
          for (const id of extra) expect(id).toMatch(/^(badge-[a-z-]+|hatch|hatch-pattern|label|.+-clip)$/);
        }
  });

  it("flattens the level transform into rect geometry", () => {
    const f = exportPerspectiveDrawingSvg(tank, opts);
    const contents = f.content.match(/<g id="contents"[^>]*>/)![0];
    expect(contents).not.toContain("transform");
  });

  it("escapes labels", () => {
    expect(exportPerspectiveDrawingSvg({ ...pump, label: { text: "A&B <1>" } }, opts).content).toContain("A&amp;B &lt;1&gt;");
  });

  it("is deterministic", () => {
    expect(exportPerspectiveDrawingSvg(tank, opts).content).toBe(exportPerspectiveDrawingSvg(tank, opts).content);
  });
});

describe("Perspective theme CSS", () => {
  it("maps every --vt-* token into :root and adds .psc- helpers", () => {
    const f = exportPerspectiveThemeCss("dark");
    expect(f.filename).toBe("dark.perspective.css");
    expect(f.content).toMatch(/^\/\*[\s\S]*UNVERIFIED/);
    for (const [k, v] of Object.entries(darkTheme.tokens)) expect(f.content).toContain(`--vt-${k.replace(/\./g, "-")}: ${v};`);
    expect(f.content).toContain(".psc-vt-state-fault");
    expect(f.content.match(/\{/g)!.length).toBe(f.content.match(/\}/g)!.length);
  });

  it("neutralises hostile token overrides", () => {
    const f = exportPerspectiveThemeCss("light", { tokens: { "state.fault": "red;} body{display:none" }, helpers: false });
    expect(f.content).not.toContain("body{");
    expect(f.content.match(/\{/g)!.length).toBe(1);
  });
});

describe("WinCC Unified dynamic SVG", () => {
  it("follows the SVGHMI header, interface and binding syntax", () => {
    const f = exportWinccUnifiedSvg(tank, opts);
    expect(f.filename).toBe("tk-1-vertical-tank-high-performance.svghmi");
    expect(f.content.startsWith('<!DOCTYPE svg PUBLIC "-//SIEMENS//DTD SVG 1.0 TIA-HMI//EN"')).toBe(true);
    const info = checkXml(f.content);
    expect(info.root).toBe("svg");
    expect(f.content).toContain('xmlns:hmi="http://svg.siemens.com/hmi/"');
    expect(f.content).toContain('xmlns:hmi-bind="http://svg.siemens.com/hmi/bind/"');
    expect(f.content).toContain('preserveAspectRatio="none"');
    expect(f.content).toMatch(/<hmi:self type="widget" displayName="VT_\w+" name="extended\.VT_\w+" version="[\d.]+">/);
    expect(f.content).toContain('<hmi:paramDef name="State" type="number" default="3"/>');
    expect(f.content).toContain('<hmi:paramDef name="Level" type="number" default="64"/>');
    expect(f.content).toContain("Converter.Bounds(ParamProps.Level / 100, 0.0, 1.0)");
    expect(f.content).toContain('<hmi:text hmi-bind:value="{{ParamProps.Label}}"/>');
    expect(f.content).toMatch(/hmi-bind:fill="\{\{eq\(ParamProps\.State,\d\) \? '#[0-9a-f]{6}' : '#[0-9a-f]{6}'\}\}"/);
    expect(f.content).toMatch(/id="badge-fault"[^>]*hmi-bind:display="\{\{eq\(ParamProps\.State,3\) \? 'inline' : 'none'\}\}"/);
    expect(f.content).not.toMatch(/<style|style=|class=|var\(|<metadata|<script|<animate|<title|foreignObject/);
  });

  it("keeps region ids unique and addressable for every generator and style", () => {
    for (const vo of everyObject)
      for (const style of STYLE_IDS) {
        const f = exportWinccUnifiedSvg(vo, { style, theme: "light", state: "normal" });
        const info = checkXml(f.content);
        expect(unique(info.ids)).toBe(true);
        for (const r of vo.regions) expect(info.ids).toContain(r.id);
        // Every bound expression is balanced.
        for (const m of f.content.matchAll(/hmi-bind:[\w-]+="([^"]*)"/g)) {
          expect(m[1]!.split("{{").length).toBe(m[1]!.split("}}").length);
          expect(m[1]!.split("(").length).toBe(m[1]!.split(")").length);
        }
      }
  });

  it("map lists parameters, state values and elements; kit zips", () => {
    const map = JSON.parse(exportWinccUnifiedMap(tank, opts).content);
    expect(map.status).toBe("unverified");
    expect(map.parameters[0]).toMatchObject({ name: "State", default: 3 });
    expect(map.parameters[0].values["1"]).toBe("running");
    expect(map.elements.map((e: { id: string }) => e.id)).toEqual(expect.arrayContaining(tank.regions.map((r) => r.id)));
    const kit = exportWinccUnifiedKit(tank, opts);
    expect(kit.files.map((f) => f.filename)).toContain("README.txt");
    checkZip(kit);
  });
});

describe("FactoryTalk Optix Advanced SVG", () => {
  it("is SVG Tiny 1.2 with hex presentation colours and region ids", () => {
    for (const vo of everyObject)
      for (const style of STYLE_IDS) {
        const f = exportOptixAdvancedSvg(vo, { style, theme: "dark", state: "running" });
        expect(f.content).toContain('version="1.2" baseProfile="tiny"');
        const info = checkXml(f.content);
        expect(unique(info.ids)).toBe(true);
        for (const r of vo.regions) expect(info.ids).toContain(r.id);
        expect(f.content).not.toMatch(/<style|style=|class=|var\(|<metadata|<pattern|currentColor/);
        for (const m of f.content.matchAll(/(?:fill|stroke)="([^"]+)"/g)) expect(m[1]).toMatch(/^(#[0-9a-f]{6}|none|url\(#.+\))$/i);
      }
  });

  it("map gives per-state values for element properties that change, flagging undocumented ones", () => {
    const map = JSON.parse(exportOptixMap(pump, opts).content);
    expect(map.status).toBe("unverified");
    const ids = exportOptixAdvancedSvg(pump, opts).content;
    for (const p of map.properties) {
      expect(ids).toContain(`id="${p.id}"`);
      expect(Object.keys(p.values)).toEqual(pump.states);
      expect(new Set(Object.values(p.values)).size).toBeGreaterThan(1);
      if (p.documented) expect(["fill", "stroke"]).toContain(p.property);
    }
    expect(map.properties.some((p: { documented: boolean }) => p.documented)).toBe(true);
    expect(map.properties.find((p: { id: string }) => p.id === "badge-fault")).toMatchObject({ property: "display", documented: false });
  });

  it("kit zips and the tank map records the level attribute and the Tiny deviation", () => {
    const map = JSON.parse(exportOptixMap(tank, opts).content);
    expect(map.level).toMatchObject({ id: "contents", attribute: "transform", documented: false });
    expect(map.tinyDeviations[0]).toContain("clipPath");
    checkZip(exportOptixKit(tank, opts));
  });
});
