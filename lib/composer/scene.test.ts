import { describe, expect, it } from "vitest";
import { generate } from "../symbols/index.ts";
import {
  decodeSceneCode,
  demoScene,
  encodeSceneCode,
  exportSceneKit,
  nextItemId,
  parseScene,
  pipeMeshes,
  pipeRoutes,
  place3d,
  placeItem,
  renderSceneSvg,
  route2d,
  SCENE_SCHEMA,
  type SceneItem,
} from "./scene.ts";

const pump = (over: Partial<SceneItem> = {}): SceneItem => ({
  id: "p",
  generator: "pump.centrifugal",
  params: {},
  state: "running",
  x: 100,
  y: 50,
  rotation: 0,
  ...over,
});

describe("placeItem", () => {
  it("offsets ports by the item position and the viewBox origin", () => {
    const vo = generate("pump.centrifugal", {});
    const p = placeItem(pump());
    const d = p.ports.find((q) => q.id === "discharge")!;
    const src = vo.ports.find((q) => q.id === "discharge")!;
    expect([d.sx, d.sy]).toEqual([100 + src.x - vo.viewBox[0], 50 + src.y - vo.viewBox[1]]);
    expect(d.dir).toEqual([0, -1]);
  });

  it("turns port directions and swaps the box with a quarter rotation", () => {
    const flat = placeItem(pump());
    const turned = placeItem(pump({ rotation: 90 }));
    expect([turned.w, turned.h]).toEqual([flat.h, flat.w]);
    // Discharge points up (270°); a clockwise quarter turn points it right.
    expect(turned.ports.find((q) => q.id === "discharge")!.dir).toEqual([1, 0]);
    for (const q of turned.ports) {
      expect(q.sx).toBeGreaterThanOrEqual(100 - 1e-6);
      expect(q.sx).toBeLessThanOrEqual(100 + turned.w + 1e-6);
      expect(q.sy).toBeGreaterThanOrEqual(50 - 1e-6);
      expect(q.sy).toBeLessThanOrEqual(50 + turned.h + 1e-6);
    }
  });

  it("mirrors suction to the other side", () => {
    const m = placeItem(pump({ mirror: true }));
    expect(m.ports.find((q) => q.id === "suction")!.dir).toEqual([1, 0]);
  });
});

describe("route2d", () => {
  it("produces orthogonal routes that start and end on the ports", () => {
    const cases = [
      [{ sx: 0, sy: 0, dir: [1, 0] as [number, number] }, { sx: 100, sy: 40, dir: [-1, 0] as [number, number] }],
      [{ sx: 0, sy: 0, dir: [0, -1] as [number, number] }, { sx: 80, sy: 60, dir: [-1, 0] as [number, number] }],
      [{ sx: 0, sy: 0, dir: [0, 1] as [number, number] }, { sx: 50, sy: 90, dir: [0, -1] as [number, number] }],
    ] as const;
    for (const [a, b] of cases) {
      const pts = route2d(a, b);
      expect(pts[0]).toEqual([a.sx, a.sy]);
      expect(pts[pts.length - 1]).toEqual([b.sx, b.sy]);
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1]!;
        const [x1, y1] = pts[i]!;
        expect(x0 === x1 || y0 === y1).toBe(true);
      }
    }
  });
});

describe("renderSceneSvg", () => {
  it("renders every item and pipe with unique element ids", () => {
    const scene = demoScene();
    const svg = renderSceneSvg(scene, { style: "high-performance", theme: "light", showPorts: true });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.match(/class="vt-item"/g)).toHaveLength(scene.items.length);
    expect(svg.match(/class="vt-pipe"/g)).toHaveLength(scene.pipes.length);
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(svg).toContain("TK-101");
  });

  it("only animates flow on pipes touching a running item", () => {
    const routes = pipeRoutes(demoScene());
    expect(routes.find((r) => r.pipe.id === "l-2")!.flowing).toBe(true);
    const idle = demoScene();
    for (const it of idle.items) it.state = "normal";
    expect(pipeRoutes(idle).some((r) => r.flowing)).toBe(false);
  });

  it("is deterministic", () => {
    const a = renderSceneSvg(demoScene(), { style: "modern-flat", theme: "dark" });
    const b = renderSceneSvg(demoScene(), { style: "modern-flat", theme: "dark" });
    expect(a).toBe(b);
  });
});

