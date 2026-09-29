import { recipeFor, stateLabel, type RenderOptions } from "../render.ts";
import { getStyle, resolvePaint } from "../styles.ts";
import { getTheme, type TokenSet } from "../themes.ts";
import { STATES, type Finish, type PaintId, type RegionRole, type SpatialModel, type StateName, type TokenName, type VtObject } from "../types.ts";
import { hexToLinear, writeGlb, type GltfMaterial } from "./gltf.ts";

export const SPATIAL_SCHEMA = "vt.spatial/v0" as const;

/** Physically based response per finish; colour always comes from the role. */
const FINISH: Record<Finish, { metallic: number; roughness: number }> = {
  paint: { metallic: 0.12, roughness: 0.42 },
  cast: { metallic: 0.3, roughness: 0.62 },
  steel: { metallic: 0.85, roughness: 0.3 },
  lens: { metallic: 0, roughness: 0.12 },
  rubber: { metallic: 0, roughness: 0.9 },
};

/**
 * Industrial paint colours for 3D (light theme, dark theme). The 2D palette is
 * deliberately pale for flat HMI screens; under real lighting that reads as
 * unpainted clay, so 3D equipment wears a proper coat instead.
 */
const PAINT: Record<Exclude<PaintId, "theme">, [string, string]> = {
  slate: ["#56707f", "#4b6473"],
  "machinery-green": ["#4f7c5e", "#46715a"],
  "signal-blue": ["#2f6190", "#2c5985"],
  grey: ["#8a9195", "#6c7478"],
  "safety-yellow": ["#d5a01c", "#c29019"],
  "fire-red": ["#a8392d", "#96332a"],
};
const FRAME: [string, string] = ["#474d51", "#33383c"];
const CAST: [string, string] = ["#7d8387", "#62686c"];

/** Material name contract: `vt-role-<role>` plus `--<finish>` for non-paint finishes. */
export const materialName = (role: RegionRole, finish: Finish = "paint") => `vt-role-${role}${finish === "paint" ? "" : `--${finish}`}`;

/** Colour a role should wear in a state, for 3D (fills win; outline style falls back to strokes). */
export interface RoleLook {
  color: string;
  opacity: number;
  /** Emissive strength (0–1). */
  emissive: number;
  /** Emissive colour when it differs from `color` (fault glow on the casing). */
  glow?: string;
}

export interface SpatialStateMap {
  roles: Partial<Record<RegionRole, RoleLook>>;
  badge?: string;
  animate: boolean;
}

export function spatialLooks(roles: RegionRole[], opts: Pick<RenderOptions, "style" | "theme" | "tokens" | "paint">): Record<StateName, SpatialStateMap> {
  const style = getStyle(opts.style);
  const tokens = { ...getTheme(opts.theme).tokens, ...opts.tokens } as TokenSet;
  const dark = getTheme(opts.theme).scheme === "dark" ? 1 : 0;
  const paint = opts.paint ?? "slate";
  const coat = paint === "theme" ? null : PAINT[paint][dark]!;
  const out = {} as Record<StateName, SpatialStateMap>;
  for (const s of STATES) {
    const map: SpatialStateMap = { roles: {}, animate: !!style.states[s].animate };
    const badge = style.states[s].badge;
    if (badge) map.badge = badge;
    for (const role of roles) {
      const paint = resolvePaint(style, s, role, role === "detail" || role === "rotor" ? "line" : "solid");
      const token = (paint.fill && paint.fill !== "none" ? paint.fill : paint.stroke && paint.stroke !== "none" ? paint.stroke : "equipment.body") as TokenName;
      let color = tokens[token];
      let emissive = role === "indicator" ? (s === "normal" || s === "disabled" ? 0.15 : 0.85) : 0;
      // Painted equipment keeps its coat in every state; state reads from the
      // beacon, badge, motion and (for faults) a red glow on the casing.
      if (coat && s !== "disabled") {
        if (role === "body" || role === "body-secondary" || role === "nozzle") color = coat;
        else if (role === "base") color = FRAME[dark]!;
        else if (role === "flange") color = CAST[dark]!;
      }
      if (s === "fault" && role === "body") emissive = 0.035;
      map.roles[role] = { color, opacity: paint.opacity ?? 1, emissive };
      if (s === "fault" && role === "body") map.roles[role]!.glow = tokens["state.fault"];
    }
    out[s] = map;
  }
  return out;
}

/**
 * Build a .glb whose materials are baked for the chosen state (so any glTF
 * viewer shows it correctly) and whose extras carry every state, so a
 * renderer such as Dimension Engine can switch state at runtime.
 */
export function spatialGlb(vo: VtObject, model: SpatialModel, opts: RenderOptions): Uint8Array {
  const roles = [...new Set(model.nodes.map((n) => n.role))];
  const looks = spatialLooks(roles, opts);
  const current = looks[opts.state];
  const keys = [...new Set(model.nodes.map((n) => materialName(n.role, n.finish)))];
  const materials: GltfMaterial[] = keys.map((name) => {
    const node = model.nodes.find((n) => materialName(n.role, n.finish) === name)!;
    const look = current.roles[node.role]!;
    const lin = hexToLinear(look.color);
    const glowLin = hexToLinear(look.glow ?? look.color);
    const fin = FINISH[node.finish ?? "paint"];
    return {
      name,
      color: lin,
      alpha: look.opacity,
      metallic: fin.metallic,
      roughness: fin.roughness,
      ...(look.emissive ? { emissive: glowLin.map((c) => Math.round(c * look.emissive * 1e4) / 1e4) as [number, number, number] } : {}),
    };
  });
  const nodeIndex = new Map(model.nodes.map((n, i) => [n.id, i]));

  return writeGlb({
    name: vo.label?.text || vo.identity.name,
    materials,
    nodes: model.nodes.map((n) => ({
      name: n.id,
      mesh: n.mesh,
      material: keys.indexOf(materialName(n.role, n.finish)),
      translation: n.translation,
      extras: { vt: { region: n.id, role: n.role, label: n.label, finish: n.finish ?? "paint" } },
    })),
    animations: model.animations.map((a) => ({
      name: a.id,
      node: nodeIndex.get(a.node)!,
      axis: a.axis === "x" ? [1, 0, 0] : a.axis === "y" ? [0, 1, 0] : [0, 0, 1],
      periodS: a.periodMs / 1000,
    })),
    extras: {
      vt: {
        schema: SPATIAL_SCHEMA,
        units: "m",
        up: "+Y",
        object: vo.identity,
        label: vo.label?.text ?? null,
        recipe: recipeFor(vo, opts),
        state: opts.state,
        paint: opts.paint ?? "slate",
        states: Object.fromEntries(
          STATES.filter((s) => vo.states.includes(s)).map((s) => [s, { label: stateLabel(s), ...looks[s] }]),
        ),
        animations: model.animations.map((a) => ({ id: a.id, node: a.node, axis: a.axis, periodMs: a.periodMs, states: a.states, gltfAnimation: a.id })),
        ports: model.ports,
        badge: model.badge,
      },
    },
  });
}
