// Binance Web3 Wallet API client (server only) for the ETF League on BSC.
//
// Docs: https://web3.binance.com/en/dev-docs/introduction
//   - Auth: HMAC-SHA256 over timestamp + METHOD + requestPath(+query, incl.
//     the /build prefix) + body, Base64, in X-OC-SIGN.
//   - RWA Data: tokenized-stock list, prices (on-chain + reference), market status.
//   - Trading: aggregated quotes and swap transactions. `feePercent` +
//     `fromTokenReferrerWalletAddress` pays an integrator fee out of the input
//     token — the league uses it to pay ETF creators on every basket buy.
//
// Secrets stay server-side: BINANCE_W3_API_KEY / BINANCE_W3_SECRET_KEY.

import { createHmac } from "node:crypto";

export const W3_BASE = process.env.BINANCE_W3_BASE_URL ?? "https://web3.binance.com";
const PREFIX = "/build";

/** Binance chain id for BNB Smart Chain. */
export const BSC = "56";

export class BinanceW3Error extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | number | undefined,
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = "BinanceW3Error";
  }
}

/** The X-OC-SIGN value for one request (exported for tests). */
export function signRequest(secret: string, timestamp: string, method: string, requestPath: string, body = ""): string {
  return createHmac("sha256", secret).update(timestamp + method.toUpperCase() + requestPath + body, "utf8").digest("base64");
}

type Query = Record<string, string | number | boolean | undefined>;

