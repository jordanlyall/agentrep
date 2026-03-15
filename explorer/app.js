const CONFIG = {
  rpc: "https://sepolia.base.org",
  identityRegistry: "0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c",
  reputationRegistry: "0x91A8e9D96fe39d4ae11F2E64769B795820a047f4",
  deployBlock: 38924000,
  explorerBase: "https://sepolia.basescan.org",
};

const IDENTITY_ABI = [
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "function tokenURI(uint256 agentId) view returns (string)",
  "function ownerOf(uint256 agentId) view returns (address)",
  "function totalAgents() view returns (uint256)",
];

const REPUTATION_ABI = [
  "event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)",
  "function getClients(uint256 agentId) view returns (address[])",
  "function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryDecimals)",
  "function readFeedback(uint256 agentId, address client, uint64 index) view returns (int128, uint8, string, string, bool)",
  "function getLastIndex(uint256 agentId, address client) view returns (uint64)",
];

const provider = new ethers.JsonRpcProvider(CONFIG.rpc);
const identity = new ethers.Contract(CONFIG.identityRegistry, IDENTITY_ABI, provider);
const reputation = new ethers.Contract(CONFIG.reputationRegistry, REPUTATION_ABI, provider);

let agents = [];
let feedbackEdges = [];

// --- Helpers ---
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function scoreClass(score) {
  if (score === null) return "score-none";
  if (score >= 70) return "score-high";
  if (score >= 40) return "score-mid";
  return "score-low";
}

function scoreText(score) {
  return score === null ? "Unrated" : String(score);
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// --- Tab navigation ---
document.querySelectorAll(".tab").forEach(function(tab) {
  tab.addEventListener("click", function() {
    document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });
    document.querySelectorAll(".view").forEach(function(v) { v.classList.remove("active"); });
    tab.classList.add("active");
    document.getElementById(tab.dataset.view + "-view").classList.add("active");
    if (tab.dataset.view === "graph") renderGraph();
  });
});

document.getElementById("back-btn").addEventListener("click", function() {
  document.getElementById("detail-view").classList.remove("active");
  document.getElementById("list-view").classList.add("active");
  document.querySelector('[data-view="list"]').classList.add("active");
  document.querySelector('[data-view="graph"]').classList.remove("active");
});

// --- DOM builder helpers ---
function createAgentCard(agent) {
  var card = document.createElement("div");
  card.className = "agent-card";
  card.dataset.id = agent.agentId;

  var badge = document.createElement("div");
  badge.className = "score-badge " + scoreClass(agent.trustScore);
  badge.textContent = scoreText(agent.trustScore);
  card.appendChild(badge);

  var name = document.createElement("div");
  name.className = "agent-name";
  name.textContent = agent.name;
  card.appendChild(name);

  var info = document.createElement("div");
  info.className = "agent-id";
  info.textContent = "ID: " + agent.agentId + " \u00B7 " + agent.feedbackCount + " reviews";
  card.appendChild(info);

  var owner = document.createElement("div");
  owner.className = "agent-owner";
  owner.textContent = shortAddr(agent.owner);
  card.appendChild(owner);

  card.addEventListener("click", function() {
    showDetail(agent.agentId);
  });

  return card;
}

function createFeedbackItem(value, tag1, tag2, client) {
  var item = document.createElement("div");
  item.className = "feedback-item";

  var valBadge = document.createElement("span");
  valBadge.className = "fb-value score-badge " + scoreClass(Number(value));
  valBadge.textContent = String(Number(value));
  item.appendChild(valBadge);

  var tags = document.createElement("span");
  tags.className = "fb-tags";
  tags.textContent = " " + tag1 + " / " + tag2;
  item.appendChild(tags);

  var clientDiv = document.createElement("div");
  clientDiv.className = "fb-client";
  clientDiv.textContent = "from " + shortAddr(client);
  item.appendChild(clientDiv);

  return item;
}

