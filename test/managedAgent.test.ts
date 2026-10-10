import { afterEach, describe, expect, it, vi } from "vitest";

// The caller only needs fetch; stub the DB module so no DATABASE_URL is needed.
vi.mock("@/db", () => ({ db: {}, schema: {} }));
process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
const { claudeCaller, parseModelJson, MANAGED_MODEL } = await import("../src/lib/managedAgent");

const req = { system: "sys", pack: '{"openFixtures":[]}', soul: "be bold" };

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("parseModelJson", () => {
  it("parses plain and fenced JSON", () => {
    expect(parseModelJson('{"picks":[]}')).toEqual({ picks: [] });
    expect(parseModelJson('```json\n{"picks":[]}\n```')).toEqual({ picks: [] });
  });
  it("returns null for non-JSON or empty", () => {
    expect(parseModelJson("sure, here you go")).toBeNull();
    expect(parseModelJson(null)).toBeNull();
  });
});

describe("claudeCaller (OpenRouter)", () => {
  it("sends a schema-constrained chat completion with the OpenRouter key", async () => {
    const fetch = mockFetch(200, {
      choices: [{ finish_reason: "stop", message: { content: '{"picks":[{"market_id":20,"home":2,"away":1,"why":"x"}]}' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 80 } },
    });
    const r = await claudeCaller(req);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-or-v1-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(MANAGED_MODEL);
    expect(MANAGED_MODEL).toMatch(/^anthropic\//);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(body.messages[1].content[1].text).toContain("be bold");

    expect(r.refused).toBe(false);
    expect(r.output).toEqual({ picks: [{ market_id: 20, home: 2, away: 1, why: "x" }] });
    expect(r.usage).toEqual({ input: 100, output: 20, cacheRead: 80 });
  });

  it("throws a model API error on a bad key, so the run log shows it", async () => {
    mockFetch(401, { error: { code: 401, message: "No auth credentials found" } });
    await expect(claudeCaller(req)).rejects.toThrow("model API 401: No auth credentials found");
  });

  it("throws on an error reported inside a 200 body", async () => {
    mockFetch(200, { error: { code: 502, message: "provider unavailable" } });
    await expect(claudeCaller(req)).rejects.toThrow("model API 502: provider unavailable");
  });

  it("reports a refusal with no output", async () => {
    mockFetch(200, { choices: [{ finish_reason: "stop", message: { content: null, refusal: "no" } }], usage: {} });
    const r = await claudeCaller(req);
    expect(r.refused).toBe(true);
    expect(r.output).toBeNull();
  });
});
