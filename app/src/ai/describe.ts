import type Anthropic from "@anthropic-ai/sdk";
import { GENERATORS, PAINTS, RECIPE_SCHEMA, STATES, type ParamDef, type Recipe, type StyleId } from "../../../lib/index.ts";

/**
 * Describe → parameters. The user's own Anthropic API key goes straight from
 * their browser to the Claude API (Visual Toolkit has no server). Claude picks
 * a generator and parameter values from the live catalogue; it never draws
 * geometry. The returned recipe is untrusted and is sanitised by the caller.
 */

export const DESCRIBE_MODEL = "claude-opus-5-5";

const STYLES: StyleId[] = ["modern-flat", "high-performance", "outline"];

function describeParam(p: ParamDef): string {
  switch (p.type) {
    case "choice":
      return `${p.key} (${p.label}): one of ${p.options.map((o) => `"${o.value}" (${o.label})`).join(", ")}; default "${p.default}"`;
    case "toggle":
      return `${p.key} (${p.label}): true or false; default ${p.default}`;
    case "number":
      return `${p.key} (${p.label}): number ${p.min}–${p.max} in steps of ${p.step}; default ${p.default}`;
    case "text":
      return `${p.key} (${p.label}): text up to ${p.maxLength} characters (letters, digits, - _ . : / # +); default "${p.default}"`;
  }
}

function catalogue(): string {
  return GENERATORS.map(
    (g) => `- ${g.id} — ${g.name}: ${g.description}\n${g.params.map((p) => `    · ${describeParam(p)}`).join("\n")}`,
  ).join("\n");
}

const SYSTEM = `You configure Visual Toolkit, a procedural generator of industrial equipment symbols and stylised 3D models.
Map the user's description (and photo, if given) to exactly one generator and its parameter values. You only choose parameters; the generator draws everything.

Generators and their parameters:
${catalogue()}

Rules:
- Use only the generator ids and parameter values listed above. Omit a parameter to keep its default.
- If the equipment isn't in the catalogue, choose the closest generator and say so in the summary.
- Put any tag number the user mentions (e.g. "P-101") in the label parameter when the generator has one.
- style: "modern-flat" by default; "high-performance" when the user mentions ISA-101, high-performance or grey HMIs; "outline" for P&ID or print.
- paint is the 3D coat colour; pick one that matches a colour the user mentions, otherwise "slate".
- state: "normal" unless the user describes one (running, warning, fault, maintenance, disabled, comm-loss).
- summary: one short sentence describing what you configured and anything you couldn't match.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["generator", "params_json", "style", "paint", "state", "summary"],
  properties: {
    generator: { type: "string", enum: GENERATORS.map((g) => g.id) },
    params_json: { type: "string", description: "A JSON object of parameter values for the chosen generator, e.g. {\"driver\":\"none\"}" },
    style: { type: "string", enum: STYLES },
    paint: { type: "string", enum: [...PAINTS] },
    state: { type: "string", enum: [...STATES] },
    summary: { type: "string" },
  },
} as const;

export interface DescribeResult {
  recipe: Recipe;
  summary: string;
  servedBy: string;
}

export async function describeToRecipe(opts: {
  apiKey: string;
  text: string;
  image?: { mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; base64: string };
  theme: Recipe["theme"];
  signal?: AbortSignal;
}): Promise<DescribeResult> {
  // Loaded on demand so the SDK never weighs on the builder's first load.
  const { default: AnthropicSDK } = await import("@anthropic-ai/sdk");
  const client = new AnthropicSDK({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (opts.image) content.push({ type: "image", source: { type: "base64", media_type: opts.image.mediaType, data: opts.image.base64 } });
  content.push({ type: "text", text: opts.text.trim() || "Configure this equipment from the photo." });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create(
      {
        model: DESCRIBE_MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
        messages: [{ role: "user", content }],
      },
      { signal: opts.signal },
    );
  } catch (e) {
    if (e instanceof AnthropicSDK.AuthenticationError) throw new Error("That API key was rejected. Check it in the Claude Console and try again.");
    if (e instanceof AnthropicSDK.RateLimitError) throw new Error("Rate limited by the Claude API. Wait a moment and try again.");
    if (e instanceof AnthropicSDK.APIConnectionError) throw new Error("Couldn't reach the Claude API. Check your connection.");
    if (e instanceof AnthropicSDK.APIError) throw new Error(`Claude API error ${e.status}: ${e.message}`);
    throw e;
  }

  if (response.stop_reason === "refusal") throw new Error("Claude declined this request. Try describing the equipment differently.");
  if (response.stop_reason === "max_tokens") throw new Error("The response was cut off. Try a shorter description.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: { generator: string; params_json: string; style: StyleId; paint: Recipe["paint"]; state: Recipe["state"]; summary: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Claude's answer wasn't valid JSON. Try again.");
  }
  let params: Record<string, string | number | boolean> = {};
  try {
    const p = JSON.parse(parsed.params_json || "{}");
    if (p && typeof p === "object" && !Array.isArray(p)) params = p;
  } catch {
    /* keep defaults */
  }
  const gen = GENERATORS.find((g) => g.id === parsed.generator);
  if (!gen) throw new Error(`Claude chose an unknown generator (${parsed.generator}).`);
  return {
    recipe: {
      schema: RECIPE_SCHEMA,
      generator: gen.id,
      version: gen.version,
      params,
      style: parsed.style,
      theme: opts.theme,
      state: parsed.state,
      paint: parsed.paint,
    },
    summary: parsed.summary,
    servedBy: response.model,
  };
}
