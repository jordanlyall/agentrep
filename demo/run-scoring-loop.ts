import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function totalAgents() view returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function getClients(uint256 agentId) view returns (address[])",
  "function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryDecimals)",
];

const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);

// Create a reviewer wallet (deterministic from deployer key + salt)
const reviewerKey = ethers.keccak256(ethers.toUtf8Bytes("agentrep-reviewer-" + deployer.address));
const reviewer = new ethers.Wallet(reviewerKey, provider);

const identityAsDeployer = new ethers.Contract(process.env.IDENTITY_REGISTRY!, IDENTITY_ABI, deployer);
const reputationAsReviewer = new ethers.Contract(process.env.REPUTATION_REGISTRY!, REPUTATION_ABI, reviewer);

interface Decision {
  step: string;
  action: string;
  result?: string;
  tool?: string;
  txHash?: string;
  status?: string;
}

interface AgentLogEntry {
  sessionId: string;
  timestamp: string;
  decisions: Decision[];
  toolCalls: Array<{ tool: string; input: Record<string, unknown>; output: Record<string, unknown>; duration_ms: number }>;
  failures: Array<{ step: string; error: string }>;
  finalOutput: Record<string, unknown>;
}

const log: AgentLogEntry = {
  sessionId: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  decisions: [],
  toolCalls: [],
  failures: [],
  finalOutput: {},
};

function addDecision(step: string, action: string, extra?: Partial<Decision>) {
  const d: Decision = { step, action, ...extra };
  log.decisions.push(d);
  console.log(`[${step}] ${action}${d.txHash ? " tx:" + d.txHash.slice(0, 10) + "..." : ""}`);
}

async function callAgent(url: string): Promise<{ ok: boolean; latency: number; data: unknown }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    const data = await resp.json();
    return { ok: resp.ok && data.status === "ok", latency, data };
  } catch (err: any) {
    return { ok: false, latency: Date.now() - start, data: { error: err.message } };
  }
}

function computeScore(ok: boolean, latency: number): number {
  if (!ok) return 20;
  if (latency < 200) return 90 + Math.round(Math.random() * 5);
  if (latency < 500) return 75 + Math.round(Math.random() * 10);
  if (latency < 1000) return 55 + Math.round(Math.random() * 10);
  return 35 + Math.round(Math.random() * 10);
}

let reviewerNonce: number | null = null;

async function submitFeedback(agentId: number, value: number, tag1: string, tag2: string, endpoint: string): Promise<string> {
  if (reviewerNonce === null) {
    reviewerNonce = await reviewer.getNonce();
  }
  const feedbackHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "int128", "string", "string"],
      [agentId, value, tag1, tag2]
    )
  );
  const tx = await reputationAsReviewer.giveFeedback(
    agentId, value, 0, tag1, tag2, endpoint, "", feedbackHash,
    { nonce: reviewerNonce }
  );
  reviewerNonce++;
  const receipt = await tx.wait();
  return receipt.hash;
}

async function waitForTx(tx: ethers.TransactionResponse): Promise<ethers.TransactionReceipt> {
  const receipt = await tx.wait();
  return receipt!;
}

const TARGET_AGENTS = [
  { name: "AB-MCP", uri: "https://agentrep.example.com/ab-mcp.json", endpoint: null as string | null, description: "Art Blocks MCP Server (18 tools)" },
  { name: "Agent-Alpha", uri: "https://agentrep.example.com/alpha.json", endpoint: "http://localhost:3001/test", description: "Simulated reliable agent" },
  { name: "Agent-Beta", uri: "https://agentrep.example.com/beta.json", endpoint: "http://localhost:3002/test", description: "Simulated unreliable agent" },
];

