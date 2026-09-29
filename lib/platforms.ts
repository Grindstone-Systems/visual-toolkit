/**
 * Platform exporters: Ignition Perspective (icon repository, Drawing-friendly
 * SVG, theme stylesheet), Siemens WinCC Unified (dynamic SVG / SVGHMI) and
 * Rockwell FactoryTalk Optix (Advanced SVG Image).
 *
 * VALIDATION STATUS: none of these outputs has been loaded on a real
 * gateway, TIA Portal project or Optix Studio project. Each exporter follows
 * the vendor documentation cited next to it and says, in comments and in
 * docs/EXPORTERS.md / docs/IGNITION.md, what is taken from the docs
 * (documented) and what is our assumption. Never advertise these as
 * platform-validated.
 *
 * All output is plain presentation-attribute SVG: no <style>, no CSS
 * variables, no CSS animation, no <metadata>. Output is deterministic and
 * every text/attribute value is XML-escaped. No DOM or Node APIs are used.
 */
import { STATES, type Recipe, type Region, type Shape, type StateName, type StyleId, type ThemeId, type TokenName, type VtObject } from "./types.ts";
import { round } from "./geometry.ts";
import { getStyle, resolvePaint, type BadgeKind, type Paint, type Style } from "./styles.ts";
import { getTheme, tokenVar, type TokenSet } from "./themes.ts";
import { BADGE_FILL_TOKEN, BADGE_GLYPH_TOKEN, BADGE_SHAPES, FONT, escapeXml as esc, stateLabel, type RenderOptions } from "./render.ts";
import { exportObject, slugify, type ExportFile } from "./exporters.ts";
import { generateFromRecipe } from "./symbols/index.ts";

/** A set of files meant to be zipped together (see `zip`). */
export interface ExportKit {
  filename: string;
  files: ExportFile[];
}

/** Options shared by the single-object platform exporters. */
export type PlatformOptions = Pick<RenderOptions, "style" | "theme" | "state" | "tokens" | "width">;

/* ------------------------------------------------------------------ */
/* Shared flat (presentation-attribute) SVG building blocks             */
/* ------------------------------------------------------------------ */

type Resolve = (t: TokenName | "none" | undefined) => string | undefined;
type Attrs = [name: string, value: string][];

const attrs = (a: Attrs): string => a.map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** XML comments may not contain "--". */
const comment = (s: string) => `<!-- ${s.replace(/-{2,}/g, "-").replace(/-$/, "- ")} -->`;

function shapeXml(s: Shape, extra = ""): string {
  switch (s.type) {
    case "path":
      return `<path d="${esc(s.d)}"${extra}/>`;
    case "rect":
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"${s.rx ? ` rx="${s.rx}"` : ""}${extra}/>`;
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"${extra}/>`;
    case "ellipse":
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${extra}/>`;
    case "line":
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"${extra}/>`;
  }
}

/** Same attribute set, in the same order, as the resolved renderer. */
function paintPairs(p: Paint, color: Resolve): Attrs {
  const out: Attrs = [];
  const fill = color(p.fill);
  const stroke = color(p.stroke);
  if (fill) out.push(["fill", fill]);
  if (stroke) out.push(["stroke", stroke]);
  if (p.strokeWidth !== undefined && stroke !== "none") out.push(["stroke-width", String(p.strokeWidth)]);
  if (p.dash) out.push(["stroke-dasharray", p.dash]);
  if (p.opacity !== undefined) out.push(["opacity", String(p.opacity)]);
  return out;
}

/**
 * Monochrome paint: every colour becomes currentColor; form survives through
 * fill-opacity steps per token so a single-colour icon still reads.
 */
const MONO_ALPHA: Partial<Record<TokenName, number>> = {
  "surface.canvas": 0,
  "surface.panel": 0,
  "equipment.body": 0.15,
  "equipment.secondary": 0.3,
  "equipment.base": 0.4,
  "equipment.body-strong": 0.55,
  "equipment.detail": 0.7,
  "process.liquid": 0.35,
  "process.material": 0.35,
  "state.stopped": 0.55,
  "state.disabled": 0.3,
};
const monoAlpha = (t: TokenName) => MONO_ALPHA[t] ?? 1;

function monoPairs(p: Paint): Attrs {
  const out: Attrs = [];
  if (p.fill !== undefined) {
    if (p.fill === "none" || monoAlpha(p.fill) === 0) out.push(["fill", "none"]);
    else {
      out.push(["fill", "currentColor"]);
      if (monoAlpha(p.fill) < 1) out.push(["fill-opacity", String(monoAlpha(p.fill))]);
    }
  }
  const strokeNone = p.stroke === "none" || (p.stroke !== undefined && monoAlpha(p.stroke) === 0);
  if (p.stroke !== undefined) out.push(["stroke", strokeNone ? "none" : "currentColor"]);
  if (p.strokeWidth !== undefined && !strokeNone) out.push(["stroke-width", String(p.strokeWidth)]);
  if (p.dash) out.push(["stroke-dasharray", p.dash]);
  if (p.opacity !== undefined) out.push(["opacity", String(p.opacity)]);
  return out;
}

/** Level regions baked for one value: rects are rewritten, anything else keeps a matrix. */
function bakeLevel(r: Region): { shapes: Shape[]; transform: Attrs } {
  if (!r.level) return { shapes: r.shapes, transform: [] };
  const v = clamp01(r.level.value);
  const b = r.level.bottom;
  if (r.shapes.every((s) => s.type === "rect" && !s.rx)) {
    return {
      shapes: r.shapes.map((s) => {
        const q = s as Extract<Shape, { type: "rect" }>;
        return { ...q, y: round(q.y * v + b * (1 - v)), height: round(q.height * v) };
      }),
      transform: [],
    };
  }
  return { shapes: r.shapes, transform: levelMatrix(r) };
}

