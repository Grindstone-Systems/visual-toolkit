import type { RegionRole, StateName, StyleId, TokenName } from "./types.ts";

/** A paint references theme tokens, never literal colours. */
export interface Paint {
  fill?: TokenName | "none";
  stroke?: TokenName | "none";
  strokeWidth?: number;
  dash?: string;
  opacity?: number;
}

export type BadgeKind = "warning" | "fault" | "maintenance" | "disabled" | "comm-loss";

export interface StateTreatment {
  roles?: Partial<Record<RegionRole, Paint>>;
  /** Applied to every role after role overrides (e.g. dashed comm-loss outlines). */
  all?: Paint;
  /** Shape-coded badge so state never relies on colour alone. */
  badge?: BadgeKind;
  /** Diagonal hatch over solid body regions. */
  hatch?: boolean;
  /** Whether rotate/flow animation hints should play in this state. */
  animate?: boolean;
}

export interface Style {
  id: StyleId;
  name: string;
  description: string;
  base: Record<RegionRole, Paint>;
  states: Record<StateName, StateTreatment>;
}

const abnormal = {
  warning: { badge: "warning", roles: { indicator: { fill: "state.warning" } } },
  maintenance: { badge: "maintenance", roles: { indicator: { fill: "state.maintenance" } } },
  "comm-loss": {
    badge: "comm-loss",
    all: { dash: "3 2" },
    roles: { indicator: { fill: "state.comm-loss" } },
  },
} satisfies Partial<Record<StateName, StateTreatment>>;

/**
 * High-performance (ISA-101-inspired): muted greys, running shown by fill
 * weight rather than colour, colour reserved for abnormal conditions.
 */
const highPerformance: Style = {
  id: "high-performance",
  name: "High-performance",
  description: "Muted greys; colour only for abnormal states.",
  base: {
    body: { fill: "equipment.body", stroke: "equipment.outline", strokeWidth: 1.5 },
    "body-secondary": { fill: "equipment.secondary", stroke: "equipment.outline", strokeWidth: 1.5 },
    nozzle: { fill: "equipment.body", stroke: "equipment.outline", strokeWidth: 1.5 },
    flange: { fill: "equipment.secondary", stroke: "equipment.outline", strokeWidth: 1.5 },
    base: { fill: "equipment.base", stroke: "equipment.outline", strokeWidth: 1.5 },
    detail: { stroke: "equipment.detail", strokeWidth: 1 },
    rotor: { fill: "none", stroke: "equipment.detail", strokeWidth: 1.25 },
    indicator: { fill: "equipment.secondary", stroke: "equipment.outline", strokeWidth: 1.25 },
  },
  states: {
    normal: {},
    running: {
      animate: true,
      roles: {
        body: { fill: "equipment.body-strong" },
        "body-secondary": { fill: "equipment.body-strong" },
        detail: { stroke: "equipment.body" },
        rotor: { stroke: "equipment.body" },
        indicator: { fill: "equipment.outline" },
      },
    },
    ...abnormal,
    fault: {
      badge: "fault",
      roles: {
        body: { stroke: "state.fault", strokeWidth: 2.5 },
        indicator: { fill: "state.fault" },
      },
    },
    disabled: {
      badge: "disabled",
      hatch: true,
      all: { stroke: "state.disabled" },
      roles: { body: { fill: "equipment.body" }, indicator: { fill: "state.disabled" } },
    },
  },
};

/** Modern flat: soft fills, fine outlines, a coloured status hub. */
const modernFlat: Style = {
  id: "modern-flat",
  name: "Modern flat",
  description: "Soft fills, fine linework, coloured status hub.",
  base: {
    body: { fill: "equipment.body", stroke: "equipment.detail", strokeWidth: 1 },
    "body-secondary": { fill: "equipment.secondary", stroke: "equipment.detail", strokeWidth: 1 },
    nozzle: { fill: "equipment.secondary", stroke: "equipment.detail", strokeWidth: 1 },
    flange: { fill: "equipment.body-strong", stroke: "equipment.detail", strokeWidth: 1 },
    base: { fill: "equipment.body-strong", stroke: "equipment.detail", strokeWidth: 1 },
    detail: { stroke: "equipment.detail", strokeWidth: 0.9 },
    rotor: { fill: "none", stroke: "equipment.body-strong", strokeWidth: 1.5 },
    indicator: { fill: "state.stopped", stroke: "none" },
  },
  states: {
    normal: {},
    running: {
      animate: true,
      roles: { indicator: { fill: "state.running" }, rotor: { stroke: "state.running" } },
    },
    ...abnormal,
    fault: {
      badge: "fault",
      roles: { body: { stroke: "state.fault", strokeWidth: 2 }, indicator: { fill: "state.fault" } },
    },
    disabled: {
      badge: "disabled",
      hatch: true,
      all: { opacity: 0.6 },
      roles: { indicator: { fill: "state.disabled" } },
    },
  },
};

/** Outline: linework only, suited to diagrams and print. */
const outline: Style = {
  id: "outline",
  name: "Outline",
  description: "Linework only; diagram and print friendly.",
  base: {
    body: { fill: "none", stroke: "equipment.outline", strokeWidth: 1.75 },
    "body-secondary": { fill: "none", stroke: "equipment.outline", strokeWidth: 1.75 },
    nozzle: { fill: "none", stroke: "equipment.outline", strokeWidth: 1.75 },
    flange: { fill: "none", stroke: "equipment.outline", strokeWidth: 1.75 },
    base: { fill: "none", stroke: "equipment.outline", strokeWidth: 1.75 },
    detail: { stroke: "equipment.detail", strokeWidth: 1 },
    rotor: { fill: "none", stroke: "equipment.outline", strokeWidth: 1.25 },
    indicator: { fill: "none", stroke: "equipment.outline", strokeWidth: 1.5 },
  },
  states: {
    normal: {},
    running: {
      animate: true,
      roles: { indicator: { fill: "state.running", stroke: "state.running" }, rotor: { stroke: "state.running" } },
    },
    ...abnormal,
    fault: {
      badge: "fault",
      roles: { body: { stroke: "state.fault", strokeWidth: 2.5 }, indicator: { fill: "state.fault", stroke: "state.fault" } },
    },
    disabled: {
      badge: "disabled",
      all: { stroke: "state.disabled" },
      hatch: true,
    },
  },
};

export const STYLES: Record<StyleId, Style> = {
  "high-performance": highPerformance,
  "modern-flat": modernFlat,
  outline,
};

export function getStyle(id: StyleId): Style {
  return STYLES[id];
}

/** Resolve the final paint for a region role in a given state. */
export function resolvePaint(style: Style, state: StateName, role: RegionRole, kind: "solid" | "line"): Paint {
  const t = style.states[state];
  const p: Paint = { ...style.base[role], ...t.roles?.[role], ...t.all };
  if (kind === "line") p.fill = "none";
  return p;
}
