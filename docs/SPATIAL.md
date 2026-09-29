# Spatial (3D) models

A generator can also build a **stylised 3D model** from the same parameters as its 2D symbol. It exports as standard **glTF 2.0 binary (`.glb`)**, which three.js, Babylon, PlayCanvas, Blender and most other 3D tools open. Visual Toolkit metadata rides inside the file, in `extras`, so a renderer can switch operating state at runtime.

Status: **all eight families** (pump, valve, motor, tank, conveyor, heat exchanger, blower, compressor). Every configuration of every family passes the Khronos glTF validator with zero errors, faces outward and is byte-for-byte deterministic (`lib/spatial/spatial.test.ts`).

| Family | 3D highlights |
| --- | --- |
| Centrifugal pump | Spiral volute, bolted flanges, bearing frame, coupling, finned TEFC motor. Cutaway shows the impeller spinning |
| Process valve | Cast body, bonnet, pneumatic / motor / handwheel actuators. Cutaway shows the gate wedge or bored ball |
| Induction motor | Foot or flange mount, three frame sizes. Cutaway shows the rotor and winding end-turns |
| Process tank | Ellipsoidal or cone bottom, sight glass that follows the level, manway, agitator. Cutaway shows the liquid and the impeller |
| Belt conveyor | Procedural length, idlers, gearmotor, cleats and cartons or bulk material sliding along the belt |
| Shell-and-tube exchanger | Bolted girth flanges, bonnet or channel-and-cover head, flanged nozzles, saddles or lugs and legs. Cutaway shows the tube bundle, segmental baffles and pass partitions |
| Centrifugal blower | Filleted scroll housing (the 2D outline extruded), inlet bell with guard, direct, belt or bare-shaft drive. Cutaway shows the backward-curved wheel spinning |
| Air compressor | Enclosed package (panel, louvres, cooler fan, roof exhaust) or open skid (separator, twin-screw airend, motor, air or water cooler). Cutaway shows the screw rotors turning |

## What is shared with the 2D symbol

| Shared | How |
| --- | --- |
| Parameters | `generator.spatial(params)` takes the same params as `generator.generate(params)` |
| Part names | glTF node names match 2D region ids where the part exists in both (`casing`, `suction-nozzle`, `discharge-flange`, `status-hub`…) |
| Part roles | Each node's `extras.vt.role` (`body`, `nozzle`, `rotor`, `indicator`…) is the same vocabulary styles use in 2D |
| States | The same seven states, with colours from the same style and theme |
| Ports | Same ids and kinds, as 3D positions plus outward directions |

## File layout

- **Units** are metres, and **+Y is up**. The model sits on y = 0.
- **Nodes:** one per part, named by part id. Each node's `translation` is its **pivot**, so a rotor spins in place.
- **Materials:** one per role, named `vt-role-<role>`. They are baked with the colours of the state chosen at export, so a plain glTF viewer shows the right look with no Visual Toolkit code.
- **Animations:** standard glTF rotation clips (for example `impeller-spin`) that loop seamlessly.
- **`extras.vt`** (on the root) holds everything a renderer needs to switch state:

```jsonc
{
  "schema": "vt.spatial/v0",
  "units": "m", "up": "+Y",
  "object": { "family": "pump", "kind": "centrifugal-pump", … },
  "label": "P-101",
  "recipe": { … },                    // reproduces the model in the builder
  "state": "running",                 // the state the materials are baked for
  "states": {
    "fault": {
      "label": "Fault",
      "roles": { "body": { "color": "#dedcd3", "opacity": 1, "emissive": 0 },
                 "indicator": { "color": "#cc2a1c", "opacity": 1, "emissive": 0.85 }, … },
      "badge": "fault",               // show a fault badge near `badge`
      "animate": false
    },
    …                                 // all seven states
  },
  "animations": [{ "id": "impeller-spin", "node": "coupling", "axis": "x",
                   "periodMs": 700, "states": ["running"], "gltfAnimation": "impeller-spin" }],
  "ports": [{ "id": "suction", "kind": "inlet", "position": [-0.34, 0.42, 0], "direction": [-1, 0, 0] }, …],
  "badge": [-0.2, 0.92, 0]            // anchor for a floating state badge
}
```

