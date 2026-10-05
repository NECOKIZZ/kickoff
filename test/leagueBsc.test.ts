import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signRequest, toQuery, w3Request, BinanceW3Error } from "@/lib/league/binanceWeb3";
import { teamKeyOf, splitBuy, clampCreatorFee } from "@/lib/league/basket";

const NVDA = "0x1111111111111111111111111111111111111111";
const TSLA = "0x2222222222222222222222222222222222222222";
const AAPL = "0x3333333333333333333333333333333333333333";

describe("Binance Web3 signing", () => {
  it("signs timestamp + METHOD + path(+query) + body, Base64 HMAC-SHA256", () => {
    const ts = "2026-05-11T10:08:57.715Z";
    const path = "/build/api/v1/dex/market/price?chainId=1&symbol=ETH%20USDT";
    const expected = createHmac("sha256", "secret").update(`${ts}GET${path}`).digest("base64");
    expect(signRequest("secret", ts, "get", path)).toBe(expected);
  });

  it("builds an encoded query, dropping undefined", () => {
    expect(toQuery({ a: "x y", b: undefined, c: 1 })).toBe("?a=x%20y&c=1");
    expect(toQuery({})).toBe("");
  });

  it("sends signed headers with the /build prefix and unwraps data", async () => {
    let seen: { url: string; headers: Record<string, string> } | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string> };
      return new Response(JSON.stringify({ code: "000000", data: [{ symbol: "NVDAB" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const data = await w3Request<{ symbol: string }[]>("GET", "/api/v1/dex/market/rwa/tokens", {
      query: { binanceChainId: "56" },
      creds: { apiKey: "k", secretKey: "s" },
      fetchImpl,
    });
    expect(data[0].symbol).toBe("NVDAB");
    expect(seen!.url).toBe("https://web3.binance.com/build/api/v1/dex/market/rwa/tokens?binanceChainId=56");
    const h = seen!.headers;
    expect(h["X-OC-APIKEY"]).toBe("k");
    expect(h["X-OC-SIGN"]).toBe(
      signRequest("s", h["X-OC-TIMESTAMP"], "GET", "/build/api/v1/dex/market/rwa/tokens?binanceChainId=56"),
    );
  });

  it("throws BinanceW3Error on an error envelope", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ code: "100001", message: "invalid sign" }), { status: 200 })) as unknown as typeof fetch;
    await expect(
      w3Request("GET", "/x", { creds: { apiKey: "k", secretKey: "s" }, fetchImpl }),
    ).rejects.toBeInstanceOf(BinanceW3Error);
  });
});

describe("team keys (clone-merging)", () => {
  it("same stocks and weights → same team, whatever the size or order", () => {
    const a = teamKeyOf([NVDA, TSLA, AAPL], [40n, 30n, 30n]);
    const b = teamKeyOf([AAPL, NVDA, TSLA], [300n, 400n, 300n]);
    expect(a).toBe(b);
  });
  it("weights within the same 1% bucket merge; different weights do not", () => {
    const a = teamKeyOf([NVDA, TSLA, AAPL], [4000n, 3000n, 3000n]);
    expect(teamKeyOf([NVDA, TSLA, AAPL], [4001n, 3000n, 2999n])).toBe(a);
    expect(teamKeyOf([NVDA, TSLA, AAPL], [5000n, 2500n, 2500n])).not.toBe(a);
  });
  it("is case-insensitive on addresses", () => {
    expect(teamKeyOf([NVDA.toUpperCase().replace("0X", "0x"), TSLA, AAPL], [1n, 1n, 1n])).toBe(
      teamKeyOf([NVDA, TSLA, AAPL], [1n, 1n, 1n]),
    );
  });
});

describe("buy the basket", () => {
  it("splits by weight and always sums to the total", () => {
    const legs = splitBuy([NVDA, TSLA, AAPL], [3333, 3333, 3334], 10n * 10n ** 18n + 1n);
    expect(legs.reduce((s, l) => s + l.amountIn, 0n)).toBe(10n * 10n ** 18n + 1n);
    expect(legs).toHaveLength(3);
  });
  it("clamps the creator fee to 0–2%", () => {
    expect(clampCreatorFee(undefined)).toBe(1);
    expect(clampCreatorFee(9)).toBe(2);
    expect(clampCreatorFee(-1)).toBe(0);
    expect(clampCreatorFee(0.555)).toBe(0.56);
  });
});