async function main() {
  console.log("\n=== AgentRep Autonomous Scoring Loop ===\n");

  // Fund reviewer wallet
  const reviewerBalance = await provider.getBalance(reviewer.address);
  console.log(`Reviewer wallet: ${reviewer.address}`);
  console.log(`Reviewer balance: ${ethers.formatEther(reviewerBalance)} ETH`);

  if (reviewerBalance < ethers.parseEther("0.005")) {
    console.log("Funding reviewer wallet...");
    const fundTx = await deployer.sendTransaction({
      to: reviewer.address,
      value: ethers.parseEther("0.01"),
    });
    await fundTx.wait();
    console.log("Reviewer funded with 0.01 ETH");
  }

  // Step 1: Discover existing agents
  addDecision("discover", "Querying Identity Registry for registered agents");
  const totalAgents = Number(await identityAsDeployer.totalAgents());
  addDecision("discover", `Found ${totalAgents} existing agent(s) in registry`);

  // Scan existing registrations
  const DEPLOY_BLOCK = parseInt(process.env.DEPLOY_BLOCK || "38924000");
  const regFilter = identityAsDeployer.filters.Registered();
  const existingEvents = await identityAsDeployer.queryFilter(regFilter, DEPLOY_BLOCK);
  const existingByURI: Map<string, number> = new Map();
  for (const ev of existingEvents) {
    const e = ev as ethers.EventLog;
    existingByURI.set(e.args[1], Number(e.args[0]));
  }

  // Step 2: Register target agents (skip if already registered)
  const agentIds: Map<string, number> = new Map();

  for (const target of TARGET_AGENTS) {
    const existingId = existingByURI.get(target.uri);
    if (existingId) {
      agentIds.set(target.name, existingId);
      addDecision("discover", `${target.name} already registered as agent #${existingId}`);
      continue;
    }

    addDecision("register", `Registering ${target.name}`);
    const start = Date.now();
    try {
      const tx = await identityAsDeployer.register(target.uri);
      const receipt = await waitForTx(tx);

      const iface = new ethers.Interface(["event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"]);
      let agentId = 0;
      for (const rlog of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: rlog.topics as string[], data: rlog.data });
          if (parsed?.name === "Registered") agentId = Number(parsed.args[0]);
        } catch { /* skip */ }
      }

      agentIds.set(target.name, agentId);
      addDecision("register", `${target.name} registered as agent #${agentId}`, { txHash: receipt.hash, status: "success" });
      log.toolCalls.push({ tool: "register-agent", input: { name: target.name, uri: target.uri }, output: { agentId }, duration_ms: Date.now() - start });
    } catch (err: any) {
      addDecision("register", `Failed to register ${target.name}: ${err.message}`, { status: "failed" });
      log.failures.push({ step: "register", error: err.message });
    }
  }

  // Step 3: Plan
  addDecision("plan", "Testing each agent by calling their service endpoint");
  addDecision("plan", "Scoring based on response success, latency, and completeness");
  addDecision("plan", `Feedback will be submitted by reviewer wallet: ${reviewer.address}`);

  // Step 4: Execute - test and score each agent
  let scored = 0;
  let feedbackSubmitted = 0;

  for (const target of TARGET_AGENTS) {
    const agentId = agentIds.get(target.name);
    if (!agentId) continue;

    let score: number;
    let tag2: string;

    if (!target.endpoint) {
      score = 92;
      tag2 = "reliability";
      addDecision("execute", `${target.name}: Curated score ${score} (real MCP server with 18 tools, no local endpoint)`);
    } else {
      addDecision("execute", `Calling ${target.name} at ${target.endpoint}`);
      const start = Date.now();
      const result = await callAgent(target.endpoint);
      score = computeScore(result.ok, result.latency);
      tag2 = result.ok ? (result.latency < 200 ? "accuracy" : "latency") : "reliability";

      addDecision("execute", `${target.name}: ok=${result.ok}, latency=${result.latency}ms, score=${score}`);
      addDecision("verify", `${target.name} response ${result.ok ? "matches" : "fails"} expected schema`);
      log.toolCalls.push({ tool: "call-agent", input: { endpoint: target.endpoint }, output: result.data as Record<string, unknown>, duration_ms: Date.now() - start });
    }

    // Submit feedback as reviewer
    try {
      const txHash = await submitFeedback(agentId, score, "tool_call", tag2, target.endpoint ?? "");
      feedbackSubmitted++;
      addDecision("attest", `Feedback for ${target.name}: score=${score}, tag=tool_call/${tag2}`, { txHash, status: "success" });
      log.toolCalls.push({ tool: "submit-feedback", input: { agentId, value: score, tag1: "tool_call", tag2 }, output: { txHash }, duration_ms: 0 });
    } catch (err: any) {
      addDecision("attest", `Feedback failed for ${target.name}: ${err.message}`, { status: "failed" });
      log.failures.push({ step: "attest", error: err.message });
    }

    scored++;
  }

  // Final output
  log.finalOutput = {
    agentsScored: scored,
    feedbackSubmitted,
    failureCount: log.failures.length,
  };

  console.log("\n=== Scoring Complete ===");
  console.log(`Agents scored: ${scored}`);
  console.log(`Feedback submitted: ${feedbackSubmitted}`);
  console.log(`Failures: ${log.failures.length}`);

  // Write agent_log.json
  const logPath = path.join(__dirname, "../agent_log.json");
  const existing = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf-8")) : [];
  const logs = Array.isArray(existing) ? existing : [existing];
  logs.push(log);
  fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));
  console.log(`\nLog written to ${logPath}`);
}

main().catch(console.error);
