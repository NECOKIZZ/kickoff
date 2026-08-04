"use client";

/**
 * Admin API helpers. The key is held in sessionStorage (cleared on tab close)
 * and sent as the same bearer every /api/admin/* route already requires —
 * the server is the gate; this client just remembers the key.
 */

const KEY_STORAGE = "kickoff-admin-key";

export function getAdminKey(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(KEY_STORAGE);
}

export function setAdminKey(key: string | null) {
  if (key) sessionStorage.setItem(KEY_STORAGE, key);
  else sessionStorage.removeItem(KEY_STORAGE);
}

export class AdminAuthError extends Error {}

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getAdminKey();
  if (!key) throw new AdminAuthError("no admin key");
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${key}`);
  if (init?.body) headers.set("content-type", "application/json");
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (res.status === 401) throw new AdminAuthError("key rejected");
  if (!res.ok) throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}
