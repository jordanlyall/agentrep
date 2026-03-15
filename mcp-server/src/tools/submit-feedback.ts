import { ethers } from "ethers";
import { getReputationRegistry } from "../lib/contracts.js";
import { sendSerializedTx } from "../lib/nonce.js";

export async function submitFeedback(
  agentId: number,
  value: number,
  tag1: string,
  tag2: string,
  endpoint: string = "",
  feedbackURI: string = ""
) {
  const registry = getReputationRegistry();

  const feedbackHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "int128", "string", "string"],
      [agentId, value, tag1, tag2]
    )
  );

  const receipt = await sendSerializedTx(async (_signer, nonce) => {
    return registry.giveFeedback(
      agentId, value, 0, tag1, tag2, endpoint, feedbackURI, feedbackHash,
      { nonce }
    ) as Promise<ethers.TransactionResponse>;
  });

  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
}
