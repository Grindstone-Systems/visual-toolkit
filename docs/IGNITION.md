# Using Visual Toolkit assets in Ignition

Visual Toolkit creates the asset, and Ignition makes it operational. Ignition owns tags, bindings, alarming, navigation, security and events. These exports are visual content only.

> **Validation status:** these workflows follow Ignition 8.1/8.3's documented support for SVG images, custom icon repositories, the Drawing component and the Advanced Stylesheet. The Phase 2 exit criterion is to verify each one on a real 8.3 gateway before it is advertised. Until then, treat anything marked *unverified* as a hypothesis.

| Level | Export (`lib/`) | Workflow | Status |
| --- | --- | --- | --- |
| **A · Universal SVG** | `exportSvg` (**Download SVG**) | Use as an Image source or a project image asset | Standard SVG; to verify on 8.3 |
| **A+ · State set** | `exportIgnitionKit` → `states/*.svg` | Bind the Image `source` to an expression that maps your status tag to a state file | *Unverified* |
| **B · Icon repository** | `exportIconRepository`, `exportIconRepositoryKit` | Install `<library>.svg` as a custom Perspective icon repository; reference icons as `<library>/<id>` | Built, follows the docs. *Unverified on a gateway* |
| **C · Drawing-ready** | `exportPerspectiveDrawingSvg` | Drag into a Drawing component; element ids equal region ids | Built. *Hypothesis to validate* |
| **D · Starter metadata** | `exportIgnitionMetadata` (`*.ignition.json` in the kit) | Suggested state names, region element ids and ports | Built (guidance only) |
| **E · Spatial** | Not built | Optional WebGPU module | Phase 5 |
| **Theme** | `exportPerspectiveThemeCss` | Paste `:root { --vt-* }` into the project's Advanced Stylesheet | Built. *Unverified* |

## State-set example (A+)

1. Export the **Ignition kit** and unzip it. `states/` holds one SVG per state.
2. Make the SVGs available to Perspective using your usual approach for image assets.
3. On an Image component, bind `props.source` with an expression such as:

```
"/path/to/assets/p-101-centrifugal-pump-high-performance-" +
  case({[default]Pumps/P101/Status}, 0, "normal", 1, "running", 2, "warning", 3, "fault",
       4, "maintenance", 5, "disabled", "comm-loss") + ".svg"
```

The mapping from your tag values to states is yours to define. Visual Toolkit only suggests the state vocabulary.

## Icon repository (B)

### What the Ignition manual says

