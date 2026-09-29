import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import {
  builtinAOContext,
  color as tslColor,
  emissive,
  fract,
  materialColor,
  mix,
  mrt,
  normalView,
  output,
  pass,
  positionWorld,
  screenUV,
  select,
  frontFacing,
  smoothstep,
  vec3,
} from "three/tsl";
import { badgeSvg, getTheme, readGlbJson, type BadgeKind, type StateName, type ThemeId } from "../../lib/index.ts";

/**
 * 3D preview and reference consumer of the vt.spatial contract. It loads the
 * exact .glb the Export panel downloads, then:
 *  - switches state from `extras.vt.states` (recolour by role, play clips),
 *  - drives `levels` (Y-scaled nodes), `effects` (vibration) and the
 *    cutaway `sectionPlane` (clip `section` nodes, reveal `internal` ones).
 * Dimension Engine can mirror this behaviour in PlayCanvas.
 */

type Vec3 = [number, number, number];
interface VtExtras {
  states: Record<
    string,
    { roles: Record<string, { color: string; opacity: number; emissive: number; glow?: string }>; badge?: BadgeKind; animate: boolean }
  >;
  animations: { gltfAnimation: string; states: StateName[] }[];
  badge: Vec3;
  levels: { node: string; bottom: number; top: number; value: number }[];
  effects: { type: string; states?: StateName[]; amplitude?: number; frequencyHz?: number }[];
  sectionPlane?: { normal: Vec3; offset: number };
}

