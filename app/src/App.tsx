import { renderSvg, stateLabel } from "../../lib/index.ts";
import {
  exportIgnitionKit,
  exportSmartSvg,
  exportSvg,
  exportObject,
  zip,
} from "../../lib/index.ts";
import { STATES, type ParamDef, type ParamValue, type StateName, type StyleId, type ThemeId, type VtObject } from "../../lib/index.ts";
import { FAMILIES, getGenerator, generate } from "../../lib/index.ts";
import { getTheme, tokenVar } from "../../lib/index.ts";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  designFromCode,
  designFromFile,
  designLink,
  initialDesign,
  parseHash,
  toRecipe,
  applyRecipe,
  type Design,
} from "./design.ts";
import { downloadBlob, downloadFile, svgToPng } from "./download.ts";
import { GALLERY, gallerySubmitUrl } from "./gallery.ts";

const STYLE_OPTIONS: { id: StyleId; label: string; hint: string }[] = [
  { id: "modern-flat", label: "Modern", hint: "Soft fills, coloured status hub" },
  { id: "high-performance", label: "High-perf", hint: "Greys; colour only when abnormal" },
  { id: "outline", label: "Outline", hint: "Linework; diagrams and print" },
];

const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

const STATE_TOKEN: Record<StateName, Parameters<typeof tokenVar>[0]> = {
  normal: "state.stopped",
  running: "state.running",
  warning: "state.warning",
  fault: "state.fault",
  maintenance: "state.maintenance",
  disabled: "state.disabled",
  "comm-loss": "state.comm-loss",
};

/* ------------------------------------------------------------------ */

