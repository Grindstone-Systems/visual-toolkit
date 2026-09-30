# Roadmap

This tracks the internal vision plan against what exists.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 · Foundations | Object format, engine, reference symbols | ✅ Built |
| 1 · Symbols MVP | Builder; pump, motor, valve, tank, conveyor; styles; states; SVG export | ✅ Eleven families (adds heat exchanger, blower, compressor, static mixer, instrument, pipe fitting), 3 styles, 7 states, All-states sheet, Live mode, Describe (bring-your-own-key AI) |
| 2 · Ignition | Export guide/kit, icon repository, sample project | 🟡 Images, state sets, icon repository and Drawing verified on an 8.3.9 gateway (docs/IGNITION.md). Sample project from a scene (Perspective view + memory tags), theme stylesheet and mono icons verified on 8.3.9 via the file system. 8.1, gateway zip import and Designer import unverified. WinCC Unified + Optix exporters built, unverified (docs/EXPORTERS.md) |
| 3 · Themes | Token editor, JSON/CSS exports | ✅ Theme editor (brand tokens, protected alarm colours, WCAG checks), CSS/DTCG exports |
| 4 · Smart objects | Ports, fill regions, animation/state metadata, piping | ✅ Ports, rotation, turn, flow, live level, smart SVG, and the **skid composer** (Mimics → Piping & connections): place, connect, route, 2D mimic + 3D layout, scene links, a 3D scene kit and an automated **HMI review** (shape coding, contrast, motion, tags, overlaps, open lines, pipe crossings) |
| 5 · Spatial | glTF + WebGPU renderer | ✅ All eleven families in 3D; validated `.glb` with states, cutaway, levels, effects; WebGPU viewer with environments; composed 3D scenes with flowing pipes and tag labels; exploded view; liquid ripple. 🟡 Dimension Engine loader on branch `feature/vt-gltf-assets` (browser dev build; no cutaway yet) |
| Sharing | Links, gallery, packs, embeds | ✅ Links, SVG round-trip, gallery, packs, `<vt-symbol>` embed, scene links. ⏳ npm publish |

## Next up

1. Close the remaining Ignition gaps: gateway zip import, Designer import (images, Drawing, tags), 8.1.
2. Dimension Engine: merge `feature/vt-gltf-assets`, add cutaway and scene-kit loading, then test in a gateway module.
3. Faceplates builder.
4. Decals (nameplates and tag plates baked into the 3D models).
