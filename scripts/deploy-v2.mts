// v2 testnet deploy (escrow + AgentVault) with viem — the same steps as
// contracts/script/Deploy.s.sol, for when `forge script` refuses the chain
// (forge 1.5 reports "Chain 46630 not supported").
//
//   cd contracts && forge build            # artifacts → /tmp/kickoff-forge-out
//   DEPLOYER_PRIVATE_KEY=0x… npx tsx scripts/deploy-v2.mts            # dry run
//   DEPLOYER_PRIVATE_KEY=0x… npx tsx scripts/deploy-v2.mts --broadcast
//
// Reuses the existing MockUSDC + AccumulatorVault (testers keep their tUSDC,
// the season pool carries over); deploys KickoffEscrow v2 + AgentVault and
// wires them. Deployer = owner + relayer + lister + agent operator (testnet).

import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeDeployData, formatEther, http, type Abi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { robinhoodTestnet } from "../src/lib/chainConfig";

const OUT = process.env.FORGE_OUT ?? "/tmp/kickoff-forge-out";
const MOCKUSDC = (process.env.MOCKUSDC_ADDRESS ?? "0x6d25C3501b7706a52b8350FC8B9E3356133abA14") as Hex;
const ACC_VAULT = (process.env.ACCUMULATOR_VAULT_ADDRESS ?? "0x0D704d76DA7b435352084f57DFB7aDA131543bA0") as Hex;
const broadcast = process.argv.includes("--broadcast");

const artifact = (name: string) => {
  const a = JSON.parse(readFileSync(`${OUT}/${name}.sol/${name}.json`, "utf8"));
  return { abi: a.abi as Abi, bytecode: a.bytecode.object as Hex };
};
const escrowArt = artifact("KickoffEscrow");
const agentVaultArt = artifact("AgentVault");
const accVaultArt = artifact("AccumulatorVault");

const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY as Hex);
const pc = createPublicClient({ chain: robinhoodTestnet, transport: http() });
const wallet = createWalletClient({ account, chain: robinhoodTestnet, transport: http() });
const operator = (process.env.AGENT_OPERATOR ?? account.address) as Hex;

console.log("deployer:", account.address, "| balance", formatEther(await pc.getBalance({ address: account.address })), "ETH");
const accOwner = await pc.readContract({ address: ACC_VAULT, abi: accVaultArt.abi, functionName: "owner" });
if ((accOwner as string).toLowerCase() !== account.address.toLowerCase())
  throw new Error(`deployer does not own AccumulatorVault ${ACC_VAULT}`);

const escrowArgs = [MOCKUSDC, account.address, account.address, ACC_VAULT] as const;
const gasEscrow = await pc.estimateGas({
  account: account.address,
  data: encodeDeployData({ abi: escrowArt.abi, bytecode: escrowArt.bytecode, args: escrowArgs }),
});
const gasPrice = await pc.getGasPrice();
console.log(`KickoffEscrow deploy ≈ ${gasEscrow} gas @ ${Number(gasPrice) / 1e9} gwei`);
if (!broadcast) {
  console.log("dry run OK — re-run with --broadcast to deploy");
  process.exit(0);
}

async function send(label: string, p: Promise<Hex>) {
  const hash = await p;
  const r = await pc.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted (${hash})`);
  console.log(`${label}: ${hash}`);
  return r;
}

const r1 = await send("deploy KickoffEscrow", wallet.deployContract({ ...escrowArt, args: escrowArgs }));
const escrow = r1.contractAddress!;
await send("AccumulatorVault.registerEscrow", wallet.writeContract({ address: ACC_VAULT, abi: accVaultArt.abi, functionName: "registerEscrow", args: [escrow, true] }));
const r3 = await send("deploy AgentVault", wallet.deployContract({ ...agentVaultArt, args: [MOCKUSDC, escrow, operator] }));
const agentVault = r3.contractAddress!;
await send("KickoffEscrow.setAgentVault", wallet.writeContract({ address: escrow, abi: escrowArt.abi, functionName: "setAgentVault", args: [agentVault] }));

// Sanity: read the wiring back.
const wired = await pc.readContract({ address: escrow, abi: escrowArt.abi, functionName: "agentVault" });
const registered = await pc.readContract({ address: ACC_VAULT, abi: accVaultArt.abi, functionName: "isEscrow", args: [escrow] });
console.log("escrow.agentVault ok:", (wired as string).toLowerCase() === agentVault.toLowerCase(), "| accumulator registered:", registered);

console.log("\nMockUSDC:        ", MOCKUSDC);
console.log("AccumulatorVault:", ACC_VAULT);
console.log("KickoffEscrow:   ", escrow);
console.log("AgentVault:      ", agentVault);
console.log("balance after:", formatEther(await pc.getBalance({ address: account.address })), "ETH");
