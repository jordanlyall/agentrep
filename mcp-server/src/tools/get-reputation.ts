import { ethers } from "ethers";
import { getIdentityRegistry, getReputationRegistry, getProvider, DEPLOY_BLOCK } from "../lib/contracts.js";
import { computeTrustScore } from "../lib/scoring.js";

export async function getReputation(agentIdOrAddress: string) {
  const provider = getProvider();
  const identityRegistry = getIdentityRegistry(provider);
  const reputationRegistry = getReputationRegistry(provider);

  let agentId: number;
  let agentAddress: string;

  if (agentIdOrAddress.startsWith("0x")) {
    agentAddress = agentIdOrAddress;
    const filter = identityRegistry.filters.Registered(null, null, agentAddress);
    const events = await identityRegistry.queryFilter(filter, DEPLOY_BLOCK);
    if (events.length === 0) return { error: "Agent not found" };
    agentId = Number((events[0] as ethers.EventLog).args[0]);
  } else {
    agentId = parseInt(agentIdOrAddress);
    if (isNaN(agentId) || agentId < 1) throw new Error("Invalid agent ID: " + agentIdOrAddress);
    try {
      agentAddress = await identityRegistry.ownerOf(agentId);
    } catch {
      return { error: "agent_not_found", message: "No agent registered with ID " + agentId };
    }
  }

  const rawClients = await reputationRegistry.getClients(agentId);
  const clients: string[] = [...rawClients];
  let erc8004Count = 0;
  let erc8004Sum = 0;

  if (clients.length > 0) {
    const [count, summaryValue] = await reputationRegistry.getSummary(agentId, clients, "", "");
    erc8004Count = Number(count);
    erc8004Sum = Number(summaryValue);
  }

  const score = computeTrustScore({ erc8004Count, erc8004Sum, easCount: 0, easSum: 0 });

  const agentURI = await identityRegistry.tokenURI(agentId);

  return {
    agentId,
    agentAddress,
    agentURI,
    trustScore: score.unified,
    erc8004: score.erc8004,
    eas: score.eas,
  };
}
