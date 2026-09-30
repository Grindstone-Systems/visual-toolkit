import { getStyle } from "../styles.ts";
import { contrastRatio, getTheme, type TokenSet } from "../themes.ts";
import type { StateName, StyleId, ThemeId, TokenName } from "../types.ts";
import { pipeRoutes, placeItem, type Scene } from "./scene.ts";

/**
 * HMI review: a deterministic checklist over a scene, inspired by common
 * high-performance HMI guidance (ISA-101 style): colour reserved for abnormal
 * states, state never shown by colour alone, restrained motion, legible
 * contrast, unique tags and a tidy layout. It's a design aid, not a
 * compliance check.
 */

export type ReviewLevel = "pass" | "warn" | "info";

export interface ReviewFinding {
  id: string;
  level: ReviewLevel;
  title: string;
  detail: string;
  /** Items the finding is about, for highlighting. */
  items?: string[];
}

export interface ReviewOptions {
  style: StyleId;
  theme: ThemeId;
  tokens?: Partial<TokenSet>;
}

const ABNORMAL: StateName[] = ["warning", "fault", "maintenance", "disabled", "comm-loss"];
const STATE_TOKEN: Partial<Record<StateName, TokenName>> = {
  warning: "state.warning",
  fault: "state.fault",
  maintenance: "state.maintenance",
  "comm-loss": "state.comm-loss",
};
/** Non-text graphics need 3:1 against their background (WCAG 1.4.11). */
const GRAPHIC_CONTRAST = 3;
/** More than this many moving items at once starts to compete for attention. */
const MAX_MOVING = 4;

