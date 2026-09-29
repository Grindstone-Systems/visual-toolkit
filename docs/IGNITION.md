# Using Visual Toolkit assets in Ignition

Visual Toolkit creates the asset, and Ignition makes it operational. Ignition owns tags, bindings, alarming, navigation, security and events. These exports are visual content only.

> **Validation status (2026-09-29):** levels A, A+, B and C were tested on a fresh **Ignition 8.3.9** gateway (Docker, standard edition trial, Perspective session in headless Chrome). Results are below, with what failed. Nothing has been tested on 8.1 or in the Designer GUI, and those items stay *unverified*.

| Level | Export (`lib/`) | Workflow | Status on 8.3.9 |
| --- | --- | --- | --- |
| **A · Universal SVG** | `exportSvg` (**Download SVG**) | Image `props.source`: gateway image, data URI or WebDev python resource | **Verified**, CSS animation runs. WebDev *mounted folders* fail (wrong MIME type) |
| **A+ · State set** | `exportIgnitionKit` → `states/*.svg` | Bind the Image `source` to an expression over a status tag | **Verified**, swaps live as the tag changes |
| **B · Icon repository** | `exportIconRepository`, `exportIconRepositoryKit` | 8.3 config-resource folder; reference icons as `<library>/<id>` | **Verified** (colour variant, 8.3 layout). 8.1 folder not read on a fresh 8.3; mono + `color` untested |
| **C · Drawing** | `exportPerspectiveDrawingSvg` | Drawing `props.elements`; bind `elements[n].fill.paint` | **Verified** through a script-converted `elements` array. Designer drag-and-drop *not tested*. Animation is lost |
| **D · Starter metadata** | `exportIgnitionMetadata` (`*.ignition.json` in the kit) | Suggested state names, region element ids and ports | Built (guidance only) |
| **Smart SVG** | `exportSmartSvg` | Expression rewrites `data-vt-state` inside a data URI | **Verified** (see below). Inline Frame and Markdown do not work |
| **E · Spatial** | `spatialGlb` | Dimension Engine module loads `vt.spatial/v0` models | Browser dev build only; not yet on a gateway |
| **Theme** | `exportPerspectiveThemeCss` | Paste `:root { --vt-* }` into the project's Advanced Stylesheet | Built. *Unverified* |

| State set bound to a tag | Icon repository | Drawing with a bound fill |
| --- | --- | --- |
| ![fault state in an Image](ignition-proof/02-states-1-fault.png) | ![vt/pump and vt/valve icons](ignition-proof/04-icons.png) | ![Drawing casing bound to fault](ignition-proof/05-drawing-1-fault.png) |

*Screenshots from the 8.3.9 test session. The grey casing colour in the Drawing test was picked by the tester, not by Visual Toolkit.*

## Getting SVGs onto the gateway (A)

Three ways worked; pick one.

1. **Gateway image management (no code).** Put the file at `data/config/resources/core/ignition/images/<Folder>/<file>.svg/<file>.svg`, with a `resource.json` beside it: `{"scope":"A","version":1,"restricted":false,"overridable":true,"files":["<file>.svg"],"attributes":{"width":156,"height":104,"format":"SVG","size":<bytes>}}`. Restart the gateway. Then use `props.source = "/system/images/<Folder>/<file>.svg"`. Uploading through the Designer's Image Management tool should produce the same resource, but that was not tested.
2. **Data URI.** `"data:image/svg+xml;base64,<b64>"`, or `"data:image/svg+xml;utf8," + encodeURIComponent(svg)`.
3. **WebDev python resource** returning `{"contentType": "image/svg+xml", ...}`.

**Don't** use a WebDev *mounted folder*: it serves SVG as `ignition-project/xml` with `nosniff`, so the Image silently shows nothing.

## State-set example (A+)

1. Export the **Ignition kit** and unzip it. `states/` holds one SVG per state.
2. Add the files as gateway images under `<Folder>/states/` (method 1 above).
3. On an Image component, bind `props.source` with an expression such as:

```
"/system/images/VisualToolkit/states/p-101-centrifugal-pump-high-performance-" +
  case({[default]Pumps/P101/Status}, 0, "normal", 1, "running", 2, "warning", 3, "fault",
       4, "maintenance", 5, "disabled", "comm-loss") + ".svg"
```

