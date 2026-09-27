import { describe, expect, it, vi } from "vitest";

// In-memory stand-in for signer_nonces + a real mutex for the advisory lock.
const store = new Map<string, { nextNonce: number; updatedAt: Date }>();
let lockTail: Promise<void> = Promise.resolve();

vi.mock("@/db", () => ({
  schema: { signerNonces: { address: "address" } },
  db: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      let release!: () => void;
      const prev = lockTail;
      lockTail = new Promise((r) => (release = r));
      let key = "";
      const tx = {
        execute: async () => {
          await prev;
        },
        select: () => ({
          from: () => ({
            where: async (cond: { value: string }) => {
              key = cond.value;
              const row = store.get(key);
              return row ? [{ address: key, ...row }] : [];
            },
          }),
        }),
        insert: () => ({
          values: (v: { address: string; nextNonce: number; updatedAt: Date }) => ({
            onConflictDoUpdate: async () => {
              store.set(v.address, { nextNonce: v.nextNonce, updatedAt: v.updatedAt });
            },
          }),
        }),
      };
      try {
        return await fn(tx);
      } finally {
        release();
      }
    },
  },
}));
vi.mock("drizzle-orm", () => ({ eq: (_c: unknown, value: string) => ({ value }), sql: () => ({}) }));

const { isNonceError, pickNonce, sendSerialized, STORED_NONCE_TTL_MS } = await import("@/lib/txQueue");

describe("pickNonce", () => {
  it("uses the stored nonce when the RPC lags a just-sent tx", () => {
    expect(pickNonce(5, 7, 1_000)).toBe(7);
  });
  it("uses the chain when it is ahead (another sender)", () => {
    expect(pickNonce(9, 7, 1_000)).toBe(9);
  });
  it("ignores a stale stored nonce so a dropped tx leaves no gap", () => {
    expect(pickNonce(5, 7, STORED_NONCE_TTL_MS + 1)).toBe(5);
  });
  it("respects the retry floor", () => {
    expect(pickNonce(5, null, null, 6)).toBe(6);
  });
});

describe("isNonceError", () => {
  it("matches the error testers saw", () => {
    expect(isNonceError(new Error("Nonce provided for the transaction is lower than the current nonce of the account."))).toBe(true);
    expect(isNonceError(new Error("nonce too low"))).toBe(true);
    expect(isNonceError(new Error("replacement transaction underpriced"))).toBe(true);
  });
  it("does not match reverts", () => {
    expect(isNonceError(new Error("execution reverted: AlreadyRegistered()"))).toBe(false);
  });
});

describe("sendSerialized", () => {
  it("hands out distinct, ordered nonces to concurrent sends while the RPC lags", async () => {
    store.clear();
    const used: number[] = [];
    const lagging = async () => 10; // RPC never sees our pending txs
    const sends = Array.from({ length: 5 }, (_, i) =>
      sendSerialized("0xAbC", lagging, async (nonce) => {
        await new Promise((r) => setTimeout(r, 5 - i));
        used.push(nonce);
        return `0x${nonce}` as `0x${string}`;
      }),
    );
    await Promise.all(sends);
    expect(used).toEqual([10, 11, 12, 13, 14]);
  });

  it("moves past a nonce used outside the queue", async () => {
    store.clear();
    let chain = 3;
    const tried: number[] = [];
    const hash = await sendSerialized(
      "0xdef",
      async () => chain,
      async (nonce) => {
        tried.push(nonce);
        if (nonce < 4) {
          chain = 4; // a script sent one meanwhile
          throw new Error("Nonce provided for the transaction is lower than the current nonce of the account.");
        }
        return "0xok";
      },
    );
    expect(hash).toBe("0xok");
    expect(tried).toEqual([3, 4]);
  });

  it("rethrows non-nonce errors without retrying", async () => {
    store.clear();
    const send = vi.fn(async () => {
      throw new Error("execution reverted");
    });
    await expect(sendSerialized("0x1", async () => 0, send)).rejects.toThrow("execution reverted");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("sendSerialized before migration 0008", () => {
  it("falls back to the RPC nonce when signer_nonces is missing", async () => {
    const { db } = await import("@/db");
    const orig = db.transaction;
    (db as any).transaction = async () => {
      throw Object.assign(new Error('relation "signer_nonces" does not exist'), { code: "42P01" });
    };
    try {
      const hash = await sendSerialized("0x2", async () => 8, async (n) => `0x${n}` as `0x${string}`);
      expect(hash).toBe("0x8");
    } finally {
      (db as any).transaction = orig;
    }
  });
});
