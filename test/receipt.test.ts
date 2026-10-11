import { describe, expect, it, vi } from "vitest";
import { waitForReceipt } from "../src/lib/receipt";

const hash = "0xabc" as const;
const receipt = { status: "success", transactionHash: hash } as any;
const notFound = new Error('Transaction receipt with hash "0xabc" could not be found.');
const noSleep = async () => {};

describe("waitForReceipt", () => {
  it("returns viem's receipt when the wait succeeds", async () => {
    const client = { waitForTransactionReceipt: vi.fn().mockResolvedValue(receipt), getTransactionReceipt: vi.fn() };
    expect(await waitForReceipt(client as any, hash, { sleep: noSleep })).toBe(receipt);
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it("recovers a mined tx when viem's wait rejects (lagging RPC node)", async () => {
    const client = {
      waitForTransactionReceipt: vi.fn().mockRejectedValue(notFound),
      getTransactionReceipt: vi.fn().mockRejectedValueOnce(notFound).mockResolvedValueOnce(receipt),
    };
    expect(await waitForReceipt(client as any, hash, { sleep: noSleep })).toBe(receipt);
    expect(client.getTransactionReceipt).toHaveBeenCalledTimes(2);
  });

  it("rethrows the original error when the receipt never appears", async () => {
    const client = {
      waitForTransactionReceipt: vi.fn().mockRejectedValue(notFound),
      getTransactionReceipt: vi.fn().mockRejectedValue(new Error("still missing")),
    };
    await expect(waitForReceipt(client as any, hash, { attempts: 3, sleep: noSleep })).rejects.toBe(notFound);
    expect(client.getTransactionReceipt).toHaveBeenCalledTimes(3);
  });
});
