// Webhook dispatch — kickoff-data → markets app (spec §3). Pure core +
// tiny fetch shell, same split as routes.ts: buildDelivery/signBody are
// testable without a network; deliver() is the only side-effectful bit.
//
// Semantics: at-least-once with bounded retry. The markets app dedupes on
// (type, fixture_id, snapshot_version) — deliveries are idempotent by
// construction, so a duplicate is harmless and a drop is recoverable (the
// app can always poll GET /v1/settlement).

import { createHmac, timingSafeEqual } from "node:crypto";
import type { WebhookEvent } from "@kickoff/schema";

export interface WebhookConfig {
  /** Markets-app endpoint, e.g. https://kickoff.cash/api/data-hooks */
  url: string | undefined;
  /** Shared HMAC secret — signature goes in x-kickoff-signature. */
  secret: string | undefined;
}

export interface Delivery {
  body: string; // exact JSON to POST (signature covers these bytes)
  headers: Record<string, string>;
}

/** HMAC-SHA256 over the exact body bytes, hex-encoded. */
export function signBody(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Consumer-side check (markets app imports this via @kickoff/data until it
 *  goes HTTP-only, then copies it — 6 lines, no drift risk). */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = Buffer.from(signBody(secret, body), "hex");
  const got = Buffer.from(signature, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function buildDelivery(event: WebhookEvent, secret: string, sentAt: Date): Delivery {
  const body = JSON.stringify({ ...event, sent_at: sentAt.toISOString() });
  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-kickoff-signature": signBody(secret, body),
      "x-kickoff-event": event.type,
    },
  };
}

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000]; // then give up — polling covers us

/**
 * POST one event. Resolves true on 2xx, false after all retries fail —
 * callers log-and-continue; a dead consumer must never stall the worker
 * (same rule as job runners).
 */
export async function deliver(
  config: WebhookConfig,
  event: WebhookEvent,
  opts: {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => Date;
  } = {},
): Promise<boolean> {
  if (!config.url || !config.secret) return false; // unconfigured = disabled, loudly at startup
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => new Date());

  for (let attempt = 0; ; attempt++) {
    const { body, headers } = buildDelivery(event, config.secret, now());
    try {
      const res = await fetchImpl(config.url, { method: "POST", headers, body });
      if (res.ok) return true;
      // 4xx = our bug or their outage-config, 5xx = transient; retry both —
      // the delay ladder is short enough that it doesn't matter.
      console.error(`[webhook] ${event.type} → ${res.status} (attempt ${attempt + 1})`);
    } catch (e) {
      console.error(`[webhook] ${event.type} → ${(e as Error).message} (attempt ${attempt + 1})`);
    }
    if (attempt >= RETRY_DELAYS_MS.length - 1) return false;
    await sleep(RETRY_DELAYS_MS[attempt]!);
  }
}

export function webhookConfigFromEnv(): WebhookConfig {
  return {
    url: process.env.KICKOFF_DATA_WEBHOOK_URL,
    secret: process.env.KICKOFF_DATA_WEBHOOK_SECRET,
  };
}
