import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { attribute, color as tslColor, fract, smoothstep, time } from "three/tsl";
import { badgeSvg, generate, getTheme, pipeMeshes, place3d, spatialGlb, type Scene, type StateName, type StyleId, type ThemeId, type TokenSet, type Vec3 } from "../../../lib/index.ts";
import { createStage, ENVIRONMENTS, type Environment } from "../three/stage.ts";
import { loadVtModel, type VtModel } from "../three/vtModel.ts";

/**
 * 3D view of a skid scene: every item's own vt.spatial model placed on the
 * floor, pipes swept between their ports, and glowing flow tracers moving
 * through pipes that touch running equipment. States apply live; moving or
 * reconfiguring items rebuilds the layout.
 */

const CSS = `
.sc3-tools{position:absolute;top:10px;right:10px;display:flex;gap:8px}
.sc3-group{display:flex;gap:2px;padding:3px;border-radius:9px;background:color-mix(in srgb,var(--panel,#fff) 86%,transparent);border:1px solid var(--line,#ddd);backdrop-filter:blur(6px)}
.sc3-group button{border:0;background:none;padding:5px 10px;border-radius:7px;font:600 12px/1 inherit;font-family:inherit;color:var(--muted,#666);cursor:pointer}
.sc3-group button[aria-pressed="true"]{background:var(--accent,#272925);color:var(--on-accent,#fff)}
.sc3-badge{position:absolute;left:0;top:0;pointer-events:none;display:grid;justify-items:center;gap:3px}
.sc3-badge b{font:650 11px/1 var(--font,inherit);letter-spacing:.04em;padding:3px 6px;border-radius:5px;background:color-mix(in srgb,var(--panel,#fff) 88%,transparent);color:var(--ink,#222);border:1px solid var(--line,#ddd);white-space:nowrap}
`;

/** Arc length along the pipe's centreline for every vertex, so flow can stream along it. */
function alongAttribute(positions: number[], path: Vec3[]): Float32Array {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1], path[i]![2] - path[i - 1]![2]));
  const out = new Float32Array(positions.length / 3);
  for (let v = 0; v < out.length; v++) {
    const p = [positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!];
    let best = Infinity;
    let at = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p[0]! - a[0]) * d[0]! + (p[1]! - a[1]) * d[1]! + (p[2]! - a[2]) * d[2]!) / l2));
      const dist = Math.hypot(a[0] + d[0]! * t - p[0]!, a[1] + d[1]! * t - p[1]!, a[2] + d[2]! * t - p[2]!);
      if (dist < best) {
        best = dist;
        at = cum[i - 1]! + t * Math.sqrt(l2);
      }
    }
    out[v] = at;
  }
  return out;
}

