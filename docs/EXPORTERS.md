# Platform exporters

Visual Toolkit exports visual assets. The HMI platform owns tags, alarms, events, security and safety behaviour. **None of the exports below has been validated on the target platform.** Each one follows the vendor documentation listed here, and the tables separate what the documentation shows from what we assume. Don't describe these exports as platform-validated until someone has tested them and recorded the results here.

All of them share these properties. They are deterministic, every value is XML-escaped, they use presentation attributes only (no `<style>`, no `var()`, no CSS animation, no `<metadata>`), and element ids equal the Visual Toolkit region ids. The code is in `lib/platforms.ts` and the tests are in `lib/platforms.test.ts`.

Ignition exports (icon repository, Drawing profile, theme CSS) are covered in [IGNITION.md](IGNITION.md).

## Siemens WinCC Unified — dynamic SVG

```ts
exportWinccUnifiedSvg(vo, { style, theme, state, widgetName? })  // <name>.svghmi
exportWinccUnifiedMap(vo, opts)                                  // <name>.wincc.json
exportWinccUnifiedKit(vo, opts)                                  // zip: both + README.txt
```

**Source:** Siemens application example **109782045**, "Using dynamic SVGs with SIMATIC WinCC", V1.0, 03/2021 ([article page](https://support.industry.siemens.com/cs/ww/en/view/109782045); the PDF we read is mirrored at [svghmi.pro](https://server.svghmi.pro/api/users/download/109782045_WinCC_and_SVG_DOC_en.pdf)). The example says it applies to WinCC "without regard to version" and that you should check the supported scope of your WinCC version.

The widget interface is:

- `State` (number): `0 normal · 1 running · 2 warning · 3 fault · 4 maintenance · 5 disabled · 6 comm-loss`. These are indices into `STATES`, exported as `WINCC_STATE_VALUES`.
- `Level` (number 0–100): only on symbols that have a level region, such as tanks.
- `Label` (string): the tag label.

Every region attribute that differs between states becomes `hmi-bind:<attr>="{{eq(ParamProps.State,n) ? 'a' : 'b'}}"`. Attributes that don't vary stay literal. Badges and the disabled hatch use `hmi-bind:display`. The level region uses a `translate(…) scale(1,…)` binding driven by a `hmi:localDef` clamped with `Converter.Bounds`.

| Item | Documented in 109782045 | Our assumption |
| --- | --- | --- |
| File ending `.svghmi`, UTF-8 only | ✅ §2.4.1 | |
| `<!DOCTYPE svg PUBLIC "-//SIEMENS//DTD SVG 1.0 TIA-HMI//EN" "…/svg18-hmi.dtd">` | ✅ | |
| Root `xmlns`, `xmlns:hmi`, `xmlns:hmi-bind`, `viewBox`, `preserveAspectRatio="none"`; the prefixes are fixed | ✅ §2.4.1–2.4.2 | |
| `<hmi:self type="widget" displayName name="extended.…" version>` + `<hmi:paramDef name type default>` | ✅ | |
| `<hmi:localDef … hmi-bind:value="{{Converter.Bounds(…)}}">` in `<defs>` | ✅ | |
| `hmi-bind:fill` / `stroke` / `transform` / `display`, `ParamProps.*`, `LocalProps.*` | ✅ §3.2–3.8 | |
| `eq()`, `or()`, `cond ? 'x' : 'y'` | ✅ §3.12 | |
| `translate(0,{{…}}) scale(1,{{…}})` in one bound transform | ✅ §3.7 shows translate + scale | |
| `<hmi:text hmi-bind:value="{{ParamProps.Label}}"/>` inside `<text>` | ✅ §3.10 | |
| No CSS styling, animation, script or foreignObject | ✅ §2.4.4 | |
| **Nested** ternaries (`a ? x : b ? y : z`) | | ⚠️ Only single ternaries are shown |
| String colour literals (`'#3dbd7d'`) as the result of `hmi-bind:fill` | | ⚠️ The examples bind `Converter.RGBA(ParamProps.<HmiColor>)` |
| `clipPath` (tank contents, conveyor product) | | ⚠️ The element table lists "circle-path"; we read it as clipPath |
| `pattern` with `patternTransform` (disabled hatch) | `pattern` is listed | ⚠️ `patternTransform` isn't mentioned |
| `dominant-baseline` on `<text>` | | ⚠️ |
| Using `viewBox` at all | ⚠️ A note says "Do not use the viewBox attribute with dynamic SVGs", yet every example uses one | We follow the examples |
| How to import the file in your TIA Portal version | ❌ Not covered in the example | Follow your version's docs |

Motion hints (rotate, flow, turn) are not exported, because SVGHMI supports no SVG or CSS animation. Bind your own rotation parameter if you need motion.

## Rockwell FactoryTalk Optix — Advanced SVG Image

```ts
exportOptixAdvancedSvg(vo, { style, theme, state })  // <name>-optix.svg (SVG Tiny 1.2)
exportOptixMap(vo, opts)                             // <name>-optix.json
exportOptixKit(vo, opts)                             // zip: both + .vt.json + README.txt
```

**Sources:**

- FactoryTalk Optix Help, [Add an Advanced SVG image (1.10)](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-10/contents-ditamap/using-the-software/graphic-and-layout-objects/add-an-advanced-svg-image.html)
- [Advanced SVG image (1.00)](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-00/contents-ditamap/developing-solutions/object-examples/advanced-svg-image.html)
- [Create an Advanced SVG Image object (1.2 tutorial)](https://www.rockwellautomation.com/en-us/docs/factorytalk-optix/1-2-0/contents-ditamap/creating-projects/graphic-objects/ui-tutorial/develop-an-icon-that-changes-color/create-an-advanced-svg-image-object.html)
- Rockwell's [NetLogic cheat sheet — Advanced SVG](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet/blob/main/pages/advanced-svg.md)

The SVG bakes one state. Each badge kind is present, and the inactive ones have `display="none"`. The map lists every element property that changes with state and gives its value for each state:

```json
{ "id": "status-hub", "property": "fill",
  "values": { "normal": "#2e3338", "running": "#c6c9c3", "fault": "#ff4a3a", … },
  "documented": true }
```

In Optix Studio, each entry corresponds to one **SVG Element Property** (ID, property, value). You drive the value from your status variable through a converter, as the Optix tutorial does with a conditional converter on an alarm variable.

| Item | Documented by Rockwell | Our assumption |
| --- | --- | --- |
| Image must be SVG Tiny 1.2 | ✅ | We emit `version="1.2" baseProfile="tiny"` |
| Fill/stroke exist as XML attributes (or inline CSS) | ✅ | |
| Colours are hexadecimal | ✅ | Every fill/stroke is `#rrggbb`, `none` or `url(#…)` |
| Elements are picked by `@id` (the drop-down lists the SVG ids) | ✅ | |
| Fill/stroke value set statically or by a dynamic link with a converter | ✅ | Map entries with `documented: true` |
| Non-conforming SVG still displays, but its properties can't be changed | ✅ | |
| `SetImageContent` (NetLogic) replaces the image buffer at runtime; the change is lost on reload | ✅ Cheat sheet | Suggested for runtime level |
| Setting fill/stroke on a `<g id>` cascades to its shapes | | ⚠️ |
| `display`, `stroke-width`, `stroke-dasharray`, `opacity` as element properties | ❌ Only fill/stroke are described | ⚠️ `documented: false` in the map |
| `clipPath` (tank contents, conveyor product) | ❌ Not in SVG Tiny 1.2 | ⚠️ Listed under `tinyDeviations` |
| Disabled hatch | | Omitted, because Tiny 1.2 has no `<pattern>`. The badge and outline colour still show the state. |

## Verification checklist

Record your results here with platform, version and date.

- [ ] WinCC Unified: the `.svghmi` imports, `State`/`Level`/`Label` appear as widget properties, and colours and badges switch.
- [ ] Optix: the SVG imports as an Advanced SVG Image, the ids appear in the ID drop-down, and fill/stroke entries switch with a converter.
- [ ] Optix: check whether `display` and group-level fill/stroke work.
