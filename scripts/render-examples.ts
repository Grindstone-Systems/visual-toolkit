/**
 * Render a contact sheet of every generator × style × state × theme into
 * examples/out/ for visual review.  Run: pnpm render:examples
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderSvg } from "../lib/index.ts";
import { STATES, type StyleId, type ThemeId } from "../lib/index.ts";
import { GENERATORS, defaultParams } from "../lib/index.ts";
import { getTheme } from "../lib/index.ts";

const out = new URL("../examples/out/", import.meta.url);
mkdirSync(out, { recursive: true });

const styles: StyleId[] = ["high-performance", "modern-flat", "outline"];
const themes: ThemeId[] = ["light", "dark"];
const variants: Record<string, Record<string, string | boolean>[]> = {
  "pump.centrifugal": [{}, { discharge: "side", inlet: "right", driver: "none", detail: "detailed" }, { detail: "simple", base: false, label: "" }],
  "valve.two-way": [{}, { body: "ball", actuator: "motor" }, { actuator: "manual", orientation: "vertical" }],
};

let html = `<!doctype html><meta charset="utf-8"><title>Visual Toolkit contact sheet</title><style>
body{font:13px Inter,system-ui,sans-serif;margin:24px}section{padding:16px;margin-bottom:12px;border-radius:8px}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}.cell{text-align:center;font-size:11px}
.cell svg{width:150px;height:auto;display:block}h3{margin:12px 0 6px}</style>`;
let n = 0;
for (const theme of themes) {
  const t = getTheme(theme);
  html += `<section style="background:${t.tokens["surface.canvas"]};color:${t.tokens["text.primary"]}"><h2>${t.name}</h2>`;
  for (const gen of GENERATORS) {
    for (const v of variants[gen.id] ?? [{}]) {
      const vo = gen.generate({ ...defaultParams(gen.params), ...v });
      for (const style of styles) {
        html += `<h3>${gen.name} · ${JSON.stringify(v)} · ${style}</h3><div class="row">`;
        for (const state of STATES) {
          const svg = renderSvg(vo, { style, theme, state, idPrefix: `s${n++}` });
          html += `<div class="cell">${svg}<div>${state}</div></div>`;
        }
        html += `</div>`;
      }
    }
  }
  html += `</section>`;
}
writeFileSync(new URL("contact-sheet.html", out), html);

// Smart SVG used by the committed plain-web example (examples/web).
const pump = GENERATORS[0]!.generate({});
writeFileSync(
  new URL("../examples/web/pump-smart.svg", import.meta.url),
  renderSvg(pump, { style: "modern-flat", theme: "light", state: "running", mode: "themable" }) + "\n",
);
console.log(`Wrote ${n} renders to examples/out/contact-sheet.html`);
