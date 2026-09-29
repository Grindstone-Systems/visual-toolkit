import type { Mesh, Vec3 } from "../types.ts";

/**
 * Minimal, dependency-free glTF 2.0 binary (.glb) writer. Enough for
 * stylised equipment: indexed triangle meshes, metallic-roughness
 * materials, node pivots, rotation animations and `extras` metadata.
 */

export interface GltfMaterial {
  name: string;
  /** Linear RGB. */
  color: Vec3;
  alpha: number;
  metallic: number;
  roughness: number;
  emissive?: Vec3;
}

export interface GltfNode {
  name: string;
  mesh: Mesh;
  material: number;
  translation: Vec3;
  extras?: Record<string, unknown>;
}

export interface GltfRotation {
  name: string;
  node: number;
  axis: Vec3;
  periodS: number;
}

export interface GltfDocument {
  name: string;
  nodes: GltfNode[];
  materials: GltfMaterial[];
  animations: GltfRotation[];
  extras: Record<string, unknown>;
}

/** sRGB hex → linear RGB, as glTF material factors require. */
export function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => {
    const s = v / 255;
    return Math.round((s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * 1e4) / 1e4;
  };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
}

export function writeGlb(doc: GltfDocument): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];

  const addView = (bytes: Uint8Array, target?: number) => {
    const pad = (4 - (byteLength % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      byteLength += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes);
    byteLength += bytes.byteLength;
    return bufferViews.length - 1;
  };
  const addAccessor = (a: Record<string, unknown>) => (accessors.push(a), accessors.length - 1);
  const f32 = (arr: number[]) => new Uint8Array(new Float32Array(arr).buffer);

  const meshes = doc.nodes.map((n) => {
    const p = n.mesh.positions;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, p[i + k]!);
        max[k] = Math.max(max[k]!, p[i + k]!);
      }
    }
    const count = p.length / 3;
    const pos = addAccessor({ bufferView: addView(f32(p), 34962), componentType: 5126, count, type: "VEC3", min, max });
    const nor = addAccessor({ bufferView: addView(f32(n.mesh.normals), 34962), componentType: 5126, count, type: "VEC3" });
    const big = count > 65535;
    const idxBytes = big
      ? new Uint8Array(new Uint32Array(n.mesh.indices).buffer)
      : new Uint8Array(new Uint16Array(n.mesh.indices).buffer);
    const idx = addAccessor({
      bufferView: addView(idxBytes, 34963),
      componentType: big ? 5125 : 5123,
      count: n.mesh.indices.length,
      type: "SCALAR",
    });
    return { name: n.name, primitives: [{ attributes: { POSITION: pos, NORMAL: nor }, indices: idx, material: n.material }] };
  });

  const animations = doc.animations.map((a) => {
    const times = [0, 0.25, 0.5, 0.75, 1].map((t) => t * a.periodS);
    const quats: number[] = [];
    for (let i = 0; i < 5; i++) {
      const half = (i * Math.PI) / 4; // 0, 90°, 180°, 270°, 360° → half-angles
      const s = Math.sin(half);
      quats.push(a.axis[0] * s, a.axis[1] * s, a.axis[2] * s, Math.cos(half));
    }
    const input = addAccessor({ bufferView: addView(f32(times)), componentType: 5126, count: 5, type: "SCALAR", min: [0], max: [a.periodS] });
    const output = addAccessor({ bufferView: addView(f32(quats.map((q) => Math.round(q * 1e6) / 1e6))), componentType: 5126, count: 5, type: "VEC4" });
    return {
      name: a.name,
      samplers: [{ input, output, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: a.node, path: "rotation" } }],
    };
  });

  const json = {
    asset: { version: "2.0", generator: "Visual Toolkit (Grindstone Systems)" },
    scene: 0,
    scenes: [{ name: doc.name, nodes: doc.nodes.map((_, i) => i) }],
    nodes: doc.nodes.map((n, i) => ({ name: n.name, mesh: i, translation: n.translation, ...(n.extras ? { extras: n.extras } : {}) })),
    meshes,
    materials: doc.materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: { baseColorFactor: [...m.color, m.alpha], metallicFactor: m.metallic, roughnessFactor: m.roughness },
      ...(m.emissive ? { emissiveFactor: m.emissive } : {}),
      ...(m.alpha < 1 ? { alphaMode: "BLEND" } : {}),
    })),
    ...(animations.length ? { animations } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: Math.ceil(byteLength / 4) * 4 }],
    extras: doc.extras,
  };

  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  if (jsonPad) {
    const padded = new Uint8Array(jsonBytes.length + jsonPad).fill(0x20);
    padded.set(jsonBytes);
    jsonBytes = padded;
  }
  const binLength = Math.ceil(byteLength / 4) * 4;
  const total = 12 + 8 + jsonBytes.length + 8 + binLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); // "glTF"
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  let o = 20 + jsonBytes.length;
  dv.setUint32(o, binLength, true);
  dv.setUint32(o + 4, 0x004e4942, true); // "BIN\0"
  o += 8;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Parse the JSON chunk of a .glb (for tests and tooling). */
export function readGlbJson(glb: Uint8Array): Record<string, unknown> {
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB file");
  const len = dv.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + len)));
}
