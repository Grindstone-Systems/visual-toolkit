# Visual Toolkit

**Industrial symbols you configure, not redraw.** By Grindstone Systems.

Pick a piece of equipment and shape it. Preview its operating states, switch style and theme, then export clean SVG for Ignition, the web or any HMI that takes SVG. Everything runs in the browser, so there is no account and no server.

> Status: **preview.** Eleven procedural families (pump, valve, motor, tank, conveyor, heat exchanger, blower, compressor, static mixer, instrument, pipe fitting), 3 styles, Light/Dark themes plus a theme editor, and 7 operating states. Every family also builds a stylised 3D model (glTF). The **skid composer** connects equipment with pipes and shows the same scene as a 2D mimic or a 3D layout. Exports: SVG, smart SVG, PNG, Ignition kit and icon repository, WinCC Unified and Optix kits, `.glb`, and scene kits. Sharing works through links, files, packs and a pull-request gallery.

## Quick start

```bash
pnpm install
pnpm dev          # builder at http://127.0.0.1:5173
pnpm check        # typecheck + tests + gallery validation + production build
```

Requires Node ≥ 22.12 and pnpm 10.

## Layout

One repository, one package:

| Path | What it is |
| --- | --- |
| `lib/` | The engine: types, geometry, styles, themes, SVG renderer, share codes, exporters |
| `lib/symbols/` | Procedural generators (pump, valve, motor, tank, conveyor) and their registry |
| `lib/spatial/` | 3D: mesh toolkit, glTF (.glb) writer, state metadata. See docs/SPATIAL.md |
| `app/` | The builder (React + Vite, fully static) |
| `gallery/` | Shared designs as small JSON recipes, added by pull request |
| `lib/element.ts` | The `<vt-symbol>` web component (built to `dist-lib/` by `pnpm build:lib`) |
| `examples/web/` | A plain HTML page driving a smart SVG |
| `examples/embed/` | `<vt-symbol>` demo page and an iframe-friendly `frame.html` |
| `docs/` | Objects, sharing, embedding, hosting, Ignition, roadmap, decisions |

## Embed on any web page

One script from GitHub Pages, then plain HTML. No build step, framework or account.

```html
<script src="https://grindstone-systems.github.io/visual-toolkit/lib/vt-symbol.iife.js"></script>
<vt-symbol generator="tank.process" params='{"label":"TK-301"}' state="running" level="0.64"></vt-symbol>
```

`recipe="z0.…"` takes a builder share code. Changing `state` or `level` updates the SVG in place, and host-page `--vt-*` custom properties re-theme it. For attributes, events, theming, CSP and Perspective notes, see [docs/EMBED.md](docs/EMBED.md). There's a live demo at `…/lib/demo.html`.

## How it works, in one paragraph

A **generator** turns parameters into a **Visual Toolkit object**: geometry split into named parts (body, rotor, indicator…), plus ports and states. A **style** decides how each kind of part is painted, and a **theme** supplies the colours. The **renderer** combines them into SVG. Generators always produce the same output from the same inputs, so a design is fully described by a tiny **recipe**. Share links and the gallery are built on that. See [docs/OBJECTS.md](docs/OBJECTS.md).

## Principles

- **Extend Ignition, don't replace it.** Visual Toolkit makes assets, and the host platform makes them operational.
- **Deterministic, not generated art.** Future AI features pick parameters; they never invent geometry.
- **Colour is never the only cue.** Every abnormal state has its own badge shape.
- **$0 to run.** A static site with no backend. See [docs/HOSTING.md](docs/HOSTING.md).

## License

The code is Apache-2.0. Gallery entries are CC0-1.0. SVGs you export are yours.

For vulnerabilities and industrial-use limits, see [Security and industrial use](SECURITY.md). Visual Toolkit creates assets; a plant's authorized team must validate any host integration before production use.
