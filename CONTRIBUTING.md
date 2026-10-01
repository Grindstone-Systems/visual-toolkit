# Contributing

Thank you for helping build Visual Toolkit.

- **Share a design:** use **Submit to gallery** in the builder. See `gallery/README.md`.
- **Add a generator:** create `lib/symbols/<name>.ts` that implements `Generator`, then register it in `GENERATORS`. Author the geometry once through a `Geo` frame so mirroring and rotation come for free. Use semantic region roles, declare ports and a badge anchor, and keep it deterministic. The generator test suite checks schema validity for every parameter combination.
- **Change a generator's output:** bump its `version` and keep the old version registered.
- **Artwork:** use generic equipment only. Don't use vendor trademarks, copyrighted artwork, or proprietary CAD without clear rights.
- **Safety:** don't imply safety certification or control-system correctness in names, states or docs.

Run `pnpm check` before opening a pull request.