Tested with a memory tag written by `system.tag.writeBlocking`: running → fault → warning → comm-loss swapped live in one session, and an unmapped value fell through to comm-loss. If your tag already holds the state name, concatenate it directly. The mapping from tag values to states is yours to define. Visual Toolkit only suggests the state vocabulary.

## Smart SVG through an expression

`smart.svg` switches on the root `data-vt-state` attribute. A Perspective Image can't set that attribute, but an expression can rewrite it inside a data URI:

1. Put `encodeURIComponent(smartSvg)` in a custom property, for example `view.custom.smartEncoded`.
2. Bind `props.source`:

```
"data:image/svg+xml;utf8," + replace({view.custom.smartEncoded},
  "data-vt-state%3D%22running%22", "data-vt-state%3D%22" + {[default]Pumps/P101/State} + "%22")
```

The search text must match the state the file was exported with. What did **not** work: an Inline Frame shows only the default state, and Markdown (`escapeHtml=false`) strips `<style>` and shows `<title>`/`<metadata>` as text. As a plain static Image URL, smart.svg renders and animates its default state only.

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
README.txt   (install steps and verification status)
```

### Install (verified on 8.3.9)

1. **8.3:** copy the folder `ignition-8.3/<library>/` (with `config.json`, `<library>.svg` and `resource.json`) into `data/config/resources/core/com.inductiveautomation.perspective/icons/`, so each repository has its own sub-folder. Restart the gateway, or try **Scan File System** (a hot scan was not tested). The repository is then served at `/data/perspective/icons/<library>.svg`.
2. In a view, set an Icon's `props.path` to `<library>/<id>`, for example `vt/centrifugal-pump-fault`. Tested with `vt/pump` and `vt/valve`, which rendered in full colour.
3. **8.1** (*unverified*): copy `ignition-8.1/*.svg` into `data/modules/com.inductiveautomation.perspective/icons/`, then restart the Designer. On a **fresh 8.3** gateway this folder is not read: it returned 404, and the log said that migration failed because `icons.digest.json` was missing. It's only a one-time migration path on upgrade.

**Icon colour:** the Icon's `props.color` has no effect on the colour variant, because VT shapes carry explicit fills. Whether the mono (`currentColor`) variant follows `color` is still untested.

## Drawing (C)

The [Drawing component](https://www.docs.inductiveautomation.com/docs/8.3/appendix/components/perspective-components/perspective-display-palette/perspective-drawing) (`ia.shapes.svg`) holds its shapes in `props.elements`. `exportPerspectiveDrawingSvg` removes what a Drawing can't carry: `<style>` blocks, CSS animation, `var()`, `<metadata>`, `<title>`, `class` and `data-*`. Paint uses presentation attributes only, and element ids equal the region ids (`casing`, `impeller`, `status-hub` …).

**Tested on 8.3.9:** a script converted the VT pump SVG into `elements` in 23 shapes. Groups became `{type:"group", elements}`, paths kept `d`, rect, circle, line and text kept their geometry, and colours became `fill:{paint}` / `stroke:{paint, width}`. Region ids survived, and `aria-label` became `name`. Binding `props.elements[n].fill.paint` to a tag expression turned the casing red on fault.

**Not tested:** the Designer's drag-and-drop import. It's a GUI action, and the docs say ids get a prefix, so check the ids after importing. Any Drawing loses VT's animation, `<title>` and `<metadata>`.

## Theme stylesheet

`exportPerspectiveThemeCss(theme)` writes `:root { --vt-*: … }` plus optional `.psc-vt-state-<state>` helper classes that set `color`/`fill` from the state token. The Perspective [Styles](https://www.docs.inductiveautomation.com/docs/8.1/ignition-modules/perspective/styles) docs say that **Enable Advanced Stylesheet** creates a `stylesheet.css` that accepts ordinary CSS, and that style classes are injected with a `.psc-` prefix. Whether `:root` variables from that sheet reach every view and inline SVG is *unverified*.

## Other platforms

See [EXPORTERS.md](EXPORTERS.md) for Siemens WinCC Unified and Rockwell FactoryTalk Optix.
