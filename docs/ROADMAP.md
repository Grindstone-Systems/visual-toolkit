# Roadmap

This tracks the internal vision plan against what exists.

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 · Foundations | Object format, engine, reference symbols | ✅ Built. ⏳ Ignition proof on a real gateway |
| 1 · Symbols MVP | Builder; pump, motor, valve, tank, conveyor; styles; states; SVG export | ✅ All five families, 3 styles, 7 states, All-states sheet, Live mode |
| 2 · Ignition | Export guide/kit, icon repository, sample project | 🟡 Kit + metadata + guide; icon repository, Drawing profile, theme CSS (unverified). WinCC Unified + Optix exporters (unverified, docs/EXPORTERS.md). ⏳ gateway validation, sample |
| 3 · Themes | Token editor, JSON/CSS exports | 🟡 Light/Dark tokens + CSS/DTCG exporters. ⏳ editor UI |
| 4 · Smart objects | Ports, fill regions, animation/state metadata | 🟡 Ports, rotation, turn, flow, live level (`--vt-level`), smart SVG. ⏳ piping/connecting objects |
| 5 · Spatial | glTF + WebGPU renderer | ✅ All five families in 3D from the same params; validated `.glb` with states, cutaway, levels, effects; WebGPU viewer with environments. ⏳ Dimension Engine loading (docs/SPATIAL.md), skid composer |
| Sharing | Links, gallery, packs, embeds | ✅ Links, SVG round-trip, gallery, `<vt-symbol>` embed. ⏳ packs, npm publish |

## Next up

1. Publish: create the public repo and turn on Pages (docs/HOSTING.md).
2. Ignition proof: import the SVG and state set on an 8.3 gateway, and record the results in docs/IGNITION.md.
4. A visual QA pass (`pnpm render:examples` → `examples/out/contact-sheet.html`).
5. Theme editor (brand accents only, with alarm colours protected).
