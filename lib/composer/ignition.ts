import { STATES, type StyleId, type ThemeId } from "../types.ts";
import { getTheme, type TokenSet } from "../themes.ts";
import { stateLabel } from "../render.ts";
import { slugify } from "../exporters.ts";
import { zip, type ZipEntry } from "../zip.ts";
import { pipeRoutes, placeItem, renderSceneSvg, sceneBounds, type Scene } from "./scene.ts";

/**
 * Ignition sample project from a skid-composer scene: a Perspective project
 * with one view that draws the mimic as bound Image components, plus memory
 * tags that drive it.
 *
 * - Each item is an Image whose `source` is a case() expression over a String
 *   memory tag holding a state name. The seven state SVGs are data URIs in
 *   the view's custom properties. A missing or unknown value shows comm-loss.
 * - Each pipe is an Image that swaps to the flowing variant while either end
 *   is running (the same rule the composer uses).
 * - A dropdown per item is bound bidirectionally to its tag, so the demo
 *   works without a PLC.
 *
 * Layouts follow what a real 8.3.9 gateway reads and writes on disk
 * (docs/IGNITION.md says what was tested). Output is deterministic; bump
 * SAMPLE_PROJECT_VERSION whenever it changes.
 */

export const SAMPLE_PROJECT_VERSION = 1;

export interface SampleProjectOptions {
  style: StyleId;
  theme: ThemeId;
  tokens?: Partial<TokenSet>;
  /** Tag provider. Default "default". */
  provider?: string;
  /** Pixels per scene unit in the view. Default 2. */
  scale?: number;
}

export interface SampleProjectKit {
  filename: string;
  projectName: string;
  entries: ZipEntry[];
  bytes: Uint8Array;
}

/** "Transfer skid" → "TransferSkid" (safe as a project, folder and tag name). */
const pascal = (s: string) =>
  slugify(s)
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("") || "Scene";
/** Tag names: letters, digits, space, underscore and hyphen. */
const tagName = (s: string) => s.replace(/[^A-Za-z0-9 _-]+/g, "_").trim().slice(0, 40);
/** Property keys safe inside expression references. */
const key = (s: string) => s.replace(/[^A-Za-z0-9_]+/g, "_");
const dataUri = (svg: string) => "data:image/svg+xml;utf8," + encodeURIComponent(svg);
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";
/** Expression string literal. */
const lit = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const RESOURCE = (files: string[]) => json({ scope: "G", version: 1, restricted: false, overridable: true, files, attributes: {} });
const TAG_RESOURCE = (files: string[]) => json({ scope: "G", version: 1, restricted: false, overridable: true, files, attributes: { config: {} } });