export function reviewScene(scene: Scene, opts: ReviewOptions): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  const tokens = { ...getTheme(opts.theme).tokens, ...opts.tokens } as Record<TokenName, string>;
  const style = getStyle(opts.style);
  const placed = scene.items.map(placeItem);
  const tagOf = (id: string) => String(scene.items.find((i) => i.id === id)?.params.label || id);

  if (!scene.items.length) return [{ id: "empty", level: "info", title: "Nothing to review yet", detail: "Add equipment to the scene." }];

  // 1. Colour is reserved for abnormal conditions.
  out.push(
    opts.style === "high-performance"
      ? { id: "style", level: "pass", title: "High-performance style", detail: "Normal equipment is grey, so colour only appears when something needs attention." }
      : {
          id: "style",
          level: "info",
          title: `${style.name} style`,
          detail: "Fine for overviews and documentation. For operator screens, the high-performance style keeps colour for abnormal states only.",
        },
  );

  // 2. Every abnormal state is shape-coded, not colour-only.
  const used = [...new Set(scene.items.map((i) => i.state))].filter((s) => ABNORMAL.includes(s));
  const noShape = used.filter((s) => !style.states[s]?.badge && !style.states[s]?.hatch);
  out.push(
    noShape.length
      ? { id: "shape-coding", level: "warn", title: "State shown by colour alone", detail: `${noShape.join(", ")} has no badge or hatch in this style.` }
      : {
          id: "shape-coding",
          level: "pass",
          title: "States are shape-coded",
          detail: used.length ? `${used.length} abnormal state${used.length > 1 ? "s" : ""} in use, each with its own badge shape.` : "Every abnormal state carries a badge shape as well as a colour.",
        },
  );

  // 3. State colours stand out from the canvas. A pale fill can still work
  //    when the badge's glyph carries the contrast (e.g. dark "!" on amber).
  const rows = (Object.entries(STATE_TOKEN) as [StateName, TokenName][]).map(([s, t]) => {
    const glyph = tokens[s === "warning" ? "state.on-warning" : "state.on-alarm"];
    return { s, ratio: contrastRatio(tokens[t], tokens["surface.canvas"]), glyph: contrastRatio(glyph, tokens[t]) };
  });
  const weak = rows.filter((r) => r.ratio < GRAPHIC_CONTRAST && r.glyph < 4.5);
  const carried = rows.filter((r) => r.ratio < GRAPHIC_CONTRAST && r.glyph >= 4.5);
  out.push(
    weak.length
      ? {
          id: "contrast",
          level: "warn",
          title: "Low-contrast state colours",
          detail: `${weak.map((w) => `${w.s} ${w.ratio.toFixed(1)}:1`).join(", ")} against the canvas. Aim for ${GRAPHIC_CONTRAST}:1 or more.`,
        }
      : carried.length
        ? {
            id: "contrast",
            level: "info",
            title: "Badge glyphs carry some state contrast",
            detail: `${carried.map((w) => `${w.s[0]!.toUpperCase()}${w.s.slice(1)} is ${w.ratio.toFixed(1)}:1 on the canvas; its badge glyph is ${w.glyph.toFixed(1)}:1 on the fill`).join(". ")}. Readable, but don't rely on the fill colour alone.`,
          }
        : { id: "contrast", level: "pass", title: "State colours have contrast", detail: `Alarm colours are at least ${GRAPHIC_CONTRAST}:1 against the canvas.` },
  );

  // 4. Motion is restrained.
  const moving = scene.items.filter((i) => style.states[i.state]?.animate && placeItem(i).vo.animations?.length);
  out.push(
    moving.length > MAX_MOVING
      ? {
          id: "motion",
          level: "warn",
          title: `${moving.length} items animate at once`,
          detail: "Movement pulls the eye. Consider showing running by fill rather than motion, or turning animation off for this screen.",
          items: moving.map((i) => i.id),
        }
      : { id: "motion", level: "pass", title: "Motion is restrained", detail: moving.length ? `${moving.length} item${moving.length > 1 ? "s animate" : " animates"}.` : "Nothing animates." },
  );

  // 5. Alarm load.
  const alarms = scene.items.filter((i) => i.state === "fault" || i.state === "warning");
  if (alarms.length && alarms.length / scene.items.length > 0.3 && scene.items.length >= 4) {
    out.push({
      id: "alarm-load",
      level: "info",
      title: "Many items in alarm",
      detail: `${alarms.length} of ${scene.items.length} items show a warning or fault. If this is a demo, fine; on a live screen that many alarms hides the one that matters.`,
      items: alarms.map((i) => i.id),
    });
  }

  // 6. Tags are present and unique.
  const tags = new Map<string, string[]>();
  for (const it of scene.items) {
    const t = String(it.params.label ?? "").trim();
    if (!t) continue;
    tags.set(t, [...(tags.get(t) ?? []), it.id]);
  }
  const untagged = scene.items.filter((i) => !String(i.params.label ?? "").trim());
  const dupes = [...tags].filter(([, ids]) => ids.length > 1);
  if (untagged.length) out.push({ id: "untagged", level: "warn", title: "Items without a tag", detail: `${untagged.map((i) => i.id).join(", ")} ha${untagged.length > 1 ? "ve" : "s"} no label.`, items: untagged.map((i) => i.id) });
  if (dupes.length) out.push({ id: "duplicate-tags", level: "warn", title: "Duplicate tags", detail: dupes.map(([t]) => t).join(", "), items: dupes.flatMap(([, ids]) => ids) });
  if (!untagged.length && !dupes.length) out.push({ id: "tags", level: "pass", title: "Tags are unique", detail: "Every item has its own label." });

  // 7. Layout: no overlapping equipment.
  const overlaps: string[][] = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const gap = 2;
      if (a.item.x + a.w - gap > b.item.x && b.item.x + b.w - gap > a.item.x && a.item.y + a.h - gap > b.item.y && b.item.y + b.h - gap > a.item.y) overlaps.push([a.item.id, b.item.id]);
    }
  out.push(
    overlaps.length
      ? { id: "overlap", level: "warn", title: "Overlapping equipment", detail: overlaps.map(([a, b]) => `${tagOf(a!)} / ${tagOf(b!)}`).join(", "), items: overlaps.flat() }
      : { id: "overlap", level: "pass", title: "No overlaps", detail: "Equipment boxes don't collide." },
  );

  // 8. Process connections: open inlets and outlets.
  const connected = new Set(scene.pipes.flatMap((p) => [`${p.from.item}:${p.from.port}`, `${p.to.item}:${p.to.port}`]));
  const open = placed.flatMap((p) =>
    p.ports.filter((q) => (q.kind === "inlet" || q.kind === "outlet") && !connected.has(`${p.item.id}:${q.id}`)).map((q) => ({ item: p.item.id, port: q.id })),
  );
  if (scene.items.length > 1) {
    out.push(
      open.length
        ? {
            id: "open-ports",
            level: "info",
            title: `${open.length} open process connection${open.length > 1 ? "s" : ""}`,
            detail: `${open
              .slice(0, 6)
              .map((o) => `${tagOf(o.item)} ${o.port}`)
              .join(", ")}${open.length > 6 ? "…" : ""}. Fine at the edge of a screen; otherwise connect or note where the line goes.`,
            items: [...new Set(open.map((o) => o.item))],
          }
        : { id: "open-ports", level: "pass", title: "Process lines are connected", detail: "Every inlet and outlet has a pipe." },
    );
  }

  // 9. Pipes cross equipment they don't belong to.
  const through: string[] = [];
  for (const r of pipeRoutes(scene, placed)) {
    for (const p of placed) {
      if (p.item.id === r.pipe.from.item || p.item.id === r.pipe.to.item) continue;
      const hit = r.points.some((pt, k) => {
        const q = r.points[k + 1];
        if (!q) return false;
        const [x0, x1] = [Math.min(pt[0], q[0]), Math.max(pt[0], q[0])];
        const [y0, y1] = [Math.min(pt[1], q[1]), Math.max(pt[1], q[1])];
        return x1 > p.item.x + 4 && x0 < p.item.x + p.w - 4 && y1 > p.item.y + 4 && y0 < p.item.y + p.h - 4;
      });
      if (hit) through.push(`${r.pipe.id} crosses ${tagOf(p.item.id)}`);
    }
  }
  if (through.length) out.push({ id: "pipe-crossing", level: "warn", title: "Pipes run through equipment", detail: `${through.join(", ")}. Move the item or the line.` });

  return out;
}
