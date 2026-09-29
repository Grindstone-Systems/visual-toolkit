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
- **Part roles:** `body · body-secondary · nozzle · flange · base · detail · rotor · indicator`
- **Colour tokens:** `surface.*`, `text.*`, `equipment.*`, `state.*`

## The one rule for generators

The same generator version with the same params must always produce the same object. If you change what a generator draws, **bump its version** and keep the old one registered. Otherwise old share links and gallery entries would silently change.

## SVG output

- Regions become `<g id="{prefix}-{region}" class="vt-region vt-role--{role}" data-region="{region}">`, so the semantic structure survives export.
- The root carries `data-vt-object`, `data-vt-generator`, `data-vt-style` and `data-vt-state`.
- `<metadata data-vt="recipe">` embeds the recipe, so any exported SVG can be reopened in the builder.

There are two modes:

- **Resolved** (default) uses literal colours for one state. It works everywhere: `<img>`, Ignition, Figma, Inkscape.
- **Smart** embeds all states, switched by the root `data-vt-state` attribute. Colours are `var(--vt-*, fallback)` so a host page can re-theme it.
