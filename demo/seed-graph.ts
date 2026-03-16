import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { EAS, SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const SITE_BASE = "https://site-gamma-five-18.vercel.app/agents";
const EAS_ADDRESS = "0x4200000000000000000000000000000000000021";
const SCHEMA_STRING = "address agent, uint8 score, string interactionType, string context, bytes32 txRef";

const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function totalAgents() view returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
];

const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
const identityRegistry = new ethers.Contract(process.env.IDENTITY_REGISTRY!, IDENTITY_ABI, deployer);

// Generate multiple reviewer wallets for graph density
function makeReviewer(salt: string) {
  const key = ethers.keccak256(ethers.toUtf8Bytes("chainref-" + salt + "-" + deployer.address));
  return new ethers.Wallet(key, provider);
}

const reviewers = [
  { wallet: makeReviewer("scorer"), name: "ChainRef-Scorer" },
  { wallet: makeReviewer("auditor"), name: "Auditor-Agent" },
  { wallet: makeReviewer("monitor"), name: "Monitor-Agent" },
];

// Agents to register with real hosted URIs
const AGENTS = [
  { name: "ChainRef-Scorer", uri: `${SITE_BASE}/scorer.json` },
  { name: "AB-MCP", uri: `${SITE_BASE}/ab-mcp.json` },
  { name: "Agent-Alpha", uri: `${SITE_BASE}/alpha.json` },
  { name: "Agent-Beta", uri: `${SITE_BASE}/beta.json` },
];

// Feedback matrix: [reviewerIndex, agentName, score, tag1, tag2]
const FEEDBACK_PLAN: [number, string, number, string, string][] = [
  // Scorer reviews all agents
  [0, "AB-MCP", 92, "tool_call", "reliability"],
  [0, "Agent-Alpha", 91, "tool_call", "accuracy"],
  [0, "Agent-Beta", 38, "tool_call", "reliability"],
  // Auditor reviews agents differently
  [1, "AB-MCP", 88, "data_request", "completeness"],
  [1, "Agent-Alpha", 85, "tool_call", "latency"],
  [1, "Agent-Beta", 42, "coordination", "reliability"],
  [1, "ChainRef-Scorer", 94, "tool_call", "accuracy"],
  // Monitor reviews agents
  [2, "AB-MCP", 90, "data_request", "accuracy"],
  [2, "ChainRef-Scorer", 89, "tool_call", "reliability"],
  [2, "Agent-Alpha", 87, "tool_call", "completeness"],
  [2, "Agent-Beta", 25, "tool_call", "reliability"],
  // Alpha reviews scorer back (bidirectional)
  [0, "ChainRef-Scorer", 95, "coordination", "accuracy"],
];

let deployerNonce: number | null = null;

async function getDeployerNonce() {
  if (deployerNonce === null) {
    deployerNonce = await deployer.getNonce();
  }
  return deployerNonce++;
}

async function fundWallet(wallet: ethers.Wallet, amount: string = "0.005") {
  const balance = await provider.getBalance(wallet.address);
  if (balance < ethers.parseEther("0.002")) {
    console.log(`  Funding ${wallet.address.slice(0, 10)}... with ${amount} ETH`);
    const nonce = await getDeployerNonce();
    const tx = await deployer.sendTransaction({
      to: wallet.address,
      value: ethers.parseEther(amount),
      nonce,
    });
    await tx.wait();
  }
}

async function registerAgent(name: string, uri: string): Promise<number | null> {
  // Check if already registered by scanning events
  const DEPLOY_BLOCK = parseInt(process.env.DEPLOY_BLOCK || "38924000");
  const filter = identityRegistry.filters.Registered();
  const events = await identityRegistry.queryFilter(filter, DEPLOY_BLOCK);

  for (const ev of events) {
    const e = ev as ethers.EventLog;
    if (e.args[1] === uri) {
      const id = Number(e.args[0]);
      console.log(`  ${name} already registered as #${id}`);
      return id;
    }
  }

  console.log(`  Registering ${name}...`);
  const nonce = await getDeployerNonce();
  const tx = await identityRegistry.register(uri, { nonce });
  const receipt = await tx.wait();

  const iface = new ethers.Interface(["event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"]);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      if (parsed?.name === "Registered") {
        const id = Number(parsed.args[0]);
        console.log(`  ${name} registered as #${id} tx:${receipt.hash.slice(0, 12)}...`);
        return id;
      }
    } catch {}
  }
  return null;
}

const reviewerNonces = new Map<string, number>();

async function getReviewerNonce(wallet: ethers.Wallet) {
  const addr = wallet.address;
  if (!reviewerNonces.has(addr)) {
    reviewerNonces.set(addr, await wallet.getNonce());
  }
  const n = reviewerNonces.get(addr)!;
  reviewerNonces.set(addr, n + 1);
  return n;
}

