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
  "fill", // process medium inside a vessel (liquid level)
  "product", // material being handled (boxes on a conveyor)
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
  "process.liquid",
  "process.material",
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
  /** Clip the region to this shape (e.g. liquid inside a vessel wall). */
  clip?: Shape;
  /**
   * Level-driven region: shapes are drawn at 100 % and scaled vertically
   * from `bottom`. `value` is 0–1. Smart SVGs expose it as --vt-level.
   */
  level?: { value: number; bottom: number };
}

export type PortKind = "inlet" | "outlet" | "bidirectional" | "signal" | "power" | "mechanical";

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
  /** Seamless slide by one pattern pitch (conveyor chevrons, product). */
  | { id: string; type: "flow"; region: string; vector: [number, number]; states: StateName[]; periodMs: number }
  /** Side-view rotation illusion (agitator blades): scaleX 1 → −1 → 1. */
  | { id: string; type: "turn"; region: string; origin: [number, number]; states: StateName[]; periodMs: number };

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
/* Spatial (3D) — same identity, part names and states as the 2D object */
/* ------------------------------------------------------------------ */

export type Vec3 = [number, number, number];

export interface Mesh {
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface SpatialNode {
  /** Matches the 2D region id where the part exists in both. */
  id: string;
  role: RegionRole;
  label: string;
  /** Vertices are relative to `translation`, which is the node's pivot. */
  mesh: Mesh;
  translation: Vec3;
  /** Surface finish; decides metalness/roughness. Colour still comes from the role. */
  finish?: Finish;
}

export type Finish = "paint" | "cast" | "steel" | "lens" | "rubber";

export interface SpatialPort {
  id: string;
  kind: PortKind;
  position: Vec3;
  direction: Vec3;
}

export interface SpatialAnimation {
  id: string;
  /** Node rotated about its pivot, along a local axis. */
  node: string;
  axis: "x" | "y" | "z";
  periodMs: number;
  states: StateName[];
}

/** Stylised 3D model in metres, +Y up, ready to become glTF. */
export interface SpatialModel {
  nodes: SpatialNode[];
  ports: SpatialPort[];
  animations: SpatialAnimation[];
  /** Where a renderer should float the state badge. */
  badge: Vec3;
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
  /** Optional stylised 3D model from the same params (the Spatial tier). */
  spatial?(params: ParamValues): SpatialModel;
}

/* ------------------------------------------------------------------ */
/* Recipe — the shareable unit                                         */
/* ------------------------------------------------------------------ */

export type StyleId = "high-performance" | "modern-flat" | "outline";
export type ThemeId = "light" | "dark";

/** Equipment paint for 3D models. "theme" uses the style's neutral colours. */
export const PAINTS = ["slate", "machinery-green", "signal-blue", "grey", "safety-yellow", "fire-red", "theme"] as const;
export type PaintId = (typeof PAINTS)[number];

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
  /** Paint for the 3D model (2D symbols stay on theme colours). */
  paint?: PaintId;
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
