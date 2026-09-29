/**
 * <vt-symbol>: an embeddable, framework-free custom element that renders a
 * Visual Toolkit symbol as a smart (themable) SVG inside a shadow root.
 *
 *   <script src=".../vt-symbol.iife.js"></script>
 *   <vt-symbol recipe="z0.…" state="running"></vt-symbol>
 *
 * Structural attributes (recipe, generator, params, style, theme, paint,
 * animate) re-render. Runtime attributes (state, level) only touch the
 * rendered SVG (data-vt-state / --vt-level), so they are cheap to drive from
 * a live tag. See docs/EMBED.md.
 *
 * Imports only the engine; never app code, React or three.js.
 */
import { decodeShareCode } from "./share.ts";
import { renderSvg, stateLabel } from "./render.ts";
import { STYLES } from "./styles.ts";
import { THEMES } from "./themes.ts";
import { getGenerator } from "./symbols/index.ts";
import {
  PAINTS,
  RECIPE_SCHEMA,
  STATES,
  TOKENS,
  type ParamValues,
  type PaintId,
  type Recipe,
  type StateName,
  type StyleId,
  type ThemeId,
  type TokenName,
} from "./types.ts";

export const VT_SYMBOL_TAG = "vt-symbol";

const STRUCTURAL = ["recipe", "generator", "params", "style", "theme", "paint", "animate"] as const;
const OBSERVED = [...STRUCTURAL, "state", "level"] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** Per-load random base + counter: ids stay unique even if the script loads twice. */
const ID_BASE = Math.random().toString(36).slice(2, 7);
let instances = 0;

const SHADOW_CSS =
  `:host{display:block;width:100%;line-height:0;contain:content}` +
  `:host([hidden]){display:none}` +
  `.frame{width:100%}` +
  `svg{display:block;width:100%;height:auto;overflow:visible}` +
  `.error{margin:0;padding:6px 8px;line-height:1.35;font:12px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;` +
  `color:var(--vt-error-text,#8a1c12);background:var(--vt-error-bg,#fdecea);border:1px solid var(--vt-error-border,#e7a79f);` +
  `border-radius:4px;overflow-wrap:anywhere}` +
  `@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`;

export interface VtReadyDetail {
  recipe: Recipe;
  svg: SVGSVGElement;
}
export interface VtErrorDetail {
  message: string;
  /** Attribute that caused it, when known. */
  attribute?: string;
}

/** Parse a `recipe` attribute: share code (z0./j0.), recipe JSON or gallery-entry JSON. */
async function parseRecipeAttr(raw: string): Promise<Partial<Recipe>> {
  const s = raw.trim();
  if (/^[zj]0\./.test(s)) {
    try {
      return await decodeShareCode(s);
    } catch (e) {
      // Stream/base64 failures surface as unhelpful messages ("Failed to fetch").
      const m = e instanceof Error && /share code/i.test(e.message) ? e.message : "Invalid or truncated share code";
      throw new Error(`recipe: ${m}`);
    }
  }
  let v: unknown;
  try {
    v = JSON.parse(s);
  } catch {
    throw new Error("recipe must be a share code (z0.… / j0.…) or recipe JSON");
  }
  if (v && typeof v === "object" && "recipe" in v) v = (v as { recipe: unknown }).recipe; // gallery entry
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("recipe JSON must be an object");
  return v as Partial<Recipe>;
}