// --- Load agents ---
async function loadAgents() {
  var loading = document.getElementById("loading");
  try {
    var filter = identity.filters.Registered();
    var events = await identity.queryFilter(filter, CONFIG.deployBlock);

    agents = [];
    for (var event of events) {
      var agentId = Number(event.args[0]);
      var agentURI = event.args[1];
      var owner = event.args[2];

      var trustScore = null;
      var feedbackCount = 0;
      try {
        var clients = await reputation.getClients(agentId);
        if (clients.length > 0) {
          var result = await reputation.getSummary(agentId, clients, "", "");
          feedbackCount = Number(result[0]);
          if (feedbackCount > 0) {
            trustScore = Math.round(Number(result[1]) / feedbackCount);
            trustScore = Math.max(0, Math.min(100, trustScore));
          }
        }
      } catch (e) { /* no reputation data */ }

      var agentName = "Agent #" + agentId;
      try {
        if (agentURI.startsWith("http")) {
          var resp = await fetch(agentURI);
          if (resp.ok) {
            var json = await resp.json();
            if (json.name) agentName = json.name;
          }
        }
      } catch (e) { /* use default name */ }

      agents.push({ agentId: agentId, agentURI: agentURI, owner: owner, name: agentName, trustScore: trustScore, feedbackCount: feedbackCount });
    }

    // Load feedback edges for graph
    var fbFilter = reputation.filters.NewFeedback();
    var fbEvents = await reputation.queryFilter(fbFilter, CONFIG.deployBlock);
    feedbackEdges = fbEvents.map(function(e) {
      return {
        agentId: Number(e.args[0]),
        client: e.args[1],
        value: Number(e.args[3]),
        tag1: e.args[5],
        tag2: e.args[6],
      };
    });

    renderAgentList();
    loading.style.display = "none";
  } catch (err) {
    loading.textContent = "Error loading agents: " + err.message;
  }
}

// --- Render agent list ---
function renderAgentList() {
  var grid = document.getElementById("agent-list");
  grid.replaceChildren();
  for (var agent of agents) {
    grid.appendChild(createAgentCard(agent));
  }
}

// --- Agent detail ---
async function showDetail(agentId) {
  var agent = agents.find(function(a) { return a.agentId === agentId; });
  if (!agent) return;

  document.querySelectorAll(".view").forEach(function(v) { v.classList.remove("active"); });
  document.getElementById("detail-view").classList.add("active");
  document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("active"); });

  var detail = document.getElementById("agent-detail");
  detail.replaceChildren();

  // Header
  var header = document.createElement("div");
  header.className = "detail-header";

  var h2 = document.createElement("h2");
  h2.textContent = agent.name;
  header.appendChild(h2);

  var meta = document.createElement("div");
  meta.className = "detail-meta";
  meta.appendChild(document.createTextNode("ID: " + agent.agentId + " \u00B7 Owner: "));

  var ownerLink = document.createElement("a");
  ownerLink.href = CONFIG.explorerBase + "/address/" + agent.owner;
  ownerLink.target = "_blank";
  ownerLink.textContent = shortAddr(agent.owner);
  meta.appendChild(ownerLink);

  meta.appendChild(document.createTextNode(" \u00B7 "));

  var uriLink = document.createElement("a");
  uriLink.href = agent.agentURI;
  uriLink.target = "_blank";
  uriLink.textContent = "agent.json";
  meta.appendChild(uriLink);

  header.appendChild(meta);
  detail.appendChild(header);

  // Scores
  var scores = document.createElement("div");
  scores.className = "detail-scores";

  var trustCard = document.createElement("div");
  trustCard.className = "score-card";
  var trustLabel = document.createElement("div");
  trustLabel.className = "score-label";
  trustLabel.textContent = "Trust Score";
  var trustValue = document.createElement("div");
  trustValue.className = "score-value " + scoreClass(agent.trustScore);
  trustValue.textContent = scoreText(agent.trustScore);
  trustCard.appendChild(trustLabel);
  trustCard.appendChild(trustValue);
  scores.appendChild(trustCard);

  var reviewCard = document.createElement("div");
  reviewCard.className = "score-card";
  var reviewLabel = document.createElement("div");
  reviewLabel.className = "score-label";
  reviewLabel.textContent = "Reviews";
  var reviewValue = document.createElement("div");
  reviewValue.className = "score-value";
  reviewValue.style.color = "#fff";
  reviewValue.textContent = String(agent.feedbackCount);
  reviewCard.appendChild(reviewLabel);
  reviewCard.appendChild(reviewValue);
  scores.appendChild(reviewCard);

  detail.appendChild(scores);

  // Feedback section
  var fbTitle = document.createElement("h3");
  fbTitle.style.cssText = "color:#fff;margin-bottom:0.75rem;font-size:0.95rem";
  fbTitle.textContent = "Feedback";
  detail.appendChild(fbTitle);

  var fbList = document.createElement("div");
  fbList.className = "feedback-list";

  var hasFeedback = false;
  try {
    var clients = await reputation.getClients(agentId);
    for (var client of clients) {
      var lastIdx = Number(await reputation.getLastIndex(agentId, client));
      for (var i = 0; i < lastIdx; i++) {
        var fb = await reputation.readFeedback(agentId, client, i);
        if (fb[4]) continue; // isRevoked
        fbList.appendChild(createFeedbackItem(fb[0], fb[2], fb[3], client));
        hasFeedback = true;
      }
    }
  } catch (e) { /* no feedback */ }

  if (!hasFeedback) {
    var empty = document.createElement("div");
    empty.className = "feedback-item";
    empty.style.color = "#555";
    empty.textContent = "No feedback yet";
    fbList.appendChild(empty);
  }

  detail.appendChild(fbList);
}

