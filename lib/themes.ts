import type { ThemeId, TokenName } from "./types.ts";

export type TokenSet = Record<TokenName, string>;

export interface Theme {
  id: ThemeId;
  name: string;
  scheme: "light" | "dark";
  tokens: TokenSet;
}

/**
 * Baseline themes. Equipment tokens are deliberately low-chroma so that
 * colour is reserved for operational meaning (high-performance HMI practice).
 * Brand accents must never be mapped onto state/alarm tokens automatically.
 */
export const lightTheme: Theme = {
  id: "light",
  name: "Light",
  scheme: "light",
  tokens: {
    "surface.canvas": "#f3f1e9",
    "surface.panel": "#faf9f5",
    "text.primary": "#272925",
    "text.muted": "#666961",
    "equipment.body": "#dedcd3",
    "equipment.body-strong": "#8b8e87",
    "equipment.secondary": "#c9c7bd",
    "equipment.outline": "#3a3d38",
    "equipment.detail": "#6b6e67",
    "equipment.base": "#b7b5aa",
    "state.running": "#2e8b57",
    "state.stopped": "#8b8e87",
    "state.warning": "#d6941a",
    "state.fault": "#cc2a1c",
    "state.maintenance": "#3669b3",
    "state.disabled": "#b9b8b0",
    "state.comm-loss": "#a23fa0",
    "state.on-alarm": "#ffffff",
    "state.on-warning": "#1c1c1a",
  },
};

export const darkTheme: Theme = {
  id: "dark",
  name: "Dark",
  scheme: "dark",
  tokens: {
    "surface.canvas": "#121518",
    "surface.panel": "#1a1e22",
    "text.primary": "#e7e8e3",
    "text.muted": "#9aa09a",
    "equipment.body": "#3a3f44",
    "equipment.body-strong": "#737a80",
    "equipment.secondary": "#2e3338",
    "equipment.outline": "#c6c9c3",
    "equipment.detail": "#8e959b",
    "equipment.base": "#292d31",
    "state.running": "#3dbd7d",
    "state.stopped": "#737a80",
    "state.warning": "#f2b233",
    "state.fault": "#ff4a3a",
    "state.maintenance": "#5b9bf0",
    "state.disabled": "#4a4f54",
    "state.comm-loss": "#d56fd2",
    "state.on-alarm": "#0e1013",
    "state.on-warning": "#1c1c1a",
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  "light": lightTheme,
  "dark": darkTheme,
};

export function getTheme(id: ThemeId): Theme {
  return THEMES[id];
}

/** Token name → CSS custom property name, e.g. state.running → --vt-state-running */
export function tokenVar(name: TokenName): string {
  return `--vt-${name.replace(/\./g, "-")}`;
}

/** Export a theme as CSS custom properties scoped to a selector. */
export function themeToCss(theme: Theme, selector = ":root"): string {
  const lines = Object.entries(theme.tokens).map(([k, v]) => `  ${tokenVar(k as TokenName)}: ${v};`);
  return `${selector} {\n${lines.join("\n")}\n}\n`;
}

/** Export a theme in W3C Design Tokens (DTCG) JSON shape. */
export function themeToDesignTokens(theme: Theme): Record<string, unknown> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [name, value] of Object.entries(theme.tokens)) {
    const [group, key] = name.split(".") as [string, string];
    (out[group] ??= {})[key] = { $type: "color", $value: value };
  }
  return { $description: `${theme.name} — Visual Toolkit`, ...out };
}
