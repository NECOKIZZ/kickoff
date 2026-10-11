// Receipt wait that survives a lagging RPC node. viem's waitForTransactionReceipt
// can reject with "receipt could not be found" for a transaction that DID mine:
// one node reports the tx in block N, another (behind the load balancer) hasn't
// seen the receipt yet, and viem's replacement check gives up on the spot. A
// mined stake reported as failed leaves the chain and the DB disagreeing (agent
// 1, market 12). So on any error we keep asking for the receipt for a while
// before treating the send as failed.

import type { Hex, PublicClient, TransactionReceipt } from "viem";

const FALLBACK_ATTEMPTS = 15;
const FALLBACK_DELAY_MS = 2_000;

export async function waitForReceipt(
  client: Pick<PublicClient, "waitForTransactionReceipt" | "getTransactionReceipt">,
  hash: Hex,
  opts: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<TransactionReceipt> {
  const { attempts = FALLBACK_ATTEMPTS, delayMs = FALLBACK_DELAY_MS } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  try {
    return await client.waitForTransactionReceipt({ hash });
  } catch (err) {
    for (let i = 0; i < attempts; i++) {
      await sleep(delayMs);
      try {
        return await client.getTransactionReceipt({ hash });
      } catch {
        // not visible yet — keep polling
      }
    }
    throw err;
  }
}
