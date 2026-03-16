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
import { getProvider } from "./lib/contracts.js";

function errorResponse(code: string, message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: code, message }, null, 2) }],
    isError: true,
  };
}

function successResponse(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

const server = new McpServer({
  name: "chainref",
  version: "1.0.0",
});

server.tool(
  "register-agent",
  "Register an AI agent in the ERC-8004 Identity Registry. Mints an NFT representing the agent's on-chain identity.",
  { agentURI: z.string().min(1).describe("URL to the agent's agent.json manifest") },
  async ({ agentURI }) => {
    try {
      const result = await registerAgent(agentURI);
      return successResponse(result);
    } catch (err: any) {
      return errorResponse("registration_failed", err.reason || err.message);
    }
  }
);

server.tool(
  "get-agent-reputation",
  "Query the unified trust score for an agent. Combines ERC-8004 reputation feedback and EAS attestations.",
  { agentIdOrAddress: z.string().min(1).describe("Agent ID (number) or wallet address (0x...)") },
  async ({ agentIdOrAddress }) => {
    try {
      const result = await getReputation(agentIdOrAddress);
      return successResponse(result);
    } catch (err: any) {
      if (err.reason?.includes("nonexistent token") || err.message?.includes("nonexistent")) {
        return errorResponse("agent_not_found", "No agent registered with ID or address: " + agentIdOrAddress);
      }
      return errorResponse("query_failed", err.reason || err.message);
    }
  }
);

server.tool(
  "submit-feedback",
  "Submit ERC-8004 reputation feedback for an agent. Cannot review your own agent.",
  {
    agentId: z.number().int().positive().describe("The agent ID to review"),
    value: z.number().int().min(0).max(100).describe("Score 0-100"),
    tag1: z.string().min(1).describe("Interaction type: tool_call, coordination, data_request, payment"),
    tag2: z.string().min(1).describe("Quality dimension: accuracy, latency, reliability, completeness"),
    endpoint: z.string().optional().describe("Service endpoint that was called"),
    feedbackURI: z.string().optional().describe("URI to detailed feedback"),
  },
  async ({ agentId, value, tag1, tag2, endpoint, feedbackURI }) => {
    try {
      const result = await submitFeedback(agentId, value, tag1, tag2, endpoint ?? "", feedbackURI ?? "");
      return successResponse(result);
    } catch (err: any) {
      if (err.reason?.includes("Cannot review own")) {
        return errorResponse("self_review_blocked", "Cannot submit feedback for your own agent. Self-review is blocked on-chain.");
      }
      return errorResponse("feedback_failed", err.reason || err.message);
    }
  }
);

server.tool(
  "submit-attestation",
  "Create an EAS attestation for an agent's performance. Stored on Base Sepolia.",
  {
    agentAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid Ethereum address").describe("Wallet address of the agent being attested"),
    score: z.number().int().min(0).max(100).describe("Score 0-100"),
    interactionType: z.string().min(1).describe("Type of interaction: tool_call, coordination, data_request, payment"),
    context: z.string().min(1).describe("Brief description of the interaction"),
  },
  async ({ agentAddress, score, interactionType, context }) => {
    try {
      const result = await submitAttestation(agentAddress, score, interactionType, context);
      return successResponse(result);
    } catch (err: any) {
      if (err.message?.includes("Schema not registered")) {
        return errorResponse("schema_not_configured", "EAS schema UID not set. Add EAS_SCHEMA_UID to .env.");
      }
      return errorResponse("attestation_failed", err.reason || err.message);
    }
  }
);

server.tool(
  "list-agents",
  "List all registered agents from the ERC-8004 Identity Registry.",
  {
    page: z.number().int().positive().optional().default(1).describe("Page number"),
    limit: z.number().int().min(1).max(100).optional().default(20).describe("Results per page"),
  },
  async ({ page, limit }) => {
    try {
      const result = await listAgents(page, limit);
      return successResponse(result);
    } catch (err: any) {
      return errorResponse("list_failed", err.reason || err.message);
    }
  }
);

server.tool(
  "status",
  "Health check. Returns server status, chain connection, and registry stats.",
  {},
  async () => {
    try {
      const provider = getProvider();
      const blockNumber = await provider.getBlockNumber();
      const { getIdentityRegistry } = await import("./lib/contracts.js");
      const registry = getIdentityRegistry(provider);
      const totalAgents = Number(await registry.totalAgents());

      return successResponse({
        status: "ok",
        server: "chainref",
        version: "1.0.0",
        chain: "base-sepolia",
        chainId: 84532,
        latestBlock: blockNumber,
        registeredAgents: totalAgents,
        contracts: {
          identityRegistry: process.env.IDENTITY_REGISTRY,
          reputationRegistry: process.env.REPUTATION_REGISTRY,
        },
      });
    } catch (err: any) {
      return errorResponse("health_check_failed", err.message);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ChainRef MCP server running on stdio");
}

main().catch(console.error);
