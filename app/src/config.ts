/**
 * Deployment configuration. Everything here is public and static — the
 * builder has no backend. See docs/HOSTING.md.
 */
export const CONFIG = {
  /** GitHub repository that hosts the community gallery (gallery/*.json). */
  galleryRepo: import.meta.env.VITE_GALLERY_REPO ?? "Grindstone-Systems/visual-toolkit",
  galleryBranch: import.meta.env.VITE_GALLERY_BRANCH ?? "main",
};
