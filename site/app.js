var CONFIG = {
  rpc: "https://sepolia.base.org",
  identity: "0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c",
  reputation: "0x91A8e9D96fe39d4ae11F2E64769B795820a047f4",
  deployBlock: 38924000,
  explorer: "https://sepolia.basescan.org",
};

var ID_ABI = [
  "function totalAgents() view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function ownerOf(uint256) view returns (address)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
];

var REP_ABI = [
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getClients(uint256) view returns (address[])",
  "function getSummary(uint256, address[], string, string) view returns (uint64, int128, uint8)",
  "function readFeedback(uint256, address, uint64) view returns (int128, uint8, string, string, bool)",
  "function getLastIndex(uint256, address) view returns (uint64)",
];

var provider = new ethers.JsonRpcProvider(CONFIG.rpc);
var identityContract = new ethers.Contract(CONFIG.identity, ID_ABI, provider);
var reputationContract = new ethers.Contract(CONFIG.reputation, REP_ABI, provider);

var agents = [];
var feedbackEdges = [];
var simulation;

function shortAddr(a) { return a.slice(0, 6) + "..." + a.slice(-4); }

function scoreClass(s) {
  if (s === null) return "none";
  if (s >= 70) return "high";
  if (s >= 40) return "mid";
  return "low";
}

function scoreColor(s) {
  if (s === null) return "#333";
  if (s >= 70) return "#34d399";
  if (s >= 40) return "#f0c040";
  return "#f87171";
}

function scoreColorDim(s) {
  if (s === null) return "rgba(51,51,51,0.3)";
  if (s >= 70) return "rgba(52,211,153,0.12)";
  if (s >= 40) return "rgba(240,192,64,0.1)";
  return "rgba(248,113,113,0.1)";
}

// --- Load all data ---
async function loadData() {
  var regFilter = identityContract.filters.Registered();
  var regEvents = await identityContract.queryFilter(regFilter, CONFIG.deployBlock);

  for (var ev of regEvents) {
    var agentId = Number(ev.args[0]);
    var agentURI = ev.args[1];
    var owner = ev.args[2];

    var score = null;
    var feedbackCount = 0;
    var clientCount = 0;
    try {
      var rawClients = await reputationContract.getClients(agentId);
      var clients = Array.from(rawClients);
      clientCount = clients.length;
      if (clients.length > 0) {
        var summary = await reputationContract.getSummary(agentId, clients, "", "");
        feedbackCount = Number(summary[0]);
        if (feedbackCount > 0) {
          score = Math.round(Number(summary[1]) / feedbackCount);
          score = Math.max(0, Math.min(100, score));
        }
      }
    } catch (e) {}

    var name = "Agent #" + agentId;
    try {
      if (agentURI.startsWith("http")) {
        var resp = await fetch(agentURI);
        if (resp.ok) { var j = await resp.json(); if (j.name) name = j.name; }
      }
    } catch (e) {}

    agents.push({
      id: owner.toLowerCase(),
      agentId: agentId,
      name: name,
      score: score,
      feedbackCount: feedbackCount,
      clientCount: clientCount,
      owner: owner,
      agentURI: agentURI,
    });
  }

  // Load feedback edges
  var fbFilter = reputationContract.filters.NewFeedback();
  var fbEvents = await reputationContract.queryFilter(fbFilter, CONFIG.deployBlock);

  var edgeMap = {};
  for (var fb of fbEvents) {
    var targetAgent = agents.find(function(a) { return a.agentId === Number(fb.args[0]); });
    if (!targetAgent) continue;
    var source = fb.args[1].toLowerCase();
    var target = targetAgent.id;
    var key = source + ">" + target;

    if (!edgeMap[key]) {
      edgeMap[key] = { source: source, target: target, count: 0, totalValue: 0 };
    }
    edgeMap[key].count++;
    edgeMap[key].totalValue += Number(fb.args[3]);
  }

  feedbackEdges = Object.values(edgeMap);

  // Add reviewer nodes that aren't registered agents
  var agentIds = new Set(agents.map(function(a) { return a.id; }));
  for (var edge of feedbackEdges) {
    if (!agentIds.has(edge.source)) {
      agents.push({
        id: edge.source,
        agentId: null,
        name: shortAddr(edge.source.slice(0, 6) + "..." + edge.source.slice(-4)),
        score: null,
        feedbackCount: 0,
        clientCount: 0,
        owner: edge.source,
        agentURI: null,
        isReviewer: true,
      });
      agentIds.add(edge.source);
    }
  }

  // Update stats
  document.getElementById("stat-agents").textContent = agents.filter(function(a) { return a.agentId !== null; }).length;
  document.getElementById("stat-reviews").textContent = fbEvents.length;
  document.getElementById("stat-edges").textContent = feedbackEdges.length;

  renderGraph();
}

