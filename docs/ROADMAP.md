# Roadmap

This tracks the internal vision plan against what exists.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 · Foundations | Object format, engine, reference symbols | ✅ Built |
| 1 · Symbols MVP | Builder; pump, motor, valve, tank, conveyor; styles; states; SVG export | ✅ Eleven families (adds heat exchanger, blower, compressor, static mixer, instrument, pipe fitting), 3 styles, 7 states, All-states sheet, Live mode, Describe (bring-your-own-key AI) |
| 2 · Ignition | Export guide/kit, icon repository, sample project | 🟡 Images, state sets, icon repository and Drawing verified on an 8.3.9 gateway (docs/IGNITION.md). Theme CSS, 8.1 and Designer import unverified. WinCC Unified + Optix exporters built, unverified (docs/EXPORTERS.md). ⏳ sample project |
| 3 · Themes | Token editor, JSON/CSS exports | ✅ Theme editor (brand tokens, protected alarm colours, WCAG checks), CSS/DTCG exports |
| 4 · Smart objects | Ports, fill regions, animation/state metadata, piping | ✅ Ports, rotation, turn, flow, live level, smart SVG, and the **skid composer** (Mimics → Piping & connections): place, connect, route, 2D mimic + 3D layout, scene links and a 3D scene kit |
| 5 · Spatial | glTF + WebGPU renderer | ✅ All eleven families in 3D; validated `.glb` with states, cutaway, levels, effects; WebGPU viewer with environments; composed 3D scenes with flowing pipes. 🟡 Dimension Engine loader on branch `feature/vt-gltf-assets` (browser dev build; no cutaway yet) |
| Sharing | Links, gallery, packs, embeds | ✅ Links, SVG round-trip, gallery, packs, `<vt-symbol>` embed, scene links. ⏳ npm publish |

## Next up

1. Dimension Engine: merge `feature/vt-gltf-assets`, add cutaway and scene-kit loading, then test in a gateway module.
2. Ignition sample project built from a scene kit (Perspective view with bound state sets).
3. Faceplates builder.
4. HMI review: a checklist pass over a mimic (contrast, state coding, density).
