import {
  RECIPE_SCHEMA,
  STATES,
  type Recipe,
  type Region,
  type Shape,
  type StateName,
  type StyleId,
  type ThemeId,
  type TokenName,
  type VtObject,
} from "./types.ts";
import { round } from "./geometry.ts";
import { getTheme, tokenVar, type TokenSet } from "./themes.ts";
import { getStyle, resolvePaint, type BadgeKind, type Paint, type Style } from "./styles.ts";

export interface RenderOptions {
  style: StyleId;
  theme: ThemeId;
  state: StateName;
  tokens?: Partial<TokenSet>;
  /**
   * resolved — literal colours for the chosen state (most portable: Ignition,
   *            Figma, Inkscape, <img>).
   * themable — CSS custom properties + every state embedded; switch at runtime
   *            with the root data-vt-state attribute (inline web use).
   */
  mode?: "resolved" | "themable";
  animate?: boolean;
  /** Prefix for element ids so many symbols can share one DOM. */
  idPrefix?: string;
  /** Output width in px; height follows the viewBox aspect. */
  width?: number;
  /** Paint a canvas-coloured background (useful for raster export). */
  background?: boolean;
  /** Embed the reproducing recipe in <metadata> so the SVG can be re-opened. */
  embedRecipe?: boolean;
}

const FONT = "Inter, 'Segoe UI', Roboto, Arial, sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STATE_LABEL: Record<StateName, string> = {
  normal: "Normal",
  running: "Running",
  warning: "Warning",
  fault: "Fault",
  maintenance: "Maintenance",
  disabled: "Disabled",
  "comm-loss": "Communication loss",
};

export const stateLabel = (s: StateName) => STATE_LABEL[s];

function shapeEl(s: Shape, attrs = ""): string {
  switch (s.type) {
    case "path":
      return `<path d="${s.d}"${attrs}/>`;
    case "rect":
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"${s.rx ? ` rx="${s.rx}"` : ""}${attrs}/>`;
    case "circle":
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}"${attrs}/>`;
    case "ellipse":
      return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${attrs}/>`;
    case "line":
      return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"${attrs}/>`;
  }
}

type Resolve = (t: TokenName | "none" | undefined) => string | undefined;

function paintAttrs(p: Paint, color: Resolve): string {
  const out: string[] = [];
  const fill = color(p.fill);
  const stroke = color(p.stroke);
  if (fill) out.push(`fill="${fill}"`);
  if (stroke) out.push(`stroke="${stroke}"`);
  if (p.strokeWidth !== undefined && stroke !== "none") out.push(`stroke-width="${p.strokeWidth}"`);
  if (p.dash) out.push(`stroke-dasharray="${p.dash}"`);
  if (p.opacity !== undefined) out.push(`opacity="${p.opacity}"`);
  return out.length ? " " + out.join(" ") : "";
}

function paintCss(p: Paint, color: Resolve): string {
  const out: string[] = [];
  const fill = color(p.fill);
  const stroke = color(p.stroke);
  out.push(`fill:${fill ?? "none"}`);
  out.push(`stroke:${stroke ?? "none"}`);
  out.push(`stroke-width:${p.strokeWidth ?? 1}`);
  out.push(`stroke-dasharray:${p.dash ?? "none"}`);
  out.push(`opacity:${p.opacity ?? 1}`);
  return out.join(";");
}

/* ---------------------------- badges ---------------------------- */

const BADGE_GLYPH_TOKEN: Record<BadgeKind, TokenName> = {
  warning: "state.on-warning",
  fault: "state.on-alarm",
  maintenance: "state.on-alarm",
  disabled: "text.primary",
  "comm-loss": "state.on-alarm",
};

const BADGE_FILL_TOKEN: Record<BadgeKind, TokenName> = {
  warning: "state.warning",
  fault: "state.fault",
  maintenance: "state.maintenance",
  disabled: "state.disabled",
  "comm-loss": "state.comm-loss",
};

const EXCLAIM = `<path d="M0 -3.4V1.2"/><circle cx="0" cy="3.9" r="0.35"/>`;

