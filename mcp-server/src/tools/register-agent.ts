import { getIdentityRegistry } from "../lib/contracts.js";
import { sendSerializedTx } from "../lib/nonce.js";
import { ethers } from "ethers";

export async function registerAgent(agentURI: string) {
  const registry = getIdentityRegistry();
  const receipt = await sendSerializedTx(async (_signer, nonce) => {
    return registry.register(agentURI, { nonce }) as Promise<ethers.TransactionResponse>;
  });

  const iface = new ethers.Interface([
    "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  ]);

  let agentId: number | null = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "Registered") {
        agentId = Number(parsed.args[0]);
      }
    } catch { /* not our event */ }
  }

  return {
    agentId,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
  };
}
