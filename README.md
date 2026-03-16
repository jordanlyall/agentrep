# AgentRep

On-chain credit scores for AI agents. Trust before you transact.

## What

A reputation registry on Base where AI agents earn trust scores through verifiable on-chain feedback. Three systems work together:

1. **ERC-8004 Identity Registry** - Agents register by minting an NFT. Each agent gets an on-chain identity with a URI pointing to their `agent.json` manifest.

2. **ERC-8004 Reputation Registry** - Anyone can submit scored feedback for an agent (0-100), tagged by interaction type and quality dimension. Agents cannot review themselves.

3. **EAS Attestations** - Ethereum Attestation Service provides a second trust signal with a custom schema for agent performance ratings.

A unified trust score combines both sources: `0.6 * ERC-8004 avg + 0.4 * EAS avg`.

## Architecture

```
                    MCP Server (5 tools)
                         |
            +------------+------------+
            |            |            |
    Identity Registry  Reputation   EAS
    (ERC-721 NFTs)     Registry    Attestations
            |            |            |
            +------+-----+-----+-----+
                   |           |
              Explorer UI   agent_log.json
              (D3 trust graph)
```

## Deployed Contracts (Base Sepolia)

| Contract | Address |
|----------|---------|
| IdentityRegistry | `0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c` |
| ReputationRegistry | `0x91A8e9D96fe39d4ae11F2E64769B795820a047f4` |

## Quick Start

### 1. Deploy contracts (already deployed)

```bash
cd contracts
forge install
forge test  # 12 tests pass
# Deploy: forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast
```

### 2. Run MCP server

```bash
cd mcp-server
npm install
cp ../.env.example ../.env  # add your keys
npm start
```

### 3. Run demo

```bash
# Terminal 1: Start simulated agents
npx tsx demo/agent-alpha.ts &
npx tsx demo/agent-beta.ts &

# Terminal 2: Run autonomous scoring loop
npx tsx demo/run-scoring-loop.ts
```

The scoring loop will:
- Discover registered agents from the Identity Registry
- Register new agents if needed
- Test each agent's endpoint (real HTTP calls)
- Score responses based on success, latency, and completeness
- Submit on-chain feedback via the Reputation Registry
- Log all decisions to `agent_log.json` with real tx hashes

## MCP Tools

| Tool | Description |
|------|-------------|
| `register-agent` | Register an agent in the Identity Registry (mints NFT) |
| `get-agent-reputation` | Query unified trust score by agent ID or address |
| `submit-feedback` | Submit ERC-8004 reputation feedback (0-100 score with tags) |
| `submit-attestation` | Create EAS attestation for agent performance |
| `list-agents` | List all registered agents with pagination |

## Explorer

Single-page app with three views:
- **Agent List**: Cards with trust scores (color-coded), review counts
- **Agent Detail**: Metadata, score breakdown, feedback history
- **Trust Graph**: D3.js force-directed network of agent interactions

## Tech Stack

- Solidity + Foundry (contracts, testing, deployment)
- Node.js + TypeScript + MCP SDK (server)
- ethers.js + EAS SDK (chain interaction)
- Vanilla HTML/JS + D3.js (explorer)
- Base Sepolia (chain)

## Bounty Targets

- **Agents With Receipts (ERC-8004)**: Multiple ERC-8004 registries, on-chain verifiability
- **Let the Agent Cook**: ERC-8004 identity, agent.json, structured logs, autonomous loop
- **Agents that Pay**: On-chain credit score on ERC-8004
- **Open Track**: Infrastructure for agent trust

## License

MIT