export type Environment = "studio" | "plant" | "night";
const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "plant", label: "Plant floor" },
  { id: "night", label: "Night" },
];

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
  const extras = useMemo(() => (readGlbJson(glb).extras as { vt: VtExtras }).vt, [glb]);
  const [env, setEnv] = useState<Environment>(defaultEnv);
  const [cutaway, setCutaway] = useState(defaultCutaway);
  const [level, setLevel] = useState(() => extras.levels[0]?.value ?? 0.6);
  // Latest UI values for the async loader, without rebuilding the scene.
  const live = useRef({ state, motion, env, cutaway, level });
  live.current = { state, motion, env, cutaway, level };
  const dark = getTheme(theme).scheme === "dark";
  const canvasColor = getTheme(theme).tokens["surface.canvas"];

  useEffect(() => {
    setLevel(extras.levels[0]?.value ?? 0.6);
  }, [extras]);

  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.append(renderer.domElement);

    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb9b6aa, 0.7);
    const key = new THREE.DirectionalLight(0xfff6ea, 2.4);
    key.position.set(1.6, 2.8, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.1, far: 9 });
    const rim = new THREE.DirectionalLight(0xdfeaff, 1.1);
    rim.position.set(-2, 1.4, -1.8);
    scene.add(hemi, key, rim);

    // Floors: an invisible shadow catcher for Studio, gridded concrete/epoxy for the others.
    const catcher = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.ShadowNodeMaterial({ opacity: dark ? 0.55 : 0.28 }));
    const floorMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 96), floorMat);
    for (const f of [catcher, floor]) {
      f.rotation.x = -Math.PI / 2;
      f.receiveShadow = true;
      scene.add(f);
    }

    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 0.6;
    controls.maxDistance = 9;
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.7;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    const timer = new THREE.Timer();
    let mixer: THREE.AnimationMixer | null = null;
    let actions: { action: THREE.AnimationAction; states: StateName[] }[] = [];
    let root: THREE.Object3D | null = null;
    let pipeline: THREE.RenderPipeline | null = null;
    let current: StateName = live.current.state;
    const materials = new Map<string, THREE.MeshStandardNodeMaterial[]>();
    const sectionMats: THREE.MeshStandardNodeMaterial[] = [];
    const internals: THREE.Object3D[] = [];
    const levelNodes: THREE.Object3D[] = [];
    const badgeAnchor = new THREE.Vector3(...extras.badge);
    const vibration = extras.effects.find((e) => e.type === "vibration");
    const sp = extras.sectionPlane;
    // three clips the negative side; the contract's normal points at the removed side.
    const plane = sp ? new THREE.Plane(new THREE.Vector3(...sp.normal).negate(), sp.offset) : null;

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const setEnvironment = (e: Environment) => {
      const bg =
        e === "studio" ? new THREE.Color(canvasColor) : e === "plant" ? new THREE.Color(dark ? "#1c1f21" : "#3a3e41") : new THREE.Color("#070b10");
      scene.background = bg;
      scene.fog = e === "studio" ? null : new THREE.Fog(bg, 5.5, 14);
      catcher.visible = e === "studio";
      floor.visible = e !== "studio";
      const [base, line, lineWidth] =
        e === "plant" ? [dark ? "#55595c" : "#8b8f91", dark ? "#3c3f41" : "#6b6f71", 0.035] : ["#0e141b", "#1d4e5a", 0.02];
      const grid = fract(positionWorld.xz.mul(2)).sub(0.5).abs();
      const lineMask = smoothstep(0.5 - lineWidth, 0.5, grid.x.max(grid.y));
      floorMat.colorNode = mix(tslColor(base), tslColor(line), lineMask);
      floorMat.emissiveNode = e === "night" ? tslColor("#1c8a9e").mul(lineMask.mul(0.14)) : vec3(0);
      floorMat.needsUpdate = true;
      if (e === "studio") {
        hemi.color.set(0xffffff);
        hemi.groundColor.set(dark ? 0x202428 : 0xb9b6aa);
        hemi.intensity = dark ? 0.5 : 0.7;
        key.color.set(0xfff6ea);
        key.intensity = dark ? 2.6 : 2.4;
        rim.color.set(0xdfeaff);
        rim.intensity = dark ? 1.6 : 1.1;
        scene.environmentIntensity = dark ? 0.55 : 0.75;
      } else if (e === "plant") {
        hemi.color.set(0xf3ead8);
        hemi.groundColor.set(0x3a3a38);
        hemi.intensity = 0.45;
        key.color.set(0xffe2b8);
        key.intensity = 2.9;
        rim.color.set(0xbcd4ff);
        rim.intensity = 1.2;
        scene.environmentIntensity = 0.45;
      } else {
        hemi.color.set(0x7fa6c8);
        hemi.groundColor.set(0x05080b);
        hemi.intensity = 0.25;
        key.color.set(0xcfe1ff);
        key.intensity = 1.4;
        rim.color.set(0x5bd7fb);
        rim.intensity = 2.6;
        scene.environmentIntensity = 0.28;
      }
    };

    // WebGPU clips through a ClippingGroup; section parts are moved into it at load.
    const clipGroup = new THREE.ClippingGroup();
    if (plane) clipGroup.clippingPlanes = [plane];
    clipGroup.enabled = false;
    const setCut = (on: boolean) => {
      clipGroup.enabled = on;
      for (const m of sectionMats) {
        m.side = on ? THREE.DoubleSide : THREE.FrontSide;
        m.needsUpdate = true;
      }
      for (const o of internals) o.visible = on;
    };

    const setLevelValue = (v: number) => {
      for (const n of levelNodes) n.scale.y = Math.max(0.001, v);
    };

    api.current = {
      apply(s, motionOn) {
        current = s;
        const look = extras.states[s];
        if (!look) return;
        for (const [role, list] of materials) {
          const r = look.roles[role];
          if (!r) continue;
          for (const m of list) {
            m.color.set(r.color);
            m.opacity = r.opacity;
            m.transparent = r.opacity < 1;
            m.emissive.set(r.glow ?? r.color);
            m.emissiveIntensity = r.emissive * (r.glow ? 1 : 2.2);
          }
        }
        for (const a of actions) {
          const play = motionOn && look.animate && a.states.includes(s);
          a.action.paused = !play;
          if (play && !a.action.isRunning()) a.action.play();
        }
        if (badgeRef.current) badgeRef.current.innerHTML = look.badge ? badgeSvg(look.badge, theme, 34) : "";
      },
      setEnv: setEnvironment,
      setCutaway: setCut,
      setLevel: setLevelValue,
    };
    setEnvironment(live.current.env);

    /** glTF gives MeshStandardMaterial; node materials let us hatch section faces. */
    const toNodeMaterial = (m: THREE.MeshStandardMaterial, section: boolean, role: string) => {
      const nm = new THREE.MeshStandardNodeMaterial({
        name: m.name,
        color: m.color,
        roughness: m.roughness,
        metalness: m.metalness,
        emissive: m.emissive,
        opacity: m.opacity,
        transparent: m.transparent,
      });
      if (section) {
        // Inside surfaces revealed by the cut: a dark interior, with a CAD-style
        // orange hatched band right at the cut edge (near the section plane).
        const n = sp ? new THREE.Vector3(...sp.normal) : new THREE.Vector3(0, 0, 1);
        const dist = positionWorld.dot(vec3(n.x, n.y, n.z)).sub(sp?.offset ?? 0).abs();
        const stripes = fract(positionWorld.x.add(positionWorld.y).mul(90));
        const hatch = mix(tslColor("#e26a33"), tslColor("#b84a20"), smoothstep(0.35, 0.65, stripes));
        const interior = role === "fill" ? materialColor.mul(0.8) : materialColor.mul(0.32).add(tslColor("#1a1c1e").mul(0.4));
        const back = mix(hatch, interior, smoothstep(0.012, 0.02, dist));
        nm.colorNode = select(frontFacing, materialColor, back);
        sectionMats.push(nm);
      }
      return nm;
    };

    (async () => {
      try {
        await renderer.init();
        if (disposed) return;
        setBackend((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL 2");

        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        setEnvironment(live.current.env);

        try {
          // Depth for AO must not be multisampled (WebGPU can't gather from it).
          const prePass = pass(scene, camera, { samples: 0 });
          prePass.setMRT(mrt({ output: normalView }));
          const aoPass = ao(prePass.getTextureNode("depth"), prePass.getTextureNode(), camera);
          aoPass.resolutionScale = 1;
          aoPass.samples.value = 24;
          const scenePass = pass(scene, camera, { samples: 4 });
          scenePass.setMRT(mrt({ output, emissive }));
          // AO darkens ambient/indirect light only, so creases read without muddying paint.
          scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
          const glow = bloom(scenePass.getTextureNode("emissive"), 1.1, 0.55, 0);
          pipeline = new THREE.RenderPipeline(renderer);
          pipeline.outputNode = scenePass.getTextureNode("output").add(glow);
        } catch {
          pipeline = null;
        }

        const gltf = await new GLTFLoader().parseAsync(glb.slice().buffer as ArrayBuffer, "");
        if (disposed) return;
        const shared = new Map<string, THREE.MeshStandardNodeMaterial>();
        gltf.scene.traverse((o) => {
          const vt = (o.userData as { vt?: { section?: boolean; internal?: boolean } }).vt;
          if (vt?.internal) internals.push(o);
          if (extras.levels.some((l) => l.node === o.name)) levelNodes.push(o);
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const src = mesh.material as THREE.MeshStandardMaterial;
          // Section parts get their own material instance so only they are clipped.
          const section = !!(vt?.section ?? (mesh.parent?.userData as { vt?: { section?: boolean } })?.vt?.section);
          const k = section ? `${src.name}#${mesh.uuid}` : src.name;
          let nm = shared.get(k);
          if (!nm) {
            nm = toNodeMaterial(src, section, src.name.replace(/^vt-role-/, "").split("--")[0]!);
            shared.set(k, nm);
            // Contract: vt-role-<role>[--<finish>]
            const role = src.name.replace(/^vt-role-/, "").split("--")[0]!;
            materials.set(role, [...(materials.get(role) ?? []), nm]);
          }
          src.dispose();
          mesh.material = nm;
        });
        // Internal parts may be nested meshes under a named node.
        for (const o of [...internals]) o.traverse((c) => c !== o && internals.push(c));
        // Move section parts under the clipping group, keeping their placement.
        gltf.scene.add(clipGroup);
        const sectionObjects: THREE.Object3D[] = [];
        gltf.scene.traverse((o) => {
          if ((o.userData as { vt?: { section?: boolean } }).vt?.section) sectionObjects.push(o);
        });
        for (const o of sectionObjects) clipGroup.attach(o);
        root = gltf.scene;
        scene.add(gltf.scene);

        mixer = new THREE.AnimationMixer(gltf.scene);
        actions = extras.animations
          .map((a) => {
            const clip = gltf.animations.find((c) => c.name === a.gltfAnimation);
            return clip ? { action: mixer!.clipAction(clip), states: a.states } : null;
          })
          .filter((a): a is { action: THREE.AnimationAction; states: StateName[] } => !!a);

        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const radius = size.length() / 2;
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(0.95, 0.62, 1.35).normalize().multiplyScalar(radius * 3.3));
        controls.update();
        setCut(live.current.cutaway);
        setLevelValue(live.current.level);
        api.current?.apply(live.current.state, live.current.motion);
      } catch (e) {
        setError((e as Error).message);
      }
    })();

    const v = new THREE.Vector3();
    renderer.setAnimationLoop(() => {
      timer.update();
      const dt = timer.getDelta();
      mixer?.update(dt);
      if (root) {
        // Vibration effect (e.g. warning): a small, fast shake of the whole model.
        const shake = vibration && live.current.motion && vibration.states?.includes(current);
        const t = timer.getElapsed() * Math.PI * 2 * (vibration?.frequencyHz ?? 0);
        const a = shake ? (vibration!.amplitude ?? 0) : 0;
        root.position.set(Math.sin(t) * a, 0, Math.cos(t * 1.37) * a);
      }
      controls.update();
      if (pipeline) pipeline.render();
      else renderer.render(scene, camera);
      const b = badgeRef.current;
      if (b) {
        v.copy(badgeAnchor).project(camera);
        b.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px) translate(-50%, -50%)`;
      }
    });

    return () => {
      disposed = true;
      api.current = null;
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      pipeline?.dispose();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
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