const levelMatrix = (r: Region): Attrs => {
  const v = clamp01(r.level!.value);
  return [["transform", `matrix(1 0 0 ${round(v)} 0 ${round(r.level!.bottom * (1 - v))})`]];
};

interface Ids {
  /** Addressable element id (region, badge, hatch, label), or null to omit. */
  el(local: string): string | null;
  /** Internal reference id (clipPath, pattern); always present. */
  ref(local: string): string;
}

const idPair = (ids: Ids, local: string): Attrs => {
  const v = ids.el(local);
  return v ? [["id", v]] : [];
};

function regionXml(r: Region, ids: Ids, paint: Attrs, level: "bake" | "matrix" | Attrs, defs: string[], extra: Attrs = []): string {
  let shapes = r.shapes;
  let transform: Attrs = [];
  if (r.level) {
    if (level === "bake") ({ shapes, transform } = bakeLevel(r));
    else if (level === "matrix") transform = levelMatrix(r);
    else transform = level;
  }
  let g = `<g${attrs([...idPair(ids, r.id), ...paint, ...extra, ...transform])}>${shapes.map((s) => shapeXml(s)).join("")}</g>`;
  if (r.clip) {
    const clipId = ids.ref(`${r.id}-clip`);
    defs.push(`<clipPath id="${esc(clipId)}">${shapeXml(r.clip)}</clipPath>`);
    g = `<g clip-path="url(#${esc(clipId)})">${g}</g>`;
  }
  return g;
}

interface BadgePaint {
  outline: Attrs;
  glyph: Attrs;
}

const badgePaint = (kind: BadgeKind, color: Resolve): BadgePaint => ({
  outline: [
    ["fill", color(BADGE_FILL_TOKEN[kind])!],
    ["stroke", color("surface.canvas")!],
    ["stroke-width", "1.6"],
    ["stroke-linejoin", "round"],
  ],
  glyph: [
    ["fill", "none"],
    ["stroke", color(BADGE_GLYPH_TOKEN[kind])!],
    ["stroke-width", "1.7"],
    ["stroke-linecap", "round"],
    ["stroke-linejoin", "round"],
  ],
});

const MONO_BADGE: BadgePaint = {
  outline: [
    ["fill", "currentColor"],
    ["fill-opacity", "0.25"],
    ["stroke", "currentColor"],
    ["stroke-width", "1.2"],
    ["stroke-linejoin", "round"],
  ],
  glyph: [
    ["fill", "none"],
    ["stroke", "currentColor"],
    ["stroke-width", "1.7"],
    ["stroke-linecap", "round"],
    ["stroke-linejoin", "round"],
  ],
};

function badgeXml(kind: BadgeKind, at: [number, number], ids: Ids, p: BadgePaint, extra: Attrs = []): string {
  const b = BADGE_SHAPES[kind];
  return (
    `<g${attrs([...idPair(ids, `badge-${kind}`), ["transform", `translate(${at[0]} ${at[1]})`], ...extra])}>` +
    `<g${attrs(p.outline)}>${b.outline}</g><g${attrs(p.glyph)}>${b.glyph}</g></g>`
  );
}

