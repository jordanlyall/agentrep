import { ethers } from "ethers";

// Block number when contracts were deployed (used for event queries)
export const DEPLOY_BLOCK = parseInt(process.env.DEPLOY_BLOCK || "38924000");

const IDENTITY_ABI = [
  "function register(string agentURI) external returns (uint256)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function setMetadata(uint256 agentId, string key, bytes value) external",
  "function getMetadata(uint256 agentId, string key) external view returns (bytes)",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function totalAgents() external view returns (uint256)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

const REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external",
  "function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external",
  "function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryDecimals)",
  "function readFeedback(uint256 agentId, address client, uint64 index) external view returns (int128, uint8, string, string, bool)",
  "function getClients(uint256 agentId) external view returns (address[])",
  "function getLastIndex(uint256 agentId, address client) external view returns (uint64)",
];

export function getProvider() {
  return new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
}

export function getSigner() {
  const provider = getProvider();
  return new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
}

export function getIdentityRegistry(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    process.env.IDENTITY_REGISTRY!,
    IDENTITY_ABI,
    signerOrProvider ?? getSigner()
  );
}

export function getReputationRegistry(signerOrProvider?: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(
    process.env.REPUTATION_REGISTRY!,
    REPUTATION_ABI,
    signerOrProvider ?? getSigner()
  );
}
