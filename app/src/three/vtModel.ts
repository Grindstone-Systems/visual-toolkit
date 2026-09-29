import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { color as tslColor, fract, frontFacing, materialColor, mix, positionWorld, select, smoothstep, vec3 } from "three/tsl";
import { readGlbJson, type BadgeKind, type StateName } from "../../../lib/index.ts";

/**
 * Reference consumer of the vt.spatial contract for one .glb:
 *  - switches state from `extras.vt.states` (recolour by role, play clips),
 *  - drives `levels` (Y-scaled nodes), `effects` (vibration) and the
 *    cutaway `sectionPlane` (clip `section` nodes, reveal `internal` ones).
 * Dimension Engine mirrors this behaviour in PlayCanvas.
 */

type Vec3 = [number, number, number];
export interface VtExtras {
  states: Record<string, { roles: Record<string, { color: string; opacity: number; emissive: number; glow?: string }>; badge?: BadgeKind; animate: boolean }>;
  animations: { gltfAnimation: string; states: StateName[] }[];
  badge: Vec3;
  levels: { node: string; bottom: number; top: number; value: number }[];
  effects: { type: string; states?: StateName[]; amplitude?: number; frequencyHz?: number }[];
  sectionPlane?: { normal: Vec3; offset: number };
}

export const glbExtras = (glb: Uint8Array) => (readGlbJson(glb).extras as { vt: VtExtras }).vt;

export interface VtModel {
  /** Add this to the scene. Vibration moves `root` itself, so place it inside your own group. */
  root: THREE.Object3D;
  extras: VtExtras;
  /** Badge anchor in the model's own space. */
  badgeAnchor: THREE.Vector3;
  apply(state: StateName, motion: boolean): void;
  setCut(on: boolean): void;
  setLevel(v: number): void;
  update(dt: number, elapsed: number, motion: boolean): void;
}

export async function loadVtModel(glb: Uint8Array): Promise<VtModel> {
  const extras = glbExtras(glb);
  const materials = new Map<string, THREE.MeshStandardNodeMaterial[]>();
  const sectionMats: THREE.MeshStandardNodeMaterial[] = [];
  const internals: THREE.Object3D[] = [];
  const levelNodes: THREE.Object3D[] = [];
  const vibration = extras.effects.find((e) => e.type === "vibration");
  const sp = extras.sectionPlane;
  // three clips the negative side; the contract's normal points at the removed side.
  const plane = sp ? new THREE.Plane(new THREE.Vector3(...sp.normal).negate(), sp.offset) : null;
  let current: StateName = "normal";

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

  const gltf = await new GLTFLoader().parseAsync(glb.slice().buffer as ArrayBuffer, "");
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
      // Contract: vt-role-<role>[--<finish>]
      const role = src.name.replace(/^vt-role-/, "").split("--")[0]!;
      nm = toNodeMaterial(src, section, role);
      shared.set(k, nm);
      materials.set(role, [...(materials.get(role) ?? []), nm]);
    }
    src.dispose();
    mesh.material = nm;
  });
  // Internal parts may be nested meshes under a named node.
  for (const o of [...internals]) o.traverse((c) => c !== o && internals.push(c));
  for (const o of internals) o.visible = false;

  // WebGPU clips through a ClippingGroup; section parts are moved into it, keeping their placement.
  const clipGroup = new THREE.ClippingGroup();
  if (plane) clipGroup.clippingPlanes = [plane];
  clipGroup.enabled = false;
  gltf.scene.add(clipGroup);
  const sectionObjects: THREE.Object3D[] = [];
  gltf.scene.traverse((o) => {
    if ((o.userData as { vt?: { section?: boolean } }).vt?.section) sectionObjects.push(o);
  });
  for (const o of sectionObjects) clipGroup.attach(o);

  const mixer = new THREE.AnimationMixer(gltf.scene);
  const actions = extras.animations
    .map((a) => {
      const clip = gltf.animations.find((c) => c.name === a.gltfAnimation);
      return clip ? { action: mixer.clipAction(clip), states: a.states } : null;
    })
    .filter((a): a is { action: THREE.AnimationAction; states: StateName[] } => !!a);

  return {
    root: gltf.scene,
    extras,
    badgeAnchor: new THREE.Vector3(...extras.badge),
    apply(s, motion) {
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
        const play = motion && look.animate && a.states.includes(s);
        a.action.paused = !play;
        if (play && !a.action.isRunning()) a.action.play();
      }
    },
    setCut(on) {
      clipGroup.enabled = on;
      for (const m of sectionMats) {
        m.side = on ? THREE.DoubleSide : THREE.FrontSide;
        m.needsUpdate = true;
      }
      for (const o of internals) o.visible = on;
    },
    setLevel(v) {
      for (const n of levelNodes) n.scale.y = Math.max(0.001, v);
    },
    update(dt, elapsed, motion) {
      mixer.update(dt);
      // Vibration effect (e.g. warning): a small, fast shake of the whole model.
      const shake = vibration && motion && vibration.states?.includes(current);
      const t = elapsed * Math.PI * 2 * (vibration?.frequencyHz ?? 0);
      const a = shake ? (vibration!.amplitude ?? 0) : 0;
      gltf.scene.position.set(Math.sin(t) * a, 0, Math.cos(t * 1.37) * a);
    },
  };
}
