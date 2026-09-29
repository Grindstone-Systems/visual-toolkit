# Embedding: `<vt-symbol>`

`<vt-symbol>` is a framework-free custom element. Load one script, then write plain HTML. Each tag renders a smart (themable) SVG inside its own shadow root. `state` and `level` then change the existing SVG in place, so it's cheap to drive them from live tag values.

```html
<script src="https://grindstone-systems.github.io/visual-toolkit/lib/vt-symbol.iife.js"></script>

<vt-symbol generator="pump.centrifugal" params='{"label":"P-101"}' state="running"></vt-symbol>
<vt-symbol recipe="z0.HYwxDsMw…" state="fault"></vt-symbol>
<vt-symbol generator="tank.process" level="0.42"></vt-symbol>
```

The scripts are served free from GitHub Pages. The `deploy-pages.yml` workflow publishes them on every push to `main`:

| File | Use |
| --- | --- |
| `…/lib/vt-symbol.iife.js` | Classic `<script src>`. Defines `<vt-symbol>` and exposes `window.VisualToolkit` (`VtSymbolElement`, `defineVtSymbol`). |
| `…/lib/vt-symbol.js` | The same element as one self-contained ES module (`<script type="module">` or `import`). |
| `…/lib/visual-toolkit.js` | The engine API (`lib/index.ts`: generators, `renderSvg`, share codes, exporters) as an ES module. It does not define the element. |
| `…/lib/demo.html` | Live demo (the `examples/embed/` page). |
| `…/lib/frame.html` | One symbol configured from the URL, for iframe hosts (see below). |

Each file stands alone, with no shared chunks and no runtime dependencies (no React or three.js). About 67 kB minified (~23 kB gzip) for the element and 81 kB (~27 kB gzip) for the engine. Local builds go to `dist-lib/` via `pnpm build:lib`. To copy a script to your own server, one file is enough.

