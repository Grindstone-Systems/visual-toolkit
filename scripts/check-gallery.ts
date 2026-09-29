/**
 * Validate every gallery/*.json entry. Runs in CI on pull requests so the
 * gallery can accept community submissions without a backend.
 */
import { readdirSync, readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { renderSvg } from "../lib/index.ts";
import { recipeSchema, type GalleryEntry } from "../lib/index.ts";
import { getGenerator, sanitizeParams } from "../lib/index.ts";

const dir = new URL("../gallery/", import.meta.url);
const validateRecipe = new Ajv2020({ allErrors: true, strict: false }).compile(recipeSchema);
const problems: string[] = [];
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

for (const file of files) {
  const fail = (m: string) => problems.push(`${file}: ${m}`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*\.json$/.test(file)) fail("filename must be kebab-case .json");
  let e: GalleryEntry;
  try {
    e = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  } catch (err) {
    fail(`invalid JSON (${(err as Error).message})`);
    continue;
  }
  const allowed = new Set(["title", "author", "description", "license", "created", "recipe"]);
  for (const k of Object.keys(e)) if (!allowed.has(k)) fail(`unexpected field "${k}"`);
  if (typeof e.title !== "string" || !e.title.trim() || e.title.length > 60) fail("title: 1–60 characters");
  if (e.description !== undefined && (typeof e.description !== "string" || e.description.length > 200)) fail("description: ≤200 characters");
  if (typeof e.author !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(e.author) || e.author === "your-github-username") {
    fail("author: set to your GitHub username");
  }
  if (e.license !== "CC0-1.0") fail('license must be "CC0-1.0"');
  if (typeof e.created !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.created)) fail("created: YYYY-MM-DD");
  if (!validateRecipe(e.recipe)) {
    fail(`recipe: ${JSON.stringify(validateRecipe.errors?.map((x) => `${x.instancePath} ${x.message}`))}`);
    continue;
  }
  const gen = getGenerator(e.recipe.generator, e.recipe.version);
  if (!gen) {
    fail(`unknown generator ${e.recipe.generator}@${e.recipe.version}`);
    continue;
  }
  const clean = sanitizeParams(gen.params, e.recipe.params);
  if (JSON.stringify(clean) !== JSON.stringify(Object.fromEntries(Object.keys(clean).map((k) => [k, e.recipe.params[k]])))) {
    fail(`params contain invalid values; expected e.g. ${JSON.stringify(clean)}`);
  }
  for (const k of Object.keys(e.recipe.params)) if (!(k in clean)) fail(`unknown param "${k}"`);
  try {
    renderSvg(gen.generate(e.recipe.params), e.recipe);
  } catch (err) {
    fail(`render failed: ${(err as Error).message}`);
  }
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ ${files.length} gallery entries valid`);