export default function Scene3D({
  scene,
  style,
  theme,
  tokens,
  motion,
}: {
  scene: Scene;
  style: StyleId;
  theme: ThemeId;
  tokens?: Partial<TokenSet>;
  motion: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const badges = useRef<HTMLDivElement>(null);
  const [env, setEnv] = useState<Environment>("plant");
  const [backend, setBackend] = useState("");
  const [error, setError] = useState<string | null>(null);
  const api = useRef<{ apply: (states: Record<string, StateName>, motion: boolean) => void; setEnv: (e: Environment) => void } | null>(null);

  // Layout identity without states: states are applied live, anything else rebuilds.
  const layoutKey = JSON.stringify({ ...scene, items: scene.items.map((i) => ({ ...i, state: undefined })) });
  const states = useMemo(() => Object.fromEntries(scene.items.map((i) => [i.id, i.state])), [scene]);
  const live = useRef({ states, motion, env });
  live.current = { states, motion, env };

  useEffect(() => {
    const el = host.current!;
    const stage = createStage(el, theme, live.current.env);
    const liquid = getTheme(theme).tokens["process.liquid"];
    const items: { id: string; tag: string; model: VtModel; group: THREE.Object3D; badge: HTMLDivElement }[] = [];
    const flowMats: THREE.MeshStandardNodeMaterial[] = [];
    let flowing = new Set<string>();

    const steel = () => new THREE.MeshStandardNodeMaterial({ color: "#a7adb1", metalness: 0.75, roughness: 0.34 });
    const idleMat = steel();
    const flowMat = steel();
    // Bright slugs streaming along the pipe, like the 2D flow dashes.
    const along = attribute("along", "float");
    const pulse = smoothstep(0.55, 0.95, fract(along.mul(3.2).sub(time.mul(1.4))));
    flowMat.emissiveNode = tslColor(liquid).mul(pulse.mul(1.6));
    flowMats.push(flowMat);
    const pipeMeshesByFlow: { mesh: THREE.Mesh; items: string[] }[] = [];

    const apply = (st: Record<string, StateName>, motionOn: boolean) => {
      for (const it of items) {
        const s = st[it.id] ?? "normal";
        it.model.apply(s, motionOn);
        const b = it.model.extras.states[s]?.badge;
        const tag = document.createElement("b");
        tag.textContent = it.tag;
        it.badge.innerHTML = b ? badgeSvg(b, theme, 26) : "";
        if (it.tag) it.badge.append(tag);
      }
      flowing = new Set(Object.entries(st).filter(([, s]) => s === "running").map(([id]) => id));
      for (const p of pipeMeshesByFlow) p.mesh.material = motionOn && p.items.some((id) => flowing.has(id)) ? flowMat : idleMat;
    };
    api.current = { apply, setEnv: stage.setEnv };

    (async () => {
      try {
        const b = await stage.ready;
        if (stage.isDisposed()) return;
        setBackend(b);
        const placed = place3d(scene) as ReturnType<typeof place3d>;
        const all = new THREE.Group();
        for (const p of placed) {
          const vo = generate(p.item.generator, p.item.params, p.item.version);
          const model = await loadVtModel(spatialGlb(vo, p.model, { style, theme, tokens, state: "normal" }));
          if (stage.isDisposed()) return;
          const centre = (p as unknown as { centre: Vec3 }).centre;
          // T(position) · Ry(rotationY) · S(mirror) · T(-centre)
          const outer = new THREE.Group();
          outer.position.set(...p.position);
          outer.rotation.y = p.rotationY;
          const flip = new THREE.Group();
          flip.scale.x = p.mirror ? -1 : 1;
          const offset = new THREE.Group();
          offset.position.set(-centre[0], 0, -centre[2]);
          offset.add(model.root);
          flip.add(offset);
          outer.add(flip);
          all.add(outer);
          const badge = document.createElement("div");
          badge.className = "sc3-badge";
          badges.current?.append(badge);
          items.push({ id: p.item.id, tag: vo.label?.text ?? "", model, group: offset, badge });
        }
        for (const q of pipeMeshes(scene)) {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(q.mesh.positions, 3));
          g.setAttribute("normal", new THREE.Float32BufferAttribute(q.mesh.normals, 3));
          g.setAttribute("along", new THREE.BufferAttribute(alongAttribute(q.mesh.positions, q.path), 1));
          g.setIndex(q.mesh.indices);
          const mesh = new THREE.Mesh(g, idleMat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          all.add(mesh);
          const pipe = scene.pipes.find((x) => x.id === q.id)!;
          pipeMeshesByFlow.push({ mesh, items: [pipe.from.item, pipe.to.item] });
        }
        stage.scene.add(all);
        if (items.length || pipeMeshesByFlow.length) stage.fit(new THREE.Box3().setFromObject(all), new THREE.Vector3(0.55, 0.8, 1.2), 3.1);
        apply(live.current.states, live.current.motion);
      } catch (e) {
        setError((e as Error).message);
      }
    })();

    const v = new THREE.Vector3();
    stage.start((dt, elapsed) => {
      for (const it of items) {
        it.model.update(dt, elapsed, live.current.motion);
        v.copy(it.model.badgeAnchor);
        it.group.localToWorld(v);
        v.project(stage.camera);
        it.badge.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px) translate(-50%, -50%)`;
        it.badge.style.visibility = v.z < 1 ? "visible" : "hidden";
      }
    });

    return () => {
      api.current = null;
      for (const it of items) it.badge.remove();
      idleMat.dispose();
      for (const m of flowMats) m.dispose();
      stage.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, style, theme, JSON.stringify(tokens ?? {})]);

  useEffect(() => {
    api.current?.apply(states, motion);
  }, [states, motion]);
  useEffect(() => {
    api.current?.setEnv(env);
  }, [env]);

  return (
    <div className="spatial" data-dark={getTheme(theme).scheme === "dark" || undefined}>
      <style>{CSS}</style>
      <div className="spatial-canvas" ref={host} />
      <div ref={badges} />
      <div className="sc3-tools">
        <div className="sc3-group" role="group" aria-label="Environment">
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
