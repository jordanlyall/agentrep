import { ethers } from "ethers";
import { getIdentityRegistry, getProvider, DEPLOY_BLOCK } from "../lib/contracts.js";

export async function listAgents(page: number = 1, limit: number = 20) {
  const provider = getProvider();
  const registry = getIdentityRegistry(provider);

  const filter = registry.filters.Registered();
  const events = await registry.queryFilter(filter, DEPLOY_BLOCK);

  const total = events.length;
  const start = (page - 1) * limit;
  const pageEvents = events.slice(start, start + limit);

  const agents = pageEvents.map((event) => {
    const e = event as ethers.EventLog;
    return {
      agentId: Number(e.args[0]),
      agentURI: e.args[1] as string,
      owner: e.args[2] as string,
    };
  });

  return { agents, total, page, limit };
}
