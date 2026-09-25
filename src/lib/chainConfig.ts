import { defineChain, parseAbi, type Hex } from "viem";

// ---------------------------------------------------------------------------
// Robinhood Chain config shared by server and browser (master spec §2.4) —
// testnet 46630 now; the mainnet cutover (4663) is a chain-object + env swap,
// never a code change. Addresses come from NEXT_PUBLIC_ env (see
// contracts/deployments.json). Nothing here touches a private key.
// ---------------------------------------------------------------------------

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { decimals: 18, name: "ETH", symbol: "ETH" },
  rpcUrls: {
    default: {
      // NEXT_PUBLIC_ variant reaches the browser; RH_RPC_URL stays server-only.
      http: [
        process.env.NEXT_PUBLIC_RH_RPC_URL ?? process.env.RH_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com/rpc",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://explorer.testnet.chain.robinhood.com" },
  },
});

export const ESCROW_ADDRESS = process.env.NEXT_PUBLIC_ESCROW_ADDRESS as Hex | undefined;
export const MOCKUSDC_ADDRESS = process.env.NEXT_PUBLIC_MOCKUSDC_ADDRESS as Hex | undefined;
export const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Hex | undefined;
export const AGENT_VAULT_ADDRESS = process.env.NEXT_PUBLIC_AGENT_VAULT_ADDRESS as Hex | undefined;

// Minimal ABIs — only what the app calls/reads. Full ABIs regenerate from
// the forge artifacts.
const CONFIG_TUPLE =
  "(uint8 kind, uint8 stakeMode, uint8 gamma, uint16 takeRateBps, uint16 accShareBps, uint16 capMultiple, uint16 maxPositions, uint64 locksAt, uint128 minStake, uint128 maxStake, uint128 fixedStake)";

export const escrowAbi = parseAbi([
  `function createMarket(${CONFIG_TUPLE} cfg) returns (uint256)`,
  `function updateDraftConfig(uint256 marketId, ${CONFIG_TUPLE} cfg)`,
  "function openMarket(uint256 marketId)",
  "function settle(uint256 marketId, uint32 actualA, uint32 actualB)",
  "function voidMarket(uint256 marketId, string reason)",
  "function stake(uint256 marketId, uint32 guessA, uint32 guessB, uint128 amount)",
  "function claim(uint256 marketId)",
  "function payoutOf(uint256 marketId, address trader) view returns (uint256)",
  "function positionCount(uint256 marketId) view returns (uint256)",
  "function marketCount() view returns (uint256)",
  "event MarketCreated(uint256 indexed marketId, uint8 kind, uint64 locksAt)",
  "event Staked(uint256 indexed marketId, address indexed trader, uint256 stake, uint32 guessA, uint32 guessB, bool restake)",
  "event Claimed(uint256 indexed marketId, address indexed trader, uint256 amount)",
]);

/** MockUSDC (tUSDC) — standard ERC-20 surface plus the testnet faucet. */
export const tusdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function faucet(uint256 amount)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

export const agentVaultAbi = parseAbi([
  "function agentOf(address human) view returns (address)",
  "function agents(address agent) view returns (address owner, bool paused, uint256 balance)",
  "function agentOfOwner(address human) view returns (address)",
  "function registerAgentFor(address human, uint256 deadline, bytes signature) returns (address)",
  "function deposit(address agent, uint256 amount)",
  "function withdraw(address agent, uint256 amount)",
  "function setPaused(address agent, bool paused)",
  "function stake(address agent, uint256 marketId, uint32 guessA, uint32 guessB)",
  "function claim(address agent, uint256 marketId) returns (uint256)",
  "event AgentRegistered(address indexed owner, address indexed agent)",
  "event AgentStaked(address indexed agent, uint256 indexed marketId, uint32 guessA, uint32 guessB, uint256 amount)",
]);
