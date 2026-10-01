Visual Toolkit creates industrial equipment graphics from parameters instead of from a fixed library. Choose from eleven families (pump, valve, motor, tank, conveyor, heat exchanger, blower, compressor, static mixer, instrument and pipe fitting) and shape it: discharge direction, driver, actuator, heads, length, level, detail. Every symbol follows the same visual language and has seven designed operating states.

## What you can make

- **2D symbols** in three styles (modern, high-performance, outline) and light or dark themes. Every abnormal state has a shape-coded badge, so status never depends on colour alone.
- **Smart SVGs.** One file holds every state. A host page switches it by setting `data-vt-state`, and a tank's level follows `--vt-level`. No runtime library is needed.
- **Stylised 3D models** from the same parameters, exported as standard glTF (`.glb`) with the same part names and states. The 3D view has cutaways, an exploded view, moving product, rippling liquid, and Studio, Plant floor and Night environments.
- **Skids.** Place equipment, connect ports, and pipes route themselves. The same skid shows in 2D or in 3D with flowing pipes, and a built-in HMI review checks shape coding, contrast, motion, tags and layout.

## Exports

- Plain SVG and PNG
- Smart SVG
- An Ignition kit (one SVG per state, starter metadata and a guide), a Perspective icon repository, a Drawing-ready SVG and theme CSS
- Siemens WinCC Unified and Rockwell FactoryTalk Optix kits (not yet tested on those platforms)
- Skid exports: SVG, PNG, `.vt-scene.json`, a 3D scene kit and an **Ignition project**: a Perspective view whose equipment and pipes change state with demo memory tags
- `.vt.json` object files
- `.glb` 3D models

## Sharing

A design is a recipe of about 150 characters. The address bar is always a share link, and exported SVGs reopen in the builder. Scenes share the same way. Packs bundle designs, and a pull-request gallery collects community designs.

## Where it fits

Visual Toolkit creates assets. It does not replace Ignition's Symbol Factory or Perspective Symbols, and it owns no alarming. Wiring to real equipment stays in Ignition. The sample project's memory tags are only for the demo. On an Ignition 8.3.9 gateway, images, tag-driven state sets, the icon repository (colour and mono), the Drawing component, the theme stylesheet and the sample project (installed on the file system) were verified. The guide lists what failed and what is untested.

## Good to know

Everything runs in your browser as a static site, with no account and no server. The code is open source under Apache-2.0.
