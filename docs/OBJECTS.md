# Visual Toolkit objects

The types are in `lib/types.ts`. JSON Schemas for tooling and CI are in `lib/schema/`.

```
recipe ──generator──▶ object ──renderer + style + theme + state──▶ SVG / PNG / kit
(~150 bytes)          (geometry + meaning)
```

| Thing | Schema tag | Contains |
| --- | --- | --- |
| **Recipe** | `vt.recipe/v0` | generator id + version, params, style, theme, state, optional colour overrides |
| **Object** | `vt.object/v0` | identity, viewBox, named regions, ports, badge/label anchors, supported states, animation hints, generator reference |

An object says what its parts **are** (`body`, `rotor`, `indicator`…), not what they look like. Styles paint part *roles*, and themes supply the colours. That separation is what lets one pump render in every style, theme and state.

## Vocabularies

- **States:** `normal · running · warning · fault · maintenance · disabled · comm-loss`
- **Part roles:** `body · body-secondary · nozzle · flange · base · detail · rotor · indicator · fill · product`
- **Colour tokens:** `surface.*`, `text.*`, `equipment.*`, `state.*`

## Built-in generators

| Id | Family | Notable params |
| --- | --- | --- |
| `pump.centrifugal` | pump | discharge, suction side, driver, baseplate |
| `valve.two-way` | valve | body, actuator, orientation, flanges |
| `motor.induction` | motor | view, frame size, mounting, shaft side |
| `tank.process` | tank | orientation, bottom head, level, agitator |
| `conveyor.belt` | conveyor | length, direction, drive, product |
| `exchanger.shell-tube` | exchanger | orientation, front head (bonnet / channel), tube passes (1 / 2 / 4), supports |
| `blower.centrifugal` | blower | discharge (top / bottom horizontal), rotation, drive (direct / belt / bare shaft) |
| `compressor.air` | compressor | package (enclosed / skid), cooling (air / water), cooler side |
| `mixer.static` | mixer | elements, orientation, dosing injection, supports, line size and ends |
| `instrument.transmitter` | instrument | ISA function letters and loop number, mounting, symbol (field / panel / DCS / PLC), process tap |
| `pipe.fitting` | pipe | fitting (elbows, tee, reducer, spool), rotation, length, DN 50–150, flanged or butt-weld |

Every generator also takes a `detail` level and a tag `label`, and builds a matching 3D model (see `SPATIAL.md`).

## The one rule for generators

The same generator version with the same params must always produce the same object. If you change what a generator draws, **bump its version** and keep the old one registered. Otherwise old share links and gallery entries would silently change.

## SVG output

- Regions become `<g id="{prefix}-{region}" class="vt-region vt-role--{role}" data-region="{region}">`, so the semantic structure survives export.
- The root carries `data-vt-object`, `data-vt-generator`, `data-vt-style` and `data-vt-state`.
- `<metadata data-vt="recipe">` embeds the recipe, so any exported SVG can be reopened in the builder.

There are two modes:

- **Resolved** (default) uses literal colours for one state. It works everywhere: `<img>`, Ignition, Figma, Inkscape.
- **Smart** embeds all states, switched by the root `data-vt-state` attribute. Colours are `var(--vt-*, fallback)` so a host page can re-theme it. Level-driven regions (tank contents) follow `--vt-level` (0–1) with a smooth transition.

## Text inside symbols

Instrument bubbles need tag letters and loop numbers as part of the geometry. They are drawn with a small single-stroke font (`lib/symbols/glyphs.ts`) as ordinary `detail` paths, so the SVG needs no font and restyles with the rest of the symbol. The optional tag `label` is still rendered as text under the symbol.

## Motion hints

| Hint | Used for |
| --- | --- |
| `rotate` | impellers, fans, pulleys |
| `turn` | side-view rotation illusion (agitator blades) |
| `flow` | seamless slide by one pattern pitch (belt chevrons, product, screw-compressor lobes) |

Motion plays only in states whose style allows it, and it respects `prefers-reduced-motion`.
