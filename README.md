# Visual Toolkit

**Industrial symbols you configure, not redraw.** By Grindstone Systems.

Pick a piece of equipment and shape it. Preview its operating states, switch style and theme, then export clean SVG for Ignition, the web or any HMI that takes SVG. Everything runs in the browser, so there is no account and no server.

> Status: **Symbols MVP.** It has five procedural families (pump, valve, motor, tank, conveyor), 3 styles, Light/Dark themes and 7 operating states. Tanks have live fill levels, and conveyors show moving product. An **All states** sheet shows every style × state at once, and **Live** mode drives a single smart SVG the way an HMI would. Exports: SVG, smart SVG, PNG, an Ignition kit and `.vt.json`. Sharing works through links, files and a pull-request gallery.

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
| `examples/web/` | A plain HTML page driving a smart SVG |
| `docs/` | Objects, sharing, hosting, Ignition, roadmap, decisions |

## How it works, in one paragraph

A **generator** turns parameters into a **Visual Toolkit object**: geometry split into named parts (body, rotor, indicator…), plus ports and states. A **style** decides how each kind of part is painted, and a **theme** supplies the colours. The **renderer** combines them into SVG. Generators always produce the same output from the same inputs, so a design is fully described by a tiny **recipe**. Share links and the gallery are built on that. See [docs/OBJECTS.md](docs/OBJECTS.md).

## Principles

- **Extend Ignition, don't replace it.** Visual Toolkit makes assets, and the host platform makes them operational.
- **Deterministic, not generated art.** Future AI features pick parameters; they never invent geometry.
- **Colour is never the only cue.** Every abnormal state has its own badge shape.
- **$0 to run.** A static site with no backend. See [docs/HOSTING.md](docs/HOSTING.md).

## License

The code is Apache-2.0. Gallery entries are CC0-1.0. SVGs you export are yours.