/** Query string in insertion order, URL-encoded, undefined values dropped. */
export function toQuery(q: Query = {}): string {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export interface W3Credentials {
  apiKey: string;
  secretKey: string;
}

function credentials(): W3Credentials {
  const apiKey = process.env.BINANCE_W3_API_KEY;
  const secretKey = process.env.BINANCE_W3_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error("BINANCE_W3_API_KEY / BINANCE_W3_SECRET_KEY not set");
  return { apiKey, secretKey };
}

const OK_CODES = new Set(["0", "000000", "200"]);

/** Signed request. Returns the `data` field of the response envelope. */
export async function w3Request<T>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Query; body?: unknown; creds?: W3Credentials; fetchImpl?: typeof fetch } = {},
): Promise<T> {
  const { apiKey, secretKey } = opts.creds ?? credentials();
  const requestPath = `${PREFIX}${path}${toQuery(opts.query)}`;
  const body = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const timestamp = new Date().toISOString();
  const res = await (opts.fetchImpl ?? fetch)(`${W3_BASE}${requestPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-OC-APIKEY": apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signRequest(secretKey, timestamp, method, requestPath, body),
      "X-OC-RECV-WINDOW": "10000",
    },
    body: method === "GET" ? undefined : body,
    cache: "no-store",
  });
  const text = await res.text();
  let json: { code?: string | number; message?: string; msg?: string; success?: boolean; data?: T } | undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    throw new BinanceW3Error(res.status, undefined, `non-JSON response: ${text.slice(0, 200)}`, path);
  }
  const code = json?.code;
  const failed = !res.ok || json?.success === false || (code !== undefined && !OK_CODES.has(String(code)));
  if (failed) {
    throw new BinanceW3Error(res.status, code, json?.message ?? json?.msg ?? `HTTP ${res.status}`, path);
  }
  return (json?.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// RWA Data (tokenized stocks)
// ---------------------------------------------------------------------------

export type RwaPlatform = "ondo" | "bstock";

/** Loosely typed: field names follow the docs; unknown extras are kept. */
export interface RwaToken {
  tokenContractAddress?: string;
  contractAddress?: string;
  symbol?: string;
  name?: string;
  decimals?: number | string;
  logoUrl?: string;
  platformId?: string;
  marketStatus?: string; // TRADING | MARKET_CLOSED | MARKET_PAUSED | ...
  openState?: string | number;
  price?: string;          // on-chain USD price
  referencePrice?: string; // underlying share price
  [k: string]: unknown;
}

export interface RwaPrice {
  tokenContractAddress?: string;
  price?: string;
  referencePrice?: string;
  updateTime?: number | string;
  [k: string]: unknown;
}

export const rwaTokens = (q: { binanceChainId?: string; platformId?: RwaPlatform; tabId?: string } = {}) =>
  w3Request<RwaToken[] | { list?: RwaToken[] }>("GET", "/api/v1/dex/market/rwa/tokens", {
    query: { binanceChainId: q.binanceChainId ?? BSC, platformId: q.platformId, tabId: q.tabId },
  }).then((d) => (Array.isArray(d) ? d : (d.list ?? [])));

export const rwaPrices = (addresses: string[], binanceChainId = BSC) => {
  if (addresses.length > 100) throw new Error("rwaPrices: max 100 addresses per call");
  return w3Request<RwaPrice[]>("GET", "/api/v1/dex/market/rwa/price", {
    query: { binanceChainId, tokenContractAddresses: addresses.join(",") },
  });
};

export const rwaUnderlyingMarket = (tokenContractAddress: string, binanceChainId = BSC) =>
  w3Request<Record<string, unknown>>("GET", "/api/v1/dex/market/rwa/underlying-market", {
    query: { binanceChainId, tokenContractAddress },
  });

// ---------------------------------------------------------------------------
// Trading (aggregated swaps)
// ---------------------------------------------------------------------------

export interface QuoteRoute {
  quoteId: string;
  vendorName: string;
  toTokenAmount: string;
  executionMode: "SWAP" | "RFQ";
  approveTarget?: string;
  [k: string]: unknown;
}

export interface SwapTx {
  tx: { from: string; to: string; data: string; value: string; gas?: string; gasPrice?: string; minReceiveAmount?: string };
  executionMode: "SWAP" | "RFQ";
  /** RFQ only: EIP-712 typed data the user signs, then submitRfqOrder. */
  rfq?: { typedData?: unknown; [k: string]: unknown };
  [k: string]: unknown;
}

export interface SwapRequest {
  fromTokenAddress: string;
  toTokenAddress: string;
  amount: bigint;         // input, base units
  userWalletAddress: string;
  /** Integrator fee, percent (e.g. 1 = 1%). 0–5 on EVM. */
  feePercent?: number;
  /** Fee recipient, paid out of the input token. */
  referrer?: string;
  slippagePercent?: number;
}

const feeQuery = (r: SwapRequest): Query =>
  r.feePercent && r.referrer
    ? { feePercent: r.feePercent.toFixed(2), fromTokenReferrerWalletAddress: r.referrer }
    : {};

export function quote(r: SwapRequest, binanceChainId = BSC): Promise<QuoteRoute[]> {
  return w3Request<QuoteRoute[]>("GET", "/api/v1/dex/aggregator/quote", {
    query: {
      binanceChainId,
      amount: r.amount.toString(),
      fromTokenAddress: r.fromTokenAddress,
      toTokenAddress: r.toTokenAddress,
      userWalletAddress: r.userWalletAddress,
      ...(r.feePercent && r.referrer ? { feePercent: r.feePercent.toFixed(2), feeSource: "FROM_TOKEN" } : {}),
    },
  });
}

export function buildSwap(r: SwapRequest, quoteId: string, binanceChainId = BSC): Promise<SwapTx> {
  return w3Request<SwapTx>("GET", "/api/v1/dex/aggregator/swap", {
    query: {
      binanceChainId,
      amount: r.amount.toString(),
      fromTokenAddress: r.fromTokenAddress,
      toTokenAddress: r.toTokenAddress,
      userWalletAddress: r.userWalletAddress,
      quoteId,
      ...(r.slippagePercent !== undefined ? { slippagePercent: r.slippagePercent } : { autoSlippage: true }),
      approveTransaction: true,
      ...feeQuery(r),
    },
  });
}

export const submitRfqOrder = (body: { requestId: string; userSignature: string; vendor: string; quoteId: string }) =>
  w3Request<{ orderId: string; status: string }>("POST", "/api/v1/dex/aggregator/order/submit", { body });

export const rfqOrderStatus = (orderId: string) =>
  w3Request<{ status: string; txHash?: string }>("GET", `/api/v1/dex/aggregator/order/${encodeURIComponent(orderId)}`);

export const txStatus = (txHash: string, binanceChainId = BSC) =>
  w3Request<unknown>("GET", "/api/v1/dex/aggregator/history", { query: { binanceChainId, txHash } });
