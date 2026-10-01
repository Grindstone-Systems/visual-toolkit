# Hosting at $0

Everything runs in the visitor's browser: the builder, generators, exports, share links and the gallery view. Hosting is just serving a folder of static files, about 85 KB of compressed JavaScript plus fonts.

## The setup

| Piece | Where | Cost |
| --- | --- | --- |
| Code, gallery, issues | Public repo `Grindstone-Systems/visual-toolkit` | $0 |
| Builder website | GitHub Pages, deployed by `.github/workflows/deploy-pages.yml` on every push to `main` | $0 for public repos |
| Tests + gallery validation | GitHub Actions (`ci.yml`) on every pull request | $0 for public repos |
| Address | `https://grindstone-systems.github.io/visual-toolkit/`, or a custom subdomain via one DNS record | $0 |

Why the repo must be **public**: Grindstone's GitHub org is on the free plan. Pages on private repos needs a paid plan, and outside contributors can't open gallery pull requests against a private repo.

### One-time steps

1. Create the public repo and push.
2. In **Settings → Pages**, set **Source: GitHub Actions**.
3. Optional: protect `main` so pull requests need CI to pass and one review.
4. Optional: to use a custom domain, add a CNAME record and set it in the Pages settings, then set the repo variable `PAGES_BASE` to `/`.

## Where money could start

Only from choosing to add server features, not from traffic:

| Feature | $0 way to do it |
| --- | --- |
| AI (describe → parameters) | Users bring their own API key and the browser calls the provider directly. Or run a small model in the browser. |
| Short links, accounts, private libraries | Share links plus packs hosted wherever the team keeps files |
| Large 3D assets | Keep them small in the repo, or attach them to GitHub Releases |

GitHub Pages has soft limits of roughly 1 GB per site and ~100 GB/month of bandwidth. That is hundreds of thousands of visits at this app's size. Limits change, so check GitHub's docs if traffic ever gets large. `pnpm build` output can move to any other static host (Cloudflare Pages, Netlify…) unchanged.
