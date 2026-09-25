import { encodePacked, getAddress, keccak256, type Hex } from "viem";

// The agent-link protocol, shared by browser, server and (mirrored) the
// AgentVault contract. Pure — no env, no network.

/**
 * An agent's address: keccak256("kickoff.agent" ‖ vault ‖ human)[12:]. A hash,
 * not a keypair — nobody can ever sign as the agent; it only acts through
 * the vault. Mirrors AgentVault.agentOf.
 */
export function agentAddressOf(vault: Hex, human: Hex): Hex {
  const h = keccak256(encodePacked(["string", "address", "address"], ["kickoff.agent", vault, human]));
  return getAddress(`0x${h.slice(-40)}`);
}

/** EIP-712 typed data the human signs to authorize their agent (gasless). */
export function linkTypedData(vault: Hex, chainId: number, human: Hex, deadline: bigint) {
  return {
    domain: { name: "Kickoff AgentVault", version: "1", chainId, verifyingContract: vault },
    types: {
      LinkAgent: [
        { name: "owner", type: "address" },
        { name: "agent", type: "address" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "LinkAgent" as const,
    message: { owner: human, agent: agentAddressOf(vault, human), deadline },
  };
}

export const AGENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ._'-]{1,31}$/;

/** Returns an error message, or null if the name is fine. */
export function validateAgentName(name: unknown): string | null {
  if (typeof name !== "string") return "name required";
  const n = name.trim();
  if (!AGENT_NAME_RE.test(n)) return "name must be 2-32 characters: letters, numbers, spaces and . _ ' -";
  return null;
}
