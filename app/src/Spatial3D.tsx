import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { builtinAOContext, emissive, mrt, normalView, output, pass, screenUV } from "three/tsl";
import { badgeSvg, getTheme, readGlbJson, type BadgeKind, type StateName, type ThemeId } from "../../lib/index.ts";

/**
 * 3D preview. It loads the exact .glb the Export panel downloads and switches
 * state the way any renderer (e.g. Dimension Engine) should: from the
 * `extras.vt.states` map — recolour materials by role, play the glTF
 * animation while the state animates. This file is the reference consumer.
 */

interface VtStates {
  [state: string]: {
    roles: Record<string, { color: string; opacity: number; emissive: number; glow?: string }>;
    badge?: BadgeKind;
    animate: boolean;
  };
}
interface VtExtras {
  states: VtStates;
  animations: { gltfAnimation: string; states: StateName[] }[];
  badge: [number, number, number];
}

export default function Spatial3D({ glb, state, theme, motion }: { glb: Uint8Array; state: StateName; theme: ThemeId; motion: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const api = useRef<{ apply: (s: StateName, motion: boolean) => void } | null>(null);
  const [backend, setBackend] = useState<string>("");
  // Latest state/motion for the async loader, without rebuilding the scene.
  const live = useRef({ state, motion });
  live.current = { state, motion };
  const [error, setError] = useState<string | null>(null);
  const extras = useMemo(() => (readGlbJson(glb).extras as { vt: VtExtras }).vt, [glb]);
  const canvasColor = getTheme(theme).tokens["surface.canvas"];

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
    scene.background = new THREE.Color(canvasColor);
    const dark = getTheme(theme).scheme === "dark";
    scene.add(new THREE.HemisphereLight(0xffffff, dark ? 0x202428 : 0xb9b6aa, dark ? 0.5 : 0.7));
    const key = new THREE.DirectionalLight(0xfff6ea, dark ? 2.6 : 2.4);
    key.position.set(1.6, 2.8, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    Object.assign(key.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 0.1, far: 8 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfeaff, dark ? 1.6 : 1.1);
    rim.position.set(-2, 1.4, -1.8);
    scene.add(rim);

    // Shadow-catcher floor: invisible except for shadows, so the model sits
    // on the page colour with no horizon line.
    const ground = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.ShadowNodeMaterial({ opacity: dark ? 0.55 : 0.28 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 50);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 0.8;
    controls.maxDistance = 8;
    // Slow turntable until the viewer takes over.
    controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.autoRotateSpeed = 0.7;
    controls.addEventListener("start", () => (controls.autoRotate = false));

    const timer = new THREE.Timer();
    let mixer: THREE.AnimationMixer | null = null;
    let actions: { action: THREE.AnimationAction; states: StateName[] }[] = [];
    const materials = new Map<string, THREE.MeshStandardMaterial[]>();
    let pipeline: THREE.RenderPipeline | null = null;
    const badgeAnchor = new THREE.Vector3(...extras.badge);

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

    api.current = {
      apply(s, motionOn) {
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
        const b = badgeRef.current;
        if (b) {
          b.innerHTML = look.badge ? badgeSvg(look.badge, theme, 34) : "";
        }
      },
    };

    (async () => {
      try {
        await renderer.init();
        if (disposed) return;
        const backendName = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL 2";
        setBackend(backendName);

        // Studio image-based lighting gives metal and paint real reflections.
        const pmrem = new THREE.PMREMGenerator(renderer);
        scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environmentIntensity = dark ? 0.55 : 0.75;

        // Ambient occlusion + bloom on emissive parts (the status beacon).
        try {
          // Depth for AO must not be multisampled (WebGPU can't gather from it).
          const prePass = pass(scene, camera, { samples: 0 });
          prePass.setMRT(mrt({ output: normalView }));
          const depth = prePass.getTextureNode("depth");
          const normal = prePass.getTextureNode();
          const aoPass = ao(depth, normal, camera);
          aoPass.resolutionScale = 1;
          aoPass.samples.value = 24;
          const scenePass = pass(scene, camera, { samples: 4 });
          scenePass.setMRT(mrt({ output, emissive }));
          // AO darkens ambient/indirect light only, so creases read without muddying paint.
          scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
          const color = scenePass.getTextureNode("output");
          const glow = bloom(scenePass.getTextureNode("emissive"), 1.1, 0.55, 0);
          pipeline = new THREE.RenderPipeline(renderer);
          pipeline.outputNode = color.add(glow);
        } catch {
          pipeline = null; // plain rendering still looks good
        }
        const gltf = await new GLTFLoader().parseAsync(glb.slice().buffer as ArrayBuffer, "");
        if (disposed) return;
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const m = mesh.material as THREE.MeshStandardMaterial;
          // Contract: vt-role-<role>[--<finish>]
          const role = m.name.replace(/^vt-role-/, "").split("--")[0]!;
          materials.set(role, [...(materials.get(role) ?? []), m]);
        });
        scene.add(gltf.scene);

        mixer = new THREE.AnimationMixer(gltf.scene);
        actions = extras.animations
          .map((a) => {
            const clip = gltf.animations.find((c) => c.name === a.gltfAnimation);
            return clip ? { action: mixer!.clipAction(clip), states: a.states } : null;
          })
          .filter((a): a is { action: THREE.AnimationAction; states: StateName[] } => !!a);

        // Frame the model in a 3/4 view.
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const radius = size.length() / 2;
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(0.95, 0.62, 1.35).normalize().multiplyScalar(radius * 3.3));
        controls.update();
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
    // Rebuild only when the model or theme changes; state is applied live below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glb, theme]);

  useEffect(() => {
    api.current?.apply(state, motion);
  }, [state, motion]);

  return (
    <div className="spatial">
      <div className="spatial-canvas" ref={host} />
      <div className="spatial-badge" ref={badgeRef} />
      <div className="spatial-meta">
        {error ? <span className="err">3D unavailable: {error}</span> : backend && <span>{backend} · drag to orbit · scroll to zoom</span>}
      </div>
    </div>
  );
}
