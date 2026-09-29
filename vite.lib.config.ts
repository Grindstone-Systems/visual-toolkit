import { defineConfig } from "vite";

/**
 * Library builds (no React, no three.js, no app code) into dist-lib/:
 *
 *   --mode element       vt-symbol.js         <vt-symbol> as one self-contained ES module
 *   --mode element-iife  vt-symbol.iife.js    the same as a classic <script> (global VisualToolkit)
 *   --mode engine        visual-toolkit.js    the engine API (lib/index.ts) as an ES module
 *
 * Each target is its own build so every file stands alone (no shared chunks):
 * copy one file anywhere and it works. `pnpm build:lib` runs all three.
 */
const TARGETS = {
  element: { entry: "lib/element.ts", fileName: "vt-symbol.js", format: "es" },
  "element-iife": { entry: "lib/element.ts", fileName: "vt-symbol.iife.js", format: "iife" },
  engine: { entry: "lib/index.ts", fileName: "visual-toolkit.js", format: "es" },
} as const;

export default defineConfig(({ mode }) => {
  const t = TARGETS[mode as keyof typeof TARGETS];
  if (!t) throw new Error(`vite.lib.config.ts: --mode must be one of ${Object.keys(TARGETS).join(", ")}`);
  return {
    publicDir: false,
    build: {
      outDir: "dist-lib",
      emptyOutDir: mode === "element", // first target cleans; the others add to it
      target: "es2022",
      minify: true,
      sourcemap: true,
      copyPublicDir: false,
      lib: {
        entry: t.entry,
        formats: [t.format],
        name: "VisualToolkit",
        fileName: () => t.fileName,
      },
      rollupOptions: {
        // Guard: the engine and element must never pull in app dependencies.
        external: (id: string) => {
          if (/^(react|react-dom|three)(\/|$)/.test(id) || /[\\/]app[\\/]/.test(id)) {
            throw new Error(`Library build must not import ${id}`);
          }
          return false;
        },
        // Vite keeps whitespace in lib-mode ES output (for downstream tree-shaking);
        // these files are served directly, so minify them fully.
        output: { minify: true },
      },
    },
  };
});
