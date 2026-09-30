/**
 * Regenerate the OIC listing screenshots into .oic/media/.
 *
 *   pnpm oic:media            # all shots
 *   pnpm oic:media hero       # only shots whose name contains "hero"
 *
 * Starts the Vite dev server, drives your installed Chrome (WebGPU) with
 * puppeteer-core, and writes 2× JPEGs sized for the catalog (≤ 12 MP, < 2 MB).
 * Set CHROME_PATH if Chrome is not in the default macOS location, and
 * OIC_MEDIA_OUT (with a trailing slash) to write somewhere else for a dry run.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer, { type Page } from "puppeteer-core";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = process.env.OIC_MEDIA_OUT ?? fileURLToPath(new URL("../.oic/media/", import.meta.url));
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const only = process.argv[2];

type Shot = { name: string; path: string; size?: [number, number]; clicks?: string[]; settle?: number; waitFor?: string };

const scene = (env: "plant" | "night", items: unknown[]) =>
  `/dev/scene.html?env=${env}&items=${encodeURIComponent(JSON.stringify(items))}&cam=${encodeURIComponent(
    JSON.stringify({ pos: [3.5, 2.2, 5.0], target: [0.3, 0.78, -0.2], fov: 32 }),
  )}`;

const lineup = (night: boolean) => [
  { gen: "tank.process", at: [-1.75, 0, -0.55], paint: night ? "slate" : "grey", p: { level: 70 } },
  { gen: "pump.centrifugal", at: [-0.35, 0, 0.75], paint: night ? "slate" : "signal-blue", state: night ? "fault" : "running", p: { detail: "detailed" } },
  night
    ? { gen: "valve.two-way", at: [1.55, 0, 1.25], paint: "slate", state: "warning", p: { actuator: "motor", body: "ball" } }
    : { gen: "valve.two-way", at: [1.55, 0, 1.25], paint: "fire-red", state: "normal" },
  { gen: "motor.induction", at: [2.55, 0, 0.05], paint: night ? "slate" : "machinery-green", rot: -0.6 },
  { gen: "conveyor.belt", at: [-0.5, 0, -1.55], paint: night ? "grey" : "safety-yellow", p: { length: 9 } },
];

const shots: Shot[] = [
  { name: "plant-floor", path: scene("plant", lineup(false)), waitFor: "window.__ready === true" },
  { name: "night-states", path: scene("night", lineup(true)), waitFor: "window.__ready === true" },
  { name: "tank-cutaway", path: "/dev/preview3d.html?gen=tank.process&state=running&paint=slate&cut=1&env=plant", size: [1400, 1000], settle: 3500 },
  { name: "builder-3d", path: "/", clicks: ["Open Symbols builder", "3D", "Cutaway"], settle: 4000 },
  { name: "all-states", path: "/", clicks: ["Open Symbols builder", "Switch to dark theme", "Pump", "All states"] },
  { name: "live-smart-svg", path: "/", clicks: ["Open Symbols builder", "Tank", "Live"], settle: 5200 },
  { name: "skid-composer-3d", path: "/#/mimics", clicks: ["Demo skid", "3D layout", "Night"], settle: 6000 },
];

async function clickByLabel(page: Page, label: string) {
  const ok = await page.evaluate((t) => {
    const el = [...document.querySelectorAll<HTMLElement>("button, a, [role=radio], [role=tab]")].find(
      (b) => (b.getAttribute("aria-label") || b.textContent || "").trim() === t,
    );
    el?.click();
    return !!el;
  }, label);
  if (!ok) throw new Error(`No control labelled "${label}"`);
  await new Promise((r) => setTimeout(r, 900));
}

const server = await createServer({ root: `${root}app`, configFile: `${root}vite.config.ts`, server: { port: 5199, strictPort: true }, logLevel: "error" });
await server.listen();
const base = "http://127.0.0.1:5199";
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--enable-unsafe-webgpu", "--use-angle=metal", "--hide-scrollbars"] });
try {
  for (const s of shots.filter((s) => !only || s.name.includes(only))) {
    const page = await browser.newPage();
    const [w, h] = s.size ?? [1600, 1000];
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await page.goto(base + s.path, { waitUntil: "networkidle0", timeout: 60000 });
    if (s.waitFor) await page.waitForFunction(s.waitFor, { timeout: 60000 });
    await new Promise((r) => setTimeout(r, 1500));
    for (const c of s.clicks ?? []) await clickByLabel(page, c);
    await new Promise((r) => setTimeout(r, s.settle ?? 2500));
    await page.screenshot({ path: `${out}${s.name}.jpg`, type: "jpeg", quality: 90 });
    console.log(`✓ ${out}${s.name}.jpg`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
