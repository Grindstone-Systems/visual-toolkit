import { RECIPE_SCHEMA, type Recipe, type ThemeId, type TokenName } from "../../lib/index.ts";
import { sanitizeTokens } from "./design.ts";

/**
 * Packs: a JSON file of designs (and optionally a team theme), loaded from any
 * URL or file. Teams host them wherever they already keep files — a GitHub
 * raw URL, an intranet share, a gist. Data only: a pack can never run code,
 * and every recipe is sanitised like a share link. See docs/SHARING.md.
 */

export const PACK_SCHEMA = "vt.pack/v0" as const;
export const MAX_PACK_BYTES = 512 * 1024;
export const MAX_PACK_ENTRIES = 200;

export interface PackEntry {
  title: string;
  description?: string;
  recipe: Recipe;
}

export interface Pack {
  schema: typeof PACK_SCHEMA;
  name: string;
  description?: string;
  author?: string;
  theme?: { base: ThemeId; tokens: Partial<Record<TokenName, string>> };
  entries: PackEntry[];
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

/** Validate untrusted JSON into a Pack, dropping anything malformed. */
export function parsePack(json: unknown): Pack {
  if (!json || typeof json !== "object") throw new Error("That file isn't a Visual Toolkit pack.");
  const j = json as Record<string, unknown>;
  if (j.schema !== PACK_SCHEMA) throw new Error(`Not a pack (expected schema "${PACK_SCHEMA}").`);
  const raw = Array.isArray(j.entries) ? j.entries.slice(0, MAX_PACK_ENTRIES) : [];
  const entries: PackEntry[] = raw.flatMap((e) => {
    if (!e || typeof e !== "object") return [];
    const x = e as Record<string, unknown>;
    const r = x.recipe as Recipe | undefined;
    if (!r || r.schema !== RECIPE_SCHEMA || typeof r.generator !== "string") return [];
    const title = str(x.title, 60) || "Untitled";
    const description = str(x.description, 200);
    return [{ title, ...(description ? { description } : {}), recipe: r }];
  });
  if (!entries.length) throw new Error("That pack has no usable designs.");
  const theme = j.theme as { base?: unknown; tokens?: unknown } | undefined;
  const base = theme?.base === "dark" ? "dark" : theme?.base === "light" ? "light" : undefined;
  const description = str(j.description, 300);
  const author = str(j.author, 60);
  return {
    schema: PACK_SCHEMA,
    name: str(j.name, 60) || "Untitled pack",
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    ...(base ? { theme: { base, tokens: sanitizeTokens(theme?.tokens) } } : {}),
    entries,
  };
}

export async function loadPackFromUrl(url: string): Promise<Pack> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("That isn't a valid URL.");
  }
  if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") throw new Error("Packs load over HTTPS only.");
  const res = await fetch(u, { credentials: "omit", redirect: "follow" }).catch(() => {
    throw new Error("Couldn't fetch the pack. The host may not allow cross-origin requests (CORS).");
  });
  if (!res.ok) throw new Error(`The pack URL returned ${res.status}.`);
  const text = await res.text();
  if (text.length > MAX_PACK_BYTES) throw new Error("That pack is larger than 512 KB.");
  return parsePack(JSON.parse(text));
}

/* ------------------------------ my pack (this device) ------------------------------ */

const MINE = "vt.my-pack";

export function readMyPack(): PackEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(MINE) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function writeMyPack(entries: PackEntry[]) {
  try {
    localStorage.setItem(MINE, JSON.stringify(entries.slice(0, MAX_PACK_ENTRIES)));
  } catch {
    /* storage unavailable */
  }
}

export function toPackFile(name: string, entries: PackEntry[], theme?: Pack["theme"]): string {
  const pack: Pack = { schema: PACK_SCHEMA, name, entries, ...(theme && Object.keys(theme.tokens).length ? { theme } : {}) };
  return JSON.stringify(pack, null, 2) + "\n";
}
