# Updating the OIC listing

Visual Toolkit is listed at https://openindustrialcollective.org/projects/visual-toolkit. The listing is **owner-authored**: the profile lives in this repo (`.oic/`), and OIC publishes a reviewed, pinned snapshot of it. Every update goes through the website's review; nothing publishes automatically.

| Piece | Where |
| --- | --- |
| Profile | `.oic/project.yaml` (schema `oic/project/v2`) |
| Long description | `.oic/overview.md` (≤ 20 KB) |
| Media | `.oic/media/*.jpg`, `logo.png` (≤ 8 images; PNG/JPEG/WebP ≤ 2 MB and ≤ 12 MP each) |
| Registration | `open-industrial-collective/website`: `content/sources.json` → `visual-toolkit` (repo ID 1395854797, `main`, controller 10232151) |
| Enrollment record | open-industrial-collective/website#14 |

## 1. Change the profile or media here

```bash
pnpm oic:media           # regenerate all six screenshots (starts Vite, drives your Chrome)
pnpm oic:media hero      # or only shots whose name matches
```

Edit `.oic/project.yaml` and `.oic/overview.md` as needed. Keep claims accurate:
- Label composed scenes as composed.
- Only claim the Ignition workflows that docs/IGNITION.md marks as verified (8.3.9). Keep the rest marked unverified.
- State any account or paid requirements.

Commit and push to `main`.

## 2. Get the update onto OIC

Either wait for the website's daily **Check registered project profiles** job, or trigger it now:

```bash
gh workflow run refresh.yml -R open-industrial-collective/website
```

It opens a `profile-update/visual-toolkit` PR that contains only the candidate, with the pinned commit and digest in its description. Merging that PR alone publishes nothing.

## 3. Approve and publish (reviewer)

In a checkout of the website repo, on the `profile-update/visual-toolkit` branch:

```bash
cp content/candidates-for-review/visual-toolkit.json content/candidates/visual-toolkit.json
npm run profile -- approve visual-toolkit --digest <digest from the PR>
npm run check
git add content/ public/data/catalog.json public/images/projects/ src/catalog.generated.json
git commit -m "Update Visual Toolkit listing" && git push
```

Merge once `check` is green. Auto-merge is allowed on that repo. Vercel then deploys openindustrialcollective.org.

You can also skip the daily job by fetching directly: `npm run profile -- fetch visual-toolkit --path .oic/project.yaml`, then approve as above. That's how the first publication (#15) was done.

## Gotchas

- **Catalog count tests** derive their expectations from the catalog (`tests/catalog-counts.mjs`), so adding a listing no longer needs test edits.
- **Mobile tests** need Playwright WebKit (`npx playwright install webkit`). They aren't part of `npm run check`; CI runs them.
- **Commit identity:** use the b-mac-gs noreply email. Never commit with a personal work email in public repos.