async function submitFeedback(
  reviewerWallet: ethers.Wallet,
  agentId: number,
  value: number,
  tag1: string,
  tag2: string
): Promise<string> {
  const repContract = new ethers.Contract(process.env.REPUTATION_REGISTRY!, REPUTATION_ABI, reviewerWallet);
  const feedbackHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "int128", "string", "string", "uint256"],
      [agentId, value, tag1, tag2, Date.now()]
    )
  );
  const nonce = await getReviewerNonce(reviewerWallet);
  const tx = await repContract.giveFeedback(agentId, value, 0, tag1, tag2, "", "", feedbackHash, { nonce });
  const receipt = await tx.wait();
  return receipt.hash;
}

async function submitAttestation(
  signerWallet: ethers.Wallet,
  agentAddress: string,
  score: number,
  interactionType: string,
  context: string
): Promise<string> {
  const eas = new EAS(EAS_ADDRESS);
  eas.connect(signerWallet);

  const encoder = new SchemaEncoder(SCHEMA_STRING);
  const encodedData = encoder.encodeData([
    { name: "agent", value: agentAddress, type: "address" },
    { name: "score", value: score, type: "uint8" },
    { name: "interactionType", value: interactionType, type: "string" },
    { name: "context", value: context, type: "string" },
    { name: "txRef", value: "0x" + "0".repeat(64), type: "bytes32" },
  ]);

  const tx = await eas.attest({
    schema: process.env.EAS_SCHEMA_UID!,
    data: {
      recipient: agentAddress,
      expirationTime: 0n,
      revocable: true,
      data: encodedData,
    },
  });

  const uid = await tx.wait();
  return uid;
}

async function main() {
  console.log("\n=== ChainRef: Seed Trust Graph ===\n");

  // 1. Fund reviewer wallets
  console.log("1. Funding reviewer wallets...");
  for (const r of reviewers) {
    await fundWallet(r.wallet);
  }

  // 2. Register agents with real URIs
  console.log("\n2. Registering agents...");
  const agentIds = new Map<string, number>();
  for (const agent of AGENTS) {
    const id = await registerAgent(agent.name, agent.uri);
    if (id) agentIds.set(agent.name, id);
  }

  console.log("\nAgent registry:");
  for (const [name, id] of agentIds) {
    console.log(`  #${id} ${name}`);
  }

  // 3. Submit feedback (ERC-8004 Reputation)
  console.log("\n3. Submitting feedback...");
  let feedbackCount = 0;
  for (const [rIdx, agentName, score, tag1, tag2] of FEEDBACK_PLAN) {
    const agentId = agentIds.get(agentName);
    if (!agentId) {
      console.log(`  SKIP: ${agentName} not registered`);
      continue;
    }

    const reviewer = reviewers[rIdx];
    try {
      const txHash = await submitFeedback(reviewer.wallet, agentId, score, tag1, tag2);
      feedbackCount++;
      console.log(`  ${reviewer.name} -> ${agentName}: ${score} (${tag1}/${tag2}) tx:${txHash.slice(0, 12)}...`);
    } catch (err: any) {
      const msg = err.message.includes("Cannot review own agent") ? "self-review blocked" : err.message.slice(0, 60);
      console.log(`  FAIL: ${reviewer.name} -> ${agentName}: ${msg}`);
    }
  }

  // 4. Submit EAS attestations (from deployer)
  console.log("\n4. Submitting EAS attestations...");
  const attestationTargets = [
    { name: "AB-MCP", score: 90, type: "tool_call", ctx: "18 MCP tools, consistent uptime, accurate data" },
    { name: "Agent-Alpha", score: 88, type: "tool_call", ctx: "Fast responses, reliable schema compliance" },
    { name: "Agent-Beta", score: 35, type: "tool_call", ctx: "Intermittent failures, high latency, partial data" },
  ];

  for (const target of attestationTargets) {
    const agentId = agentIds.get(target.name);
    if (!agentId) continue;

    const agentOwner = await identityRegistry.ownerOf(agentId);
    try {
      const uid = await submitAttestation(deployer, agentOwner, target.score, target.type, target.ctx);
      console.log(`  EAS: ${target.name} score=${target.score} uid:${uid.slice(0, 16)}...`);
    } catch (err: any) {
      console.log(`  EAS FAIL: ${target.name}: ${err.message.slice(0, 80)}`);
    }
  }

  // Summary
  console.log("\n=== Seeding Complete ===");
  console.log(`Agents: ${agentIds.size}`);
  console.log(`Feedback submitted: ${feedbackCount}`);
  console.log(`Reviewer wallets: ${reviewers.length}`);
  console.log("Refresh explorer to see updated trust graph.");
}

main().catch(console.error);