function parseParams(raw: string | null): ParamValues {
  if (raw === null || raw.trim() === "") return {};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new Error("params must be JSON, e.g. params='{\"label\":\"P-101\"}'");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("params must be a JSON object");
  return v as ParamValues;
}

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[], what: string, fallback: T): T {
  if (value === null || value === undefined || value === "") return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Unknown ${what} "${value}" (expected ${allowed.join(", ")})`);
}

/** Level attribute: 0–1, or a percentage such as "64%". null = use the recipe's level. */
export function parseLevel(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const s = raw.trim();
  const n = s.endsWith("%") ? Number(s.slice(0, -1)) / 100 : Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function cleanTokens(t: unknown): Recipe["tokens"] | undefined {
  if (!t || typeof t !== "object") return undefined;
  const out: Partial<Record<TokenName, string>> = {};
  for (const [k, v] of Object.entries(t)) {
    if ((TOKENS as readonly string[]).includes(k) && typeof v === "string" && HEX.test(v)) out[k as TokenName] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const Base: typeof HTMLElement =
  typeof HTMLElement !== "undefined" ? HTMLElement : (class {} as unknown as typeof HTMLElement);

export class VtSymbolElement extends Base {
  static get observedAttributes(): readonly string[] {
    return OBSERVED;
  }

  readonly #root: ShadowRoot;
  readonly #frame: HTMLDivElement;
  readonly #prefix = `vt-${ID_BASE}-${++instances}`;
  #svg: SVGSVGElement | null = null;
  #recipe: Recipe | null = null;
  /** State baked into the recipe; the state attribute overrides it. */
  #baseState: StateName = "normal";
  #token = 0;
  #queued = false;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHADOW_CSS;
    this.#frame = document.createElement("div");
    this.#frame.className = "frame";
    this.#frame.setAttribute("part", "frame");
    this.#root.append(style, this.#frame);
  }

  /** Unique id prefix used for every id inside this instance's SVG. */
  get idPrefix(): string {
    return this.#prefix;
  }
  /** The rendered smart SVG, or null before the first render / after an error. */
  get svg(): SVGSVGElement | null {
    return this.#svg;
  }
  /** The recipe currently shown (after attribute overrides and sanitising). */
  get recipe(): Recipe | null {
    return this.#recipe;
  }

  get state(): string | null {
    return this.getAttribute("state");
  }
  set state(v: string | null) {
    if (v === null) this.removeAttribute("state");
    else this.setAttribute("state", v);
  }
  get level(): number | null {
    return parseLevel(this.getAttribute("level"));
  }
  set level(v: number | string | null) {
    if (v === null) this.removeAttribute("level");
    else this.setAttribute("level", String(v));
  }

  connectedCallback(): void {
    this.#schedule();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (name === "state") this.#applyState();
    else if (name === "level") this.#applyLevel();
    else this.#schedule();
  }

  /** Coalesce attribute changes made in the same task into one render. */
  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected) void this.#render();
    });
  }

  async #resolveRecipe(): Promise<Recipe> {
    const recipeAttr = this.getAttribute("recipe");
    let base: Partial<Recipe> = {};
    if (recipeAttr && recipeAttr.trim()) {
      base = await parseRecipeAttr(recipeAttr);
    } else {
      const generator = this.getAttribute("generator");
      if (!generator) throw new Error('Set a recipe="…" or generator="…" attribute');
      base = { generator, params: parseParams(this.getAttribute("params")) };
    }
    if (typeof base.generator !== "string") throw new Error("recipe has no generator");
    const gen =
      getGenerator(base.generator, typeof base.version === "number" ? base.version : undefined) ??
      getGenerator(base.generator);
    if (!gen) throw new Error(`Unknown generator "${base.generator}"`);

    const styleIds = Object.keys(STYLES) as StyleId[];
    const themeIds = Object.keys(THEMES) as ThemeId[];
    // Attributes override the recipe; recipe values fall back quietly (like the builder).
    const style = pick(this.getAttribute("style"), styleIds, "style", styleIds.includes(base.style!) ? base.style! : "modern-flat");
    const theme = pick(this.getAttribute("theme"), themeIds, "theme", themeIds.includes(base.theme!) ? base.theme! : "light");
    const paint = pick<PaintId | "">(this.getAttribute("paint"), [...PAINTS, ""], "paint", PAINTS.includes(base.paint!) ? base.paint! : "");
    const state = STATES.includes(base.state as StateName) ? (base.state as StateName) : "normal";

    const r: Recipe = {
      schema: RECIPE_SCHEMA,
      generator: gen.id,
      version: gen.version,
      params: base.params && typeof base.params === "object" ? base.params : {},
      style,
      theme,
      state,
    };
    const tokens = cleanTokens(base.tokens);
    if (tokens) r.tokens = tokens;
    if (paint) r.paint = paint;
    return r;
  }

  async #render(): Promise<void> {
    const token = ++this.#token;
    try {
      const r = await this.#resolveRecipe();
      if (token !== this.#token) return; // superseded by a newer render
      const gen = getGenerator(r.generator, r.version)!;
      const vo = gen.generate(r.params); // generators sanitise their own params
      r.params = vo.generator.params;
      const markup = renderSvg(vo, {
        style: r.style,
        theme: r.theme,
        state: r.state,
        tokens: r.tokens,
        mode: "themable",
        animate: this.getAttribute("animate") !== "false",
        idPrefix: this.#prefix,
        embedRecipe: false,
      });
      // Parse as XML (the renderer emits well-formed SVG with every text value
      // escaped); more predictable than innerHTML for <style> inside <svg>.
      const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
      if (doc.querySelector("parsererror") || doc.documentElement.localName !== "svg") {
        throw new Error("Renderer produced invalid SVG");
      }
      const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.setAttribute("part", "svg"); // style from outside: vt-symbol::part(svg) { … }
      this.#frame.replaceChildren(svg);
      this.#svg = svg;
      this.#recipe = r;
      this.#baseState = r.state;
      this.#applyState();
      this.#applyLevel();
      this.dispatchEvent(
        new CustomEvent<VtReadyDetail>("vt-ready", { detail: { recipe: r, svg }, bubbles: true, composed: true }),
      );
    } catch (e) {
      if (token !== this.#token) return;
      this.#fail(e instanceof Error ? e.message : String(e));
    }
  }

  #fail(message: string, attribute?: string, fatal = true): void {
    if (fatal) {
      this.#svg = null;
      this.#recipe = null;
      const p = document.createElement("p");
      p.className = "error";
      p.setAttribute("part", "error");
      p.setAttribute("role", "alert");
      p.textContent = `vt-symbol: ${message}`;
      this.#frame.replaceChildren(p);
    }
    this.dispatchEvent(
      new CustomEvent<VtErrorDetail>("vt-error", { detail: { message, attribute }, bubbles: true, composed: true }),
    );
  }

  /** state → data-vt-state on the existing SVG (no re-render). */
  #applyState(): void {
    const svg = this.#svg;
    const r = this.#recipe;
    if (!svg || !r) return;
    const raw = this.getAttribute("state");
    let state: StateName = this.#baseState;
    if (raw !== null && raw !== "") {
      if (STATES.includes(raw as StateName)) state = raw as StateName;
      else {
        // Non-fatal: keep showing the last good state.
        this.#fail(`Unknown state "${raw}" (expected ${STATES.join(", ")})`, "state", false);
        return;
      }
    }
    svg.setAttribute("data-vt-state", state);
    r.state = state;
    const title = svg.querySelector("title");
    if (title?.textContent) title.textContent = title.textContent.replace(/ — [^—]*$/, ` — ${stateLabel(state)}`);
  }

  /** level → --vt-level on the existing SVG (no re-render). */
  #applyLevel(): void {
    const svg = this.#svg;
    if (!svg) return;
    const v = parseLevel(this.getAttribute("level"));
    if (v === null) svg.style.removeProperty("--vt-level");
    else svg.style.setProperty("--vt-level", String(v));
  }
}

/**
 * Register the element (idempotent). A custom tag name registers a subclass,
 * because one constructor can only be defined once.
 */
export function defineVtSymbol(tag: string = VT_SYMBOL_TAG): typeof VtSymbolElement | undefined {
  if (typeof customElements === "undefined") return undefined;
  const existing = customElements.get(tag);
  if (existing) return existing as typeof VtSymbolElement;
  const ctor = tag === VT_SYMBOL_TAG ? VtSymbolElement : class extends VtSymbolElement {};
  customElements.define(tag, ctor);
  return ctor;
}

declare global {
  interface HTMLElementTagNameMap {
    "vt-symbol": VtSymbolElement;
  }
  interface HTMLElementEventMap {
    "vt-ready": CustomEvent<VtReadyDetail>;
    "vt-error": CustomEvent<VtErrorDetail>;
  }
}

// Auto-define when loaded (script tag or import); harmless in Node.
defineVtSymbol();
