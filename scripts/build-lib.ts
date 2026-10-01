/**
 * Library build: dist-lib/ with the <vt-symbol> element (ES + classic
 * script), the engine as an ES module, and TypeScript declarations.
 *
 *   pnpm build:lib            → dist-lib/
 *   pnpm build:pages          → app build + dist-lib copied to dist/lib/ with
 *                               the embed demo (served by GitHub Pages at …/lib/)
 *
 * See docs/EMBED.md.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "dist-lib");

for (const mode of ["element", "element-iife", "engine"]) {
  await build({ configFile: join(root, "vite.lib.config.ts"), mode, logLevel: "warn" });
}

// Declarations: emitted from lib/, then import specifiers rewritten .ts → .js so
// they resolve for any consumer; the JSON schemas they re-export come along.
const types = join(out, "types");
rmSync(types, { recursive: true, force: true });
execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", join(root, "tsconfig.lib.json")], { stdio: "inherit" });
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const f of walk(types).filter((f) => f.endsWith(".d.ts"))) {
  writeFileSync(f, readFileSync(f, "utf8").replace(/(from\s+["']\.{1,2}\/[^"']*?)\.ts(["'])/g, "$1.js$2"));
}
cpSync(join(root, "lib/schema"), join(types, "schema"), { recursive: true });

const sizes = readdirSync(out)
  .filter((f) => f.endsWith(".js"))
  .map((f) => `${f} ${(statSync(join(out, f)).size / 1024).toFixed(1)} kB`);
console.log(`dist-lib: ${sizes.join(", ")}`);

if (process.argv.includes("--pages")) {
  const dist = join(root, "dist");
  if (!existsSync(join(dist, "index.html"))) throw new Error("Run the app build (pnpm build) before --pages");
  const lib = join(dist, "lib");
  mkdirSync(lib, { recursive: true });
  for (const f of readdirSync(out).filter((f) => /\.js(\.map)?$/.test(f))) copyFileSync(join(out, f), join(lib, f));
  // Demo pages next to the scripts: …/lib/demo.html and …/lib/frame.html
  const local = (html: string) => html.replaceAll("../../dist-lib/", "./");
  writeFileSync(join(lib, "demo.html"), local(readFileSync(join(root, "examples/embed/index.html"), "utf8")));
  writeFileSync(join(lib, "frame.html"), local(readFileSync(join(root, "examples/embed/frame.html"), "utf8")));
  console.log(`copied to dist/lib/ (+ demo.html, frame.html)`);
}
