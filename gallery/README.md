# Gallery

Community-shared Visual Toolkit designs. Each file is a **recipe**: the generator, its parameters, style, theme and state. Recipes are a few hundred bytes, and the builder regenerates each design exactly from its recipe.

## Submit a design

1. In the builder, choose **Share → Submit to gallery**. It opens a pre-filled GitHub "new file" page.
2. Replace `author` with your GitHub username, then propose the change. GitHub forks the repository for you and opens a pull request.
3. CI validates the entry (`pnpm gallery:check`). A maintainer reviews it and merges it.

Entries are published under **CC0-1.0**, so anyone may use the design in any plant or product without having to give attribution.

## Rules

- Generic equipment only. Do not use vendor trademarks, logos or copied manufacturer artwork.
- Titles and descriptions must be factual and short. Do not make safety or certification claims.
- Use one design per file, named `kebab-case-title.json`.
