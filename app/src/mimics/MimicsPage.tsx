import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  decodeSceneCode,
  defaultParams,
  demoScene,
  emptyScene,
  encodeSceneCode,
  exportSceneKit,
  FAMILIES,
  getGenerator,
  nextItemId,
  parseScene,
  placeItem,
  renderSceneSvg,
  reviewScene,
  sceneBounds,
  SCENE_SCHEMA,
  slugify,
  stateLabel,
  STATES,
  tokenVar,
  type Pipe,
  type PipeEnd,
  type Rotation,
  type Scene,
  type SceneItem,
} from "../../../lib/index.ts";
import type { Design } from "../design.ts";
import { downloadBlob, svgToPng } from "../download.ts";
import { ParamControl, STATE_TOKEN, Thumb } from "../symbols/Builder.tsx";
import { Section, Segmented } from "../ui/controls.tsx";
import { Icon } from "../ui/icons.tsx";

const Scene3D = lazy(() => import("./Scene3D.tsx"));

const STORE = "vt.scene";
const GRID = 10;
const PAD = 60;

type Selection = { kind: "item"; id: string } | { kind: "pipe"; id: string } | null;

const readStored = (): Scene | null => {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? parseScene(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
};

export const sceneLink = async (scene: Scene) => `${location.origin}${location.pathname}#/mimics/s/${await encodeSceneCode(scene)}`;

/** A fresh tag for a new item: the generator's default label with the next free number. */
function freshLabel(scene: Scene, base: string): string {
  const m = base.match(/^(.*?)(\d+)$/);
  if (!m) return base;
  const used = new Set(scene.items.map((i) => String(i.params.label ?? "")));
  let n = Number(m[2]);
  while (used.has(`${m[1]}${n}`)) n++;
  return `${m[1]}${n}`;
}

export function MimicsPage({ design, code, notify }: { design: Design; code?: string; notify: (m: string) => void }) {
  const [scene, setScene] = useState<Scene>(() => readStored() ?? demoScene());
  const [sel, setSel] = useState<Selection>(null);
  const [pending, setPending] = useState<PipeEnd | null>(null);
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [animate, setAnimate] = useState(true);
  const [frozen, setFrozen] = useState<[number, number, number, number] | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const style = scene.style ?? design.style;
  const theme = scene.theme ?? design.theme;

  // Share links open a scene; otherwise keep the last one on this device.
  useEffect(() => {
    if (!code) return;
    decodeSceneCode(code)
      .then((s) => {
        setScene(s);
        setSel(null);
        notify(`Opened “${s.name || "shared scene"}”.`);
      })
      .catch((e) => notify(`Couldn't open that scene link: ${(e as Error).message}`));
  }, [code, notify]);
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(scene));
    } catch {
      /* storage unavailable: the scene lives for this page only */
    }
  }, [scene]);

  const update = useCallback((fn: (s: Scene) => Scene) => setScene((s) => fn(structuredClone(s))), []);
  const item = sel?.kind === "item" ? scene.items.find((i) => i.id === sel.id) : undefined;
  const pipe = sel?.kind === "pipe" ? scene.pipes.find((p) => p.id === sel.id) : undefined;

  const bounds = useMemo(() => sceneBounds(scene.items.map(placeItem), PAD), [scene.items]);
  const svg = useMemo(
    () =>
      renderSceneSvg(scene, {
        style,
        theme,
        tokens: design.tokens,
        animate,
        showPorts: true,
        idPrefix: "mimic",
        viewBox: frozen ?? bounds,
        highlight: { item: sel?.kind === "item" ? sel.id : undefined, pipe: sel?.kind === "pipe" ? sel.id : undefined, port: pending ?? undefined },
      }),
    [scene, style, theme, design.tokens, animate, frozen, bounds, sel, pending],
  );

  /* ------------------------------ editing ------------------------------ */

  const addItem = (generator: string) => {
    const gen = getGenerator(generator)!;
    update((s) => {
      const params = defaultParams(gen.params);
      if (typeof params.label === "string" && params.label) params.label = freshLabel(s, params.label);
      const placed = s.items.map(placeItem);
      const [bx, by, bw] = sceneBounds(placed, 0);
      const it: SceneItem = {
        id: nextItemId(s, generator),
        generator,
        params,
        state: "normal",
        x: placed.length ? Math.round((bx + bw + 40) / GRID) * GRID : 0,
        y: placed.length ? Math.round(by / GRID) * GRID : 0,
        rotation: 0,
      };
      s.items.push(it);
      setSel({ kind: "item", id: it.id });
      return s;
    });
  };

  const removeSelection = useCallback(() => {
    if (!sel) return;
    update((s) => {
      if (sel.kind === "item") {
        s.items = s.items.filter((i) => i.id !== sel.id);
        s.pipes = s.pipes.filter((p) => p.from.item !== sel.id && p.to.item !== sel.id);
      } else s.pipes = s.pipes.filter((p) => p.id !== sel.id);
      return s;
    });
    setSel(null);
  }, [sel, update]);

  const editItem = useCallback(
    (fn: (it: SceneItem) => void) => {
      if (sel?.kind !== "item") return;
      update((s) => {
        const it = s.items.find((i) => i.id === sel.id);
        if (it) fn(it);
        return s;
      });
    },
    [sel, update],
  );
  const rotate = useCallback((by: 90 | -90) => editItem((it) => void (it.rotation = (((it.rotation + by) % 360) + 360) % 360 as Rotation)), [editItem]);

  const connect = (end: PipeEnd) => {
    if (!pending) return setPending(end);
    if (pending.item === end.item && pending.port === end.port) return setPending(null);
    if (pending.item === end.item) {
      notify("Connect ports on two different items.");
      return setPending(null);
    }
    const busy = (e: PipeEnd) => scene.pipes.some((p) => [p.from, p.to].some((q) => q.item === e.item && q.port === e.port));
    if (busy(pending) || busy(end)) {
      notify("That port already has a pipe. Delete it first.");
      return setPending(null);
    }
    const from = pending;
    update((s) => {
      let n = s.pipes.length + 1;
      while (s.pipes.some((p) => p.id === `l-${n}`)) n++;
      const p: Pipe = { id: `l-${n}`, from, to: end };
      s.pipes.push(p);
      setSel({ kind: "pipe", id: p.id });
      return s;
    });
    setPending(null);
  };

  // Keyboard: Delete removes, R / Shift+R rotates, M mirrors, Esc cancels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select") || view !== "2d") return;
      if (e.key === "Escape") (setPending(null), setSel(null));
      else if (e.key === "Delete" || e.key === "Backspace") (e.preventDefault(), removeSelection());
      else if (e.key.toLowerCase() === "r") rotate(e.shiftKey ? -90 : 90);
      else if (e.key.toLowerCase() === "m") editItem((it) => void (it.mirror = !it.mirror || undefined));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [removeSelection, rotate, editItem, view]);

  /* ------------------------------ pointer ------------------------------ */

  const toScene = (e: React.PointerEvent): [number, number] => {
    const el = host.current!.querySelector("svg")!;
    const m = el.getScreenCTM();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as Element;
    const port = t.closest(".vt-port");
    if (port) return connect({ item: port.getAttribute("data-item")!, port: port.getAttribute("data-port")! });
    const pipeEl = t.closest(".vt-pipe");
    if (pipeEl) return setSel({ kind: "pipe", id: pipeEl.getAttribute("data-pipe")! });
    const itemEl = t.closest(".vt-item");
    if (!itemEl) {
      setPending(null);
      return setSel(null);
    }
    const id = itemEl.getAttribute("data-item")!;
    const it = scene.items.find((i) => i.id === id)!;
    const [x, y] = toScene(e);
    drag.current = { id, dx: x - it.x, dy: y - it.y, moved: false };
    setSel({ kind: "item", id });
    setFrozen(bounds);
    try {
      host.current!.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer: dragging still works inside the canvas */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = toScene(e);
    const nx = Math.round((x - d.dx) / GRID) * GRID;
    const ny = Math.round((y - d.dy) / GRID) * GRID;
    const it = scene.items.find((i) => i.id === d.id);
    if (!it || (it.x === nx && it.y === ny)) return;
    d.moved = true;
    setScene((s) => ({ ...s, items: s.items.map((i) => (i.id === d.id ? { ...i, x: nx, y: ny } : i)) }));
  };

  const onPointerUp = () => {
    drag.current = null;
    setFrozen(null);
  };

  /* ------------------------------ files & sharing ------------------------------ */

  const base = slugify(scene.name || "scene");
  const staticSvg = () => renderSceneSvg(scene, { style, theme, tokens: design.tokens, animate: true, idPrefix: base });
  const openFile = async (f: File) => {
    try {
      setScene(parseScene(JSON.parse(await f.text())));
      setSel(null);
      notify(`Opened ${f.name}.`);
    } catch (e) {
      notify((e as Error).message);
    }
  };

  const review = useMemo(() => reviewScene(scene, { style, theme, tokens: design.tokens }), [scene, style, theme, design.tokens]);
  const warnings = review.filter((f) => f.level === "warn").length;

  const gen = item ? getGenerator(item.generator, item.version) ?? getGenerator(item.generator) : undefined;
  const hasPorts = scene.items.length > 1;

  return (
    <div className="builder mimics">
      <aside className="panel left" aria-label="Equipment">
        <Section step="1" title="Add equipment" aside="click to place">
          <div className="families">
            {FAMILIES.map((f) => {
              const g = f.generator ? getGenerator(f.generator) : undefined;
              return g ? (
                <button key={f.family} className="family" onClick={() => addItem(g.id)} title={`Add a ${f.name.toLowerCase()}`}>
                  <Thumb generator={g.id} design={{ ...design, style, theme }} />
                  <span>{f.name}</span>
                </button>
              ) : null;
            })}
          </div>
        </Section>
        <Section step="2" title="Scene">
          <label className="field">
            <span>Name</span>
            <input type="text" value={scene.name ?? ""} placeholder="Untitled scene" onChange={(e) => setScene((s) => ({ ...s, name: e.target.value || undefined }))} />
          </label>
          <Segmented
            value={style}
            options={[
              { value: "high-performance", label: "HP" },
              { value: "modern-flat", label: "Flat" },
              { value: "outline", label: "Outline" },
            ]}
            onChange={(v) => setScene((s) => ({ ...s, style: v }))}
          />
          <div className="grid2">
            <button onClick={() => (setScene(demoScene()), setSel(null))}>Demo skid</button>
            <button onClick={() => (setScene({ ...emptyScene(), style: scene.style, theme: scene.theme }), setSel(null))}>New</button>
            <button className="span2" onClick={() => fileRef.current?.click()}>
              Open .vt-scene.json
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} />
          </div>
          <p className="hint">
            {scene.items.length} items · {scene.pipes.length} pipes. Saved on this device.
          </p>
        </Section>
      </aside>

      <section className="stage" aria-label="Scene">
        <div className="stage-tools">
          <Segmented
            value={view}
            options={[
              { value: "2d", label: "2D mimic" },
              { value: "3d", label: "3D layout", title: "The same scene with each item's 3D model and swept pipes" },
            ]}
            onChange={setView}
          />
          <div className="checks">
            <label className="check">
              <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> Motion
            </label>
          </div>
        </div>
        {view === "2d" ? (
          <div
            className={`mimic-canvas${pending ? " connecting" : ""}`}
            ref={host}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <Suspense fallback={<div className="spatial-loading">Loading 3D…</div>}>
            <Scene3D scene={scene} style={style} theme={theme} tokens={design.tokens} motion={animate} />
          </Suspense>
        )}
        <p className="mimic-hint">
          {view === "3d"
            ? "Pipes glow with flow wherever they touch running equipment. Edit the layout in 2D."
            : pending
              ? `Connecting from ${pending.item} · ${pending.port}. Click another port, or Esc to cancel.`
              : hasPorts
                ? "Drag to move · click a port, then another, to connect · R rotates · M mirrors · Delete removes"
                : "Add equipment from the left, then connect ports to route pipes."}
        </p>
      </section>

      <aside className="panel right" aria-label="Selection and export">
        {item && gen ? (
          <Section step="3" title="Selected" aside={item.id}>
            <div className="state-chips vertical">
              {STATES.map((s) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={item.state === s}
                  className={`chip${item.state === s ? " on" : ""}`}
                  onClick={() => editItem((it) => void (it.state = s))}
                >
                  <i style={{ background: `var(${tokenVar(STATE_TOKEN[s])})` }} />
                  {s === "comm-loss" ? "Comm loss" : stateLabel(s)}
                </button>
              ))}
            </div>
            <div className="grid2">
              <button onClick={() => rotate(-90)} title="Rotate left (Shift+R)">
                ⟲ Rotate
              </button>
              <button onClick={() => rotate(90)} title="Rotate right (R)">
                Rotate ⟳
              </button>
              <button onClick={() => editItem((it) => void (it.mirror = !it.mirror || undefined))} aria-pressed={!!item.mirror} title="Mirror (M)">
                Mirror
              </button>
              <button onClick={removeSelection} title="Delete">
                Delete
              </button>
            </div>
            <details className="more-exports" open>
              <summary>{gen.name} parameters</summary>
              <div className="section" style={{ borderBottom: 0, paddingTop: 4 }}>
                {gen.params.map((d) => (
                  <ParamControl
                    key={d.key}
                    def={d}
                    value={item.params[d.key] ?? defaultParams(gen.params)[d.key]!}
                    onChange={(v) => editItem((it) => void (it.params = { ...it.params, [d.key]: v }))}
                  />
                ))}
              </div>
            </details>
            <p className="hint">Changing parameters can move ports; connected pipes re-route automatically.</p>
          </Section>
        ) : pipe ? (
          <Section step="3" title="Selected pipe" aside={pipe.id}>
            <p className="hint">
              {pipe.from.item} · {pipe.from.port} → {pipe.to.item} · {pipe.to.port}
            </p>
            <button onClick={removeSelection}>Delete pipe</button>
          </Section>
        ) : (
          <Section step="3" title="Selected">
            <p className="hint">Click an item to set its state, rotate, mirror or change its parameters. Click a pipe to delete it.</p>
          </Section>
        )}

        <Section step="4" title="HMI review" aside={warnings ? `${warnings} to look at` : "looks good"}>
          <ul className="review">
            {review.map((f) => (
              <li key={f.id} className={`review-${f.level}`}>
                <button
                  type="button"
                  className="review-row"
                  disabled={!f.items?.length}
                  onClick={() => f.items?.[0] && (setView("2d"), setSel({ kind: "item", id: f.items[0] }))}
                  title={f.items?.length ? "Select the first item this is about" : undefined}
                >
                  <i aria-hidden="true">{f.level === "pass" ? "✓" : f.level === "warn" ? "!" : "i"}</i>
                  <span>
                    <b>{f.title}</b>
                    {f.detail}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">A design aid based on high-performance HMI practice, not a compliance check.</p>
        </Section>

        <Section step="5" title="Export">
          <button className="primary" onClick={() => downloadBlob(new Blob([staticSvg()], { type: "image/svg+xml" }), `${base}.svg`)}>
            <Icon name="download" /> Download mimic SVG
          </button>
          <div className="grid2">
            <button
              onClick={async () => {
                const s = renderSceneSvg(scene, { style, theme, tokens: design.tokens, animate: false, idPrefix: base });
                downloadBlob(await svgToPng(s, 2400), `${base}.png`);
              }}
            >
              PNG
            </button>
            <button
              onClick={() => downloadBlob(new Blob([JSON.stringify({ ...scene, schema: SCENE_SCHEMA }, null, 2)], { type: "application/json" }), `${base}.vt-scene.json`)}
              title="The scene as data (vt.scene/v0)"
            >
              .vt-scene.json
            </button>
            <button
              className="span2"
              disabled={!scene.items.length}
              onClick={() => {
                const kit = exportSceneKit(scene, { style, theme, tokens: design.tokens });
                downloadBlob(new Blob([kit.bytes as BlobPart], { type: "application/zip" }), kit.filename);
              }}
              title="A .glb per item, pipes.glb and scene.json with the 3D placements"
            >
              3D scene kit (.zip)
            </button>
          </div>
          <button
            onClick={async () => {
              const link = await sceneLink(scene);
              history.replaceState(null, "", link);
              await navigator.clipboard?.writeText(link).catch(() => undefined);
              notify("Scene link copied. The whole layout is in the link.");
            }}
          >
            <Icon name="link" /> Copy share link
          </button>
          <p className="hint">The link carries the whole scene. There's no server, and anyone who opens it gets the same layout.</p>
        </Section>
      </aside>
    </div>
  );
}
