import type { ParamDef, ParamValues } from "../types.ts";

/** Printable tag characters allowed in labels (keeps share codes safe to render). */
const LABEL_CHARS = /[^A-Za-z0-9 _.:/#+-]/g;

/**
 * Coerce arbitrary input (share codes, gallery files, URL state) into a valid
 * parameter set. Unknown keys are dropped and invalid values fall back to the
 * declared default, so a generator never sees malformed params.
 */
export function sanitizeParams(defs: readonly ParamDef[], raw: ParamValues | undefined): ParamValues {
  const out: ParamValues = {};
  for (const d of defs) {
    const v = raw?.[d.key];
    switch (d.type) {
      case "choice":
        out[d.key] = typeof v === "string" && d.options.some((o) => o.value === v) ? v : d.default;
        break;
      case "toggle":
        out[d.key] = typeof v === "boolean" ? v : d.default;
        break;
      case "number":
        out[d.key] =
          typeof v === "number" && Number.isFinite(v)
            ? Math.min(d.max, Math.max(d.min, Math.round(v / d.step) * d.step))
            : d.default;
        break;
      case "text":
        out[d.key] = typeof v === "string" ? v.replace(LABEL_CHARS, "").slice(0, d.maxLength) : d.default;
        break;
    }
  }
  return out;
}

export function defaultParams(defs: readonly ParamDef[]): ParamValues {
  return sanitizeParams(defs, {});
}

/** Reserve space under the geometry for an optional tag label. */
export function labelLayout(contentBottom: number, width: number, text: string) {
  const t = text.trim();
  if (!t) return { height: contentBottom, label: undefined, anchor: undefined };
  return {
    height: contentBottom + 14,
    label: { text: t },
    anchor: [width / 2, contentBottom + 7] as [number, number],
  };
}
