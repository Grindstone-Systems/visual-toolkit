# Using Visual Toolkit assets in Ignition

Visual Toolkit creates the asset, and Ignition makes it operational. Ignition owns tags, bindings, alarming, navigation, security and events. These exports are visual content only.

> **Validation status:** these workflows follow Ignition 8.3's documented support for SVG images, custom icon repositories and the Drawing component. The Phase 2 exit criterion is to verify each one on a real 8.3 gateway before it is advertised. Until then, treat anything marked *unverified* as a hypothesis.

| Level | Export | Workflow | Status |
| --- | --- | --- | --- |
| **A · Universal SVG** | **Download SVG** | Use as an Image source or a project image asset | Standard SVG; to verify on 8.3 |
| **A+ · State set** | **Ignition kit** → `states/*.svg` | Bind the Image `source` to an expression that maps your status tag to a state file | *Unverified* |
| **B · Icon pack** | Not built yet | Custom Perspective icon repository for icon-scale assets | Planned (Phase 2) |
| **C · Drawing-ready** | Semantic SVG (region ids and classes are preserved) | Import as a Drawing where appropriate | *Unverified* |
| **D · Starter metadata** | `*.ignition.json` in the kit | Suggested state names, region element ids and ports | Built (guidance only) |
| **E · Spatial** | Not built | Optional WebGPU module | Phase 5 |

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

## Smart SVG

`smart.svg` embeds every state and switches on the root `data-vt-state` attribute. That is proven in plain web pages (`examples/web`). Whether Perspective components can drive it is **unverified**, and it is a Phase 2 investigation item.
