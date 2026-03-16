import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function totalAgents() view returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
];

const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
const identityRegistry = new ethers.Contract(process.env.IDENTITY_REGISTRY!, IDENTITY_ABI, deployer);

const SITE_BASE = "https://site-gamma-five-18.vercel.app/agents";
const DEPLOY_BLOCK = parseInt(process.env.DEPLOY_BLOCK || "38924000");

// Well-known MCP servers and agents from the ecosystem
const ECOSYSTEM = [
  // MCP Servers (real, well-known)
  { name: "GitHub MCP", type: "mcp-server", tools: 20, desc: "GitHub API integration. Repos, issues, PRs, code search.", score: 94, tag1: "tool_call", tag2: "reliability" },
  { name: "Brave Search", type: "mcp-server", tools: 2, desc: "Web search via Brave Search API. Fast, private.", score: 88, tag1: "data_request", tag2: "accuracy" },
  { name: "Playwright MCP", type: "mcp-server", tools: 12, desc: "Browser automation. Screenshots, navigation, form filling.", score: 85, tag1: "tool_call", tag2: "completeness" },
  { name: "Linear MCP", type: "mcp-server", tools: 15, desc: "Project management. Issues, cycles, projects, teams.", score: 91, tag1: "tool_call", tag2: "reliability" },
  { name: "Notion MCP", type: "mcp-server", tools: 10, desc: "Workspace integration. Pages, databases, search.", score: 82, tag1: "data_request", tag2: "completeness" },
  { name: "Slack MCP", type: "mcp-server", tools: 8, desc: "Team messaging. Channels, messages, reactions.", score: 87, tag1: "coordination", tag2: "reliability" },
  { name: "Filesystem MCP", type: "mcp-server", tools: 11, desc: "Local file operations. Read, write, search, glob.", score: 96, tag1: "tool_call", tag2: "accuracy" },
  { name: "Postgres MCP", type: "mcp-server", tools: 5, desc: "Database queries. Schema inspection, SQL execution.", score: 90, tag1: "data_request", tag2: "accuracy" },
  // Agents
  { name: "Devin", type: "agent", tools: 0, desc: "Autonomous software engineering agent by Cognition.", score: 72, tag1: "coordination", tag2: "completeness" },
  { name: "SWE-agent", type: "agent", tools: 0, desc: "Open-source software engineering agent. GitHub issue resolution.", score: 68, tag1: "tool_call", tag2: "reliability" },
  { name: "AutoGPT", type: "agent", tools: 0, desc: "General-purpose autonomous agent. Task decomposition and execution.", score: 45, tag1: "coordination", tag2: "reliability" },
  // Unreliable/new (for score diversity)
  { name: "SketchyAPI", type: "mcp-server", tools: 3, desc: "Unverified data aggregator. Inconsistent uptime.", score: 28, tag1: "data_request", tag2: "reliability" },
  { name: "CryptoOracle-v0", type: "oracle", tools: 1, desc: "Price feed oracle. Beta, frequent stale data.", score: 33, tag1: "data_request", tag2: "accuracy" },
];

// Generate reviewer wallets
function makeReviewer(salt: string) {
  const key = ethers.keccak256(ethers.toUtf8Bytes("chainref-eco-" + salt + "-" + deployer.address));
  return new ethers.Wallet(key, provider);
}

const reviewers = [
  makeReviewer("auditor-1"),
  makeReviewer("auditor-2"),
  makeReviewer("auditor-3"),
  makeReviewer("monitor-1"),
  makeReviewer("monitor-2"),
];

let deployerNonce: number | null = null;
async function getDeployerNonce() {
  if (deployerNonce === null) deployerNonce = await deployer.getNonce();
  return deployerNonce++;
}

const reviewerNonces = new Map<string, number>();
async function getReviewerNonce(w: ethers.Wallet) {
  if (!reviewerNonces.has(w.address)) reviewerNonces.set(w.address, await w.getNonce());
  const n = reviewerNonces.get(w.address)!;
  reviewerNonces.set(w.address, n + 1);
  return n;
}

async function main() {
  console.log("\n=== ChainRef: Seed Ecosystem ===\n");

  // Check what's already registered
  const regFilter = identityRegistry.filters.Registered();
  const existingEvents = await identityRegistry.queryFilter(regFilter, DEPLOY_BLOCK);
  const existingURIs = new Set(existingEvents.map((e: any) => e.args[1]));
  console.log(`Existing registrations: ${existingEvents.length}`);

  // Fund reviewers
  console.log("\nFunding reviewers...");
  for (const r of reviewers) {
    const bal = await provider.getBalance(r.address);
    if (bal < ethers.parseEther("0.002")) {
      const nonce = await getDeployerNonce();
      const tx = await deployer.sendTransaction({ to: r.address, value: ethers.parseEther("0.003"), nonce });
      await tx.wait();
      console.log(`  Funded ${r.address.slice(0, 10)}...`);
    }
  }

  // Register ecosystem entities
  console.log("\nRegistering ecosystem entities...");
  const agentIds = new Map<string, number>();

  for (const entity of ECOSYSTEM) {
    const uri = `${SITE_BASE}/eco/${entity.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}.json`;

    if (existingURIs.has(uri)) {
      // Find existing ID
      const existing = existingEvents.find((e: any) => e.args[1] === uri);
      if (existing) {
        const id = Number((existing as any).args[0]);
        agentIds.set(entity.name, id);
        console.log(`  ${entity.name} already #${id}`);
      }
      continue;
    }

    try {
      const nonce = await getDeployerNonce();
      const tx = await identityRegistry.register(uri, { nonce });
      const receipt = await tx.wait();

      const iface = new ethers.Interface(["event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"]);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (parsed?.name === "Registered") {
            const id = Number(parsed.args[0]);
            agentIds.set(entity.name, id);
            console.log(`  ${entity.name} -> #${id}`);
          }
        } catch {}
      }
    } catch (err: any) {
      console.log(`  FAIL: ${entity.name}: ${err.message.slice(0, 60)}`);
    }
  }

  // Submit feedback from multiple reviewers
  console.log("\nSubmitting feedback...");
  let feedbackCount = 0;

  for (const entity of ECOSYSTEM) {
    const agentId = agentIds.get(entity.name);
    if (!agentId) continue;

    // Each entity gets 2-4 reviews from different reviewers with slight variance
    const numReviews = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numReviews; i++) {
      const reviewer = reviewers[i % reviewers.length];
      const variance = Math.floor(Math.random() * 10) - 5;
      const score = Math.max(5, Math.min(100, entity.score + variance));

      const feedbackHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["uint256", "int128", "string", "string", "uint256"],
          [agentId, score, entity.tag1, entity.tag2, Date.now() + i]
        )
      );

      try {
        const repContract = new ethers.Contract(process.env.REPUTATION_REGISTRY!, REPUTATION_ABI, reviewer);
        const nonce = await getReviewerNonce(reviewer);
        const tx = await repContract.giveFeedback(agentId, score, 0, entity.tag1, entity.tag2, "", "", feedbackHash, { nonce });
        await tx.wait();
        feedbackCount++;
        console.log(`  ${entity.name}: ${score} from ${reviewer.address.slice(0, 8)}...`);
      } catch (err: any) {
        const msg = err.message.includes("Cannot review own") ? "self-review blocked" : err.message.slice(0, 50);
        console.log(`  FAIL: ${entity.name}: ${msg}`);
      }
    }
  }

  console.log(`\n=== Done: ${agentIds.size} entities, ${feedbackCount} reviews ===`);
}

main().catch(console.error);