// --- Trust graph ---
function renderGraph() {
  var svg = d3.select("#trust-graph");
  svg.selectAll("*").remove();

  var width = svg.node().getBoundingClientRect().width;
  var height = 500;
  svg.attr("viewBox", [0, 0, width, height]);

  var nodes = agents.map(function(a) {
    return { id: a.owner.toLowerCase(), agentId: a.agentId, name: a.name, score: a.trustScore };
  });

  var nodeSet = new Set(nodes.map(function(n) { return n.id; }));
  var links = [];
  var edgeCounts = {};

  for (var edge of feedbackEdges) {
    var target = agents.find(function(a) { return a.agentId === edge.agentId; });
    if (!target) continue;
    var source = edge.client.toLowerCase();
    var targetId = target.owner.toLowerCase();

    if (!nodeSet.has(source)) {
      nodes.push({ id: source, agentId: null, name: shortAddr(edge.client), score: null });
      nodeSet.add(source);
    }

    var key = source + "->" + targetId;
    edgeCounts[key] = (edgeCounts[key] || 0) + 1;

    if (edgeCounts[key] === 1) {
      links.push({ source: source, target: targetId, count: 1, avgValue: edge.value });
    } else {
      var existingLink = links.find(function(l) { return l.source === source && l.target === targetId; });
      if (existingLink) {
        existingLink.count = edgeCounts[key];
        existingLink.avgValue = Math.round((existingLink.avgValue * (existingLink.count - 1) + edge.value) / existingLink.count);
      }
    }
  }

  if (nodes.length === 0) {
    svg.append("text").attr("x", width/2).attr("y", height/2)
      .attr("text-anchor", "middle").attr("fill", "#555")
      .text("No agents registered yet");
    return;
  }

  var simulation = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(function(d) { return d.id; }).distance(120))
    .force("charge", d3.forceManyBody().strength(-300))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(40));

  var link = svg.append("g")
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", "#2a2a4e")
    .attr("stroke-width", function(d) { return Math.min(d.count * 2, 8); })
    .attr("stroke-opacity", 0.6);

  var node = svg.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", function(d) { return d.agentId ? 16 : 10; })
    .attr("fill", function(d) {
      if (d.score === null) return "#333";
      if (d.score >= 70) return "#166534";
      if (d.score >= 40) return "#854d0e";
      return "#991b1b";
    })
    .attr("stroke", function(d) {
      if (d.score === null) return "#555";
      if (d.score >= 70) return "#4ade80";
      if (d.score >= 40) return "#facc15";
      return "#f87171";
    })
    .attr("stroke-width", 2)
    .call(d3.drag()
      .on("start", function(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", function(event, d) { d.fx = event.x; d.fy = event.y; })
      .on("end", function(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    );

  var label = svg.append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("class", "node-label")
    .attr("dy", function(d) { return (d.agentId ? 16 : 10) + 14; })
    .text(function(d) { return d.name; });

  var scoreLabel = svg.append("g")
    .selectAll("text")
    .data(nodes.filter(function(d) { return d.score !== null; }))
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", 4)
    .attr("fill", "#fff")
    .attr("font-size", "10px")
    .attr("font-weight", "700")
    .attr("pointer-events", "none")
    .text(function(d) { return d.score; });

  simulation.on("tick", function() {
    link
      .attr("x1", function(d) { return d.source.x; }).attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; }).attr("y2", function(d) { return d.target.y; });
    node.attr("cx", function(d) { return d.x; }).attr("cy", function(d) { return d.y; });
    label.attr("x", function(d) { return d.x; }).attr("y", function(d) { return d.y; });
    scoreLabel.attr("x", function(d) { return d.x; }).attr("y", function(d) { return d.y; });
  });
}

// --- Init ---
loadAgents();