Pin a version for production. The Pages URL always serves the latest `main`, so copy the file onto your own host, or use a CDN tag once the package is published (see [Publishing](#publishing-to-npm)).

## Attributes

| Attribute | Re-renders? | Value |
| --- | --- | --- |
| `recipe` | yes | A share code (`z0.…` / `j0.…`, the part after `#/d/` in a builder link), recipe JSON, or a gallery entry's JSON. |
| `generator` | yes | Generator id, used when there's no `recipe`: `pump.centrifugal`, `valve.two-way`, `motor.induction`, `tank.process`, `conveyor.belt`. |
| `params` | yes | JSON object of generator params, e.g. `'{"label":"TK-1","agitator":true}'`. Unknown keys are dropped, and invalid values fall back to defaults. Used with `generator`. |
| `style` | yes | `modern-flat` (default), `high-performance` or `outline`. Overrides the recipe. |
| `theme` | yes | `light` (default) or `dark`. Sets the fallback colours. Overrides the recipe. |
| `paint` | yes | 3D paint id, carried in the recipe (the 2D symbol ignores it). |
| `animate` | yes | `"false"` turns motion off. |
| `state` | **no** | `normal`, `running`, `warning`, `fault`, `maintenance`, `disabled` or `comm-loss`. Sets `data-vt-state` on the inner SVG. Defaults to the recipe's state. |
| `level` | **no** | `0`–`1`, or a percentage such as `64%`. Clamped. Sets `--vt-level` on the inner SVG; it's used by tanks. Remove the attribute to go back to the recipe's level. |

All attributes are observed live. Changes made in the same task are coalesced into one render. Properties do the same thing: `el.state = "fault"` and `el.level = 0.3`. Read-only properties are `el.svg` (the inner `<svg>`), `el.recipe` (the effective, sanitised recipe) and `el.idPrefix`.

## Events

Both events bubble and are `composed`, so a `document` listener sees them.

| Event | `detail` | When |
| --- | --- | --- |
| `vt-ready` | `{ recipe, svg }` | After each (re)render. |
| `vt-error` | `{ message, attribute? }` | Bad input. For an unusable `recipe`, `generator`, `params`, `style` or `theme`, the element shows a small readable error box in place of the symbol. An unknown `state` is reported with `attribute: "state"`, and the last good state stays on screen. |

The first render happens as soon as the element is defined. To catch its events, add listeners before the script loads, or listen on `document`.

## Sizing

The host is `display:block; width:100%`, and the SVG scales from its viewBox (`height:auto`). Size it through its container or the element itself:

```css
vt-symbol.small { width: 160px; }
/* Cap the height; the drawing keeps its aspect ratio and centres itself. */
vt-symbol::part(svg) { max-height: 220px; }
```

Parts: `frame` (the wrapper), `svg` (the symbol) and `error` (the error box).

## Theming

Every colour in the smart SVG is `var(--vt-<token>, <theme fallback>)`. The SVG's styles live inside the shadow root, and custom properties inherit across shadow boundaries, so the host page re-themes symbols by setting tokens on any ancestor:

```css
.control-room {
  --vt-surface-canvas: #121518;
  --vt-text-primary: #e7e8e3;
  --vt-equipment-body: #3a3f44;
  --vt-state-running: #0a7cff;  /* brand accent */
}
```

Token names are listed in `TOKENS` (`lib/types.ts`), with dots becoming dashes: `state.comm-loss` → `--vt-state-comm-loss`. The `theme` attribute only picks the fallbacks. The error box uses `--vt-error-text`, `--vt-error-bg` and `--vt-error-border`.

Colour is never the only cue: every abnormal state also shows its own badge shape.

## Motion

Running pumps and motors spin, and conveyors move product. Under `prefers-reduced-motion: reduce`, all animation and transitions inside the element stop. `animate="false"` stops them for everyone.

## Ids

Each instance renders with a unique id prefix (`vt-<random>-<n>`), so many symbols can share a page. Shadow DOM also keeps their ids and CSS out of the host page.

## Loading from a module

```js
import "https://grindstone-systems.github.io/visual-toolkit/lib/vt-symbol.js"; // defines <vt-symbol>
// or, with a custom tag name:
import { defineVtSymbol } from ".../vt-symbol.js";
defineVtSymbol("plant-symbol");
```

Importing the module always defines `vt-symbol`. `defineVtSymbol()` is idempotent, and a custom name registers a subclass.

## Ignition Perspective (unverified)

> These notes have **not been tested** against a Perspective session yet. Treat them as starting points.

- **Markdown component:** it renders sanitised HTML, and `<script>` doesn't run by default, so it can't load the element script. Turning off `escapeHtml` might keep a `<vt-symbol>` tag, but something still has to define the element. Don't rely on this path.
- **Inline Frame component (recommended to try first):** point its `src` at `frame.html` and configure the symbol with URL parameters:

  ```
  https://grindstone-systems.github.io/visual-toolkit/lib/frame.html?generator=tank.process&params={"label":"TK-1"}#state=running&level=0.42
  ```

  Any attribute can go in the query or the `#hash`, and the hash wins. Changing only the hash, for example through an expression binding on `src` driven by a tag, shouldn't reload the frame, so `state` and `level` update in place. `bg=#rrggbb` sets the page background (transparent by default). Whether Perspective reassigns `src` without a reload when only the hash changes is not verified.
- **Self-hosting:** to avoid a dependency on github.io from a plant network, copy `vt-symbol.js` and `frame.html` onto the gateway's web server or another intranet host. In `frame.html`, change the script path to `./vt-symbol.js`, which is what `pnpm build:pages` does for the published copy.
- The Ignition kit export (docs/IGNITION.md) stays the primary path for Perspective. The embed is for web pages and dashboards around it.

## Content Security Policy

- `script-src` must allow wherever the script is served from (e.g. `https://grindstone-systems.github.io`, or `'self'` when self-hosted). The element uses no `eval` or `new Function`.
- Styles: the element and the SVG put `<style>` elements inside the shadow root. Strict policies without `'unsafe-inline'` in `style-src` may block them, and `level` also sets an inline `style` property on the SVG. If your CSP forbids inline styles, the symbol will render without state styling. Nonce support is not implemented yet.
- Share codes are decoded with `DecompressionStream` (no network). `frame.html` makes no requests other than loading its script.
- Recipes are untrusted input: params are sanitised, label text is whitelisted and escaped, and token overrides must be `#rrggbb`. See docs/SHARING.md.

## Try it locally

```bash
pnpm build:lib
python3 -m http.server 5192      # from the repo root
open http://127.0.0.1:5192/examples/embed/
```

## Publishing to npm

`package.json` is publish-ready (`exports`, `module`, `types`, `files` → `dist-lib/`, TypeScript declarations in `dist-lib/types/`). It stays `"private": true` on purpose. Publishing needs a decision on the package name/scope (e.g. `@grindstone-systems/visual-toolkit`), an npm account or org, and a versioning policy. After that, drop `private`, run `pnpm build:lib`, then run `npm publish`. That also makes versioned CDN URLs such as `https://cdn.jsdelivr.net/npm/<name>@<version>/dist-lib/vt-symbol.js` work for free.
