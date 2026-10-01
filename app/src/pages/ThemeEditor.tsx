import { useMemo, useState } from "react";
import {
  FAMILIES,
  generate,
  getGenerator,
  getTheme,
  renderSvg,
  stateLabel,
  themeToCss,
  themeToDesignTokens,
  TOKENS,
  type StateName,
  type StyleId,
  type Theme,
  type TokenName,
} from "../../../lib/index.ts";
import { PROTECTED, type Design } from "../design.ts";
import { downloadFile } from "../download.ts";
import { STYLE_OPTIONS } from "../symbols/Builder.tsx";
import { PageHeader, Segmented } from "../ui/controls.tsx";
import { Icon } from "../ui/icons.tsx";

/**
 * Theme editor: brand the equipment look once and apply it to every symbol and
 * 3D model. State and alarm colours are protected — a brand can change how
 * equipment looks, never what "fault" looks like. Overrides live in the design
 * (so they travel in share links and recipes).
 */

const GROUPS: { label: string; hint: string; tokens: TokenName[] }[] = [
  { label: "Surfaces", hint: "Canvas behind symbols and panels", tokens: ["surface.canvas", "surface.panel"] },
  { label: "Text", hint: "Tag labels and captions", tokens: ["text.primary", "text.muted"] },
  {
    label: "Equipment",
    hint: "Bodies, drives, linework and bases",
    tokens: ["equipment.body", "equipment.body-strong", "equipment.secondary", "equipment.outline", "equipment.detail", "equipment.base"],
  },
  { label: "Process", hint: "Liquids and material handled", tokens: ["process.liquid", "process.material"] },
];

const NAMES: Partial<Record<TokenName, string>> = {
  "surface.canvas": "Canvas",
  "surface.panel": "Panel",
  "text.primary": "Primary text",
  "text.muted": "Muted text",
  "equipment.body": "Body",
  "equipment.body-strong": "Body (running / strong)",
  "equipment.secondary": "Secondary parts",
  "equipment.outline": "Outline",
  "equipment.detail": "Detail lines",
  "equipment.base": "Base / frame",
  "process.liquid": "Liquid",
  "process.material": "Material",
};

type Preset = { id: string; label: string; scheme: "light" | "dark"; tokens: Partial<Record<TokenName, string>> };
const PRESETS: Preset[] = [
  { id: "default-light", label: "Default light", scheme: "light", tokens: {} },
  { id: "default-dark", label: "Default dark", scheme: "dark", tokens: {} },
  {
    id: "steel",
    label: "Steel blue",
    scheme: "light",
    tokens: {
      "surface.canvas": "#eef2f4", "surface.panel": "#f8fafb", "equipment.body": "#d7e0e6", "equipment.body-strong": "#7f95a3",
      "equipment.secondary": "#c2ced6", "equipment.outline": "#2d3a42", "equipment.detail": "#5f7280", "equipment.base": "#aab7bf",
    },
  },
  {
    id: "sand",
    label: "Warm sand",
    scheme: "light",
    tokens: {
      "surface.canvas": "#f5f0e7", "surface.panel": "#fbf8f2", "equipment.body": "#e6ddcf", "equipment.body-strong": "#9c8f7b",
      "equipment.secondary": "#d6cab6", "equipment.outline": "#3b342b", "equipment.detail": "#6d6354", "equipment.base": "#bfb29c",
    },
  },
  {
    id: "control-room",
    label: "Control room",
    scheme: "dark",
    tokens: {
      "surface.canvas": "#0f1418", "surface.panel": "#161d22", "text.primary": "#e3eaef", "text.muted": "#93a4b0",
      "equipment.body": "#2c3a44", "equipment.body-strong": "#5d7483", "equipment.secondary": "#25313a",
      "equipment.outline": "#b8c7d1", "equipment.detail": "#7e93a1", "equipment.base": "#1f282e",
    },
  },
];

const PREVIEW_STATES: StateName[] = ["normal", "running", "warning", "fault"];

import { contrastRatio as contrast } from "../../../lib/index.ts";
export { contrast };