function hatchXml(vo: VtObject, ids: Ids, stroke: string, defs: string[], extra: Attrs = []): string {
  const bodies = vo.regions.filter((r) => r.role === "body" && r.paint === "solid");
  if (!bodies.length) return "";
  const pid = ids.ref("hatch-pattern");
  defs.push(
    `<pattern id="${esc(pid)}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">` +
      `<line x1="0" y1="0" x2="0" y2="4" stroke="${esc(stroke)}" stroke-width="1" opacity="0.55"/></pattern>`,
  );
  return (
    `<g${attrs([...idPair(ids, "hatch"), ["fill", `url(#${pid})`], ["stroke", "none"], ...extra])}>` +
    bodies.flatMap((r) => r.shapes.map((s) => shapeXml(s))).join("") +
    `</g>`
  );
}

function labelXml(vo: VtObject, ids: Ids, fill: string, inner?: string): string {
  if (!vo.label?.text || !vo.anchors.label) return "";
  const [x, y] = vo.anchors.label;
  const a: Attrs = [
    ...idPair(ids, "label"),
    ["x", String(x)],
    ["y", String(y)],
    ["text-anchor", "middle"],
    ["dominant-baseline", "middle"],
    ["font-family", FONT],
    ["font-size", "8"],
    ["font-weight", "600"],
    ["letter-spacing", "0.4"],
    ["fill", fill],
    ["stroke", "none"],
  ];
  return `<text${attrs(a)}>${inner ?? esc(vo.label.text)}</text>`;
}

const tokensFor = (o: Pick<RenderOptions, "theme" | "tokens">): TokenSet => ({ ...getTheme(o.theme).tokens, ...o.tokens }) as TokenSet;
const literalOf = (tokens: TokenSet): Resolve => (t) => (t === undefined ? undefined : t === "none" ? "none" : tokens[t]);

interface FlatOptions {
  style: Style;
  state: StateName;
  ids: Ids;
  /** "color" = literal theme colours; "mono" = currentColor. */
  paint: "color" | "mono";
  tokens: TokenSet;
  level: "bake" | "matrix";
  /** Include the disabled-state hatch pattern (not in SVG Tiny 1.2). */
  hatch: boolean;
  /** Emit every badge kind the style uses, hiding inactive ones with display="none". */
  allBadges?: boolean;
}

/** One state of an object as flat presentation-attribute markup (no root). */
function flatBody(vo: VtObject, o: FlatOptions): { defs: string[]; body: string } {
  const defs: string[] = [];
  const parts: string[] = [];
  const color = literalOf(o.tokens);
  const t = o.style.states[o.state];
  for (const r of vo.regions) {
    const p = resolvePaint(o.style, o.state, r.role, r.paint);
    parts.push(regionXml(r, o.ids, o.paint === "mono" ? monoPairs(p) : paintPairs(p, color), o.level, defs));
  }
  if (o.hatch && t.hatch) {
    parts.push(hatchXml(vo, o.ids, o.paint === "mono" ? "currentColor" : color("equipment.detail")!, defs));
  }
  const bp = (k: BadgeKind) => (o.paint === "mono" ? MONO_BADGE : badgePaint(k, color));
  if (o.allBadges) {
    for (const k of styleBadges(o.style)) {
      parts.push(badgeXml(k, vo.anchors.badge, o.ids, bp(k), k === t.badge ? [] : [["display", "none"]]));
    }
  } else if (t.badge) parts.push(badgeXml(t.badge, vo.anchors.badge, o.ids, bp(t.badge)));
  parts.push(labelXml(vo, o.ids, o.paint === "mono" ? "currentColor" : color("text.primary")!));
  return { defs, body: `<g stroke-linejoin="round" stroke-linecap="round">${parts.join("")}</g>` };
}

/** Badge kinds a style can show, in state order, de-duplicated. */
function styleBadges(style: Style): BadgeKind[] {
  const out: BadgeKind[] = [];
  for (const s of STATES) {
    const b = style.states[s].badge;
    if (b && !out.includes(b)) out.push(b);
  }
  return out;
}

const regionIds: Ids = { el: (l) => l, ref: (l) => l };

function rootSize(vo: VtObject, width?: number): { vb: string; w: number; h: number } {
  const [minX, minY, vw, vh] = vo.viewBox;
  const w = width ?? vw;
  return { vb: `${minX} ${minY} ${vw} ${vh}`, w, h: Math.round(((w * vh) / vw) * 100) / 100 };
}

const titleOf = (vo: VtObject, state: StateName) =>
  `${vo.label?.text ? `${vo.label.text} · ` : ""}${vo.identity.name} — ${stateLabel(state)}`;

/* ------------------------------------------------------------------ */
/* Ignition Perspective — custom icon repository (Level B)              */
/* ------------------------------------------------------------------ */

/**
 * Documented (IA manual, "Images and Icons in Perspective", 8.1 and 8.3):
 *  - a repository is ONE SVG file, <repository name>.svg;
 *  - root <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink=...>;
 *  - each icon is a child <svg> with an `id` (the icon name) and a `viewBox`
 *    large enough to enclose the graphic (no <symbol> in the documented form);
 *  - icons are referenced as "<repository>/<id>";
 *  - 8.1 path: data/modules/com.inductiveautomation.perspective/icons/
 *  - 8.3 path: data/config/resources/core/com.inductiveautomation.perspective/icons/
 *    plus config.json {"svgFileName": "<file>.svg"} and resource.json in the
 *    same directory; Designer restart (or Gateway "Scan File System").
 * Assumed (unverified): that Perspective's icon `color` reaches `currentColor`
 * in the monochrome variant, and that inner ids/clipPaths/patterns in a
 * repository file behave as in a browser.
 */
export interface IconRepositoryItem {
  object: VtObject;
  state: StateName;
  /** Icon name within the repository. Defaults to `<kind>-<state>`. */
  id?: string;
  style?: StyleId;
  theme?: ThemeId;
  tokens?: RenderOptions["tokens"];
}

export interface IconRepositoryOptions {
  /** Repository (library) name; becomes the file name and the icon path prefix. */
  library: string;
  style: StyleId;
  theme: ThemeId;
  tokens?: RenderOptions["tokens"];
  /** "color" (default): resolved theme colours. "mono": currentColor only. */
  variant?: "color" | "mono";
}

/** Icon names: lowercase, digits, "-" and "_". */
export const iconSlug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "icon";

/** One item per state of an object (default: every state it supports). */
export function iconItemsForStates(vo: VtObject, states: readonly StateName[] = vo.states): IconRepositoryItem[] {
  return STATES.filter((s) => states.includes(s) && vo.states.includes(s)).map((state) => ({ object: vo, state }));
}

/** One item per recipe, each keeping its own style, theme, state and token overrides. */
export function iconItemsFromRecipes(recipes: readonly Recipe[]): IconRepositoryItem[] {
  return recipes.map((r) => ({ object: generateFromRecipe(r), state: r.state, style: r.style, theme: r.theme, tokens: r.tokens }));
}

/** Resolve unique icon ids in item order (collisions get -2, -3, …). */
export function iconIds(items: readonly IconRepositoryItem[]): string[] {
  const seen = new Set<string>();
  return items.map((it) => {
    const base = iconSlug(it.id ?? `${it.object.identity.kind}-${it.state}`);
    let id = base;
    for (let n = 2; seen.has(id); n++) id = `${base}-${n}`;
    seen.add(id);
    return id;
  });
}

export function exportIconRepository(items: readonly IconRepositoryItem[], opts: IconRepositoryOptions): ExportFile {
  const library = iconSlug(opts.library);
  const variant = opts.variant ?? "color";
  const names = iconIds(items);
  const icons = items.map((it, i) => {
    const id = names[i]!;
    // Inner ids are not addressable in an icon; reference ids are namespaced
    // by the icon id so the whole repository file has unique ids.
    const ids: Ids = { el: () => null, ref: (l) => `${id}--${l}` };
    const { defs, body } = flatBody(it.object, {
      style: getStyle(it.style ?? opts.style),
      state: it.state,
      ids,
      paint: variant,
      tokens: tokensFor({ theme: it.theme ?? opts.theme, tokens: { ...opts.tokens, ...it.tokens } }),
      level: "bake",
      hatch: true,
    });
    const [minX, minY, vw, vh] = it.object.viewBox;
    return (
      `  ${comment(titleOf(it.object, it.state))}\n` +
      `  <svg viewBox="${minX} ${minY} ${vw} ${vh}" id="${esc(id)}">` +
      (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
      body +
      `</svg>`
    );
  });
  return {
    filename: `${library}.svg`,
    mime: "image/svg+xml",
    content:
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `${comment(`Visual Toolkit icon repository "${library}" (${variant}). Reference icons as ${library}/<id>. Unverified on a gateway.`)}\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n` +
      icons.join("\n") +
      `\n</svg>\n`,
  };
}

/** Ignition 8.3 config.json / resource.json exactly as the 8.3 manual's example shows. */
function ignition83Resource(svgFile: string): ExportFile[] {
  return [
    { filename: "config.json", mime: "application/json", content: JSON.stringify({ svgFileName: svgFile }, null, 4) + "\n" },
    {
      filename: "resource.json",
      mime: "application/json",
      content:
        JSON.stringify(
          { scope: "A", version: 1, restricted: false, overridable: true, files: ["config.json", svgFile], attributes: {} },
          null,
          4,
        ) + "\n",
    },
  ];
}

/**
 * Zip-ready icon repository kit: colour and monochrome repositories laid out
 * for 8.1 and 8.3, an icon index and an install README (unverified).
 */
export function exportIconRepositoryKit(items: readonly IconRepositoryItem[], opts: Omit<IconRepositoryOptions, "variant">): ExportKit {
  const library = iconSlug(opts.library);
  const mono = `${library}-mono`;
  const color = exportIconRepository(items, { ...opts, library, variant: "color" });
  const monoFile = exportIconRepository(items, { ...opts, library: mono, variant: "mono" });
  const ids = iconIds(items);
  const index = {
    $comment: "Visual Toolkit icon repository index. Unverified on an Ignition gateway.",
    libraries: { color: library, mono },
    icons: items.map((it, i) => ({
      id: ids[i],
      path: `${library}/${ids[i]}`,
      monoPath: `${mono}/${ids[i]}`,
      kind: it.object.identity.kind,
      label: it.object.label?.text,
      state: it.state,
      style: it.style ?? opts.style,
      theme: it.theme ?? opts.theme,
      generator: `${it.object.generator.id}@${it.object.generator.version}`,
      params: it.object.generator.params,
    })),
  };
  const readme = [
    `Visual Toolkit — Perspective icon repositories "${library}" and "${mono}"`,
    "",
    "STATUS: colour repository VERIFIED on a fresh Ignition 8.3.9 gateway (8.3 layout below).",
    "The 8.1 folder and the mono variant's use of the icon colour are still unverified.",
    "Please report what works.",
    "",
    `${library}.svg      full colour, resolved for the ${opts.theme} theme / ${opts.style} style`,
    `${mono}.svg single colour (currentColor) — intended to follow the icon's color property`,
    "",
    "Ignition 8.1",
    "  Copy ignition-8.1/*.svg to",
    "    <install>/data/modules/com.inductiveautomation.perspective/icons/",
    "  (Windows: C:\\Program Files\\Inductive Automation\\Ignition\\...; macOS: /usr/local/ignition/...;",
    "   Linux: /usr/local/bin/ignition/...). Restart the Designer to pick up new icons.",
    "",
    "Ignition 8.3",
    "  Icon repositories live in",
    "    <install>/data/config/resources/core/com.inductiveautomation.perspective/icons/",
    "  Copy the folder ignition-8.3/<repository>/ (config.json, <repository>.svg,",
    "  resource.json) into that folder, so each repository has its own sub-folder.",
    "  Verified on 8.3.9: the repository is then served at /data/perspective/icons/<repository>.svg.",
    "  Note: on a fresh 8.3 gateway the 8.1 folder is NOT read (it is only migrated on upgrade).",
    "  Then restart the Designer and Gateway, or press Scan File System on the Gateway's",
    "  Platform Overview page.",
    "",
    "Using an icon",
    `  Set an icon path to ${library}/<id> (or ${mono}/<id>), e.g. ${library}/${ids[0] ?? "centrifugal-pump-running"}.`,
    "  icons.json lists every id with the recipe that produced it.",
    "",
    "Visual assets only: Ignition owns tags, bindings, alarming and events.",
    "",
  ].join("\n");
  return {
    filename: `${library}-perspective-icons.zip`,
    files: [
      { ...color, filename: `ignition-8.1/${color.filename}` },
      { ...monoFile, filename: `ignition-8.1/${monoFile.filename}` },
      { ...color, filename: `ignition-8.3/${library}/${color.filename}` },
      ...ignition83Resource(color.filename).map((f) => ({ ...f, filename: `ignition-8.3/${library}/${f.filename}` })),
      { ...monoFile, filename: `ignition-8.3/${mono}/${monoFile.filename}` },
      ...ignition83Resource(monoFile.filename).map((f) => ({ ...f, filename: `ignition-8.3/${mono}/${f.filename}` })),
      { filename: "icons.json", mime: "application/json", content: JSON.stringify(index, null, 2) + "\n" },
      { filename: "README.txt", mime: "text/plain", content: readme },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Ignition Perspective — Drawing-friendly SVG profile (Level C)        */
/* ------------------------------------------------------------------ */

/**
 * HYPOTHESIS TO VALIDATE. The Perspective Drawing component imports SVG by
 * drag and drop and turns elements into `props.elements` (documented: ids
 * get a collision-avoiding prefix, attributes become camelCase, "testing
 * these attributes is recommended"). The docs do not list what the importer
 * drops, so this profile removes everything we suspect might not survive:
 * <style> blocks, CSS animation, CSS variables, <metadata>, class/data-*
 * attributes and <title>. Paint is presentation attributes only, level
 * transforms are flattened into rect geometry where possible, and element ids
 * equal the region ids (badge-<kind>, hatch and label for overlays).
 */
export function exportPerspectiveDrawingSvg(vo: VtObject, opts: PlatformOptions): ExportFile {
  const { vb, w, h } = rootSize(vo, opts.width);
  const { defs, body } = flatBody(vo, {
    style: getStyle(opts.style),
    state: opts.state,
    ids: regionIds,
    paint: "color",
    tokens: tokensFor(opts),
    level: "bake",
    hatch: true,
  });
  const name = slugify([vo.label?.text, vo.identity.kind, opts.style, opts.state, "drawing"].filter(Boolean).join("-"));
  return {
    filename: `${name}.svg`,
    mime: "image/svg+xml",
    content:
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}">` +
      (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
      body +
      `</svg>\n`,
  };
}

/* ------------------------------------------------------------------ */
/* Ignition Perspective — theme stylesheet snippet                      */
/* ------------------------------------------------------------------ */

/**
 * Documented (IA manual, Perspective > Styles): right-click Styles > "Enable
 * Advanced Stylesheet" creates a stylesheet.css resource that takes ordinary
 * CSS, and Perspective prefixes style classes with ".psc-" when injecting
 * them. Assumed (unverified): that :root custom properties declared there are
 * visible to every view and to inline SVG, and that the helper classes below
 * behave as written.
 */
export function exportPerspectiveThemeCss(
  themeId: ThemeId,
  opts: { tokens?: RenderOptions["tokens"]; selector?: string; helpers?: boolean } = {},
): ExportFile {
  const theme = getTheme(themeId);
  const tokens = { ...theme.tokens, ...opts.tokens } as TokenSet;
  const selector = opts.selector ?? ":root";
  const vars = (Object.keys(tokens) as TokenName[]).map((k) => `  ${tokenVar(k)}: ${cssValue(tokens[k])};`);
  const helpers =
    opts.helpers === false
      ? ""
      : "\n/* Optional helpers. A Perspective style class named vt-state-running is injected as\n" +
        " * .psc-vt-state-running; add it to an Icon so a monochrome Visual Toolkit icon takes\n" +
        " * the state colour. Unverified. */\n" +
        STATES.map((s) => {
          const tok: TokenName = s === "normal" ? "state.stopped" : s === "disabled" ? "state.disabled" : (`state.${s}` as TokenName);
          return `.psc-vt-state-${s} {\n  color: var(${tokenVar(tok)});\n  fill: var(${tokenVar(tok)});\n}`;
        }).join("\n") +
        "\n";
  return {
    filename: `${theme.id}.perspective.css`,
    mime: "text/css",
    content:
      `/* Visual Toolkit — ${cssComment(theme.name)} theme tokens for Ignition Perspective.\n` +
      " * UNVERIFIED on a gateway. Paste into your project's Advanced Stylesheet\n" +
      " * (Perspective > Styles > stylesheet.css). Colour meaning: state.* tokens are for\n" +
      " * operational state only; do not map brand colours onto them. */\n" +
      `${selector} {\n${vars.join("\n")}\n}\n` +
      helpers,
  };
}

/** Token values come from themes or user overrides: keep them inert in CSS. */
const cssValue = (v: string) => v.replace(/[;{}<>\\]/g, "").trim() || "initial";
const cssComment = (s: string) => s.replace(/\*\//g, "* /");

/* ------------------------------------------------------------------ */
/* Siemens WinCC Unified — dynamic SVG (SVGHMI)                         */
/* ------------------------------------------------------------------ */

/**
 * Source: Siemens application example 109782045 "Using dynamic SVGs with
 * SIMATIC WinCC" (V1.0, 03/2021, states it applies to WinCC regardless of
 * version and to check your version's supported scope).
 *
 * Documented and followed here:
 *  - file ending .svghmi, UTF-8 only;
 *  - DOCTYPE svg PUBLIC "-//SIEMENS//DTD SVG 1.0 TIA-HMI//EN" ".../svg18-hmi.dtd";
 *  - root: xmlns, xmlns:hmi, xmlns:hmi-bind, viewBox, preserveAspectRatio="none"
 *    ("only the viewBox can be modified"); namespace PREFIXES are fixed;
 *  - <hmi:self type="widget" displayName="X" name="extended.X" version="…">
 *    with <hmi:paramDef name type default/> (types number, boolean, string, HmiColor);
 *  - <hmi:localDef … hmi-bind:value="{{Converter.Bounds(…)}}"/> inside <defs>;
 *  - hmi-bind:<attr>="{{ expression }}", ParamProps.* / LocalProps.*, eq()/or(),
 *    `cond ? 'a' : 'b'`, hmi-bind:display for show/hide, translate/scale in
 *    hmi-bind:transform, <hmi:text hmi-bind:value="{{ParamProps.Text}}"/>;
 *  - no CSS styling (presentation attributes only), no animation, no script,
 *    no foreignObject.
 * Assumed (not shown in the document): nested ternaries (a ? x : b ? y : z),
 * string colour literals as the result of hmi-bind:fill/stroke, clipPath
 * (the element table lists "circle-path", which we read as clipPath),
 * patternTransform, and dominant-baseline on text. The document also says
 * "Do not use the viewBox attribute with dynamic SVGs" while every example
 * uses one; we follow the examples.
 */
export interface WinccOptions extends PlatformOptions {
  /** Widget name (displayName; name becomes "extended.<name>"). */
  widgetName?: string;
}

/** Numeric State parameter values: index into STATES (stable across objects). */
export const WINCC_STATE_VALUES: Record<StateName, number> = Object.fromEntries(STATES.map((s, i) => [s, i])) as Record<
  StateName,
  number
>;

const pascal = (s: string) =>
  s
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join("");

export function winccWidgetName(vo: VtObject, style: StyleId): string {
  return `VT_${pascal([vo.label?.text, vo.identity.kind, style].filter(Boolean).join(" ")) || "Symbol"}`;
}

const stateCond = (states: StateName[]) =>
  states
    .map((s) => `eq(ParamProps.State,${WINCC_STATE_VALUES[s]})`)
    .reduceRight((acc, c) => (acc ? `or(${c},${acc})` : c), "");

/**
 * One attribute across states: a literal when every state agrees, otherwise
 * an hmi-bind expression whose default is the most common value.
 */
function winccAttr(name: string, byState: [StateName, string][], numeric: boolean): Attrs {
  const groups = new Map<string, StateName[]>();
  for (const [s, v] of byState) groups.set(v, [...(groups.get(v) ?? []), s]);
  if (groups.size === 1) return [[name, byState[0]![1]]];
  const ordered = [...groups.entries()];
  let def = ordered[0]!;
  for (const g of ordered) if (g[1].length > def[1].length) def = g;
  const q = (v: string) => (numeric ? v : `'${v}'`);
  const expr = ordered
    .filter((g) => g !== def)
    .reduceRight((acc, [v, ss]) => `${stateCond(ss)} ? ${q(v)} : ${acc}`, q(def[0]));
  return [[`hmi-bind:${name}`, `{{${expr}}}`]];
}

const PAINT_DEFAULTS: Record<string, string> = { fill: "none", stroke: "none", "stroke-width": "1", "stroke-dasharray": "none", opacity: "1" };
const NUMERIC = new Set(["stroke-width", "opacity"]);

const widgetOf = (vo: VtObject, opts: WinccOptions) => (opts.widgetName ?? winccWidgetName(vo, opts.style)).replace(/[^A-Za-z0-9_]/g, "_");

export function exportWinccUnifiedSvg(vo: VtObject, opts: WinccOptions): ExportFile {
  const style = getStyle(opts.style);
  const color = literalOf(tokensFor(opts));
  const states = STATES.filter((s) => vo.states.includes(s));
  const widget = widgetOf(vo, opts);
  const defs: string[] = [];
  const parts: string[] = [];
  const levelRegion = vo.regions.find((r) => r.level);

  for (const r of vo.regions) {
    const per = states.map((s) => [s, paintPairs(resolvePaint(style, s, r.role, r.paint), color)] as const);
    const names = Object.keys(PAINT_DEFAULTS).filter((n) => per.some(([, a]) => a.some(([k]) => k === n)));
    const paint: Attrs = names.flatMap((n) =>
      winccAttr(
        n,
        per.map(([s, a]) => [s, a.find(([k]) => k === n)?.[1] ?? PAINT_DEFAULTS[n]!]),
        NUMERIC.has(n),
      ),
    );
    const level: Attrs | "bake" = r.level
      ? [["hmi-bind:transform", `translate(0,{{${r.level.bottom} - LocalProps.VtLevel*${r.level.bottom}}}) scale(1,{{LocalProps.VtLevel}})`]]
      : "bake";
    parts.push(regionXml(r, regionIds, paint, level, defs));
  }

  const hatched = states.filter((s) => style.states[s].hatch);
  if (hatched.length) {
    parts.push(hatchXml(vo, regionIds, color("equipment.detail")!, defs, [["hmi-bind:display", `{{${stateCond(hatched)} ? 'inline' : 'none'}}`]]));
  }
  for (const k of styleBadges(style)) {
    const on = states.filter((s) => style.states[s].badge === k);
    if (!on.length) continue;
    parts.push(badgeXml(k, vo.anchors.badge, regionIds, badgePaint(k, color), [["hmi-bind:display", `{{${stateCond(on)} ? 'inline' : 'none'}}`]]));
  }
  parts.push(labelXml(vo, regionIds, color("text.primary")!, `<hmi:text hmi-bind:value="{{ParamProps.Label}}"/>`));

  const params = [
    `<hmi:paramDef name="State" type="number" default="${WINCC_STATE_VALUES[opts.state]}"/>`,
    levelRegion ? `<hmi:paramDef name="Level" type="number" default="${round(clamp01(levelRegion.level!.value) * 100)}"/>` : "",
    vo.label?.text && vo.anchors.label ? `<hmi:paramDef name="Label" type="string" default="${esc(vo.label.text)}"/>` : "",
  ].filter(Boolean);
  const localDefs = levelRegion
    ? [`<hmi:localDef name="VtLevel" type="number" hmi-bind:value="{{Converter.Bounds(ParamProps.Level / 100, 0.0, 1.0)}}"/>`]
    : [];
  const [minX, minY, vw, vh] = vo.viewBox;
  const allDefs = [...localDefs, ...defs];
  return {
    filename: `${slugify([vo.label?.text, vo.identity.kind, opts.style].filter(Boolean).join("-"))}.svghmi`,
    mime: "image/svg+xml",
    content:
      `<!DOCTYPE svg PUBLIC "-//SIEMENS//DTD SVG 1.0 TIA-HMI//EN" "http://tia.siemens.com/graphics/svg/1.8/dtd/svg18-hmi.dtd">\n` +
      `${comment(`Visual Toolkit ${vo.generator.id}@${vo.generator.version} for WinCC Unified. Not validated in TIA Portal. State: ${states.map((s) => `${WINCC_STATE_VALUES[s]}=${s}`).join(" ")}`)}\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:hmi="http://svg.siemens.com/hmi/" xmlns:hmi-bind="http://svg.siemens.com/hmi/bind/" viewBox="${minX} ${minY} ${vw} ${vh}" preserveAspectRatio="none">\n` +
      `<hmi:self type="widget" displayName="${esc(widget)}" name="extended.${esc(widget)}" version="1.0.${vo.generator.version}">\n` +
      params.map((p) => `  ${p}\n`).join("") +
      `</hmi:self>\n` +
      (allDefs.length ? `<defs>${allDefs.join("")}</defs>\n` : "") +
      `${parts.length ? `<g stroke-linejoin="round" stroke-linecap="round">${parts.join("")}</g>` : ""}\n` +
      `</svg>\n`,
  };
}

/** Parameter/element map for the WinCC Unified export. */
export function exportWinccUnifiedMap(vo: VtObject, opts: WinccOptions): ExportFile {
  const states = STATES.filter((s) => vo.states.includes(s));
  const style = getStyle(opts.style);
  const level = vo.regions.find((r) => r.level);
  const svg = exportWinccUnifiedSvg(vo, opts);
  const map = {
    $comment:
      "Visual Toolkit → WinCC Unified dynamic SVG. UNVERIFIED in TIA Portal/WinCC Unified. Syntax follows Siemens application example 109782045; see docs/EXPORTERS.md for what is documented vs assumed.",
    platform: "siemens-wincc-unified",
    status: "unverified",
    file: svg.filename,
    widget: { displayName: widgetOf(vo, opts), version: `1.0.${vo.generator.version}` },
    parameters: [
      {
        name: "State",
        type: "number",
        default: WINCC_STATE_VALUES[opts.state],
        values: Object.fromEntries(states.map((s) => [WINCC_STATE_VALUES[s], s])),
      },
      ...(level ? [{ name: "Level", type: "number", default: round(clamp01(level.level!.value) * 100), range: [0, 100], unit: "%" }] : []),
      ...(vo.label?.text && vo.anchors.label ? [{ name: "Label", type: "string", default: vo.label.text }] : []),
    ],
    elements: [
      ...vo.regions.map((r) => ({ id: r.id, role: r.role, label: r.label })),
      ...(states.some((s) => style.states[s].hatch) ? [{ id: "hatch", role: "overlay", label: "Disabled hatch" }] : []),
      ...styleBadges(style).map((k) => ({ id: `badge-${k}`, role: "badge", label: `${k} badge` })),
      ...(vo.label?.text && vo.anchors.label ? [{ id: "label", role: "label", label: "Tag label" }] : []),
    ],
    notDynamized: ["motion (rotate/flow/turn hints): SVGHMI does not support SVG/CSS animation; bind a rotation parameter yourself if needed"],
    sources: ["https://support.industry.siemens.com/cs/ww/en/view/109782045"],
  };
  return {
    filename: svg.filename.replace(/\.svghmi$/, ".wincc.json"),
    mime: "application/json",
    content: JSON.stringify(map, null, 2) + "\n",
  };
}

export function exportWinccUnifiedKit(vo: VtObject, opts: WinccOptions): ExportKit {
  const svg = exportWinccUnifiedSvg(vo, opts);
  const map = exportWinccUnifiedMap(vo, opts);
  const readme = [
    `Visual Toolkit — ${vo.identity.name} for Siemens WinCC Unified (dynamic SVG)`,
    "",
    "STATUS: UNVERIFIED. Not yet imported into TIA Portal / WinCC Unified.",
    "",
    `${svg.filename}  dynamic SVG (SVGHMI) following Siemens application example 109782045`,
    `${map.filename}  interface: State (number), Level (0-100, if the symbol has a level), Label`,
    "",
    "Import it as a dynamic SVG according to your TIA Portal version's documentation and",
    "connect State to your status tag. State values are listed in the JSON map.",
    "Visual assets only: WinCC owns tags, alarms, events and safety behaviour.",
    "",
  ].join("\n");
  return {
    filename: svg.filename.replace(/\.svghmi$/, "-wincc-unified.zip"),
    files: [svg, map, { filename: "README.txt", mime: "text/plain", content: readme }],
  };
}

/* ------------------------------------------------------------------ */
/* Rockwell FactoryTalk Optix — Advanced SVG Image                      */
/* ------------------------------------------------------------------ */

/**
 * Sources: FactoryTalk Optix Help, "Add an Advanced SVG image" (1.10) and
 * "Advanced SVG image" (1.00), "Create an Advanced SVG Image object" (1.2).
 *
 * Documented and followed here:
 *  - the image must be SVG Tiny 1.2;
 *  - fill and stroke must exist with colours as XML attributes (or inline CSS);
 *  - colours must be hexadecimal;
 *  - SVG Element Properties pick an element by its @id and set a property
 *    (fill/stroke) to a hex value, statically or via a dynamic link with a
 *    converter (e.g. conditional converter on an alarm variable);
 *  - NetLogic SetImageContent can replace the image buffer at runtime
 *    (FactoryTalk-Optix/NetLogic_CheatSheet).
 * Assumed (unverified): setting fill/stroke on a <g id> cascades to its
 * shapes; `display`, `stroke-width`, `stroke-dasharray` and `opacity` are
 * settable the same way (the map marks these documented:false); clipPath
 * (used by tank contents and conveyor product) is tolerated although it is
 * not part of SVG Tiny 1.2. The hatch pattern is omitted (no <pattern> in Tiny).
 */
export function exportOptixAdvancedSvg(vo: VtObject, opts: PlatformOptions): ExportFile {
  const { vb, w, h } = rootSize(vo, opts.width);
  const { defs, body } = flatBody(vo, {
    style: getStyle(opts.style),
    state: opts.state,
    ids: regionIds,
    paint: "color",
    tokens: tokensFor(opts),
    level: "matrix",
    hatch: false,
    allBadges: true,
  });
  return {
    filename: `${slugify([vo.label?.text, vo.identity.kind, opts.style, "optix"].filter(Boolean).join("-"))}.svg`,
    mime: "image/svg+xml",
    content:
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" viewBox="${vb}" width="${w}" height="${h}">` +
      `<title>${esc(titleOf(vo, opts.state))}</title>` +
      (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
      body +
      `</svg>\n`,
  };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Element-property map: for every property that changes with state, its value per state. */
export function exportOptixMap(vo: VtObject, opts: PlatformOptions): ExportFile {
  const style = getStyle(opts.style);
  const color = literalOf(tokensFor(opts));
  const states = STATES.filter((s) => vo.states.includes(s));
  const svg = exportOptixAdvancedSvg(vo, opts);
  const properties: { id: string; property: string; values: Record<string, string>; documented: boolean }[] = [];
  const add = (id: string, property: string, values: Record<string, string>) => {
    if (new Set(Object.values(values)).size < 2) return;
    const documented = (property === "fill" || property === "stroke") && Object.values(values).every((v) => HEX.test(v));
    properties.push({ id, property, values, documented });
  };
  for (const r of vo.regions) {
    const per = states.map((s) => [s, paintPairs(resolvePaint(style, s, r.role, r.paint), color)] as const);
    for (const n of Object.keys(PAINT_DEFAULTS)) {
      if (!per.some(([, a]) => a.some(([k]) => k === n))) continue;
      add(r.id, n, Object.fromEntries(per.map(([s, a]) => [s, a.find(([k]) => k === n)?.[1] ?? PAINT_DEFAULTS[n]!])));
    }
  }
  for (const k of styleBadges(style)) {
    add(`badge-${k}`, "display", Object.fromEntries(states.map((s) => [s, style.states[s].badge === k ? "inline" : "none"])));
  }
  const level = vo.regions.find((r) => r.level);
  const map = {
    $comment:
      "Visual Toolkit → FactoryTalk Optix Advanced SVG Image. UNVERIFIED in Optix Studio. documented:true = fill/stroke with hex values by element id, as the Optix help describes; documented:false = our assumption.",
    platform: "rockwell-factorytalk-optix",
    status: "unverified",
    file: svg.filename,
    svgProfile: "SVG Tiny 1.2 (version=1.2 baseProfile=tiny); presentation attributes; hex colours",
    tinyDeviations: vo.regions.some((r) => r.clip) ? ["clipPath (not in SVG Tiny 1.2) on: " + vo.regions.filter((r) => r.clip).map((r) => r.id).join(", ")] : [],
    defaultState: opts.state,
    states,
    elements: [
      ...vo.regions.map((r) => ({ id: r.id, role: r.role, label: r.label })),
      ...styleBadges(style).map((k) => ({ id: `badge-${k}`, role: "badge", label: `${k} badge` })),
      ...(vo.label?.text && vo.anchors.label ? [{ id: "label", role: "label", label: "Tag label" }] : []),
    ],
    properties,
    ...(level
      ? {
          level: {
            id: level.id,
            attribute: "transform",
            value: `matrix(1 0 0 {v} 0 ${level.level!.bottom}*(1-{v}))`,
            range: [0, 1],
            documented: false,
            note: "Runtime level needs NetLogic (e.g. rewrite the attribute and call SetImageContent). The file bakes the exported level.",
          },
        }
      : {}),
    sources: [
      "https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-10/contents-ditamap/using-the-software/graphic-and-layout-objects/add-an-advanced-svg-image.html",
      "https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-00/contents-ditamap/developing-solutions/object-examples/advanced-svg-image.html",
      "https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet/blob/main/pages/advanced-svg.md",
    ],
  };
  return { filename: svg.filename.replace(/\.svg$/, ".json"), mime: "application/json", content: JSON.stringify(map, null, 2) + "\n" };
}

export function exportOptixKit(vo: VtObject, opts: PlatformOptions): ExportKit {
  const svg = exportOptixAdvancedSvg(vo, opts);
  const map = exportOptixMap(vo, opts);
  const readme = [
    `Visual Toolkit — ${vo.identity.name} for FactoryTalk Optix (Advanced SVG Image)`,
    "",
    "STATUS: UNVERIFIED. Not yet imported into Optix Studio.",
    "",
    `${svg.filename}  SVG Tiny 1.2 with element ids equal to Visual Toolkit region ids`,
    `${map.filename}  for each element property that changes with state, its value per state`,
    "",
    "In Optix Studio: add an Advanced SVG Image, import the SVG, then for each entry in",
    "properties add an SVG Element Property (ID, property, value) and drive the value",
    "from your status variable, e.g. with a key-value or conditional converter.",
    "Entries marked documented:false rely on behaviour the Optix help does not describe.",
    "Visual assets only: Optix owns tags, alarms, events and safety behaviour.",
    "",
  ].join("\n");
  return {
    filename: svg.filename.replace(/\.svg$/, ".zip"),
    files: [svg, map, exportObject(vo, opts), { filename: "README.txt", mime: "text/plain", content: readme }],
  };
}
