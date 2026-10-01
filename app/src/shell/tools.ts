import type { IconName } from "../ui/icons.tsx";

/**
 * The tool registry: every page the platform knows about, grouped the way the
 * sidebar shows them. Adding a tool is one entry here plus a page in App.tsx.
 * Statuses mirror docs/ROADMAP.md — don't mark something ready that isn't.
 */

export type PageId = "overview" | "symbols.builder" | "symbols.gallery" | "themes.editor" | "skids" | "faceplates.builder" | "spatial.models";

export type ToolStatus = "ready" | "preview" | "planned";

export interface ToolPage {
  id: PageId;
  label: string;
  /** Hash path without the leading "#/". */
  path: string;
  icon: IconName;
  status: ToolStatus;
  summary: string;
  /** Planned/preview pages: what the tool will do, and where it stands today. */
  details?: string[];
  progress?: string;
}

export interface ToolGroup {
  id: string;
  label: string;
  icon: IconName;
  pages: ToolPage[];
}

export const OVERVIEW: ToolPage = {
  id: "overview",
  label: "Overview",
  path: "",
  icon: "home",
  status: "ready",
  summary: "Every Visual Toolkit tool in one place.",
};

export const GROUPS: ToolGroup[] = [
  {
    id: "symbols",
    label: "Symbols",
    icon: "symbols",
    pages: [
      {
        id: "symbols.builder",
        label: "Builder",
        path: "symbols",
        icon: "builder",
        status: "ready",
        summary: "Configure equipment, preview operating states and export clean SVG, smart SVG or an Ignition kit.",
      },
      {
        id: "symbols.gallery",
        label: "Gallery",
        path: "symbols/gallery",
        icon: "gallery",
        status: "ready",
        summary: "Designs shared by the community as recipes. Open any of them and keep building.",
      },
    ],
  },
  {
    id: "themes",
    label: "Themes",
    icon: "themes",
    pages: [
      {
        id: "themes.editor",
        label: "Themes",
        path: "themes",
        icon: "themes",
        status: "ready",
        summary: "Brand the equipment look once; state and alarm colours stay protected. Export CSS and DTCG tokens.",
      },
    ],
  },
  {
    id: "skids",
    label: "Skids",
    icon: "skids",
    pages: [
      {
        id: "skids",
        label: "Skids",
        path: "skids",
        icon: "skids",
        status: "ready",
        summary: "Connect equipment with pipes into a skid, then view it in 2D or 3D and take it to Ignition.",
      },
    ],
  },
  {
    id: "faceplates",
    label: "Faceplates",
    icon: "faceplates",
    pages: [
      {
        id: "faceplates.builder",
        label: "Faceplates",
        path: "faceplates",
        icon: "faceplates",
        status: "planned",
        summary: "Equipment status and control panels built from the same states and themes.",
        details: [
          "Start from a symbol and get a matching faceplate layout.",
          "Uses the same seven operating states and theme tokens.",
        ],
        progress: "Not started. It follows Themes and Skids on the roadmap.",
      },
    ],
  },
  {
    id: "spatial",
    label: "Spatial",
    icon: "spatial",
    pages: [
      {
        id: "spatial.models",
        label: "3D models",
        path: "spatial",
        icon: "spatial",
        status: "preview",
        summary: "Stylised 3D models generated from the same parameters, exported as glTF with state metadata.",
        details: [
          "The same pump parameters produce a stylised 3D model.",
          "Exports a validated .glb with every operating state in its metadata.",
          "Previews with WebGPU in the browser; renderers switch state from the metadata.",
        ],
        progress: "Proof built for the centrifugal pump. Other families and Dimension Engine loading are next (docs/SPATIAL.md).",
      },
    ],
  },
];

export const ALL_PAGES: ToolPage[] = [OVERVIEW, ...GROUPS.flatMap((g) => g.pages)];

export const pageById = (id: PageId) => ALL_PAGES.find((p) => p.id === id)!;
export const groupOf = (id: PageId) => GROUPS.find((g) => g.pages.some((p) => p.id === id));

/* ------------------------------ routes ------------------------------ */

export interface Route {
  page: PageId;
  /** Share code for the symbols builder (#/d/<code>). */
  code?: string;
  /** Pack URL for the gallery (#/symbols/gallery?pack=<url>). */
  pack?: string;
  /** Scene share code for the skid composer (#/skids/s/<code>). */
  scene?: string;
}

export function parseHash(hash = location.hash): Route {
  const [path, query = ""] = hash.replace(/^#\/?/, "").split("?");
  const h = path!.replace(/\/$/, "");
  const pack = new URLSearchParams(query).get("pack") ?? undefined;
  if (h === "symbols/gallery" && pack) return { page: "symbols.gallery", pack };
  // Share links stay short and stable: #/d/<code> (docs/SHARING.md).
  const m = h.match(/^(?:symbols\/)?d\/([A-Za-z0-9._-]+)$/);
  if (m) return { page: "symbols.builder", code: m[1] };
  // #/mimics was the skid composer's first address; its share links keep working.
  const sc = h.match(/^(?:skids|mimics)\/s\/([A-Za-z0-9._-]+)$/);
  if (sc) return { page: "skids", scene: sc[1] };
  if (h === "mimics") return { page: "skids" };
  if (h === "gallery") return { page: "symbols.gallery" }; // links from before the platform shell
  return { page: ALL_PAGES.find((p) => p.path === h)?.id ?? "overview" };
}

export const hrefOf = (id: PageId) => `#/${pageById(id).path}`;