export function exportIgnitionSampleProject(scene: Scene, opts: SampleProjectOptions): SampleProjectKit {
  const name = pascal(scene.name || "Scene");
  const projectName = `VisualToolkit_${name}`;
  const viewPath = `VisualToolkit/${name}`;
  const provider = opts.provider ?? "default";
  const S = opts.scale ?? 2;
  const tokens = { ...getTheme(opts.theme).tokens, ...opts.tokens };
  const render = { style: opts.style, theme: opts.theme, tokens: opts.tokens };

  const placed = scene.items.map(placeItem);
  const [X0, Y0, W, H] = sceneBounds(placed, 24);
  const px = (v: number) => Math.round(v * S * 100) / 100;
  const HEADER = 44;
  const box = (x: number, y: number, w: number, h: number) => ({ x: px(x - X0), y: HEADER + px(y - Y0), width: px(w), height: px(h) });

  // One tag per item, named after its label when it has one.
  const used = new Set<string>();
  const tags = placed.map(({ item, vo }) => {
    const base = tagName(vo.label?.text || item.id) || item.id;
    let n = base;
    for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base}-${i}`;
    used.add(n.toLowerCase());
    return { item, tag: n, path: `[${provider}]VisualToolkit/${name}/${n}/State`, label: vo.label?.text || item.id };
  });
  const tagOf = new Map(tags.map((t) => [t.item.id, t]));

  const custom: { items: Record<string, Record<string, string>>; pipes: Record<string, { idle: string; flowing: string }> } = { items: {}, pipes: {} };
  const children: unknown[] = [];

  // Pipes first, so they sit under the equipment.
  for (const { pipe, points, size } of pipeRoutes(scene, placed)) {
    const pad = size * 0.62 + 4;
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const vb: [number, number, number, number] = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) - Math.min(...xs) + 2 * pad, Math.max(...ys) - Math.min(...ys) + 2 * pad];
    const variant = (flowing: boolean) => {
      // Flow is derived from the end states, so render with a stand-in state.
      const s: Scene = {
        ...scene,
        items: scene.items.map((it) => ({ ...it, state: flowing && it.id === pipe.from.item ? "running" : "normal" })),
      };
      return dataUri(renderSceneSvg(s, { ...render, viewBox: vb, include: { items: [], pipes: [pipe.id] }, background: false, idPrefix: `vt-${key(pipe.id)}` }));
    };
    const k = key(pipe.id);
    custom.pipes[k] = { idle: variant(false), flowing: variant(true) };
    const a = tagOf.get(pipe.from.item)!.path;
    const b = tagOf.get(pipe.to.item)!.path;
    children.push({
      type: "ia.display.image",
      meta: { name: `pipe_${k}` },
      position: box(...vb),
      props: { fit: { mode: "fill" } },
      propConfig: {
        "props.source": {
          binding: {
            type: "expr",
            config: { expression: `if({${a}} = "running" || {${b}} = "running", {view.custom.vt.pipes.${k}.flowing}, {view.custom.vt.pipes.${k}.idle})` },
          },
        },
      },
    });
  }

  for (const p of placed) {
    const { item } = p;
    const k = key(item.id);
    const [bx, by, bw, bh] = sceneBounds([p], 6);
    const states: Record<string, string> = {};
    for (const st of STATES) {
      const s: Scene = { ...scene, items: scene.items.map((it) => (it.id === item.id ? { ...it, state: st } : it)) };
      states[key(st)] = dataUri(
        renderSceneSvg(s, { ...render, viewBox: [bx, by, bw, bh], include: { items: [item.id], pipes: [] }, background: false, idPrefix: `vt-${k}-${key(st)}` }),
      );
    }
    custom.items[k] = states;
    const cases = STATES.filter((st) => st !== "comm-loss")
      .map((st) => `${lit(st)}, {view.custom.vt.items.${k}.${key(st)}}`)
      .join(", ");
    children.push({
      type: "ia.display.image",
      meta: { name: `item_${k}` },
      position: box(bx, by, bw, bh),
      props: { fit: { mode: "fill" } },
      propConfig: {
        "props.source": {
          binding: {
            type: "expr",
            // Anything unmapped (including a missing tag) falls through to comm-loss.
            config: { expression: `case({${tagOf.get(item.id)!.path}}, ${cases}, {view.custom.vt.items.${k}.comm_loss})` },
          },
        },
      },
    });
  }

  // Title and demo controls.
  const text = tokens["text.primary"];
  const muted = tokens["text.muted"];
  children.unshift({
    type: "ia.display.label",
    meta: { name: "title" },
    position: { x: 16, y: 8, width: Math.max(320, px(W) - 32), height: 28 },
    props: { text: `${scene.name || "Scene"} · Visual Toolkit sample`, style: { color: text, fontSize: 18, fontWeight: 600 } },
  });
  const COL = 190;
  const perRow = Math.max(1, Math.floor((px(W) - 16) / COL));
  const top = HEADER + px(H) + 12;
  tags.forEach((t, i) => {
    const x = 16 + (i % perRow) * COL;
    const y = top + Math.floor(i / perRow) * 64;
    children.push(
      {
        type: "ia.display.label",
        meta: { name: `label_${key(t.item.id)}` },
        position: { x, y, width: COL - 16, height: 20 },
        props: { text: t.label, style: { color: muted, fontSize: 12 } },
      },
      {
        type: "ia.input.dropdown",
        meta: { name: `state_${key(t.item.id)}` },
        position: { x, y: y + 22, width: COL - 16, height: 32 },
        props: { options: STATES.map((st) => ({ value: st, label: stateLabel(st) })), placeholder: { text: "comm-loss (no tag)" } },
        propConfig: { "props.value": { binding: { type: "tag", config: { mode: "direct", tagPath: t.path, bidirectional: true } } } },
      },
    );
  });
  const rows = Math.ceil(tags.length / perRow);
  const width = Math.max(px(W), 360);
  const height = top + rows * 64 + 12;

  const view = {
    custom: { vt: custom },
    params: {},
    props: { defaultSize: { width, height } },
    root: {
      type: "ia.container.coord",
      meta: { name: "root" },
      props: { mode: "fixed", style: { backgroundColor: tokens["surface.canvas"] } },
      children,
    },
  };

  const projectFiles: ZipEntry[] = [
    { path: "project.json", content: json({ title: `Visual Toolkit · ${scene.name || "Scene"}`, description: "Sample project generated by Visual Toolkit (Grindstone Systems).", parent: "", enabled: true, inheritable: false }) },
    { path: `com.inductiveautomation.perspective/views/${viewPath}/view.json`, content: json(view) },
    { path: `com.inductiveautomation.perspective/views/${viewPath}/resource.json`, content: RESOURCE(["view.json"]) },
    { path: "com.inductiveautomation.perspective/page-config/config.json", content: json({ pages: { "/": { viewPath, title: scene.name || "Visual Toolkit" } } }) },
    { path: "com.inductiveautomation.perspective/page-config/resource.json", content: RESOURCE(["config.json"]) },
  ];

  // 8.3 tag-definition layout, exactly as the gateway writes it.
  const tagRoot = `tags/ignition-8.3/tag-definition/${provider}`;
  const tagFiles: ZipEntry[] = [
    { path: `${tagRoot}/VisualToolkit/unary-resource.json`, content: TAG_RESOURCE([]) },
    { path: `${tagRoot}/VisualToolkit/${name}/unary-resource.json`, content: TAG_RESOURCE([]) },
    ...tags.flatMap((t) => [
      { path: `${tagRoot}/VisualToolkit/${name}/${t.tag}/tags.json`, content: json([{ dataType: "String", defaultValue: t.item.state, name: "State", tagType: "AtomicTag", valueSource: "memory" }]) },
      { path: `${tagRoot}/VisualToolkit/${name}/${t.tag}/unary-resource.json`, content: TAG_RESOURCE(["tags.json"]) },
    ]),
  ];
  // Tag Browser import (the usual Designer JSON export shape).
  const tagImport = {
    name: "VisualToolkit",
    tagType: "Folder",
    tags: [
      {
        name,
        tagType: "Folder",
        tags: tags.map((t) => ({ name: t.tag, tagType: "Folder", tags: [{ name: "State", tagType: "AtomicTag", valueSource: "memory", dataType: "String", value: t.item.state }] })),
      },
    ],
  };

  const index = {
    $comment: "Visual Toolkit Ignition sample project. See README.txt for what has been tested.",
    sampleProject: SAMPLE_PROJECT_VERSION,
    project: projectName,
    view: viewPath,
    style: opts.style,
    theme: opts.theme,
    states: STATES,
    items: tags.map((t) => ({ id: t.item.id, generator: t.item.generator, label: t.label, tag: t.path, initial: t.item.state, customKey: key(t.item.id) })),
    pipes: scene.pipes.map((p) => ({ id: p.id, from: tagOf.get(p.from.item)!.path, to: tagOf.get(p.to.item)!.path })),
  };

  const readme = [
    `Visual Toolkit — Ignition sample project "${projectName}" (sample project v${SAMPLE_PROJECT_VERSION})`,
    `Scene: ${scene.name || "Scene"} · ${scene.items.length} items, ${scene.pipes.length} pipes · ${opts.style} style, ${opts.theme} theme`,
    "",
    "STATUS: the 8.3 file-system install below was VERIFIED on a fresh Ignition 8.3.9 gateway",
    "(Docker, standard edition trial, anonymous Perspective session). Importing the project zip",
    "through the Gateway web UI, importing tags-import.json in the Designer, and Ignition 8.1",
    "are UNVERIFIED. Please report what works.",
    "",
    "What you get",
    `  project/${projectName}/      the Perspective project (one view, page "/")`,
    `  ${projectName}.zip          the same project zipped for Gateway > Projects > Import`,
    "  tags/ignition-8.3/          memory tags in the 8.3 tag-definition layout",
    "  tags/tags-import.json       the same tags for the Designer Tag Browser import",
    "  sample.json                 item → tag map, generator ids and states",
    "",
    "Install on 8.3 (verified)",
    `  1. Copy project/${projectName}/ into <install>/data/projects/`,
    `  2. Copy tags/ignition-8.3/tag-definition/${provider}/VisualToolkit/ into`,
    `     <install>/data/config/resources/core/ignition/tag-definition/${provider}/`,
    "  3. Restart the gateway (or try Scan File System on the Platform Overview page; untested).",
    `  4. Open http://<gateway>:8088/data/perspective/client/${projectName}/`,
    "",
    "Using it",
    `  Each item reads [${provider}]VisualToolkit/${name}/<tag>/State, a String memory tag holding`,
    `  a state name: ${STATES.join(", ")}.`,
    "  The dropdowns write those tags. A missing tag or unknown value shows comm-loss.",
    "  A pipe flows while either end is running.",
    "  To drive the view from real equipment, change the tag paths in the Image bindings,",
    "  or make the memory tags expressions that map your status values to state names.",
    "",
    "Visual assets only: Ignition owns tags, bindings, alarming, security and events. The",
    "sample makes no claim about control-system or safety correctness.",
    "",
  ].join("\n");

  const entries: ZipEntry[] = [
    { path: "README.txt", content: readme },
    { path: "sample.json", content: json(index) },
    ...projectFiles.map((f) => ({ ...f, path: `project/${projectName}/${f.path}` })),
    { path: `${projectName}.zip`, content: zip(projectFiles) },
    ...tagFiles,
    { path: "tags/tags-import.json", content: json(tagImport) },
  ];
  return { filename: `${slugify(scene.name || "scene")}-ignition-sample.zip`, projectName, entries, bytes: zip(entries) };
}