export function App() {
  const [design, setDesign] = useState<Design>(initialDesign);
  const [view, setView] = useState<"builder" | "gallery">("builder");
  const [toast, setToast] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as unknown as { t?: number }).t);
    (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Load from the URL (share links) and follow hash changes.
  useEffect(() => {
    const load = async () => {
      const route = parseHash();
      if (route.view === "gallery") return setView("gallery");
      setView("builder");
      if (route.code) {
        try {
          const d = await designFromCode(initialDesign(), route.code);
          setDesign(d);
        } catch (e) {
          notify(`Couldn't open that link: ${(e as Error).message}`);
        }
      }
      loadedRef.current = true;
    };
    void load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, [notify]);

  // Keep the URL in sync so the address bar is always a share link.
  useEffect(() => {
    if (!loadedRef.current || view !== "builder") return;
    const t = window.setTimeout(async () => {
      const link = await designLink(design);
      if (link !== location.href) history.replaceState(null, "", link);
    }, 250);
    return () => window.clearTimeout(t);
  }, [design, view]);

  const theme = getTheme(design.theme);

  // App chrome follows the symbol theme so Light/Dark is a whole-screen switch.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme.scheme;
    for (const [k, v] of Object.entries(theme.tokens)) root.style.setProperty(tokenVar(k as never), v);
  }, [theme]);

  const go = (v: "builder" | "gallery") => {
    setView(v);
    if (v === "gallery") history.pushState(null, "", "#/gallery");
    else void designLink(design).then((l) => history.pushState(null, "", l));
  };

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#/" onClick={(e) => (e.preventDefault(), go("builder"))}>
          <Mark />
          <span className="brand-name">Visual Toolkit</span>
          <span className="brand-cap">Symbols</span>
        </a>
        <nav className="tabs" aria-label="Views">
          <button className={view === "builder" ? "on" : ""} onClick={() => go("builder")}>
            Builder
          </button>
          <button className={view === "gallery" ? "on" : ""} onClick={() => go("gallery")}>
            Gallery <span className="count">{GALLERY.length}</span>
          </button>
        </nav>
        <div className="topbar-end">
          <span className="byline">by Grindstone Systems</span>
        </div>
      </header>

      {view === "builder" ? (
        <Builder design={design} setDesign={setDesign} notify={notify} />
      ) : (
        <Gallery
          onOpen={(r) => {
            setDesign((d) => applyRecipe(d, r));
            setView("builder");
            notify("Opened from the gallery — tweak it and make it yours.");
          }}
        />
      )}

      <div className={`toast${toast ? " show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Builder({
  design,
  setDesign,
  notify,
}: {
  design: Design;
  setDesign: React.Dispatch<React.SetStateAction<Design>>;
  notify: (m: string) => void;
}) {
  const gen = getGenerator(design.generator)!;
  const params = design.params[gen.id]!;
  const vo = useMemo(() => gen.generate(params), [gen, params]);
  const [showPorts, setShowPorts] = useState(false);
  const [stageView, setStageView] = useState<"single" | "sheet" | "live">("single");
  const [animate, setAnimate] = useState(true);
  const [dragging, setDragging] = useState(false);

  const opts = { style: design.style, theme: design.theme, state: design.state, animate };
  const svg = useMemo(() => renderSvg(vo, { ...opts, idPrefix: "stage" }), [vo, design.style, design.theme, design.state, animate]);
  const exportFile = useMemo(() => exportSvg(vo, opts), [vo, design.style, design.theme, design.state, animate]);

  const set = <K extends keyof Design>(k: K, v: Design[K]) => setDesign((d) => ({ ...d, [k]: v }));
  const setParam = (key: string, v: ParamValue) =>
    setDesign((d) => ({ ...d, params: { ...d.params, [gen.id]: { ...d.params[gen.id], [key]: v } } }));

  // 1–7 select states; ignore while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select") || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < STATES.length) set("state", STATES[i]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const openFile = async (file: File) => {
    try {
      setDesign(await designFromFile(design, file));
      notify(`Opened ${file.name}`);
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <main className="builder">
      <aside className="panel left" aria-label="Configure">
        <Section step="1" title="Equipment">
          <div className="families">
            {FAMILIES.map((f) => {
              const g = f.generator ? getGenerator(f.generator) : undefined;
              return (
                <button
                  key={f.family}
                  className={`family${g?.id === gen.id ? " on" : ""}`}
                  disabled={!g}
                  onClick={() => g && set("generator", g.id)}
                  title={g ? g.description : "On the roadmap"}
                  aria-label={g ? f.name : `${f.name} (coming soon)`}
                >
                  {g ? <Thumb generator={g.id} design={design} /> : <span className="soon">Soon</span>}
                  <span>{f.name}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section step="2" title="Configure" aside={gen.name}>
          {gen.params.map((d) => (
            <ParamControl key={d.key} def={d} value={params[d.key]!} onChange={(v) => setParam(d.key, v)} />
          ))}
        </Section>

        <Section step="3" title="Style">
          <Segmented
            value={design.style}
            options={STYLE_OPTIONS.map((s) => ({ value: s.id, label: s.label, title: s.hint }))}
            onChange={(v) => set("style", v)}
          />
          <p className="hint">{STYLE_OPTIONS.find((s) => s.id === design.style)!.hint}</p>
        </Section>

        <Section step="5" title="Theme">
          <Segmented value={design.theme} options={THEME_OPTIONS.map((t) => ({ value: t.id, label: t.label }))} onChange={(v) => set("theme", v)} />
        </Section>
      </aside>

      <section
        className={`stage${dragging ? " dragging" : ""}`}
        aria-label="Preview"
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) void openFile(f);
        }}
      >
        <div className="stage-tools">
          <Segmented
            value={stageView}
            options={[
              { value: "single", label: "Symbol" },
              { value: "sheet", label: "All states", title: "Every style × state at once" },
              { value: "live", label: "Live", title: "Drive the smart SVG like an HMI would" },
            ]}
            onChange={setStageView}
          />
          {stageView === "single" && (
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={showPorts} onChange={(e) => setShowPorts(e.target.checked)} /> Ports
              </label>
              <label className="check">
                <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> Motion
              </label>
            </div>
          )}
        </div>

        {stageView === "single" && (
          <div className="canvas">
            <div className="symbol" style={{ aspectRatio: `${vo.viewBox[2]} / ${vo.viewBox[3]}`, width: `min(100%, ${vo.viewBox[2] * 4}px)` }}>
              <div className="symbol-svg" dangerouslySetInnerHTML={{ __html: svg }} />
              {showPorts && <PortsOverlay vo={vo} />}
            </div>
          </div>
        )}
        {stageView === "sheet" && (
          <SheetView
            vo={vo}
            design={design}
            onPick={(style, state) => {
              setDesign((d) => ({ ...d, style, state }));
              setStageView("single");
            }}
          />
        )}
        {stageView === "live" && <LiveView vo={vo} design={design} />}

        <div className={`states${stageView === "single" ? "" : " hidden"}`} role="radiogroup" aria-label="Operating state">
          <span className="step-label">
            <b>4</b> Preview state
          </span>
          <div className="state-chips">
            {STATES.map((s, i) => (
              <button
                key={s}
                role="radio"
                aria-checked={design.state === s}
                className={`chip${design.state === s ? " on" : ""}`}
                onClick={() => set("state", s)}
                title={`${stateLabel(s)} (${i + 1})`}
              >
                <i style={{ background: `var(${tokenVar(STATE_TOKEN[s])})` }} />
                {s === "comm-loss" ? "Comm loss" : stateLabel(s)}
              </button>
            ))}
          </div>
        </div>
        {dragging && <div className="drop-hint">Drop a Visual Toolkit SVG or recipe to open it</div>}
      </section>

      <aside className="panel right" aria-label="Export and share">
        <Section step="6" title="Export">
          <button className="primary" onClick={() => downloadFile(exportFile)}>
            <DownloadIcon /> Download SVG
          </button>
          <p className="hint">
            {exportFile.filename} · {(exportFile.content.length / 1024).toFixed(1)} KB · plain SVG, opens anywhere
          </p>
          <div className="grid2">
            <button
              onClick={async () => {
                const png = await svgToPng(renderSvg(vo, { ...opts, animate: false, embedRecipe: false }), 1024);
                downloadBlob(png, exportFile.filename.replace(/\.svg$/, ".png"));
              }}
            >
              PNG
            </button>
            <button onClick={() => downloadFile(exportSmartSvg(vo, opts))} title="All states in one SVG, switched with data-vt-state">
              Smart SVG
            </button>
            <button
              onClick={() => {
                const kit = exportIgnitionKit(vo, opts);
                downloadBlob(
                  new Blob([zip(kit.files.map((f) => ({ path: f.filename, content: f.content }))) as BlobPart], { type: "application/zip" }),
                  kit.filename,
                );
              }}
              title="Per-state SVGs, smart SVG, starter metadata and a guide"
            >
              Ignition kit
            </button>
            <button onClick={() => downloadFile(exportObject(vo, opts))} title="Canonical Visual Toolkit object (JSON)">
              .vt.json
            </button>
          </div>
        </Section>

        <SharePanel design={design} notify={notify} onOpenFile={openFile} />

        <details className="source">
          <summary>SVG source</summary>
          <pre>{exportFile.content}</pre>
        </details>
      </aside>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function SharePanel({ design, notify, onOpenFile }: { design: Design; notify: (m: string) => void; onOpenFile: (f: File) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Section step="↗" title="Share">
      <button
        onClick={async () => {
          const link = await designLink(design);
          try {
            await navigator.clipboard.writeText(link);
            notify("Link copied. Anyone who opens it gets this exact design — no account needed.");
          } catch {
            prompt("Copy this link", link);
          }
        }}
      >
        <LinkIcon /> Copy share link
      </button>
      <div className="grid2">
        <button onClick={() => setSubmitting((s) => !s)} aria-expanded={submitting}>
          Submit to gallery
        </button>
        <button onClick={() => fileRef.current?.click()}>Open file…</button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,.json,image/svg+xml,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onOpenFile(f);
          e.target.value = "";
        }}
      />
      {submitting && (
        <form
          className="submit"
          onSubmit={(e) => {
            e.preventDefault();
            window.open(gallerySubmitUrl(toRecipe(design), title, desc), "_blank", "noopener");
            setSubmitting(false);
          }}
        >
          <input required maxLength={60} placeholder="Title, e.g. Sanitary transfer pump" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea maxLength={200} rows={2} placeholder="Short description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button className="primary" type="submit">
            Continue on GitHub
          </button>
          <p className="hint">Opens a pre-filled pull request. Gallery entries are reviewed, then published under CC0.</p>
        </form>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ */

function Gallery({ onOpen }: { onOpen: (r: (typeof GALLERY)[number]["recipe"]) => void }) {
  return (
    <main className="gallery">
      <div className="gallery-head">
        <h1>Gallery</h1>
        <p>
          Designs shared by the community. Each one is a tiny recipe, regenerated live — open any of them and keep
          building.
        </p>
      </div>
      <div className="cards">
        {GALLERY.map((e) => {
          let vo: VtObject | null = null;
          try {
            vo = generate(e.recipe.generator, e.recipe.params, e.recipe.version);
          } catch {
            /* generator not in this build */
          }
          const t = getTheme(e.recipe.theme);
          return (
            <article key={e.slug} className="card">
              <div className="card-art" style={{ background: t.tokens["surface.canvas"] }}>
                {vo ? (
                  <div dangerouslySetInnerHTML={{ __html: renderSvg(vo, { ...e.recipe, idPrefix: `g-${e.slug}` }) }} />
                ) : (
                  <span className="hint">Needs a newer build</span>
                )}
              </div>
              <div className="card-body">
                <h2>{e.title}</h2>
                {e.description && <p>{e.description}</p>}
                <div className="card-foot">
                  <span className="by">@{e.author}</span>
                  <button disabled={!vo} onClick={() => onOpen(e.recipe)}>
                    Open
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Section({ step, title, aside, children }: { step: string; title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2>
        <b>{step}</b> {title}
        {aside && <span className="aside">{aside}</span>}
      </h2>
      {children}
    </section>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={o.value === value ? "on" : ""} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ParamControl({ def, value, onChange }: { def: ParamDef; value: ParamValue; onChange: (v: ParamValue) => void }) {
  switch (def.type) {
    case "choice":
      return (
        <div className="field">
          <span>{def.label}</span>
          {def.options.length <= 3 ? (
            <Segmented value={value as string} options={def.options} onChange={onChange} />
          ) : (
            <select value={value as string} onChange={(e) => onChange(e.target.value)}>
              {def.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      );
    case "toggle":
      return (
        <label className="field toggle">
          <span>{def.label}</span>
          <input type="checkbox" role="switch" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
        </label>
      );
    case "number":
      return (
        <label className="field">
          <span>
            {def.label} <em>{value}</em>
          </span>
          <input type="range" min={def.min} max={def.max} step={def.step} value={value as number} onChange={(e) => onChange(Number(e.target.value))} />
        </label>
      );
    case "text":
      return (
        <label className="field">
          <span>{def.label}</span>
          <input type="text" maxLength={def.maxLength} value={value as string} spellCheck={false} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
  }
}

function Thumb({ generator, design }: { generator: string; design: Design }) {
  const html = useMemo(() => {
    const vo = generate(generator, { ...design.params[generator], label: "" });
    return renderSvg(vo, { style: design.style, theme: design.theme, state: "normal", idPrefix: `thumb-${generator.replace(/\W/g, "")}`, animate: false, embedRecipe: false });
  }, [generator, design.params, design.style, design.theme]);
  return <span className="thumb" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Every style × state for the current configuration — the family at a glance. */
function SheetView({ vo, design, onPick }: { vo: VtObject; design: Design; onPick: (s: StyleId, st: StateName) => void }) {
  const cells = useMemo(
    () =>
      STYLE_OPTIONS.map((st) => ({
        style: st,
        svgs: STATES.map((s) => renderSvg(vo, { style: st.id, theme: design.theme, state: s, idPrefix: `sh-${st.id}-${s}`, embedRecipe: false })),
      })),
    [vo, design.theme],
  );
  return (
    <div className="sheet" style={{ ["--cell-aspect" as string]: `${vo.viewBox[2]} / ${vo.viewBox[3]}` }}>
      <div className="sheet-grid">
        <span />
        {STATES.map((s) => (
          <span key={s} className="sheet-head">
            {s === "comm-loss" ? "Comm loss" : stateLabel(s)}
          </span>
        ))}
        {cells.map(({ style, svgs }) => (
          <Fragment key={style.id}>
            <span className="sheet-row">{style.label}</span>
            {svgs.map((html, i) => (
              <button
                key={i}
                className={`sheet-cell${design.style === style.id && design.state === STATES[i] ? " on" : ""}`}
                onClick={() => onPick(style.id, STATES[i]!)}
                title={`${style.label} · ${stateLabel(STATES[i]!)}`}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <p className="hint">21 variants from one definition. Click any cell to use it.</p>
    </div>
  );
}

const LIVE_SCRIPT: StateName[] = ["running", "running", "warning", "running", "fault", "maintenance", "normal", "comm-loss", "running", "disabled"];

/**
 * Live: one smart SVG, driven exactly as an HMI would drive it — by setting
 * data-vt-state and --vt-level on the element. Nothing is re-rendered.
 */
function LiveView({ vo, design }: { vo: VtObject; design: Design }) {
  const host = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => renderSvg(vo, { style: design.style, theme: design.theme, state: "running", mode: "themable", idPrefix: "live", embedRecipe: false }),
    [vo, design.style, design.theme],
  );
  const hasLevel = vo.regions.some((r) => r.level);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(true);
  const state = LIVE_SCRIPT[Math.floor(tick / 2) % LIVE_SCRIPT.length]!;
  const level = Math.round((0.52 + 0.36 * Math.sin(tick * 0.55)) * 100) / 100;

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1300);
    return () => window.clearInterval(t);
  }, [playing]);

  useEffect(() => {
    const svg = host.current?.querySelector("svg");
    if (!svg) return;
    svg.dataset.vtState = state;
    if (hasLevel) svg.style.setProperty("--vt-level", String(level));
  }, [html, state, level, hasLevel]);

  return (
    <div className="live">
      <div className="canvas">
        <div className="symbol" style={{ aspectRatio: `${vo.viewBox[2]} / ${vo.viewBox[3]}`, width: `min(100%, ${vo.viewBox[2] * 4}px)` }}>
          <div className="symbol-svg" ref={host} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      <div className="live-hud">
        <button className="live-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "❚❚" : "▶"}
        </button>
        <code>
          <span className="c">// one smart SVG · your HMI sets two things</span>
          <br />
          svg.dataset.vtState = <b>"{state}"</b>;
          {hasLevel && (
            <>
              <br />
              svg.style.setProperty("--vt-level", <b>{level.toFixed(2)}</b>);
            </>
          )}
        </code>
      </div>
    </div>
  );
}

function PortsOverlay({ vo }: { vo: VtObject }) {
  const [x, y, w, h] = vo.viewBox;
  return (
    <svg className="ports" viewBox={`${x} ${y} ${w} ${h}`} aria-hidden="true">
      {vo.ports.map((p) => {
        const a = (p.direction * Math.PI) / 180;
        return (
          <g key={p.id} className={`port port--${p.kind}`}>
            <line x1={p.x} y1={p.y} x2={p.x + Math.cos(a) * 7} y2={p.y + Math.sin(a) * 7} />
            <circle cx={p.x} cy={p.y} r={2.2} />
            <text x={p.x + Math.cos(a) * 10} y={p.y + Math.sin(a) * 10 + 1.5} textAnchor={Math.cos(a) > 0.3 ? "start" : Math.cos(a) < -0.3 ? "end" : "middle"}>
              {p.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------ icons ------------------------------ */

const Mark = () => (
  <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" />
    <circle cx="14" cy="17.5" r="7.5" fill="none" strokeWidth="2.4" />
    <path d="M17 10V5.5h6V12" fill="none" strokeWidth="2.4" strokeLinejoin="round" />
    <circle className="dot" cx="14" cy="17.5" r="2.6" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M3 13.5h10" />
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2.1-2.1a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0L3.2 8.6a3 3 0 0 0 4.2 4.2l.7-.7" />
  </svg>
);
