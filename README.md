# ChainRef: On-Chain Trust Scores for AI Agents

> Before you call an AI tool, check its trust score.

**[Live Trust Network](https://site-gamma-five-18.vercel.app)** | **[Explorer](https://explorer-seven-psi.vercel.app)** | **[Contracts on Basescan](https://sepolia.basescan.org/address/0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c)**

## Problem

$50B+ in agent tokens traded. 165K paid subscribers for an AI streamer. The first AI software engineer deployed at Goldman Sachs. An AI got hacked for $47K via prompt injection. Agents are transacting at scale. There is no verifiable trust layer.

## What ChainRef Does

ChainRef is an on-chain reputation registry on Base. Agents, MCP servers, and oracles register via ERC-8004 Identity Registry (NFT mint). After interactions, callers submit scored feedback (0-100) to the Reputation Registry, tagged by interaction type (tool_call, data_request, coordination) and quality dimension (reliability, accuracy, completeness, latency). EAS attestations provide a second trust signal. Both combine into a unified score: `(0.6 * erc8004_avg) + (0.4 * eas_avg)`. Self-review is blocked on-chain.

## Live Deployment

### On-Chain (Base Sepolia)

| Contract | Address | Basescan |
|----------|---------|----------|
| IdentityRegistry | `0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c` | [View](https://sepolia.basescan.org/address/0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c) |
| ReputationRegistry | `0x91A8e9D96fe39d4ae11F2E64769B795820a047f4` | [View](https://sepolia.basescan.org/address/0x91A8e9D96fe39d4ae11F2E64769B795820a047f4) |
| EAS Schema | `0x1b891f631aeaf26293ed5b1af44280f770e2b39fb19359b36b10de718b96b228` | [View](https://base-sepolia.easscan.org/schema/view/0x1b891f631aeaf26293ed5b1af44280f770e2b39fb19359b36b10de718b96b228) |

### On-Chain Activity

- 33 registered entities (MCP servers, agents, oracles)
- 119 on-chain reviews from 24 unique wallets
- 24 trust edges including agent-to-MCP cross-links
- 2 EAS attestations
- Entities include: GitHub MCP, Brave Search, Linear MCP, Devin, AIXBT, Neuro-sama, Truth Terminal, Freysa, Botto, and more

### Live URLs

- **Trust Network (interactive)**: https://site-gamma-five-18.vercel.app
- **Explorer (agent list + graph)**: https://explorer-seven-psi.vercel.app

## Architecture

```
            MCP Server (5 tools, stdio)
                    |
        +-----------+-----------+
        |           |           |
  Identity      Reputation     EAS
  Registry      Registry    Attestations
  (ERC-721)    (feedback)   (schema)
        |           |           |
        +-----+-----+-----+----+
              |           |
     Trust Network    agent_log.json
     (D3 + ethers)   (real tx hashes)
```

## ERC-8004 Compliance

### agent.json

Hosted at: https://site-gamma-five-18.vercel.app/agents/scorer.json

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "ChainRef-Scorer",
  "services": [{ "name": "MCP", "endpoint": "stdio", "version": "1.0.0" }],
  "operatorWallet": "0x75668C4DDd32480d3fC63BBb180bEa1c9e764612",
  "tools": ["register-agent", "get-agent-reputation", "submit-feedback", "submit-attestation", "list-agents"]
}
```

All 33 entities have hosted agent.json manifests at `site-gamma-five-18.vercel.app/agents/`.

### agent_log.json

Contains real execution data from the autonomous scoring loop with verifiable Base Sepolia transaction hashes. [View in repo](agent_log.json).

## MCP Server

5 tools, stdio transport. Clone and run locally:

```bash
git clone https://github.com/jordanlyall/agentrep.git
cd agentrep/mcp-server && npm install
cp ../.env.example ../.env  # contract addresses pre-filled, add a private key
npm start
# ChainRef MCP server running on stdio
```

### Tools

| Tool | Input | Output |
|------|-------|--------|
| `register-agent` | `{ agentURI: string }` | `{ agentId, txHash, blockNumber }` |
| `get-agent-reputation` | `{ agentIdOrAddress: string }` | `{ agentId, trustScore, erc8004: { count, average }, eas: { count, average } }` |
| `submit-feedback` | `{ agentId: number, value: 0-100, tag1: string, tag2: string }` | `{ txHash, blockNumber }` |
| `submit-attestation` | `{ agentAddress, score, interactionType, context }` | `{ attestationUID, txHash }` |
| `list-agents` | `{ page?, limit? }` | `{ agents: [{ agentId, agentURI, owner }], total }` |

## Trust Score System

Scores are multi-dimensional, not a single number:

- **Dimensions**: reliability, accuracy, completeness, latency (tagged per review)
- **Confidence**: Low (<2 reviews), Medium (2-4), High (5+)
- **Raw transparency**: every individual score visible, average computed openly
- **Integrity**: self-review blocked at contract level, all reviews on-chain and verifiable
- **Trust badges**: embeddable SVG for README integration (`![ChainRef](https://chainref.ai/badge/github-mcp.svg)`)

## Autonomous Scoring Loop

The demo runs a discover > plan > execute > verify > attest loop:

1. Query Identity Registry for registered agents
2. Test each agent's service endpoint (real HTTP calls)
3. Score responses: success rate, latency, schema compliance
4. Submit ERC-8004 feedback on-chain
5. Log all decisions to `agent_log.json` with real tx hashes

```bash
npx tsx demo/agent-alpha.ts &    # reliable agent (port 3001)
npx tsx demo/agent-beta.ts &     # unreliable agent (port 3002)
npx tsx demo/run-scoring-loop.ts # autonomous scoring
```

## Bounty Evidence

### Agents With Receipts (ERC-8004) - $8,004

- Two ERC-8004 registries deployed: Identity (`0xea16...451c`) + Reputation (`0x91A8...47f4`)
- [agent.json](https://site-gamma-five-18.vercel.app/agents/scorer.json) conforms to ERC-8004 registration spec
- [agent_log.json](agent_log.json) contains real tx hashes from autonomous execution
- EAS schema registered: `0x1b89...b228`
- 33 entities registered with on-chain identities

### Let the Agent Cook (EF) - $8,000

- MCP server with 5 callable tools (stdio transport)
- Autonomous scoring loop: discover > plan > execute > verify > attest
- Agent-to-agent trust edges: 24 cross-links between agents and MCP servers
- Structured execution log with real tx hashes

### Agents that Pay (bond.credit) - $1,500

- On-chain credit scores computed from ERC-8004 feedback
- Multi-dimensional scoring (reliability, accuracy, completeness, latency)
- 119 on-chain reviews across 33 entities

### Open Track - $14,559

- First on-chain reputation registry for AI agents and MCP servers
- Live trust network with recognizable entities (GitHub MCP, Devin, AIXBT, etc.)
- Embeddable trust badges for README integration

## Tests

```bash
cd contracts && forge test -v
# 12 tests pass (7 Identity, 5 Reputation)
```

## Tech Stack

Solidity + Foundry, Node.js + TypeScript + MCP SDK, ethers.js + EAS SDK, D3.js, Base Sepolia, Vercel

## License

MIT
