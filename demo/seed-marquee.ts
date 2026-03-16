import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
];

const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
const identityRegistry = new ethers.Contract(process.env.IDENTITY_REGISTRY!, IDENTITY_ABI, deployer);

const SITE_BASE = "https://site-gamma-five-18.vercel.app/agents/marquee";
const DEPLOY_BLOCK = parseInt(process.env.DEPLOY_BLOCK || "38924000");

// Marquee agents from the landscape
const MARQUEE = [
  // Crypto agents
  { name: "Truth Terminal", type: "agent", desc: "Semi-autonomous AI by Andy Ayrey. Inspired $GOAT ($1.3B). First AI crypto millionaire. Ayrey reviews tweets before posting.", score: 62, tag1: "coordination", tag2: "reliability" },
  { name: "AIXBT", type: "agent", desc: "Autonomous crypto market intelligence. 460K+ followers. Monitors 400+ influencers. 2,000+ replies/day at 99% autonomy.", score: 78, tag1: "data_request", tag2: "accuracy" },
  { name: "ai16z / ElizaOS", type: "agent", desc: "AI-led venture DAO on Solana. $2.7B peak market cap. ElizaOS framework: #1 trending GitHub repo.", score: 71, tag1: "coordination", tag2: "completeness" },
  { name: "Freysa", type: "agent", desc: "Adversarial AI guarding a prize pool. Got hacked on attempt #482 for $47K via prompt injection.", score: 41, tag1: "tool_call", tag2: "reliability" },
  { name: "Clanker", type: "agent", desc: "Autonomous token launcher on Farcaster/Base. 14,000 tokens created. $100M+ trading volume.", score: 74, tag1: "tool_call", tag2: "reliability" },
  // Social/entertainment
  { name: "Neuro-sama", type: "agent", desc: "Autonomous AI VTuber. #1 most-subscribed Twitch channel. 165K+ paid subs. $400K+/month revenue.", score: 88, tag1: "coordination", tag2: "reliability" },
  { name: "Felix Craft", type: "agent", desc: "Autonomous AI CEO on OpenClaw. $14.7K revenue in 3 weeks. Self-funded operations. Runs on Mac Mini.", score: 76, tag1: "coordination", tag2: "completeness" },
  // Creative
  { name: "Botto", type: "agent", desc: "Decentralized autonomous artist. $5M+ in NFT sales. Solo Sotheby's exhibition. 5,000+ DAO members govern output.", score: 85, tag1: "coordination", tag2: "accuracy" },
  // Coding/research
  { name: "Manus AI", type: "agent", desc: "General-purpose autonomous agent. 86.5% on GAIA benchmark. Acquired by Meta. Cloud-based Ubuntu workspace.", score: 82, tag1: "tool_call", tag2: "completeness" },
  { name: "OpenHands", type: "agent", desc: "Open-source AI coding agent. 68,600+ GitHub stars. Solves 87% of bug tickets same day.", score: 80, tag1: "tool_call", tag2: "accuracy" },
  { name: "BabyAGI", type: "agent", desc: "Minimalist autonomous agent by Yohei Nakajima. 140 lines of Python. Cited in 42+ academic papers.", score: 58, tag1: "tool_call", tag2: "reliability" },
  // Low trust / cautionary
  { name: "FN Meka", type: "agent", desc: "Virtual rapper. Signed to Capitol Records, dropped 9 days later. Racial stereotyping controversy. AI claims partly fabricated.", score: 15, tag1: "coordination", tag2: "accuracy" },
];

function makeReviewer(salt: string) {
  const key = ethers.keccak256(ethers.toUtf8Bytes("chainref-marquee-" + salt + "-" + deployer.address));
  return new ethers.Wallet(key, provider);
}

const reviewers = [
  makeReviewer("critic-1"),
  makeReviewer("critic-2"),
  makeReviewer("critic-3"),
  makeReviewer("analyst-1"),
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
  console.log("\n=== ChainRef: Seed Marquee Agents ===\n");

  // Check existing
  const regFilter = identityRegistry.filters.Registered();
  const existingEvents = await identityRegistry.queryFilter(regFilter, DEPLOY_BLOCK);
  const existingURIs = new Set(existingEvents.map((e: any) => e.args[1]));

  // Fund reviewers
  console.log("Funding reviewers...");
  for (const r of reviewers) {
    const bal = await provider.getBalance(r.address);
    if (bal < ethers.parseEther("0.002")) {
      const nonce = await getDeployerNonce();
      const tx = await deployer.sendTransaction({ to: r.address, value: ethers.parseEther("0.004"), nonce });
      await tx.wait();
      console.log("  Funded " + r.address.slice(0, 10) + "...");
    }
  }

  // Register
  console.log("\nRegistering marquee agents...");
  const agentIds = new Map<string, number>();

  for (const entity of MARQUEE) {
    const slug = entity.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const uri = SITE_BASE + "/" + slug + ".json";

    if (existingURIs.has(uri)) {
      const existing = existingEvents.find((e: any) => e.args[1] === uri);
      if (existing) {
        agentIds.set(entity.name, Number((existing as any).args[0]));
        console.log("  " + entity.name + " already registered");
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
            console.log("  " + entity.name + " -> #" + id);
          }
        } catch {}
      }
    } catch (err: any) {
      console.log("  FAIL: " + entity.name + ": " + err.message.slice(0, 50));
    }
  }

  // Submit feedback
  console.log("\nSubmitting feedback...");
  let feedbackCount = 0;

  for (const entity of MARQUEE) {
    const agentId = agentIds.get(entity.name);
    if (!agentId) continue;

    const numReviews = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numReviews; i++) {
      const reviewer = reviewers[i % reviewers.length];
      const variance = Math.floor(Math.random() * 12) - 6;
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
        console.log("  " + entity.name + ": " + score + " from " + reviewer.address.slice(0, 8) + "...");
      } catch (err: any) {
        console.log("  FAIL: " + entity.name + ": " + err.message.slice(0, 50));
      }
    }
  }

  console.log("\n=== Done: " + agentIds.size + " agents, " + feedbackCount + " reviews ===");
}

main().catch(console.error);
