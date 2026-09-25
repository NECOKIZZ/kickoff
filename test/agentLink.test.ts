import { describe, expect, it } from "vitest";
import { hashTypedData, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { agentAddressOf, linkTypedData, validateAgentName } from "../src/lib/agentLink";

// Fixed values shared with contracts/test/AgentVault.t.sol (LinkParity):
// if either side's derivation changes, both tests break.
const VAULT = "0x00000000000000000000000000000000000a6e47" as const;
const HUMAN_PK = "0x00000000000000000000000000000000000000000000000000000000000a11ce" as const;

describe("agent link", () => {
  const human = privateKeyToAccount(HUMAN_PK).address;

  it("derives a stable agent address distinct from the human", () => {
    const a = agentAddressOf(VAULT, human);
    expect(a).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(a.toLowerCase()).not.toBe(human.toLowerCase());
    expect(agentAddressOf(VAULT, human)).toBe(a);
    // Pinned in contracts/test/AgentVault.t.sol (AgentLinkParityTest).
    expect(a).toBe("0x7fbd46B91D5539a7A5Ee618f0c78E591Fa8Ecc80");
    expect(hashTypedData(linkTypedData(VAULT, 46630, human, 2_000_000_000n))).toBe(
      "0x68fa3f0c0c8407ccbeb4ef6b0316006ff66e4bfa38f2c0e5d03380e6017b065d",
    );
  });

  it("a signed link recovers to the human", async () => {
    const td = linkTypedData(VAULT, 46630, human, 2_000_000_000n);
    const sig = await privateKeyToAccount(HUMAN_PK).signTypedData(td);
    expect(await recoverTypedDataAddress({ ...td, signature: sig })).toBe(human);
  });

  it("validates names", () => {
    expect(validateAgentName("Dave's Predictor")).toBeNull();
    expect(validateAgentName("x")).not.toBeNull();
    expect(validateAgentName("<script>")).not.toBeNull();
    expect(validateAgentName("a".repeat(40))).not.toBeNull();
  });
});