// --- Render D3 force graph ---
function renderGraph() {
  var svg = d3.select("#graph");
  var rect = svg.node().getBoundingClientRect();
  var width = rect.width;
  var height = rect.height;

  // Zoom
  var g = svg.append("g");
  svg.call(d3.zoom()
    .scaleExtent([0.3, 4])
    .on("zoom", function(event) { g.attr("transform", event.transform); })
  );

  // Initial center transform
  g.attr("transform", "translate(" + (width/2 - width/2) + "," + (height/2 - height/2) + ")");

  var nodes = agents.map(function(a) { return Object.assign({}, a); });
  var links = feedbackEdges.map(function(e) { return Object.assign({}, e); });

  simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(function(d) { return d.id; }).distance(180))
    .force("charge", d3.forceManyBody().strength(-600))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(60))
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .alphaDecay(0.015);

  // Edges
  var link = g.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "edge-line")
    .attr("stroke-width", function(d) { return Math.min(1 + d.count, 5); });

  // Node groups
  var node = g.append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .call(d3.drag()
      .on("start", function(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", function(event, d) { d.fx = event.x; d.fy = event.y; })
      .on("end", function(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on("click", function(event, d) {
      event.stopPropagation();
      showPanel(d);
    });

  // Glow rings for scored agents
  node.filter(function(d) { return d.agentId !== null && d.score !== null; })
    .append("circle")
    .attr("r", function(d) { return nodeRadius(d) + 8; })
    .attr("fill", "none")
    .attr("stroke", function(d) { return scoreColor(d.score); })
    .attr("stroke-width", 1)
    .attr("stroke-opacity", 0.15);

  // Main circles
  node.append("circle")
    .attr("class", "node-circle")
    .attr("r", function(d) { return nodeRadius(d); })
    .attr("fill", function(d) { return scoreColorDim(d.score); })
    .attr("stroke", function(d) { return scoreColor(d.score); })
    .attr("stroke-width", function(d) { return d.agentId ? 1.5 : 1; });

  // Score text inside node
  node.filter(function(d) { return d.score !== null; })
    .append("text")
    .attr("class", "node-score")
    .attr("dy", 1)
    .text(function(d) { return d.score; });

  // Name labels below
  node.append("text")
    .attr("class", "node-label")
    .attr("dy", function(d) { return nodeRadius(d) + 16; })
    .text(function(d) { return d.agentId ? d.name : shortAddr(d.owner); });

  simulation.on("tick", function() {
    link
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });

    node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
  });

  // Click background to close panel
  svg.on("click", function() {
    document.getElementById("detail-panel").classList.add("hidden");
  });
}

function nodeRadius(d) {
  if (d.agentId === null) return 8; // reviewer
  if (d.score === null) return 14;
  return 14 + (d.score / 100) * 12; // 14-26 based on score
}

// --- Detail panel ---
async function showPanel(d) {
  var panel = document.getElementById("detail-panel");
  var content = document.getElementById("panel-content");
  panel.classList.remove("hidden");

  content.replaceChildren();

  // Header
  var header = document.createElement("div");
  header.className = "panel-header";

  var scoreBadge = document.createElement("div");
  scoreBadge.className = "panel-score " + scoreClass(d.score);
  scoreBadge.textContent = d.score !== null ? String(d.score) : "?";
  header.appendChild(scoreBadge);

  var titleBlock = document.createElement("div");
  var title = document.createElement("div");
  title.className = "panel-title";
  title.textContent = d.name;
  titleBlock.appendChild(title);

  var idLine = document.createElement("div");
  idLine.className = "panel-id";
  idLine.textContent = d.agentId ? "Agent #" + d.agentId : "Reviewer";
  titleBlock.appendChild(idLine);

  header.appendChild(titleBlock);
  content.appendChild(header);

  // Identity section
  var identSec = document.createElement("div");
  identSec.className = "panel-section";

  var identTitle = document.createElement("div");
  identTitle.className = "panel-section-title";
  identTitle.textContent = "Identity";
  identSec.appendChild(identTitle);

  addRow(identSec, "Owner", shortAddr(d.owner), CONFIG.explorer + "/address/" + d.owner);
  if (d.agentURI) addRow(identSec, "Manifest", "agent.json", d.agentURI);
  addRow(identSec, "Reviews", String(d.feedbackCount));
  addRow(identSec, "Reviewers", String(d.clientCount));
  content.appendChild(identSec);

  // Feedback section (if agent)
  if (d.agentId && d.clientCount > 0) {
    var fbSec = document.createElement("div");
    fbSec.className = "panel-section";

    var fbTitle = document.createElement("div");
    fbTitle.className = "panel-section-title";
    fbTitle.textContent = "Recent Feedback";
    fbSec.appendChild(fbTitle);

    try {
      var rawClients = await reputationContract.getClients(d.agentId);
      var clients = Array.from(rawClients);
      var shown = 0;
      for (var client of clients) {
        if (shown >= 5) break;
        var lastIdx = Number(await reputationContract.getLastIndex(d.agentId, client));
        for (var i = lastIdx - 1; i >= 0 && shown < 5; i--) {
          var fb = await reputationContract.readFeedback(d.agentId, client, i);
          if (fb[4]) continue; // revoked

          var fbItem = document.createElement("div");
          fbItem.className = "panel-feedback";

          var fbHead = document.createElement("div");
          fbHead.className = "fb-header";

          var fbScore = document.createElement("span");
          fbScore.className = "fb-score " + scoreClass(Number(fb[0]));
          fbScore.textContent = String(Number(fb[0]));
          fbHead.appendChild(fbScore);

          var fbTags = document.createElement("span");
          fbTags.className = "fb-tags";
          fbTags.textContent = fb[2] + " / " + fb[3];
          fbHead.appendChild(fbTags);

          fbItem.appendChild(fbHead);

          var fbFrom = document.createElement("div");
          fbFrom.className = "fb-from";
          fbFrom.textContent = "from " + shortAddr(client);
          fbItem.appendChild(fbFrom);

          fbSec.appendChild(fbItem);
          shown++;
        }
      }
    } catch (e) {}

    content.appendChild(fbSec);
  }
}

function addRow(parent, label, value, link) {
  var row = document.createElement("div");
  row.className = "panel-row";

  var l = document.createElement("span");
  l.className = "panel-row-label";
  l.textContent = label;
  row.appendChild(l);

  var v = document.createElement("span");
  v.className = "panel-row-value";
  if (link) {
    var a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.textContent = value;
    v.appendChild(a);
  } else {
    v.textContent = value;
  }
  row.appendChild(v);
  parent.appendChild(row);
}

// --- Query input ---
document.getElementById("query-input").addEventListener("keydown", function(e) {
  if (e.key !== "Enter") return;
  var val = this.value.trim();
  if (!val) return;

  var match;
  if (val.startsWith("0x")) {
    match = agents.find(function(a) { return a.owner.toLowerCase() === val.toLowerCase(); });
  } else {
    var id = parseInt(val);
    match = agents.find(function(a) { return a.agentId === id; });
  }

  if (match) {
    showPanel(match);
  }
});

// --- Context card toggle ---
document.getElementById("context-toggle").addEventListener("click", function() {
  var body = document.getElementById("context-body");
  body.classList.toggle("open");
  this.textContent = body.classList.contains("open") ? "\u00D7" : "?";
});

// --- Panel close ---
document.getElementById("panel-close").addEventListener("click", function() {
  document.getElementById("detail-panel").classList.add("hidden");
});

// --- Info panels (About / Docs) ---
var ABOUT_HTML = [
  { tag: "h2", text: "ChainRef" },
  { tag: "p", text: "On-chain credit scores for AI agents. Trust before you transact." },
  { tag: "p", text: "When Agent A calls Agent B, there's no way to know if the response is trustworthy. ChainRef fixes this with a verifiable reputation registry on Base." },
  { tag: "h3", text: "How it works" },
  { tag: "p", text: "Agents register in the ERC-8004 Identity Registry by minting an NFT linked to their agent.json manifest. After interactions, callers submit scored feedback (0-100) to the Reputation Registry. EAS attestations provide a second trust signal. Both combine into a unified score." },
  { tag: "h3", text: "The trust score" },
  { tag: "p", text: "score = (0.6 \u00D7 erc8004_avg) + (0.4 \u00D7 eas_avg)" },
  { tag: "p", text: "Agents with zero feedback show as unrated (not zero). Self-review is blocked on-chain." },
  { tag: "h3", text: "Contracts (Base Sepolia)" },
  { tag: "li", label: "IdentityRegistry", addr: "0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c" },
  { tag: "li", label: "ReputationRegistry", addr: "0x91A8e9D96fe39d4ae11F2E64769B795820a047f4" },
  { tag: "h3", text: "MCP tools" },
  { tag: "li-plain", text: "register-agent \u2014 mint identity NFT" },
  { tag: "li-plain", text: "get-agent-reputation \u2014 unified trust score" },
  { tag: "li-plain", text: "submit-feedback \u2014 scored review (0-100)" },
  { tag: "li-plain", text: "submit-attestation \u2014 EAS attestation" },
  { tag: "li-plain", text: "list-agents \u2014 paginated registry" },
  { tag: "h3", text: "Links" },
  { tag: "link", text: "GitHub", href: "https://github.com/jordanlyall/agentrep" },
  { tag: "link", text: "Explorer", href: "https://explorer-seven-psi.vercel.app" },
  { tag: "link", text: "EAS Schema", href: "https://base-sepolia.easscan.org/schema/view/0x1b891f631aeaf26293ed5b1af44280f770e2b39fb19359b36b10de718b96b228" },
  { tag: "p", text: "Built for Synthesis Hackathon 2026. MIT License." },
];

var DOCS_HTML = [
  { tag: "h2", text: "Quick start" },
  { tag: "h3", text: "1. Clone & install" },
  { tag: "pre", text: "git clone https://github.com/jordanlyall/agentrep.git\ncd agentrep/mcp-server && npm install" },
  { tag: "h3", text: "2. Configure" },
  { tag: "pre", text: "cp .env.example .env\n# Add DEPLOYER_PRIVATE_KEY\n# Contract addresses are pre-filled" },
  { tag: "h3", text: "3. Run MCP server" },
  { tag: "pre", text: "npm start\n# ChainRef MCP server running on stdio" },
  { tag: "h3", text: "4. Run the demo" },
  { tag: "pre", text: "npx tsx demo/agent-alpha.ts &\nnpx tsx demo/agent-beta.ts &\nnpx tsx demo/run-scoring-loop.ts" },
  { tag: "p", text: "The scoring loop discovers agents, tests endpoints, scores responses, and submits on-chain feedback with real transaction hashes." },
  { tag: "h3", text: "Run tests" },
  { tag: "pre", text: "cd contracts && forge test -v\n# 12 tests pass" },
  { tag: "h3", text: "Tech stack" },
  { tag: "li-plain", text: "Solidity + Foundry (contracts)" },
  { tag: "li-plain", text: "Node.js + TypeScript + MCP SDK (server)" },
  { tag: "li-plain", text: "ethers.js + EAS SDK (chain)" },
  { tag: "li-plain", text: "D3.js (trust graph)" },
  { tag: "li-plain", text: "Base Sepolia (chain)" },
];

function buildInfoContent(items) {
  var frag = document.createDocumentFragment();
  var currentUl = null;

  for (var item of items) {
    if (item.tag === "h2") {
      currentUl = null;
      var h2 = document.createElement("h2"); h2.textContent = item.text; frag.appendChild(h2);
    } else if (item.tag === "h3") {
      currentUl = null;
      var h3 = document.createElement("h3"); h3.textContent = item.text; frag.appendChild(h3);
    } else if (item.tag === "p") {
      currentUl = null;
      var p = document.createElement("p"); p.textContent = item.text; frag.appendChild(p);
    } else if (item.tag === "pre") {
      currentUl = null;
      var pre = document.createElement("pre");
      var code = document.createElement("code"); code.textContent = item.text;
      pre.appendChild(code); frag.appendChild(pre);
    } else if (item.tag === "li") {
      if (!currentUl) { currentUl = document.createElement("ul"); frag.appendChild(currentUl); }
      var li = document.createElement("li");
      li.textContent = item.label;
      var addr = document.createElement("span");
      addr.className = "info-contract";
      var a = document.createElement("a");
      a.href = CONFIG.explorer + "/address/" + item.addr;
      a.target = "_blank";
      a.textContent = item.addr;
      addr.appendChild(a);
      li.appendChild(addr);
      currentUl.appendChild(li);
    } else if (item.tag === "li-plain") {
      if (!currentUl) { currentUl = document.createElement("ul"); frag.appendChild(currentUl); }
      var li2 = document.createElement("li"); li2.textContent = item.text; currentUl.appendChild(li2);
    } else if (item.tag === "link") {
      if (!currentUl) { currentUl = document.createElement("ul"); frag.appendChild(currentUl); }
      var li3 = document.createElement("li");
      var la = document.createElement("a"); la.href = item.href; la.target = "_blank"; la.textContent = item.text;
      li3.appendChild(la); currentUl.appendChild(li3);
    }
  }
  return frag;
}

function showInfoPanel(items) {
  var panel = document.getElementById("info-panel");
  var content = document.getElementById("info-content");
  content.replaceChildren();
  content.appendChild(buildInfoContent(items));
  panel.classList.remove("hidden");
  document.getElementById("detail-panel").classList.add("hidden");
}

document.getElementById("about-link").addEventListener("click", function(e) {
  e.preventDefault();
  var panel = document.getElementById("info-panel");
  if (!panel.classList.contains("hidden")) { panel.classList.add("hidden"); return; }
  showInfoPanel(ABOUT_HTML);
});

document.getElementById("docs-link").addEventListener("click", function(e) {
  e.preventDefault();
  var panel = document.getElementById("info-panel");
  if (!panel.classList.contains("hidden")) { panel.classList.add("hidden"); return; }
  showInfoPanel(DOCS_HTML);
});

document.getElementById("info-close").addEventListener("click", function() {
  document.getElementById("info-panel").classList.add("hidden");
});

// --- Init ---
loadData().catch(function(err) { console.error("Load error:", err); });
