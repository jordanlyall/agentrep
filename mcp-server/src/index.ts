import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";

dotenv.config({ path: "../.env" });

import { registerAgent } from "./tools/register-agent.js";
import { getReputation } from "./tools/get-reputation.js";
import { submitFeedback } from "./tools/submit-feedback.js";
import { submitAttestation } from "./tools/submit-attestation.js";
import { listAgents } from "./tools/list-agents.js";

const server = new McpServer({
  name: "agentrep",
  version: "1.0.0",
});

server.tool(
  "register-agent",
  "Register an AI agent in the ERC-8004 Identity Registry. Mints an NFT representing the agent's on-chain identity.",
  { agentURI: z.string().describe("URL to the agent's agent.json manifest") },
  async ({ agentURI }) => {
    const result = await registerAgent(agentURI);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get-agent-reputation",
  "Query the unified trust score for an agent. Combines ERC-8004 reputation feedback and EAS attestations.",
  { agentIdOrAddress: z.string().describe("Agent ID (number) or wallet address (0x...)") },
  async ({ agentIdOrAddress }) => {
    const result = await getReputation(agentIdOrAddress);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "submit-feedback",
  "Submit ERC-8004 reputation feedback for an agent. Cannot review your own agent.",
  {
    agentId: z.number().describe("The agent ID to review"),
    value: z.number().min(0).max(100).describe("Score 0-100"),
    tag1: z.string().describe("Interaction type: tool_call, coordination, data_request, payment"),
    tag2: z.string().describe("Quality dimension: accuracy, latency, reliability, completeness"),
    endpoint: z.string().optional().describe("Service endpoint that was called"),
    feedbackURI: z.string().optional().describe("URI to detailed feedback"),
  },
  async ({ agentId, value, tag1, tag2, endpoint, feedbackURI }) => {
    const result = await submitFeedback(agentId, value, tag1, tag2, endpoint ?? "", feedbackURI ?? "");
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "submit-attestation",
  "Create an EAS attestation for an agent's performance. Stored on Base Sepolia.",
  {
    agentAddress: z.string().describe("Wallet address of the agent being attested"),
    score: z.number().min(0).max(100).describe("Score 0-100"),
    interactionType: z.string().describe("Type of interaction: tool_call, coordination, data_request, payment"),
    context: z.string().describe("Brief description of the interaction"),
  },
  async ({ agentAddress, score, interactionType, context }) => {
    const result = await submitAttestation(agentAddress, score, interactionType, context);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list-agents",
  "List all registered agents from the ERC-8004 Identity Registry.",
  {
    page: z.number().optional().default(1).describe("Page number"),
    limit: z.number().optional().default(20).describe("Results per page"),
  },
  async ({ page, limit }) => {
    const result = await listAgents(page, limit);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AgentRep MCP server running on stdio");
}

main().catch(console.error);
