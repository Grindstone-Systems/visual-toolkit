import { PAINTS, RECIPE_SCHEMA, STATES, type Recipe } from "./types.ts";

/**
 * Share codes: a recipe serialised into a compact, URL-safe string.
 *
 *   z0.<base64url(deflate-raw(json))>   compressed (preferred)
 *   j0.<base64url(json)>                fallback where CompressionStream is unavailable
 *
 * Because generators are deterministic the code *is* the design — no server
 * is needed to store or resolve it. See docs/SHARING.md.
 */

const toB64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64Url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buf = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}

/** Minimal form: drop the schema tag (implied) to keep codes short. */
function pack(r: Recipe): unknown[] {
  return [r.generator, r.version, r.params, r.style, r.theme, r.state, r.tokens ?? null, r.paint ?? null];
}

function unpack(a: unknown): Recipe {
  if (!Array.isArray(a) || a.length < 6) throw new Error("Malformed share code");
  const [generator, version, params, style, theme, state, tokens, paint] = a;
  if (typeof generator !== "string" || typeof version !== "number" || typeof params !== "object" || !params) {
    throw new Error("Malformed share code");
  }
  if (!STATES.includes(state)) throw new Error("Unknown state in share code");
  const r: Recipe = { schema: RECIPE_SCHEMA, generator, version, params, style, theme, state } as Recipe;
  if (tokens) r.tokens = tokens as Recipe["tokens"];
  if (typeof paint === "string" && (PAINTS as readonly string[]).includes(paint)) r.paint = paint as Recipe["paint"];
  return r;
}

/** Any JSON value → `z0.`/`j0.` code (shared by recipes and scenes). */
export async function encodeJsonCode(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream !== "undefined") {
    return `z0.${toB64Url(await pipe(json, new CompressionStream("deflate-raw")))}`;
  }
  return `j0.${toB64Url(json)}`;
}

export async function decodeJsonCode(code: string): Promise<unknown> {
  const [kind, body] = [code.slice(0, 3), code.slice(3)];
  let bytes = fromB64Url(body);
  if (kind === "z0.") bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  else if (kind !== "j0.") throw new Error("Unsupported share code version");
  return JSON.parse(new TextDecoder().decode(bytes));
}

export const encodeShareCode = (r: Recipe): Promise<string> => encodeJsonCode(pack(r));

export async function decodeShareCode(code: string): Promise<Recipe> {
  return unpack(await decodeJsonCode(code));
}
