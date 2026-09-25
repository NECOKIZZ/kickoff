import { createPublicClient, createWalletClient, http, parseEventLogs, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AGENT_VAULT_ADDRESS,
  ESCROW_ADDRESS,
  MOCKUSDC_ADDRESS,
  agentVaultAbi,
  escrowAbi,
  robinhoodTestnet,
  tusdcAbi,
} from "@/lib/chainConfig";

// ---------------------------------------------------------------------------
// Server-side chain wiring (relayer writes + stake verification). The chain
// object, addresses and ABIs live in chainConfig.ts so the browser can share
// them without pulling in anything that touches the relayer key.
// On-chain calls are OPTIONAL in dev: when CHAIN_ENABLED is false every
// helper below no-ops so the offline tests and mock-data flow keep working.
// ---------------------------------------------------------------------------

export {
  AGENT_VAULT_ADDRESS,
  ESCROW_ADDRESS,
  MOCKUSDC_ADDRESS,
  VAULT_ADDRESS,
  escrowAbi,
  robinhoodTestnet,
} from "@/lib/chainConfig";

/** On-chain wiring is active when the escrow address + relayer key are set. */
export const CHAIN_ENABLED = Boolean(ESCROW_ADDRESS && process.env.DEPLOYER_PRIVATE_KEY);

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

/** Max positions per on-chain market — bounds the single-tx settle's gas. */
export const MAX_POSITIONS = 300;

export interface MarketKnobs {
  kind: "scoreline" | "player_points";
  stakeMode: "variable" | "fixed";
  gamma: number;
  takeRateBps: number;
  accumulatorShareBps: number;
  capMultiple: number;
  locksAt: Date;
  minStake: bigint;
  maxStake: bigint;
  fixedStake: bigint | null;
}

/** DB knobs → the escrow's MarketConfig struct (enums as their uint8). */
export function toOnChainConfig(k: MarketKnobs) {
  return {
    kind: k.kind === "scoreline" ? 0 : 1,
    stakeMode: k.stakeMode === "variable" ? 0 : 1,
    gamma: k.gamma,
    takeRateBps: k.takeRateBps,
    accShareBps: k.accumulatorShareBps,
    capMultiple: k.capMultiple,
    maxPositions: MAX_POSITIONS,
    locksAt: BigInt(Math.floor(k.locksAt.getTime() / 1000)),
    minStake: k.minStake,
    maxStake: k.maxStake,
    fixedStake: k.fixedStake ?? 0n,
  };
}

/**
 * List a market on the escrow in Draft (lister role = the relayer key on
 * testnet). Returns the escrow address + the contract's own market id, or
 * null when chain wiring is off.
 */
