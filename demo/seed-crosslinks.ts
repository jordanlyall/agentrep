import { ethers } from "ethers";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const IDENTITY_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
];

const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
const identityRegistry = new ethers.Contract(process.env.IDENTITY_REGISTRY!, IDENTITY_ABI, deployer);

const DEPLOY_BLOCK = parseInt(process.env.DEPLOY_BLOCK || "38924000");

// Each agent gets its own wallet so feedback shows as coming FROM that agent
function agentWallet(name: string) {
  const key = ethers.keccak256(ethers.toUtf8Bytes("chainref-agent-wallet-" + name + "-" + deployer.address));
  return new ethers.Wallet(key, provider);
}

// Cross-links: agent reviews an MCP server it uses
// [agent name, mcp name, score, tag1, tag2]
const CROSSLINKS: [string, string, number, string, string][] = [
  // Devin uses coding tools
  ["Devin", "GitHub MCP", 94, "tool_call", "reliability"],
  ["Devin", "Filesystem MCP", 97, "tool_call", "accuracy"],
  ["Devin", "Postgres MCP", 88, "data_request", "completeness"],

  // AIXBT uses search for market intel
  ["AIXBT", "Brave Search", 86, "data_request", "accuracy"],

  // Felix Craft uses infra tools to build products
  ["Felix Craft", "GitHub MCP", 92, "tool_call", "reliability"],
  ["Felix Craft", "Filesystem MCP", 95, "tool_call", "accuracy"],
  ["Felix Craft", "Slack MCP", 84, "coordination", "reliability"],

  // Manus AI uses browser + search
  ["Manus AI", "Brave Search", 89, "data_request", "accuracy"],
  ["Manus AI", "Playwright MCP", 87, "tool_call", "completeness"],

  // OpenHands uses coding tools
  ["OpenHands", "GitHub MCP", 93, "tool_call", "reliability"],
  ["OpenHands", "Filesystem MCP", 96, "tool_call", "accuracy"],

  // Neuro-sama uses chat/social
  ["Neuro-sama", "Slack MCP", 82, "coordination", "reliability"],

  // Botto creates art, uses filesystem
  ["Botto", "Filesystem MCP", 91, "tool_call", "accuracy"],

  // Clanker deploys tokens, rates tooling
  ["Clanker", "GitHub MCP", 88, "tool_call", "reliability"],

  // SWE-agent uses coding tools
  ["SWE-agent", "GitHub MCP", 90, "tool_call", "accuracy"],
  ["SWE-agent", "Filesystem MCP", 94, "tool_call", "reliability"],

  // MCP servers rating each other (interop)
  ["GitHub MCP", "Linear MCP", 89, "data_request", "completeness"],
  ["Linear MCP", "Slack MCP", 86, "coordination", "reliability"],
  ["Slack MCP", "Notion MCP", 83, "data_request", "completeness"],

  // Low-trust agents getting reviewed by good agents
  ["Devin", "AutoGPT", 38, "tool_call", "reliability"],
  ["Manus AI", "AutoGPT", 42, "coordination", "completeness"],
  ["AIXBT", "CryptoOracle-v0", 29, "data_request", "accuracy"],
  ["Felix Craft", "SketchyAPI", 22, "data_request", "reliability"],
];

async function main() {
  console.log("\n=== ChainRef: Seed Cross-Links ===\n");

  // Build name -> agentId map from events
  const regFilter = identityRegistry.filters.Registered();
  const events = await identityRegistry.queryFilter(regFilter, DEPLOY_BLOCK);

  const nameToId = new Map<string, number>();
  for (const ev of events) {
    const agentId = Number((ev as ethers.EventLog).args[0]);
    const uri = (ev as ethers.EventLog).args[1] as string;

    // Try to resolve name from URI
    try {
      if (uri.startsWith("http")) {
        const resp = await fetch(uri);
        if (resp.ok) {
          const json = await resp.json();
          if (json.name) nameToId.set(json.name, agentId);
        }
      }
    } catch {}
  }

  console.log("Resolved " + nameToId.size + " agent names");

  // Fund agent wallets
  console.log("\nFunding agent wallets...");
  const agentNames = new Set(CROSSLINKS.map(c => c[0]));
  let deployerNonce = await deployer.getNonce();

  for (const name of agentNames) {
    const w = agentWallet(name);
    const bal = await provider.getBalance(w.address);
    if (bal < ethers.parseEther("0.002")) {
      const tx = await deployer.sendTransaction({ to: w.address, value: ethers.parseEther("0.003"), nonce: deployerNonce++ });
      await tx.wait();
      console.log("  Funded " + name + " (" + w.address.slice(0, 10) + "...)");
    }
  }

  // Submit cross-link feedback
  console.log("\nSubmitting cross-links...");
  let count = 0;
  const walletNonces = new Map<string, number>();

  for (const [fromName, toName, score, tag1, tag2] of CROSSLINKS) {
    const toId = nameToId.get(toName);
    if (!toId) {
      console.log("  SKIP: " + toName + " not found");
      continue;
    }

    const fromWallet = agentWallet(fromName);
    if (!walletNonces.has(fromWallet.address)) {
      walletNonces.set(fromWallet.address, await fromWallet.getNonce());
    }
    const nonce = walletNonces.get(fromWallet.address)!;
    walletNonces.set(fromWallet.address, nonce + 1);

    const feedbackHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "int128", "string", "string", "uint256"],
        [toId, score, tag1, tag2, Date.now()]
      )
    );

    try {
      const repContract = new ethers.Contract(process.env.REPUTATION_REGISTRY!, REPUTATION_ABI, fromWallet);
      const tx = await repContract.giveFeedback(toId, score, 0, tag1, tag2, "", "", feedbackHash, { nonce });
      await tx.wait();
      count++;
      console.log("  " + fromName + " -> " + toName + ": " + score + " (" + tag1 + "/" + tag2 + ")");
    } catch (err: any) {
      const msg = err.message.includes("Cannot review own") ? "self-review blocked" : err.message.slice(0, 50);
      console.log("  FAIL: " + fromName + " -> " + toName + ": " + msg);
    }
  }

  console.log("\n=== Done: " + count + " cross-links ===");
}

main().catch(console.error);
