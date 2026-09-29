import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { badgeSvg, getTheme, type StateName, type ThemeId } from "../../lib/index.ts";
import { createStage, ENVIRONMENTS, type Environment } from "./three/stage.ts";
import { glbExtras, loadVtModel, type VtModel } from "./three/vtModel.ts";

export type { Environment };

/**
 * 3D preview of one model. It loads the exact .glb the Export panel
 * downloads and drives it through the vt.spatial contract (three/vtModel.ts).
 */

const CSS = `
.sp3-tools{position:absolute;top:10px;right:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end;max-width:calc(100% - 20px)}
.sp3-group{display:flex;gap:2px;padding:3px;border-radius:9px;background:color-mix(in srgb,var(--panel,#fff) 86%,transparent);border:1px solid var(--line,#ddd);backdrop-filter:blur(6px)}
.sp3-group button{border:0;background:none;padding:5px 10px;border-radius:7px;font:600 12px/1 inherit;font-family:inherit;color:var(--muted,#666);cursor:pointer}
.sp3-group button[aria-pressed="true"]{background:var(--accent,#272925);color:var(--on-accent,#fff)}
.sp3-level{display:flex;align-items:center;gap:8px;padding:5px 10px;font:600 12px/1 inherit;font-family:inherit;color:var(--muted,#666)}
.sp3-level input{width:110px;accent-color:var(--accent,#272925)}
`;

export default function Spatial3D({
  glb,
  state,
  theme,
  motion,
  defaultEnv = "studio",
  defaultCutaway = false,
}: {
  glb: Uint8Array;
  state: StateName;
  theme: ThemeId;
  motion: boolean;
  defaultEnv?: Environment;
  defaultCutaway?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const api = useRef<{
    apply: (s: StateName, motion: boolean) => void;
    setEnv: (e: Environment) => void;
    setCutaway: (on: boolean) => void;
    setLevel: (v: number) => void;
  } | null>(null);
  const [backend, setBackend] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const extras = useMemo(() => glbExtras(glb), [glb]);
  const [env, setEnv] = useState<Environment>(defaultEnv);
  const [cutaway, setCutaway] = useState(defaultCutaway);
  const [level, setLevel] = useState(() => extras.levels[0]?.value ?? 0.6);
  // Latest UI values for the async loader, without rebuilding the scene.
  const live = useRef({ state, motion, env, cutaway, level });
  live.current = { state, motion, env, cutaway, level };
  const dark = getTheme(theme).scheme === "dark";

  useEffect(() => {
    setLevel(extras.levels[0]?.value ?? 0.6);
  }, [extras]);

  useEffect(() => {
    const el = host.current!;
    const stage = createStage(el, theme, live.current.env);
    let model: VtModel | null = null;
    const showBadge = (s: StateName) => {
      const b = model?.extras.states[s]?.badge;
      if (badgeRef.current) badgeRef.current.innerHTML = b ? badgeSvg(b, theme, 34) : "";
    };
    api.current = {
      apply(s, motionOn) {
        model?.apply(s, motionOn);
        showBadge(s);
      },
      setEnv: stage.setEnv,
      setCutaway: (on) => model?.setCut(on),
      setLevel: (v) => model?.setLevel(v),
    };

    (async () => {
      try {
        const backend = await stage.ready;
        if (stage.isDisposed()) return;
        setBackend(backend);
        const m = await loadVtModel(glb);
        if (stage.isDisposed()) return;
        model = m;
        stage.scene.add(m.root);
        stage.fit(new THREE.Box3().setFromObject(m.root));
        m.setCut(live.current.cutaway);
        m.setLevel(live.current.level);
        api.current?.apply(live.current.state, live.current.motion);
      } catch (e) {
        setError((e as Error).message);
      }
    })();

    const v = new THREE.Vector3();
    stage.start((dt, elapsed) => {
      model?.update(dt, elapsed, live.current.motion);
      const b = badgeRef.current;
      if (b && model) {
        v.copy(model.badgeAnchor).project(stage.camera);
        b.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px) translate(-50%, -50%)`;
      }
    });

    return () => {
      api.current = null;
      stage.dispose();
    };
    // Rebuild only when the model or theme changes; everything else is applied live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glb, theme]);

  useEffect(() => {
    api.current?.apply(state, motion);
  }, [state, motion]);
  useEffect(() => {
    api.current?.setEnv(env);
  }, [env]);
  useEffect(() => {
    api.current?.setCutaway(cutaway);
  }, [cutaway]);
  useEffect(() => {
    api.current?.setLevel(level);
  }, [level]);

  return (
    <div className="spatial" data-dark={dark || undefined}>
      <style>{CSS}</style>
      <div className="spatial-canvas" ref={host} />
      <div className="spatial-badge" ref={badgeRef} />
      <div className="sp3-tools">
        {extras.levels.length > 0 && (
          <label className="sp3-group sp3-level" htmlFor="sp3-level">
            Level
            <input id="sp3-level" type="range" min={0} max={100} value={Math.round(level * 100)} onChange={(e) => setLevel(Number(e.target.value) / 100)} />
          </label>
        )}
        {extras.sectionPlane && (
          <div className="sp3-group">
            <button type="button" aria-pressed={cutaway} onClick={() => setCutaway((c) => !c)} title="Section the casing to see inside">
              Cutaway
            </button>
          </div>
        )}
        <div className="sp3-group" role="group" aria-label="Environment">
          {ENVIRONMENTS.map((e) => (
            <button key={e.id} type="button" aria-pressed={env === e.id} onClick={() => setEnv(e.id)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <div className="spatial-meta">
        {error ? <span className="err">3D unavailable: {error}</span> : backend && <span>{backend} · drag to orbit · scroll to zoom</span>}
      </div>
    </div>
  );
}
