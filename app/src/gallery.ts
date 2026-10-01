import type { GalleryEntry, Recipe } from "../../lib/index.ts";
import { CONFIG } from "./config.ts";

/**
 * The gallery is a folder of JSON files in the repository. Entries arrive by
 * pull request, get validated in CI, and are bundled at build time — no
 * database, no accounts, no server. See docs/SHARING.md.
 */
const modules = import.meta.glob<GalleryEntry>("../../gallery/*.json", { eager: true, import: "default" });

export const GALLERY: (GalleryEntry & { slug: string })[] = Object.entries(modules)
  .map(([path, entry]) => ({ ...entry, slug: path.split("/").pop()!.replace(/\.json$/, "") }))
  .sort((a, b) => b.created.localeCompare(a.created) || a.title.localeCompare(b.title));

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "design";

/**
 * Build a github.com "new file" URL with the entry pre-filled. GitHub forks the
 * repo for the contributor and opens a pull request — review is moderation.
 */
export function gallerySubmitUrl(recipe: Recipe, title: string, description: string): string {
  const entry: GalleryEntry = {
    title: title.trim() || "Untitled",
    author: "your-github-username",
    ...(description.trim() ? { description: description.trim() } : {}),
    license: "CC0-1.0",
    created: new Date().toISOString().slice(0, 10),
    recipe,
  };
  const q = new URLSearchParams({
    filename: `${slugify(title)}.json`,
    value: JSON.stringify(entry, null, 2) + "\n",
    message: `gallery: add ${entry.title}`,
    description: "Submitted from the Visual Toolkit builder. Replace `author` with your GitHub username before committing.",
  });
  return `https://github.com/${CONFIG.galleryRepo}/new/${CONFIG.galleryBranch}/gallery?${q}`;
}
