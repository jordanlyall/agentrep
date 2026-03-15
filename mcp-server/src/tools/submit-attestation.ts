import { createAttestation } from "../lib/eas.js";

export async function submitAttestation(
  agentAddress: string,
  score: number,
  interactionType: string,
  context: string
) {
  const result = await createAttestation(agentAddress, score, interactionType, context);
  return {
    attestationUID: result.uid,
    txHash: result.txHash,
  };
}
