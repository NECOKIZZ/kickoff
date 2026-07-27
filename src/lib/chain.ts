import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ---------------------------------------------------------------------------
// Robinhood Chain wiring (master spec §2.4) — testnet 46630 now; the mainnet
// cutover (4663) is a chain-object + env swap, never a code change.
// Contract addresses come from env (deployed 2026-07-27, see
// contracts/deployments.json). On-chain calls are OPTIONAL in dev: when
// CHAIN_ENABLED is false every helper below no-ops so the 39 offline tests
// and the mock-data flow keep working without an RPC.
// ---------------------------------------------------------------------------

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: { default: { http: [process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com/rpc"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
});

export const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Hex | undefined;
export const MOCKUSDC_ADDRESS = process.env.NEXT_PUBLIC_MOCKUSDC_ADDRESS as Hex | undefined;
export const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Hex | undefined;

/** On-chain wiring is active when the escrow address + relayer key are set. */
export const CHAIN_ENABLED = Boolean(ESCROW_ADDRESS && process.env.DEPLOYER_PRIVATE_KEY);

// Minimal ABI — only what the app calls/reads. Full ABI lives in the forge
// artifacts (/tmp/kickoff-forge-out) and regenerates from source.
export const escrowAbi = parseAbi([
  "function createMarket((uint8 kind, uint8 stakeMode, uint8 gamma, uint16 takeRateBps, uint16 accShareBps, uint16 capMultiple, uint16 maxPositions, uint64 locksAt, uint128 minStake, uint128 maxStake, uint128 fixedStake) cfg) returns (uint256)",
  "function openMarket(uint256 marketId)",
  "function settle(uint256 marketId, uint32 actualA, uint32 actualB)",
  "function voidMarket(uint256 marketId, string reason)",
  "function stake(uint256 marketId, uint32 guessA, uint32 guessB, uint128 amount)",
  "function claim(uint256 marketId)",
  "function payoutOf(uint256 marketId, address trader) view returns (uint256)",
  "function positionCount(uint256 marketId) view returns (uint256)",
  "function marketCount() view returns (uint256)",
  "event Staked(uint256 indexed marketId, address indexed trader, uint256 stake, uint32 guessA, uint32 guessB, bool restake)",
]);

export const publicClient = createPublicClient({ chain: robinhoodTestnet, transport: http() });

/**
 * Relayer wallet — testnet phase reuses the deployer key (owner+relayer+agent
 * on the deployed escrow; see deployments.json). Split before mainnet.
 */
function relayerClient() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as Hex;
  return createWalletClient({
    account: privateKeyToAccount(pk),
    chain: robinhoodTestnet,
    transport: http(),
  });
}

/**
 * Submit a settlement outcome on-chain (relayer-only escrow call) and wait
 * for inclusion. Returns the tx hash, or null when chain wiring is off.
 * Market B packs points into actualA (uint32 fixed-point ×1e6), actualB = 0 —
 * same convention the escrow uses for guesses.
 */
export async function settleOnChain(
  onChainMarketId: bigint,
  actualA: number,
  actualB: number,
): Promise<Hex | null> {
  if (!CHAIN_ENABLED) return null;
  const wallet = relayerClient();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS!,
    abi: escrowAbi,
    functionName: "settle",
    args: [onChainMarketId, actualA, actualB],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Owner void on-chain (abandoned/postponed fixture). Null when wiring is off. */
export async function voidOnChain(onChainMarketId: bigint, reason: string): Promise<Hex | null> {
  if (!CHAIN_ENABLED) return null;
  const wallet = relayerClient();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS!,
    abi: escrowAbi,
    functionName: "voidMarket",
    args: [onChainMarketId, reason],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Verify a claimed stake tx: confirms the tx succeeded, hit the escrow, and
 * emitted a Staked event for (marketId, trader). Best-effort — returns false
 * on any mismatch, null when chain wiring is off (dev-mode accepts as-is).
 */
export async function verifyStakeTx(
  txHash: Hex,
  onChainMarketId: bigint,
  trader: Hex,
): Promise<boolean | null> {
  if (!CHAIN_ENABLED) return null;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") return false;
    if (receipt.to?.toLowerCase() !== ESCROW_ADDRESS!.toLowerCase()) return false;
    const logs = await publicClient.getContractEvents({
      address: ESCROW_ADDRESS!,
      abi: escrowAbi,
      eventName: "Staked",
      args: { marketId: onChainMarketId, trader },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    return logs.some((l) => l.transactionHash === txHash);
  } catch {
    return false;
  }
}