const BADGE_SHAPES: Record<BadgeKind, { outline: string; glyph: string }> = {
  warning: { outline: `<path d="M0 -8.6L8.8 6.6H-8.8Z"/>`, glyph: `<g transform="translate(0 1.2)">${EXCLAIM}</g>` },
  fault: { outline: `<path d="M0 -9L9 0L0 9L-9 0Z"/>`, glyph: EXCLAIM },
  maintenance: { outline: `<rect x="-7.2" y="-7.2" width="14.4" height="14.4" rx="2.4"/>`, glyph: `<path d="M-3.4 3.2V-3.2L0 0.8L3.4 -3.2V3.2"/>` },
  disabled: { outline: `<circle r="7.6"/>`, glyph: `<path d="M-3.6 3.6L3.6 -3.6"/>` },
  "comm-loss": {
    outline: `<circle r="7.6"/>`,
    glyph: `<path d="M-2.5 -2A2.6 2.6 0 1 1 0.9 0.4C0.2 0.8 0 1.3 0 2.2"/><circle cx="0" cy="4.6" r="0.35"/>`,
  },
};

function badgeEl(kind: BadgeKind, at: [number, number], color: Resolve, cls = ""): string {
  const b = BADGE_SHAPES[kind];
  const fill = color(BADGE_FILL_TOKEN[kind]);
  const halo = color("surface.canvas");
  const glyph = color(BADGE_GLYPH_TOKEN[kind]);
  return (
    `<g class="vt-badge vt-badge--${kind}${cls}" transform="translate(${at[0]} ${at[1]})" aria-hidden="true">` +
    `<g fill="${fill}" stroke="${halo}" stroke-width="1.6" stroke-linejoin="round">${b.outline}</g>` +
    `<g fill="none" stroke="${glyph}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${b.glyph}</g>` +
    `</g>`
  );
}

/* ---------------------------- animation ---------------------------- */

/**
 * @param states states in which animation may play (resolved: just the
 *               rendered state; themable: all of them)
 * @param stateSelector CSS selector prefix scoping a rule to a state
 */
function animationCss(
  vo: VtObject,
  prefix: string,
  style: Style,
  states: readonly StateName[],
  stateSelector: (s: StateName) => string,
): string {
  const rules: string[] = [];
  const frames = new Set<string>();
  for (const a of vo.animations ?? []) {
    const active = states.filter((s) => a.states.includes(s) && style.states[s].animate);
    if (!active.length) continue;
    const sel = active.map((s) => `${stateSelector(s)}#${prefix}-${a.region}`).join(",");
    if (a.type === "rotate") {
      frames.add(`@keyframes ${prefix}-spin{to{transform:rotate(360deg)}}`);
      rules.push(
        `${sel}{transform-box:view-box;transform-origin:${a.origin[0]}px ${a.origin[1]}px;animation:${prefix}-spin ${a.periodMs}ms linear infinite}`,
      );
    } else if (a.type === "turn") {
      frames.add(`@keyframes ${prefix}-turn{50%{transform:scaleX(-1)}}`);
      rules.push(
        `${sel}{transform-box:view-box;transform-origin:${a.origin[0]}px ${a.origin[1]}px;animation:${prefix}-turn ${a.periodMs}ms ease-in-out infinite}`,
      );
    } else {
      const name = `${prefix}-${a.id}`;
      frames.add(`@keyframes ${name}{to{transform:translate(${a.vector[0]}px,${a.vector[1]}px)}}`);
      rules.push(`${sel}{animation:${name} ${a.periodMs}ms linear infinite}`);
    }
  }
  if (!rules.length) return "";
  return (
    [...frames].join("") +
    rules.join("") +
    `@media (prefers-reduced-motion:reduce){.vt-region{animation:none!important}}`
  );
}

/* ---------------------------- render ---------------------------- */

/**
 * One region: `<g id>` carrying paint, optionally wrapped in a clip group
 * (so animation/level transforms never move the clip) and scaled by level.
 */