## Beyond state: cutaway, levels and effects

These are all optional. A renderer that ignores them still shows a correct model.

| Metadata | Meaning | Reference behaviour |
| --- | --- | --- |
| `sectionPlane` `{ normal, offset }` | Cutaway plane. The normal points at the side that is removed | Clip nodes with `extras.vt.section`. Draw revealed back faces as a dark interior with an orange band at the cut edge |
| node `extras.vt.internal` | Shown only in cutaway (impeller, ball, rotor, tank contents) | Hide unless cutaway is on |
| `levels[]` `{ node, bottom, top, value }` | A node that follows a 0–1 level. Its pivot sits at `bottom` | `node.scale.y = level` (tank contents, sight-glass column) |
| `effects[]` `vibration` | Shake in listed states (for example warning) | Offset the model by `amplitude · sin(2π·f·t)` |
| animations `type: "slide"` | glTF translate/scale clips that loop seamlessly by one pitch; items grow in at the tail and shrink out at the head | Play like any clip |
| animations `reverse` | Spin the negative way round the axis (conveyor pulleys running right) | Already baked into the clip |

The builder's 3D view has **Cutaway**, a **Level** slider and three environments: **Studio** (a shadow-catcher floor on the page colour), **Plant floor** (tiled concrete, warm key light) and **Night** (dark, cyan rim light, glowing grid).

## Switching state at runtime (any renderer)

1. Read `extras.vt.states[newState]`.
2. For each material `vt-role-<role>`:
   - set its base colour to `roles[role].color` (sRGB hex; convert to linear if your engine expects that),
   - set opacity to `opacity`,
   - set emissive to the same colour × `emissive`.
3. Play each clip in `animations` whose `states` include the new state and where that state has `animate: true`. Pause the rest.
4. If `badge` is set, show that state's badge at the `badge` anchor. The builder uses the same badge shapes as the 2D symbol.

`app/src/Spatial3D.tsx` is the reference implementation, in three.js with a WebGPU renderer that falls back to WebGL 2.

## Dimension Engine: what to add

Dimension Engine's Spatial Scene currently loads Gaussian-splat captures (a `gsplat` PlayCanvas asset). PlayCanvas can already load glTF, so the additions are small:

1. **Load glTF assets in a scene.** Accept `.glb` entries alongside (or instead of) a splat, each with an id, URL, position, rotation and scale. In PlayCanvas this is a `container` asset instantiated as a render entity.
2. **Read `extras.vt`.** Parse the GLB's JSON chunk (12-byte header, then the JSON chunk; `readGlbJson` in `lib/spatial/gltf.ts` is about ten lines) to get `states`, `animations`, `ports` and `badge`.
3. **Bind state to telemetry.** Per placed model, add a state signal. Map the tag value to one of the seven state names, then apply the four steps above. Treat stale or bad-quality data as `comm-loss`, which matches Dimension Engine's existing freshness handling.
4. **Selection.** Raise the existing `onEquipmentSelected` event when a model is clicked, passing the model id and part id (the node name).
5. **Levels:** bind a tag to each `levels[]` entry and scale that node on Y. This mirrors the 2D `--vt-level`.
6. **Cutaway (optional):** PlayCanvas can clip with a custom shader chunk or a clipping plane uniform. Toggle it per model.

Verify the exact PlayCanvas 2.x calls (container instantiation, material updates, anim component) against its docs when implementing. This document defines the file contract, not Dimension Engine's internals.

**Proof exit test:** change the pump's discharge in the builder, export the `.glb`, place it in a Dimension Engine Spatial Scene, and switch the demo tag to fault. The model should show the same fault treatment as the 2D symbol: red status beacon, badge, spin stopped.