From [Images and Icons in Perspective (8.1)](https://www.docs.inductiveautomation.com/docs/8.1/ignition-modules/perspective/working-with-perspective-components/images-and-icons-in-perspective) and [the 8.3 page](https://www.docs.inductiveautomation.com/docs/8.3/ignition-modules/perspective/working-with-perspective-components/images-and-icons-in-perspective):

- A repository is **one SVG file** named `<repository name>.svg`.
- The root is `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`. Each icon is a **child `<svg>`** with an `id` (the icon name) and a `viewBox` large enough to enclose the graphic. The documented form uses nested `<svg>` elements, not `<symbol>`.
- Icons are referenced as `repository/id`, for example `example/red-circle`.
- **8.1** location: `…/Ignition/data/modules/com.inductiveautomation.perspective/icons/<repository name>.svg`.
- **8.3** location: `…/Ignition/data/config/resources/core/com.inductiveautomation.perspective/icons/<repository name>.svg`. Put a `config.json` (`{"svgFileName": "example.svg"}`) and a `resource.json` (`scope "A"`, `version 1`, `restricted false`, `overridable true`, `files [config.json, example.svg]`, `attributes {}`) in the same directory.
- Restart the Designer to pick up new icons. On 8.3 you restart the Designer and Gateway, or you press **Scan File System** on the Gateway's Platform Overview page.
- Icon components take a `color` (the example sets `icon.color` to `#4747FF`). The manual's example shows one icon with no `fill`, which implies that unfilled shapes take the icon colour.

### What the exporter produces

`exportIconRepository(items, { library, style, theme, variant })` writes one `<library>.svg` in the documented form. It contains one child `<svg viewBox id>` per requested item: a whole family (`iconItemsForStates(vo)` gives all seven states) or several recipes (`iconItemsFromRecipes`). The default ids are `<kind>-<state>`, such as `centrifugal-pump-running`. Colliding ids get `-2`, `-3` and so on. Every id in the file is unique, because clip paths and patterns are namespaced as `<icon>--<name>`.

- `variant: "color"` produces resolved theme colours.
- `variant: "mono"` produces `currentColor` only, with `fill-opacity` steps so the form still reads in one colour. *Assumption:* the Perspective icon `color` reaches `currentColor`. If it doesn't, use the colour variant.

`exportIconRepositoryKit` zips both variants like this:

```
ignition-8.1/<library>.svg, <library>-mono.svg
ignition-8.3/<library>/{<library>.svg, config.json, resource.json}
ignition-8.3/<library>-mono/{…}
icons.json   (id → recipe, state, style, theme)
README.txt   (install steps, marked unverified)
```

### Install (unverified)

1. **8.1:** copy `ignition-8.1/*.svg` into `data/modules/com.inductiveautomation.perspective/icons/`, then restart the Designer.
2. **8.3:** copy the three files from `ignition-8.3/<library>/` into `data/config/resources/core/com.inductiveautomation.perspective/icons/`, as the manual describes. Then restart the Designer and Gateway, or use **Scan File System**. The documented example has one `config.json` per folder, so the docs don't cover installing both variants side by side. Putting each one in its own sub-folder (`icons/<library>/`) is an untested assumption.
3. In the Designer, set an icon path to `<library>/<id>`, for example `vt/centrifugal-pump-fault`.

## Drawing-friendly SVG (C) — hypothesis

The [Drawing component page](https://www.docs.inductiveautomation.com/docs/8.3/appendix/components/perspective-components/perspective-display-palette/perspective-drawing) says SVGs are imported by drag and drop into `props.elements`. It says element `id`s are automatically prefixed to avoid collisions, and that most attributes become camelCase. It also says "testing these attributes is recommended to avoid unexpected behavior." It does **not** list what the importer drops.

`exportPerspectiveDrawingSvg` therefore removes everything we suspect might not survive: `<style>` blocks, CSS animation, `var()`, `<metadata>`, `<title>`, `class` and `data-*`. Paint uses presentation attributes only. The tank level transform is flattened into rect geometry, while badges keep a single `translate`. Element ids equal the region ids (`casing`, `impeller`, `status-hub` …), plus `badge-<kind>`, `hatch` and `label` for overlays.

**To validate:** drag it into a Drawing, then check that every region appears as an element with its id and that fill and stroke are intact. Then try binding `elements[n].fill` to a state expression.

## Theme stylesheet

`exportPerspectiveThemeCss(theme)` writes `:root { --vt-*: … }` plus optional `.psc-vt-state-<state>` helper classes that set `color`/`fill` from the state token. The Perspective [Styles](https://www.docs.inductiveautomation.com/docs/8.1/ignition-modules/perspective/styles) docs say that **Enable Advanced Stylesheet** creates a `stylesheet.css` that accepts ordinary CSS, and that style classes are injected with a `.psc-` prefix. Whether `:root` variables from that sheet reach every view and inline SVG is *unverified*.

## Smart SVG

`smart.svg` embeds every state and switches on the root `data-vt-state` attribute. That works in plain web pages (`examples/web`). Whether Perspective components can drive it is **unverified**, and it is a Phase 2 investigation item.

## Other platforms

See [EXPORTERS.md](EXPORTERS.md) for Siemens WinCC Unified and Rockwell FactoryTalk Optix.