function regionGroup(r: Region, prefix: string, attrs: string, mode: "resolved" | "themable", defs: string[]): string {
  const label = r.label ? ` aria-label="${esc(r.label)}"` : "";
  let transform = "";
  if (r.level && mode === "resolved") {
    const v = Math.min(1, Math.max(0, r.level.value));
    transform = ` transform="matrix(1 0 0 ${round(v)} 0 ${round(r.level.bottom * (1 - v))})"`;
  }
  let g =
    `<g id="${prefix}-${r.id}" class="vt-region vt-role--${r.role} vt-paint--${r.paint}" data-region="${r.id}"${label}${attrs}${transform}>` +
    r.shapes.map((s) => shapeEl(s)).join("") +
    `</g>`;
  if (r.clip) {
    const clipId = `${prefix}-${r.id}-clip`;
    defs.push(`<clipPath id="${clipId}">${shapeEl(r.clip)}</clipPath>`);
    g = `<g clip-path="url(#${clipId})">${g}</g>`;
  }
  return g;
}

/** Smart-SVG rules for level regions: host sets --vt-level (0–1) on the SVG. */
function levelCss(vo: VtObject, prefix: string): string {
  return vo.regions
    .filter((r) => r.level)
    .map(
      (r) =>
        `#${prefix}-${r.id}{transform-box:view-box;transform-origin:0 ${r.level!.bottom}px;` +
        `transform:scale(1,var(--vt-level,${r.level!.value}));transition:transform .9s cubic-bezier(.3,.7,.2,1)}`,
    )
    .join("");
}

export function recipeFor(vo: VtObject, o: Pick<RenderOptions, "style" | "theme" | "state" | "tokens">): Recipe {
  const r: Recipe = {
    schema: RECIPE_SCHEMA,
    generator: vo.generator.id,
    version: vo.generator.version,
    params: vo.generator.params,
    style: o.style,
    theme: o.theme,
    state: o.state,
  };
  if (o.tokens && Object.keys(o.tokens).length) r.tokens = o.tokens as Recipe["tokens"];
  return r;
}

