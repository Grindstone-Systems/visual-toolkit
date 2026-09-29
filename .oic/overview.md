Visual Toolkit creates industrial equipment graphics from parameters instead of from a fixed library. Choose a pump, valve, motor, tank or conveyor and shape it: discharge direction, driver, actuator, heads, length, level, detail. Every symbol follows the same visual language and has seven designed operating states.

## What you can make

- **2D symbols** in three styles (modern, high-performance, outline) and light or dark themes. Every abnormal state has a shape-coded badge, so status never depends on colour alone.
- **Smart SVGs.** One file holds every state. A host page switches it by setting `data-vt-state`, and a tank's level follows `--vt-level`. No runtime library is needed.
- **Stylised 3D models** from the same parameters, exported as standard glTF (`.glb`) with the same part names and states. The 3D view has cutaways (impeller, ball, agitator, tank contents), moving product, and Studio, Plant floor and Night environments.

## Exports

- Plain SVG and PNG
- Smart SVG
- An Ignition kit: one SVG per state, plus starter metadata and a guide
- `.vt.json` object files
- `.glb` 3D models

## Sharing

A design is a recipe of about 150 characters. The address bar is always a share link, and exported SVGs reopen in the builder. A pull-request gallery collects community designs.

## Where it fits

Visual Toolkit creates assets. It does not replace Ignition's Symbol Factory or Perspective Symbols, and it owns no tags, bindings or alarming. Ignition import workflows are documented but not yet validated on a gateway.

## Good to know

Everything runs in your browser as a static site, with no account and no server. The code is open source under Apache-2.0.
