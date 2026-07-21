import { NextResponse } from "next/server";

/**
 * JSON responses with BigInt support: money/distance values are serialized as
 * strings (base units), which is also what the frontend should feed to viem.
 */
export function json(data: unknown, init?: ResponseInit): NextResponse {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  return new NextResponse(body, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
}

export function jsonError(message: string, status: number): NextResponse {
  return json({ error: message }, { status });
}

/** Parse a non-negative base-unit amount from a string field. */
export function parseAmount(v: unknown): bigint | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  try {
    const b = BigInt(v);
    return b >= 0n ? b : null;
  } catch {
    return null;
  }
}
