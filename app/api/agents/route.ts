import { db, schema } from "@/db";
import { json, jsonError } from "@/lib/http";
import { verifyCaller } from "@/lib/auth";
import { verifyInviteFromRequest } from "@/lib/inviteGate";
import { logAdminEvent } from "@/lib/admin";
import { agentAddressOf, linkTypedData, validateAgentName } from "@/lib/agentLink";
import { LINK_VAULT, agentNameTaken, agentOfOwner, publicAgent, validateSoulMd } from "@/lib/agents";
import { registerAgentOnChain } from "@/lib/chain";
import { robinhoodTestnet } from "@/lib/chainConfig";
import { recoverTypedDataAddress, type Hex } from "viem";

/**
 * POST /api/agents — create the caller's one agent.
 *
 * Body: { name, mode: "byok"|"managed", deadline, signature, soulMd? }
 * `signature` is the human's EIP-712 LinkAgent over (owner, agent, deadline)
 * — see src/lib/agentLink.ts. Gasless for the human: the operator submits it
 * to AgentVault.registerAgentFor (chain first, DB second). The agent gets its
 * own users row, so it trades as an ordinary one-vote position holder.
 */
export async function POST(req: Request) {
  const caller = await verifyCaller(req);
  if (!caller) return jsonError("unauthorized", 401);
  if ((await verifyInviteFromRequest(req)) === null) return jsonError("invite required", 403);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return jsonError("invalid JSON body", 400);
  }

  const nameErr = validateAgentName(b.name);
  if (nameErr) return jsonError(nameErr, 400);
  const name = (b.name as string).trim();
  if (b.mode !== "byok" && b.mode !== "managed") return jsonError("mode must be 'byok' or 'managed'", 400);
  const soulErr = validateSoulMd(b.soulMd ?? null);
  if (soulErr) return jsonError(soulErr, 400);

  let deadline: bigint;
  try {
    deadline = BigInt(b.deadline as string);
  } catch {
    return jsonError("deadline (unix seconds) required", 400);
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (deadline <= now || deadline > now + 86_400n) return jsonError("deadline must be within the next 24h", 400);
  if (typeof b.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(b.signature))
    return jsonError("signature required", 400);

  if (await agentOfOwner(caller.userId)) return jsonError("you already have an agent (one per person)", 409);
  if (await agentNameTaken(name)) return jsonError("that agent name is taken", 409);

  // Check the signature here too, so a bad one never costs operator gas.
  const human = caller.address as Hex;
  const td = linkTypedData(LINK_VAULT, robinhoodTestnet.id, human, deadline);
  let signer: string;
  try {
    signer = await recoverTypedDataAddress({ ...td, signature: b.signature as Hex });
  } catch {
    return jsonError("signature is malformed", 400);
  }
  if (signer.toLowerCase() !== human.toLowerCase()) return jsonError("signature is not from your wallet", 400);

  const agentAddress = agentAddressOf(LINK_VAULT, human).toLowerCase();

  let registerTxHash: string | null = null;
  try {
    registerTxHash = await registerAgentOnChain(human, deadline, b.signature as Hex);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Registered on-chain by an earlier attempt whose DB write failed: the
    // chain already says this human owns this agent, so just finish the DB.
    if (!/AlreadyRegistered/.test(msg)) return jsonError(`on-chain registration failed, nothing saved: ${msg}`, 502);
  }

  try {
    const agent = await db.transaction(async (tx) => {
      const [agentUser] = await tx
        .insert(schema.users)
        .values({ address: agentAddress })
        .onConflictDoUpdate({ target: schema.users.address, set: { address: agentAddress } })
        .returning();
      const [row] = await tx
        .insert(schema.agents)
        .values({
          ownerUserId: caller.userId,
          agentUserId: agentUser.id,
          name,
          walletAddress: agentAddress,
          mode: b.mode as "byok" | "managed",
          soulMd: typeof b.soulMd === "string" ? b.soulMd : null,
          registerTxHash,
        })
        .returning();
      await tx.insert(schema.agentLinks).values({
        agentId: row.id,
        ownerWallet: human.toLowerCase(),
        signature: b.signature as string,
        signedMessage: { ...td, message: { ...td.message, deadline: deadline.toString() } },
      });
      return row;
    });
    await logAdminEvent(human.toLowerCase(), "agent.create", null, { agentId: agent.id, agentAddress, registerTxHash });
    return json({ agent: publicAgent(agent) }, { status: 201 });
  } catch (err) {
    // Unique index race: a concurrent request created it first.
    if (/agents_owner_idx|duplicate key/.test(String(err))) return jsonError("you already have an agent (one per person)", 409);
    throw err;
  }
}
