# Sharing

## Share recipes, not pictures

A design is fully described by its recipe:

```json
{ "schema": "vt.recipe/v0", "generator": "pump.centrifugal", "version": 0,
  "params": { "discharge": "top", "inlet": "left", "driver": "motor", "base": true, "detail": "standard", "label": "P-101" },
  "style": "modern-flat", "theme": "light", "state": "running" }
```

Compressed, a recipe is about 150 characters, so it fits in a URL, a chat message or a small JSON file. **Nothing has to be stored on a server**, which is why sharing costs $0.

## What exists

| | How | Account needed |
| --- | --- | --- |
| **Share link** | The address bar is always a link to the current design (`…/#/d/z0.<code>`). **Copy share link** copies it. | No |
| **SVG round-trip** | Every exported SVG carries its recipe. Drop it back on the builder, or use **Open file…**, to keep editing. | No |
| **Gallery** | **Submit to gallery** opens a pre-filled GitHub pull request. CI validates the entry, a maintainer reviews it, and it appears in the Gallery tab after the next deploy. | To submit only |

The part after `#` in a link is never sent to the web server, so shared designs don't show up in hosting logs.

Gallery entries are CC0-1.0, so anyone can use them in any plant without having to give attribution. People without GitHub can send a share link, and a maintainer can add it for them with credit.

## Later, still $0

- **Packs:** a JSON file of recipes (and colour overrides) loaded from any URL, for team libraries hosted wherever a team already keeps files. Data only; new generators arrive only as reviewed code.
- **Embeds:** a `<vt-symbol recipe="…" state="running">` web component served from a free CDN.

Hosted features like short links, accounts, private libraries or comments would need a server and someone to run it. Build them only if people ask.

## Safety

Recipes from links, files or the gallery are untrusted. Params are sanitised to known values, label characters are whitelisted, all text is escaped, and colour overrides must be `#rrggbb`. A recipe can't carry markup or script.
