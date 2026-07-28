import { describe, it, expect } from "vitest";
import type { WebhookEvent } from "@kickoff/schema";
import { buildDelivery, deliver, signBody, verifySignature } from "../src/api/webhooks";

const EVENT: WebhookEvent = {
  type: "settlement.ready",
  fixture_id: "epl-2026-arsenal-chelsea-20260815T1400",
  snapshot_version: 1,
};
const SENT_AT = new Date("2026-08-15T16:15:00Z");
const SECRET = "test-secret";

describe("webhooks: signing", () => {
  it("signature covers the exact body bytes and round-trips verify", () => {
    const d = buildDelivery(EVENT, SECRET, SENT_AT);
    expect(verifySignature(SECRET, d.body, d.headers["x-kickoff-signature"]!)).toBe(true);
  });

  it("tampered body or wrong secret fails verification", () => {
    const d = buildDelivery(EVENT, SECRET, SENT_AT);
    const sig = d.headers["x-kickoff-signature"]!;
    expect(verifySignature(SECRET, d.body.replace("1", "2"), sig)).toBe(false);
    expect(verifySignature("other-secret", d.body, sig)).toBe(false);
    expect(verifySignature(SECRET, d.body, "deadbeef")).toBe(false);
  });

  it("body carries the event plus sent_at", () => {
    const d = buildDelivery(EVENT, SECRET, SENT_AT);
    expect(JSON.parse(d.body)).toEqual({ ...EVENT, sent_at: "2026-08-15T16:15:00.000Z" });
    expect(d.headers["x-kickoff-event"]).toBe("settlement.ready");
  });

  it("signBody is deterministic", () => {
    expect(signBody(SECRET, "abc")).toBe(signBody(SECRET, "abc"));
  });
});

describe("webhooks: delivery retry ladder", () => {
  const config = { url: "https://app.test/hooks", secret: SECRET };
  const noSleep = (ms: number) => {
    void ms;
    return Promise.resolve();
  };

  it("2xx on first try → true, one call", async () => {
    let calls = 0;
    const ok = await deliver(config, EVENT, {
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(new Response("", { status: 200 }));
      }) as typeof fetch,
      sleep: noSleep,
      now: () => SENT_AT,
    });
    expect(ok).toBe(true);
    expect(calls).toBe(1);
  });

  it("failures retry through the ladder then give up → false", async () => {
    let calls = 0;
    const ok = await deliver(config, EVENT, {
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(new Response("", { status: 500 }));
      }) as typeof fetch,
      sleep: noSleep,
      now: () => SENT_AT,
    });
    expect(ok).toBe(false);
    expect(calls).toBe(3);
  });

  it("network throw is retried like a 5xx", async () => {
    let calls = 0;
    const ok = await deliver(config, EVENT, {
      fetchImpl: (() => {
        calls++;
        return calls < 3
          ? Promise.reject(new Error("ECONNREFUSED"))
          : Promise.resolve(new Response("", { status: 200 }));
      }) as typeof fetch,
      sleep: noSleep,
      now: () => SENT_AT,
    });
    expect(ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("unconfigured → false immediately, zero calls", async () => {
    let calls = 0;
    const ok = await deliver({ url: undefined, secret: undefined }, EVENT, {
      fetchImpl: (() => {
        calls++;
        return Promise.resolve(new Response("", { status: 200 }));
      }) as typeof fetch,
      sleep: noSleep,
    });
    expect(ok).toBe(false);
    expect(calls).toBe(0);
  });
});
