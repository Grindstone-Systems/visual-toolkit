import { decodeShareCode, encodeShareCode, extractRecipe } from "../../lib/index.ts";
import {
  RECIPE_SCHEMA,
  STATES,
  PAINTS,
  TOKENS,
  type PaintId,
  type TokenName,
  type ParamValues,
  type Recipe,
  type StateName,
  type StyleId,
  type ThemeId,
} from "../../lib/index.ts";
import { defaultParams, GENERATORS, getGenerator, sanitizeParams } from "../../lib/index.ts";

export interface Design {
  generator: string;
  /** Remembered params per generator so switching families is lossless. */
  params: Record<string, ParamValues>;
  style: StyleId;
  theme: ThemeId;
  state: StateName;
  /** 3D paint. */
  paint: PaintId;
  /** Theme overrides from the theme editor (brand tokens; state colours stay protected). */
  tokens: Partial<Record<TokenName, string>>;
}

/** State and alarm colours are protected: the theme editor never changes them. */
export const PROTECTED = (t: TokenName) => t.startsWith("state.");

/** Keep only known, non-protected tokens with #rrggbb values (recipes are untrusted). */
export function sanitizeTokens(t: unknown): Partial<Record<TokenName, string>> {
  const out: Partial<Record<TokenName, string>> = {};
  if (!t || typeof t !== "object") return out;
  for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
    if ((TOKENS as readonly string[]).includes(k) && !PROTECTED(k as TokenName) && typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) {
      out[k as TokenName] = v.toLowerCase();
    }
  }
  return out;
}

const STYLES: StyleId[] = ["high-performance", "modern-flat", "outline"];
const THEMES: ThemeId[] = ["light", "dark"];

export const initialDesign = (): Design => ({
  generator: "pump.centrifugal",
  params: Object.fromEntries(GENERATORS.map((g) => [g.id, defaultParams(g.params)])),
  style: "modern-flat",
  theme: "light",
  state: "running",
  paint: "slate",
  tokens: {},
});

export function toRecipe(d: Design): Recipe {
  const gen = getGenerator(d.generator)!;
  return {
    schema: RECIPE_SCHEMA,
    generator: gen.id,
    version: gen.version,
    params: d.params[gen.id]!,
    style: d.style,
    theme: d.theme,
    state: d.state,
    ...(d.paint !== "slate" ? { paint: d.paint } : {}),
    ...(Object.keys(d.tokens).length ? { tokens: d.tokens } : {}),
  };
}

/** Apply an untrusted recipe (share link, file, gallery) onto a design. */
export function applyRecipe(d: Design, r: Recipe): Design {
  const gen = getGenerator(r.generator, r.version) ?? getGenerator(r.generator);
  if (!gen) throw new Error(`This design needs the “${r.generator}” generator, which this build doesn't include.`);
  return {
    generator: gen.id,
    params: { ...d.params, [gen.id]: sanitizeParams(gen.params, r.params) },
    style: STYLES.includes(r.style) ? r.style : d.style,
    theme: THEMES.includes(r.theme) ? r.theme : d.theme,
    state: STATES.includes(r.state) ? r.state : d.state,
    paint: r.paint && PAINTS.includes(r.paint) ? r.paint : "slate",
    tokens: sanitizeTokens(r.tokens),
  };
}

/* ------------------------------ share links ------------------------------ */

export async function designLink(d: Design): Promise<string> {
  const code = await encodeShareCode(toRecipe(d));
  return `${location.origin}${location.pathname}#/d/${code}`;
}

export async function designFromCode(d: Design, code: string): Promise<Design> {
  return applyRecipe(d, await decodeShareCode(code));
}

/** Accept an exported .svg (embedded recipe), .recipe.json, .vt.json or gallery entry. */
export async function designFromFile(d: Design, file: File): Promise<Design> {
  const text = await file.text();
  if (file.name.endsWith(".svg") || text.trimStart().startsWith("<")) {
    const r = extractRecipe(text);
    if (!r) throw new Error("That SVG wasn't exported by Visual Toolkit (no embedded recipe).");
    return applyRecipe(d, r);
  }
  const json = JSON.parse(text) as Record<string, unknown>;
  const r = (json.schema === RECIPE_SCHEMA ? json : (json.recipe as Recipe | undefined)) as Recipe | undefined;
  if (!r || r.schema !== RECIPE_SCHEMA) throw new Error("No Visual Toolkit recipe found in that file.");
  return applyRecipe(d, r);
}
