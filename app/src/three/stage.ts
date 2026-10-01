import * as THREE from "three/webgpu";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ao } from "three/examples/jsm/tsl/display/GTAONode.js";
import { bloom } from "three/examples/jsm/tsl/display/BloomNode.js";
import { builtinAOContext, color as tslColor, emissive, fract, mix, mrt, normalView, output, pass, positionWorld, screenUV, smoothstep, vec3 } from "three/tsl";
import { getTheme, type ThemeId } from "../../../lib/index.ts";

/**
 * The shared 3D stage: WebGPU renderer (WebGL 2 fallback), image-based
 * lighting, GTAO + bloom, shadowed floors and the three environments.
 * Spatial3D (one model) and the skid composer (a whole scene) both use it.
 */

export type Environment = "studio" | "plant" | "night";
export const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "plant", label: "Plant floor" },
  { id: "night", label: "Night" },
];

export interface Stage {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  dark: boolean;
  /** Resolves to "WebGPU" or "WebGL 2" once the renderer is ready. */
  ready: Promise<string>;
  setEnv(e: Environment): void;
  /** Aim the camera and size the shadow frustum for a bounding box. */
  fit(box: THREE.Box3, view?: THREE.Vector3, distance?: number): void;
  /** Move the camera towards (f < 1) or away from (f > 1) its target, eased over a moment. */
  dolly(f: number): void;
  start(onFrame: (dt: number, elapsed: number) => void): void;
  isDisposed(): boolean;
  dispose(): void;
}

export function createStage(el: HTMLElement, theme: ThemeId, env: Environment): Stage {
  const dark = getTheme(theme).scheme === "dark";
  const canvasColor = getTheme(theme).tokens["surface.canvas"];
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
  scene.add(hemi, key, rim, key.target);

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

  let pipeline: THREE.RenderPipeline | null = null;

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

  const setEnv = (e: Environment) => {
    const bg = e === "studio" ? new THREE.Color(canvasColor) : e === "plant" ? new THREE.Color(dark ? "#1c1f21" : "#3a3e41") : new THREE.Color("#070b10");
    scene.background = bg;
    scene.fog = e === "studio" ? null : new THREE.Fog(bg, 5.5 * fogScale, 14 * fogScale);
    catcher.visible = e === "studio";
    floor.visible = e !== "studio";
    const [base, line, lineWidth] = e === "plant" ? [dark ? "#55595c" : "#8b8f91", dark ? "#3c3f41" : "#6b6f71", 0.035] : ["#0e141b", "#1d4e5a", 0.02];
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
  let fogScale = 1;
  let currentEnv = env;
  setEnv(env);

  const ready = (async () => {
    await renderer.init();
    if (disposed) return "";
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    setEnv(currentEnv);
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
    return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : "WebGL 2";
  })();

  const timer = new THREE.Timer();
  let dollyLeft = 1;

  return {
    renderer,
    scene,
    camera,
    controls,
    dark,
    ready,
    setEnv(e) {
      currentEnv = e;
      setEnv(e);
    },
    fit(box, view = new THREE.Vector3(0.95, 0.62, 1.35), distance = 3.3) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const radius = size.length() / 2;
      controls.target.copy(center);
      controls.maxDistance = Math.max(9, radius * 8);
      camera.far = Math.max(60, radius * 24);
      camera.updateProjectionMatrix();
      // Narrow viewports need more distance to keep wide content in frame.
      const narrow = Math.sqrt(Math.max(1, 1.4 / Math.max(0.3, camera.aspect)));
      camera.position.copy(center).add(view.clone().normalize().multiplyScalar(radius * distance * narrow));
      controls.update();
      // Shadows and fog follow the content's size.
      const r = Math.max(2.5, radius * 1.3);
      Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: r * 4 });
      key.shadow.camera.updateProjectionMatrix();
      key.target.position.copy(center);
      key.position.copy(center).add(new THREE.Vector3(1.6, 2.8, 2.2).normalize().multiplyScalar(r * 1.8));
      const floorScale = Math.max(1, radius / 2);
      catcher.scale.setScalar(floorScale);
      floor.scale.setScalar(floorScale);
      catcher.position.set(center.x, 0, center.z);
      floor.position.set(center.x, 0, center.z);
      fogScale = Math.max(1, radius / 1.2);
      setEnv(currentEnv);
    },
    dolly(f) {
      dollyLeft *= f;
    },
    start(onFrame) {
      renderer.setAnimationLoop(() => {
        timer.update();
        const dt = timer.getDelta();
        if (Math.abs(dollyLeft - 1) > 1e-3) {
          const step = Math.pow(dollyLeft, Math.min(1, dt * 6));
          dollyLeft /= step;
          camera.position.sub(controls.target).multiplyScalar(step).add(controls.target);
        }
        onFrame(dt, timer.getElapsed());
        controls.update();
        if (pipeline) pipeline.render();
        else renderer.render(scene, camera);
      });
    },
    isDisposed: () => disposed,
    dispose() {
      disposed = true;
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
    },
  };
}