describe("scene data", () => {
  it("round-trips through a share code", async () => {
    const scene = { ...demoScene(), style: "outline" as const, theme: "dark" as const };
    const code = await encodeSceneCode(scene);
    expect(code).toMatch(/^[zj]0\./);
    expect(await decodeSceneCode(code)).toEqual(scene);
  });

  it("drops unknown generators, dangling pipes and bad values", () => {
    const s = parseScene({
      schema: SCENE_SCHEMA,
      items: [pump({ rotation: 45 as 0, state: "exploded" as "normal" }), { ...pump({ id: "x" }), generator: "nope.nope" }],
      pipes: [
        { id: "a", from: { item: "p", port: "discharge" }, to: { item: "x", port: "inlet" } },
        { id: "b", from: { item: "p", port: "discharge" }, to: { item: "p", port: "suction" } },
      ],
    });
    expect(s.items.map((i) => i.id)).toEqual(["p"]);
    expect(s.items[0]!.rotation).toBe(0);
    expect(s.items[0]!.state).toBe("normal");
    expect(s.pipes.map((p) => p.id)).toEqual(["b"]);
    expect(() => parseScene({ schema: "vt.recipe/v0" })).toThrow();
  });

  it("picks the next free item id", () => {
    expect(nextItemId(demoScene(), "pump.centrifugal")).toBe("pump-2");
    expect(nextItemId(demoScene(), "motor.induction")).toBe("motor-1");
  });
});

describe("3D layout", () => {
  it("rotates port directions with the item", () => {
    const [flat] = place3d({ schema: SCENE_SCHEMA, items: [pump()], pipes: [] });
    const [turned] = place3d({ schema: SCENE_SCHEMA, items: [pump({ rotation: 90 })], pipes: [] });
    const s0 = flat!.ports.find((p) => p.id === "suction")!.worldDir;
    const s1 = turned!.ports.find((p) => p.id === "suction")!.worldDir;
    // Horizontal directions turn a quarter about Y; vertical components are unchanged.
    expect(Math.hypot(s0[0], s0[2])).toBeCloseTo(Math.hypot(s1[0], s1[2]), 6);
    expect(s0[0] * s1[0] + s0[2] * s1[2]).toBeCloseTo(0, 6);
    expect(s1[1]).toBeCloseTo(s0[1], 6);
  });

  it("routes low under the equipment from a bottom outlet", () => {
    const scene = demoScene();
    const placed = place3d(scene);
    const tank = placed.find((p) => p.item.id === "tank-1")!.ports.find((p) => p.id === "outlet")!;
    const valve = placed.find((p) => p.item.id === "valve-1")!.ports.find((p) => p.id === "inlet")!;
    const run = pipeMeshes(scene).find((p) => p.id === "l-1")!.path;
    // No rack above the equipment: the run never climbs past the higher end.
    expect(Math.max(...run.map((p) => p[1]))).toBeLessThanOrEqual(Math.max(tank.world[1], valve.world[1]) + 1e-6);
    expect(Math.min(...run.map((p) => p[1]))).toBeGreaterThan(0.05);
  });

  it("exports a scene kit with a model per item and the pipes", () => {
    const kit = exportSceneKit(demoScene(), { style: "modern-flat", theme: "light" });
    const paths = kit.entries.map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["models/tank-1.glb", "models/pump-1.glb", "pipes.glb", "scene.json", "transfer-skid.svg"]));
    const layout = JSON.parse(kit.entries.find((e) => e.path === "scene.json")!.content as string);
    expect(layout.layout3d.items).toHaveLength(4);
    expect(kit.filename).toBe("transfer-skid-scene-kit.zip");
  });

  it("builds valid pipe meshes that start and end on the ports", () => {
    const scene = demoScene();
    const placed = place3d(scene);
    const meshes = pipeMeshes(scene);
    expect(meshes).toHaveLength(scene.pipes.length);
    for (const { id, mesh, path } of meshes) {
      const pipe = scene.pipes.find((p) => p.id === id)!;
      const a = placed.find((p) => p.item.id === pipe.from.item)!.ports.find((p) => p.id === pipe.from.port)!.world;
      const b = placed.find((p) => p.item.id === pipe.to.item)!.ports.find((p) => p.id === pipe.to.port)!.world;
      expect(path[0]).toEqual(a);
      expect(path[path.length - 1]).toEqual(b);
      const verts = mesh.positions.length / 3;
      expect(mesh.positions.every(Number.isFinite)).toBe(true);
      expect(mesh.indices.every((i) => i >= 0 && i < verts)).toBe(true);
      expect(mesh.indices.length % 3).toBe(0);
    }
  });
});
