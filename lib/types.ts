/**
 * Visual Toolkit object — v0 (draft).
 *
 * The canonical description of an industrial visual object:
 * identity + geometry + semantic regions + ports + states + theme token
 * references + optional animation hints + optional spatial payload + export
 * metadata. Renderers and exporters degrade this down to what each target
 * platform can consume. See docs/SPEC.md.
 */

export const OBJECT_SCHEMA = "vt.object/v0" as const;
export const RECIPE_SCHEMA = "vt.recipe/v0" as const;

/* ------------------------------------------------------------------ */
/* Vocabularies                                                        */
/* ------------------------------------------------------------------ */

/** Operational states every V1 symbol can preview. Order is display order. */
export const STATES = [
  "normal",
  "running",
  "warning",
  "fault",
  "maintenance",
  "disabled",
  "comm-loss",
] as const;
export type StateName = (typeof STATES)[number];

/**
 * Semantic region roles. Styles paint roles, never individual shapes, which
 * is what lets one geometry render coherently in every style/theme/state.
 */
export const REGION_ROLES = [
  "body", // primary casing / vessel
  "body-secondary", // driver, actuator, secondary assembly
  "nozzle", // process connections
  "flange", // connection flanges
  "base", // skid, feet, supports
  "detail", // non-structural linework (vanes, fins, seams) — stroke only
  "rotor", // moving element; target of rotation hints
  "indicator", // status lamp / hub that carries state colour
] as const;
export type RegionRole = (typeof REGION_ROLES)[number];

/** Semantic theme tokens. Symbols reference these, never literal colours. */
export const TOKENS = [
  "surface.canvas",
  "surface.panel",
  "text.primary",
  "text.muted",
  "equipment.body",
  "equipment.body-strong",
  "equipment.secondary",
  "equipment.outline",
  "equipment.detail",
  "equipment.base",
  "state.running",
  "state.stopped",
  "state.warning",
  "state.fault",
  "state.maintenance",
  "state.disabled",
  "state.comm-loss",
  "state.on-alarm",
  "state.on-warning",
] as const;
export type TokenName = (typeof TOKENS)[number];

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

export type Shape =
  | { type: "path"; d: string }
  | { type: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number };

export interface Region {
  /** Stable, unique id. Survives into exported SVG as the group id. */
  id: string;
  role: RegionRole;
  /** Human label, e.g. "Volute casing". */
  label?: string;
  /** "solid" = fill + outline, "line" = stroke only. */
  paint: "solid" | "line";
  shapes: Shape[];
}

export type PortKind = "inlet" | "outlet" | "bidirectional" | "signal" | "power";

export interface Port {
  id: string;
  kind: PortKind;
  /** Anchor point in viewBox coordinates. */
  x: number;
  y: number;
  /** Outward direction in degrees (0 = +x / right, 90 = +y / down). */
  direction: number;
  /** Nominal connection size in viewBox units, for piping/layout tools. */
  size?: number;
}

export type AnimationHint =
  | { id: string; type: "rotate"; region: string; origin: [number, number]; states: StateName[]; periodMs: number }
  | { id: string; type: "flow"; port: string; states: StateName[] }
  | { id: string; type: "pulse"; region: string; states: StateName[] };

export interface Identity {
  /** Equipment family, e.g. "pump". */
  family: string;
  /** Specific kind within the family, e.g. "centrifugal-pump". */
  kind: string;
  category: "process-equipment" | "valve" | "instrument" | "material-handling" | "electrical";
  name: string;
  tags?: string[];
}

/** Named anchor points renderers use for overlays (badges, labels). */
export interface Anchors {
  badge: [number, number];
  label?: [number, number];
}

export interface GeneratorRef {
  /** e.g. "pump.centrifugal" */
  id: string;
  /** Integer major version. Same id+version+params must produce identical output. */
  version: number;
  params: ParamValues;
}

/** Placeholder for the Spatial tier (glTF/GLB payload conventions). Not used in V1. */
export interface SpatialPayload {
  format: "gltf" | "glb";
  uri: string;
  regionMap?: Record<string, string>;
}

export interface VtObject {
  schema: typeof OBJECT_SCHEMA;
  id: string;
  identity: Identity;
  /** [minX, minY, width, height] */
  viewBox: [number, number, number, number];
  regions: Region[];
  ports: Port[];
  anchors: Anchors;
  states: StateName[];
  animations?: AnimationHint[];
  label?: { text: string };
  spatial?: SpatialPayload;
  generator: GeneratorRef;
}

/* ------------------------------------------------------------------ */
/* Generators & parameters                                             */
/* ------------------------------------------------------------------ */

export type ParamValue = string | number | boolean;
export type ParamValues = Record<string, ParamValue>;

export type ParamDef =
  | { key: string; label: string; type: "choice"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: "toggle"; default: boolean }
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; default: number }
  | { key: string; label: string; type: "text"; maxLength: number; default: string };

/**
 * A procedural symbol generator. Deterministic: identical params must always
 * yield an identical VtObject for a given version. Bump `version` for any
 * change that alters output, and keep old versions resolvable so share links
 * and gallery recipes never silently change.
 */
export interface Generator {
  id: string;
  version: number;
  family: string;
  name: string;
  description: string;
  params: ParamDef[];
  generate(params: ParamValues): VtObject;
}

/* ------------------------------------------------------------------ */
/* Recipe — the shareable unit                                         */
/* ------------------------------------------------------------------ */

export type StyleId = "high-performance" | "modern-flat" | "outline";
export type ThemeId = "light" | "dark";

/**
 * A recipe is everything needed to reproduce a visual exactly. Because
 * generators are deterministic, a recipe is tiny (a few hundred bytes), which
 * makes it cheap to put in a URL, a file, or a gallery pull request.
 */
export interface Recipe {
  schema: typeof RECIPE_SCHEMA;
  generator: string;
  version: number;
  params: ParamValues;
  style: StyleId;
  theme: ThemeId;
  state: StateName;
  /** Optional per-recipe token overrides (custom brand accents etc). */
  tokens?: Partial<Record<TokenName, string>>;
}

/** A gallery entry: a recipe plus attribution, stored as gallery/<slug>.json. */
export interface GalleryEntry {
  title: string;
  /** GitHub username of the contributor (display identifier only). */
  author: string;
  description?: string;
  license: "CC0-1.0";
  created: string;
  recipe: Recipe;
}

export { default as objectSchema } from "./schema/object.schema.json" with { type: "json" };
export { default as recipeSchema } from "./schema/recipe.schema.json" with { type: "json" };
