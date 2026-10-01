import { afterEach, describe, expect, it, vi } from "vitest";
import { describeToRecipe, DESCRIBE_MODEL } from "./describe.ts";

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function mockFetch(reply: { status?: number; json: unknown }) {
  const calls: Captured[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      calls.push({ url: String(url), headers, body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response(JSON.stringify(reply.json), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const message = (text: string, stop_reason = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: DESCRIBE_MODEL,
  content: [{ type: "text", text }],
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

afterEach(() => vi.unstubAllGlobals());

describe("describeToRecipe", () => {
  it("sends a browser BYOK request with fallbacks, structured output and the image first", async () => {
    const calls = mockFetch({
      json: message(
        JSON.stringify({
          generator: "pump.centrifugal",
          params_json: JSON.stringify({ driver: "none", label: "P-204", discharge: "side" }),
          style: "high-performance",
          paint: "signal-blue",
          state: "running",
          summary: "Bare-shaft pump P-204 with side discharge.",
        }),
      ),
    });
    const r = await describeToRecipe({
      apiKey: "sk-ant-test",
      text: "bare shaft pump P-204 side discharge, ISA-101 look",
      image: { mediaType: "image/png", base64: "iVBORw0KGgo=" },
      theme: "dark",
    });
    const c = calls[0]!;
    expect(c.url).toMatch(/\/v1\/messages/);
    expect(c.headers["x-api-key"]).toBe("sk-ant-test");
    expect(c.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(c.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(c.body.model).toBe("claude-opus-5-5");
    expect(c.body.fallbacks).toBe("default");
    expect((c.body.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    const content = (c.body.messages as { content: { type: string }[] }[])[0]!.content;
    expect(content.map((b) => b.type)).toEqual(["image", "text"]);
    expect(String(c.body.system)).toContain("pump.centrifugal");
    expect(r.recipe).toMatchObject({ generator: "pump.centrifugal", style: "high-performance", paint: "signal-blue", state: "running", theme: "dark" });
    expect(r.recipe.params).toMatchObject({ driver: "none", label: "P-204" });
  });

  it("reports refusals and bad keys clearly", async () => {
    mockFetch({ json: message("", "refusal") });
    await expect(describeToRecipe({ apiKey: "k", text: "x", theme: "light" })).rejects.toThrow(/declined/);
    mockFetch({ status: 401, json: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } });
    await expect(describeToRecipe({ apiKey: "bad", text: "x", theme: "light" })).rejects.toThrow(/key was rejected/);
  });
});
