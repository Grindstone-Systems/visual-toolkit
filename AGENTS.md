# Visual Toolkit — agent instructions

This is a Grindstone Systems project: one public repo with a single package. `lib/` is the engine and `app/` is the builder. The original vision plan is an internal document kept locally in `docs/sources/` (gitignored, never published). Status is in `docs/ROADMAP.md` and decisions are in `docs/DECISIONS.md`.

- Keep it simple. Don't split into more packages or reintroduce a separate standards layer without a reason the user accepts.
- **$0 hosting.** Static site on GitHub Pages, deployed by Actions on every push to `main`; no backend, paid services or new accounts. Sharing stays recipe-based (`docs/SHARING.md`). Use the `b-mac-gs` GitHub account, not `bwmcclai`.
- Extend Ignition, never replace it. Mark Ignition workflows *unverified* until someone tests them on a gateway.
- Generators are deterministic. Any output change bumps the generator version, and old versions stay registered.
- Don't fabricate community activity, submissions or validation results.
- Run `pnpm check` before calling work done.