export async function createMarketOnChain(
  k: MarketKnobs,
): Promise<{ escrowAddress: Hex; onChainMarketId: bigint; txHash: Hex } | null> {
  if (!CHAIN_ENABLED) return null;
  const wallet = relayerClient();
  const hash = await wallet.writeContract({
    address: ESCROW_ADDRESS!,
    abi: escrowAbi,
    functionName: "createMarket",
    args: [toOnChainConfig(k)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`createMarket reverted (${hash})`);
  const [created] = parseEventLogs({ abi: escrowAbi, eventName: "MarketCreated", logs: receipt.logs });
  if (!created) throw new Error(`createMarket emitted no MarketCreated (${hash})`);
  return { escrowAddress: ESCROW_ADDRESS!, onChainMarketId: created.args.marketId, txHash: hash };
}

/** Replace a Draft market's config on-chain (the escrow refuses once open). */
export async function updateDraftConfigOnChain(onChainMarketId: bigint, k: MarketKnobs): Promise<Hex | null> {
  if (!CHAIN_ENABLED) return null;
  return writeAndWait("updateDraftConfig", [onChainMarketId, toOnChainConfig(k)]);
}

/** Draft → Open on-chain. From here the escrow's config is immutable. */
export async function openMarketOnChain(onChainMarketId: bigint): Promise<Hex | null> {
  if (!CHAIN_ENABLED) return null;
  return writeAndWait("openMarket", [onChainMarketId]);
}

/** Relayer write that FAILS on a reverted receipt (viem's wait doesn't throw on revert). */
async function writeAndWait(functionName: any, args: any): Promise<Hex> {
  const wallet = relayerClient();
  const hash = await wallet.writeContract({ address: ESCROW_ADDRESS!, abi: escrowAbi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  return hash;
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
  return writeAndWait("settle", [onChainMarketId, actualA, actualB]);
}

/** Owner void on-chain (abandoned/postponed fixture). Null when wiring is off. */
export async function voidOnChain(onChainMarketId: bigint, reason: string): Promise<Hex | null> {
  if (!CHAIN_ENABLED) return null;
  return writeAndWait("voidMarket", [onChainMarketId, reason]);
}

export interface VerifiedStake {
  /** Amount moved by THIS tx (a fixed-mode restake moves 0). */
  amount: bigint;
  guessA: number;
  guessB: number;
  restake: boolean;
}

/**
 * Verify a claimed stake tx and read what it actually did: the tx succeeded
 * and the escrow emitted Staked(marketId, trader) in it. The DB records the
 * amount and guess from this event, never from the request body. Returns
 * false on any mismatch, null when chain wiring is off (dev mode).
 */
export async function verifyStakeTx(
  txHash: Hex,
  onChainMarketId: bigint,
  trader: Hex,
): Promise<VerifiedStake | false | null> {
  if (!CHAIN_ENABLED) return null;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") return false;
    const staked = parseEventLogs({ abi: escrowAbi, eventName: "Staked", logs: receipt.logs }).find(
      (l) =>
        l.address.toLowerCase() === ESCROW_ADDRESS!.toLowerCase() &&
        l.args.marketId === onChainMarketId &&
        l.args.trader.toLowerCase() === trader.toLowerCase(),
    );
    if (!staked) return false;
    return {
      amount: staked.args.stake,
      guessA: staked.args.guessA,
      guessB: staked.args.guessB,
      restake: staked.args.restake,
    };
  } catch {
    return false;
  }
}

/** Verify a claim tx: success + escrow Claimed(marketId, trader). Returns the amount. */
export async function verifyClaimTx(txHash: Hex, onChainMarketId: bigint, trader: Hex): Promise<bigint | false | null> {
  if (!CHAIN_ENABLED) return null;
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") return false;
    const claimed = parseEventLogs({ abi: escrowAbi, eventName: "Claimed", logs: receipt.logs }).find(
      (l) =>
        l.address.toLowerCase() === ESCROW_ADDRESS!.toLowerCase() &&
        l.args.marketId === onChainMarketId &&
        l.args.trader.toLowerCase() === trader.toLowerCase(),
    );
    return claimed ? claimed.args.amount : false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Testnet top-up: gas ETH + tUSDC from the server wallet, so a new tester can
// stake without first finding a faucet. Amounts are env-tunable.
// ---------------------------------------------------------------------------

const DRIP_ETH_WEI = BigInt(process.env.FAUCET_ETH_WEI ?? "2000000000000000"); // 0.002 ETH
const DRIP_TUSDC = BigInt(process.env.FAUCET_TUSDC ?? "100000000"); // 100 tUSDC
// Only top up what's actually low, so repeat clicks can't farm the drip.
const MIN_ETH_WEI = DRIP_ETH_WEI / 4n;
const MIN_TUSDC = DRIP_TUSDC / 2n;

export interface DripResult {
  ethTxHash: Hex | null;
  tusdcTxHash: Hex | null;
}

export async function dripTestFunds(to: Hex): Promise<DripResult | null> {
  if (!CHAIN_ENABLED || !MOCKUSDC_ADDRESS) return null;
  const wallet = relayerClient();
  const out: DripResult = { ethTxHash: null, tusdcTxHash: null };

  if ((await publicClient.getBalance({ address: to })) < MIN_ETH_WEI) {
    const hash = await wallet.sendTransaction({ to, value: DRIP_ETH_WEI });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`ETH drip reverted (${hash})`);
    out.ethTxHash = hash;
  }

  const tusdc = await publicClient.readContract({ address: MOCKUSDC_ADDRESS, abi: tusdcAbi, functionName: "balanceOf", args: [to] });
  if (tusdc < MIN_TUSDC) {
    // MockUSDC.faucet mints to the caller; mint to the server wallet, then send.
    const mint = await wallet.writeContract({ address: MOCKUSDC_ADDRESS, abi: tusdcAbi, functionName: "faucet", args: [DRIP_TUSDC] });
    await publicClient.waitForTransactionReceipt({ hash: mint });
    const hash = await wallet.writeContract({ address: MOCKUSDC_ADDRESS, abi: tusdcAbi, functionName: "transfer", args: [to, DRIP_TUSDC] });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`tUSDC drip reverted (${hash})`);
    out.tusdcTxHash = hash;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Agent accounts (AgentVault). The operator key registers agents and places
// their predictions; it can only ever move an agent's money into the escrow.
// Testnet reuses the deployer key unless AGENT_OPERATOR_PRIVATE_KEY is set.
// ---------------------------------------------------------------------------

/** Agent staking is live when chain wiring is on AND an AgentVault is configured. */
export const AGENTS_ON_CHAIN = CHAIN_ENABLED && !!AGENT_VAULT_ADDRESS;

function operatorClient() {
  const pk = (process.env.AGENT_OPERATOR_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY) as Hex;
  return createWalletClient({ account: privateKeyToAccount(pk), chain: robinhoodTestnet, transport: http() });
}

async function operatorWrite(functionName: any, args: any): Promise<Hex> {
  const hash = await operatorClient().writeContract({ address: AGENT_VAULT_ADDRESS!, abi: agentVaultAbi, functionName, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`AgentVault.${functionName} reverted (${hash})`);
  return hash;
}

/** Gasless for the human: the operator submits their signed LinkAgent. */
export async function registerAgentOnChain(human: Hex, deadline: bigint, signature: Hex): Promise<Hex | null> {
  if (!AGENTS_ON_CHAIN) return null;
  return operatorWrite("registerAgentFor", [human, deadline, signature]);
}

/** Place (or re-guess) an agent's prediction at the market's fixed stake. */
export async function agentStakeOnChain(agent: Hex, onChainMarketId: bigint, guessA: number, guessB: number): Promise<Hex | null> {
  if (!AGENTS_ON_CHAIN) return null;
  return operatorWrite("stake", [agent, onChainMarketId, guessA, guessB]);
}

/** Sweep a settled/void payout back into the agent's vault balance. */
export async function agentClaimOnChain(agent: Hex, onChainMarketId: bigint): Promise<Hex | null> {
  if (!AGENTS_ON_CHAIN) return null;
  return operatorWrite("claim", [agent, onChainMarketId]);
}

/** Vault view of an agent: owner, paused, spendable balance. */
export async function agentVaultState(agent: Hex): Promise<{ owner: Hex; paused: boolean; balance: bigint } | null> {
  if (!AGENT_VAULT_ADDRESS) return null;
  const [owner, paused, balance] = await publicClient.readContract({
    address: AGENT_VAULT_ADDRESS,
    abi: agentVaultAbi,
    functionName: "agents",
    args: [agent],
  });
  return { owner, paused, balance };
}

/** Platform kill switch: halt/resume ALL agent staking on-chain (vault owner). */
export async function setAgentStakingHalted(halted: boolean): Promise<Hex | null> {
  if (!AGENTS_ON_CHAIN) return null;
  const hash = await relayerClient().writeContract({
    address: AGENT_VAULT_ADDRESS!,
    abi: agentVaultAbi,
    functionName: "setStakingHalted",
    args: [halted],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`setStakingHalted reverted (${hash})`);
  return hash;
}

export async function agentStakingHalted(): Promise<boolean | null> {
  if (!AGENT_VAULT_ADDRESS) return null;
  return publicClient.readContract({ address: AGENT_VAULT_ADDRESS, abi: agentVaultAbi, functionName: "stakingHalted" });
}
