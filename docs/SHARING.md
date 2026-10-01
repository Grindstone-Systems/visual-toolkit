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
| **Embed** | `<vt-symbol recipe="z0.<code>" state="running">` on any web page, from one script served by GitHub Pages. See [EMBED.md](EMBED.md). | No |
| **Gallery** | **Submit to gallery** opens a pre-filled GitHub pull request. CI validates the entry, a maintainer reviews it, and it appears in the Gallery tab after the next deploy. | To submit only |

The part after `#` in a link is never sent to the web server, so shared designs don't show up in hosting logs.

Gallery entries are CC0-1.0, so anyone can use them in any plant without having to give attribution. People without GitHub can send a share link, and a maintainer can add it for them with credit.

## Later, still $0

- **Packs (built):** a `vt.pack/v0` JSON file of designs plus an optional team theme. Load one from any HTTPS URL that allows cross-origin reads (a GitHub raw link works) or from a file on the Gallery page. Share it as `#/symbols/gallery?pack=<url>`. Use **Add to my pack** in the builder to collect designs on your device and download them as a pack. Packs are data only: never code, with every recipe and token sanitised. There's a demo at `/packs/water-treatment.pack.json`.

Hosted features like short links, accounts, private libraries or comments would need a server and someone to run it. Build them only if people ask.

## Safety

Recipes from links, files or the gallery are untrusted. Params are sanitised to known values, label characters are whitelisted, all text is escaped, and colour overrides must be `#rrggbb`. A recipe can't carry markup or script.