export function renderSvg(vo: VtObject, opts: RenderOptions): string {
  const mode = opts.mode ?? "resolved";
  const animate = opts.animate ?? true;
  const prefix = opts.idPrefix ?? vo.id;
  const style = getStyle(opts.style);
  const tokens: TokenSet = { ...getTheme(opts.theme).tokens, ...opts.tokens } as TokenSet;
  const [minX, minY, vw, vh] = vo.viewBox;
  const width = opts.width ?? vw;
  const height = Math.round((width * vh) / vw * 100) / 100;

  const literal: Resolve = (t) => (t === undefined ? undefined : t === "none" ? "none" : tokens[t]);
  const cssVar: Resolve = (t) =>
    t === undefined ? undefined : t === "none" ? "none" : `var(${tokenVar(t)},${tokens[t]})`;

  const state = opts.state;
  const treatment = style.states[state];
  const title = `${vo.label?.text ? `${vo.label.text} · ` : ""}${vo.identity.name} — ${stateLabel(state)}`;

  const parts: string[] = [];
  const css: string[] = [];
  const defs: string[] = [];
  const bodyRegions = vo.regions.filter((r) => r.role === "body" && r.paint === "solid");
  const color = mode === "resolved" ? literal : cssVar;

  // Hatch pattern for disabled states.
  const anyHatch = mode === "themable" ? STATES.some((s) => style.states[s].hatch) : treatment.hatch;
  if (anyHatch && bodyRegions.length) {
    defs.push(
      `<pattern id="${prefix}-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="4" stroke="${literal("equipment.detail")}" stroke-width="1" opacity="0.55"/></pattern>`,
    );
  }

  if (opts.background) {
    parts.push(`<rect class="vt-background" x="${minX}" y="${minY}" width="${vw}" height="${vh}" fill="${color("surface.canvas")}"/>`);
  }

  if (mode === "resolved") {
    for (const r of vo.regions) {
      parts.push(regionGroup(r, prefix, paintAttrs(resolvePaint(style, state, r.role, r.paint), literal), "resolved", defs));
    }
    if (treatment.hatch && bodyRegions.length) {
      parts.push(
        `<g class="vt-hatch" fill="url(#${prefix}-hatch)" stroke="none" pointer-events="none">` +
          bodyRegions.flatMap((r) => r.shapes.map((s) => shapeEl(s))).join("") +
          `</g>`,
      );
    }
    if (treatment.badge) parts.push(badgeEl(treatment.badge, vo.anchors.badge, literal));
  } else {
    // Themable: paint through classes so every state lives in one file.
    const sel = (s: StateName) => `[data-vt-state="${s}"]`;
    const roles = new Map(vo.regions.map((r) => [`${r.role}|${r.paint}`, r] as const));
    for (const s of STATES) {
      for (const r of roles.values()) {
        css.push(`${sel(s)} .vt-role--${r.role}.vt-paint--${r.paint}{${paintCss(resolvePaint(style, s, r.role, r.paint), cssVar)}}`);
      }
    }
    for (const r of vo.regions) parts.push(regionGroup(r, prefix, "", "themable", defs));
    css.push(levelCss(vo, prefix));
    css.push(`.vt-region,.vt-badge{transition:fill .35s,stroke .35s,opacity .35s}`);
    if (bodyRegions.length && anyHatch) {
      parts.push(
        `<g class="vt-hatch" fill="url(#${prefix}-hatch)" stroke="none" pointer-events="none">` +
          bodyRegions.flatMap((r) => r.shapes.map((s) => shapeEl(s))).join("") +
          `</g>`,
      );
      const hatched = STATES.filter((s) => style.states[s].hatch);
      css.push(`.vt-hatch{display:none}${hatched.map((s) => `${sel(s)} .vt-hatch`).join(",")}{display:inline}`);
    }
    const kinds = new Set<BadgeKind>();
    for (const s of STATES) {
      const b = style.states[s].badge;
      if (b) kinds.add(b);
    }
    for (const k of kinds) parts.push(badgeEl(k, vo.anchors.badge, cssVar));
    css.push(`.vt-badge{display:none}`);
    for (const s of STATES) {
      const b = style.states[s].badge;
      if (b) css.push(`${sel(s)} .vt-badge--${b}{display:inline}`);
    }
  }

  if (animate) {
    css.push(
      mode === "resolved"
        ? animationCss(vo, prefix, style, [state], () => "")
        : animationCss(vo, prefix, style, STATES, (s) => `[data-vt-state="${s}"] `),
    );
  }

  if (vo.label?.text && vo.anchors.label) {
    const [lx, ly] = vo.anchors.label;
    parts.push(
      `<text class="vt-label" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-family="${esc(FONT)}" font-size="8" font-weight="600" letter-spacing="0.4" fill="${color("text.primary")}" stroke="none">${esc(vo.label.text)}</text>`,
    );
  }

  const metadata =
    (opts.embedRecipe ?? true)
      ? `<metadata id="${prefix}-recipe" data-vt="recipe">${esc(JSON.stringify(recipeFor(vo, opts)))}</metadata>`
      : "";
  const cssText = css.filter(Boolean).join("");

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${vw} ${vh}" width="${width}" height="${height}" ` +
    `class="vt-object" role="img" aria-labelledby="${prefix}-title" data-vt-object="${vo.identity.kind}" ` +
    `data-vt-generator="${vo.generator.id}@${vo.generator.version}" data-vt-style="${style.id}" data-vt-state="${state}" ` +
    `stroke-linejoin="round" stroke-linecap="round">` +
    `<title id="${prefix}-title">${esc(title)}</title>` +
    metadata +
    (defs.length ? `<defs>${defs.join("")}</defs>` : "") +
    (cssText ? `<style>${cssText}</style>` : "") +
    parts.join("") +
    `</svg>`
  );
}

/** Read an embedded recipe back out of an SVG exported by renderSvg. */
export function extractRecipe(svg: string): Recipe | null {
  const m = svg.match(/<metadata[^>]*data-vt="recipe"[^>]*>([\s\S]*?)<\/metadata>/);
  if (!m?.[1]) return null;
  const json = m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  try {
    const r = JSON.parse(json) as Recipe;
    return r.schema === RECIPE_SCHEMA ? r : null;
  } catch {
    return null;
  }
}