export function ThemeEditor({ design, setDesign, openBuilder }: { design: Design; setDesign: React.Dispatch<React.SetStateAction<Design>>; openBuilder: () => void }) {
  const base = getTheme(design.theme);
  const tokens = { ...base.tokens, ...design.tokens } as Record<TokenName, string>;
  const [style, setStyle] = useState<StyleId>(design.style);
  const custom: Theme = { id: design.theme, name: "Custom", scheme: base.scheme, tokens };

  const setToken = (t: TokenName, v: string) =>
    setDesign((d) => {
      const next = { ...d.tokens };
      if (v.toLowerCase() === getTheme(d.theme).tokens[t].toLowerCase()) delete next[t];
      else next[t] = v.toLowerCase();
      return { ...d, tokens: next };
    });

  const checks = useMemo(() => {
    const t = tokens;
    const rows: { label: string; a: TokenName; b: TokenName; min: number; why: string }[] = [
      { label: "Tag labels on the canvas", a: "text.primary", b: "surface.canvas", min: 4.5, why: "WCAG AA text" },
      { label: "Equipment outline on the canvas", a: "equipment.outline", b: "surface.canvas", min: 3, why: "shape edges (WCAG 1.4.11)" },
      { label: "Outline against the body", a: "equipment.outline", b: "equipment.body", min: 3, why: "part edges" },
      { label: "Fault colour on the body", a: "state.fault", b: "equipment.body", min: 3, why: "abnormal state must stand out" },
      { label: "Warning colour on the body", a: "state.warning", b: "equipment.body", min: 1.8, why: "amber is paired with a badge shape" },
      { label: "Running colour on the body", a: "state.running", b: "equipment.body", min: 2, why: "status hub" },
      { label: "Fault badge on the canvas", a: "state.fault", b: "surface.canvas", min: 3, why: "badge visibility" },
    ];
    return rows.map((r) => ({ ...r, ratio: contrast(t[r.a], t[r.b]) }));
  }, [tokens]);

  const families = FAMILIES.flatMap((f) => (f.generator && getGenerator(f.generator) ? [f] : []));
  const previews = useMemo(
    () =>
      families.map((f) => {
        const vo = generate(f.generator!, { ...design.params[f.generator!], label: "" });
        return {
          name: f.name,
          svgs: PREVIEW_STATES.map((s) =>
            renderSvg(vo, { style, theme: design.theme, tokens: design.tokens, state: s, idPrefix: `te-${f.family}-${s}`, embedRecipe: false }),
          ),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [style, design.theme, design.tokens, design.params],
  );
  const overrides = Object.keys(design.tokens).length;
  const failing = checks.filter((c) => c.ratio < c.min).length;

  return (
    <div className="page theme-editor">
      <PageHeader
        eyebrow="Themes"
        title="Theme editor"
        actions={
          <div className="page-actions">
            <button className="secondary" onClick={() => setDesign((d) => ({ ...d, tokens: {} }))} disabled={!overrides}>
              Reset
            </button>
            <button className="primary" onClick={openBuilder}>
              Use in builder <Icon name="arrow" />
            </button>
          </div>
        }
      >
        Brand the equipment look once. It applies to every symbol, sheet, smart SVG and 3D model, and travels in share links. State and alarm colours stay
        protected.
      </PageHeader>

      <div className="te-grid">
        <aside className="panel-card te-controls" aria-label="Theme tokens">
          <div className="te-row">
            <span className="te-label">Base</span>
            <Segmented
              value={design.theme}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(v) => setDesign((d) => ({ ...d, theme: v, tokens: {} }))}
            />
          </div>
          <div className="te-presets" role="group" aria-label="Presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="te-preset"
                onClick={() => setDesign((d) => ({ ...d, theme: p.scheme, tokens: { ...p.tokens } }))}
                title={`${p.label} (${p.scheme})`}
              >
                <i style={{ background: p.tokens["equipment.body"] ?? getTheme(p.scheme).tokens["equipment.body"], borderColor: p.tokens["equipment.outline"] ?? getTheme(p.scheme).tokens["equipment.outline"] }} />
                {p.label}
              </button>
            ))}
          </div>

          {GROUPS.map((g) => (
            <fieldset key={g.label} className="te-group">
              <legend>
                {g.label} <span>{g.hint}</span>
              </legend>
              {g.tokens.map((t) => (
                <label key={t} className="te-token" htmlFor={`tok-${t}`}>
                  <input id={`tok-${t}`} type="color" value={tokens[t]} onChange={(e) => setToken(t, e.target.value)} />
                  <span>{NAMES[t] ?? t}</span>
                  <code>{tokens[t]}</code>
                  {design.tokens[t] && (
                    <button className="te-undo" onClick={() => setToken(t, base.tokens[t])} aria-label={`Reset ${NAMES[t]}`} title="Reset">
                      ×
                    </button>
                  )}
                </label>
              ))}
            </fieldset>
          ))}

          <fieldset className="te-group">
            <legend>
              States <span>protected, shape-coded</span>
            </legend>
            <div className="te-locked">
              {TOKENS.filter((t) => PROTECTED(t) && !t.startsWith("state.on-")).map((t) => (
                <span key={t} title={`${t} is protected`}>
                  <i style={{ background: tokens[t] }} />
                  {t.replace("state.", "")}
                </span>
              ))}
            </div>
          </fieldset>
        </aside>

        <div className="te-main">
          <section className="panel-card">
            <div className="te-preview-head">
              <h2 className="block-title">Preview</h2>
              <Segmented value={style} options={STYLE_OPTIONS.map((s) => ({ value: s.id, label: s.label }))} onChange={setStyle} />
            </div>
            <div className="te-preview" style={{ background: tokens["surface.canvas"] }}>
              <span />
              {PREVIEW_STATES.map((s) => (
                <span key={s} className="te-col" style={{ color: tokens["text.muted"] }}>
                  {stateLabel(s)}
                </span>
              ))}
              {previews.map((p) => (
                <div key={p.name} className="te-row-wrap">
                  <span className="te-rowlabel" style={{ color: tokens["text.muted"] }}>
                    {p.name}
                  </span>
                  {p.svgs.map((html, i) => (
                    <div key={i} className="te-cell" dangerouslySetInnerHTML={{ __html: html }} />
                  ))}
                </div>
              ))}
            </div>
          </section>

          <div className="te-bottom">
            <section className="panel-card">
              <h2 className="block-title">
                Checks {failing ? <span className="te-bad">{failing} to fix</span> : <span className="te-ok">all pass</span>}
              </h2>
              <ul className="te-checks">
                {checks.map((c) => (
                  <li key={c.label} className={c.ratio >= c.min ? "ok" : "bad"}>
                    <span className="te-swatch" style={{ background: tokens[c.b], color: tokens[c.a], borderColor: tokens[c.a] }}>
                      Aa
                    </span>
                    <span>
                      {c.label}
                      <small>
                        {c.why} · needs {c.min}:1
                      </small>
                    </span>
                    <b>{c.ratio.toFixed(2)}:1</b>
                  </li>
                ))}
                <li className="ok">
                  <span className="te-swatch">◆</span>
                  <span>
                    State never relies on colour alone<small>every abnormal state has its own badge shape</small>
                  </span>
                  <b>built in</b>
                </li>
              </ul>
            </section>
            <section className="panel-card">
              <h2 className="block-title">Export</h2>
              <p>{overrides ? `${overrides} token${overrides === 1 ? "" : "s"} changed from ${base.name}.` : `Using ${base.name} unchanged.`}</p>
              <div className="te-exports">
                <button onClick={() => downloadFile({ filename: "visual-toolkit-theme.css", mime: "text/css", content: themeToCss(custom) })}>
                  <Icon name="download" /> CSS variables
                </button>
                <button
                  onClick={() =>
                    downloadFile({
                      filename: "visual-toolkit-theme.tokens.json",
                      mime: "application/json",
                      content: JSON.stringify(themeToDesignTokens(custom), null, 2) + "\n",
                    })
                  }
                >
                  <Icon name="download" /> DTCG tokens
                </button>
                <button
                  onClick={() =>
                    downloadFile({
                      filename: "visual-toolkit-theme.recipe-tokens.json",
                      mime: "application/json",
                      content: JSON.stringify({ theme: design.theme, tokens: design.tokens }, null, 2) + "\n",
                    })
                  }
                >
                  <Icon name="download" /> Recipe tokens
                </button>
              </div>
              <p className="hint">Share links from the builder already carry this theme.</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
