// --- Hero network animation (canvas) ---
(function() {
  var canvas = document.getElementById("hero-network");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var nodes = [];
  var edges = [];
  var nodeCount = 40;
  var mouse = { x: -1000, y: -1000 };

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener("resize", resize);

  document.addEventListener("mousemove", function(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });

  // Create nodes
  for (var i = 0; i < nodeCount; i++) {
    nodes.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 2 + Math.random() * 3,
      score: Math.random() > 0.3 ? Math.round(40 + Math.random() * 60) : null,
    });
  }

  // Create edges between close nodes
  function updateEdges() {
    edges = [];
    for (var i = 0; i < nodes.length; i++) {
      for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].x - nodes[j].x;
        var dy = nodes[i].y - nodes[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          edges.push({ a: i, b: j, dist: dist });
        }
      }
    }
  }

  function scoreColor(score) {
    if (score === null) return "rgba(100, 100, 130, 0.6)";
    if (score >= 70) return "rgba(0, 255, 136, 0.7)";
    if (score >= 40) return "rgba(255, 204, 51, 0.7)";
    return "rgba(255, 68, 102, 0.7)";
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Move nodes
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;

      // Mouse repulsion
      var mdx = n.x - mouse.x;
      var mdy = n.y - mouse.y;
      var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
      if (mdist < 150) {
        n.vx += (mdx / mdist) * 0.15;
        n.vy += (mdy / mdist) * 0.15;
      }

      // Damping
      n.vx *= 0.99;
      n.vy *= 0.99;

      // Bounds
      if (n.x < 0 || n.x > canvas.width) n.vx *= -1;
      if (n.y < 0 || n.y > canvas.height) n.vy *= -1;
    }

    updateEdges();

    // Draw edges
    for (var e = 0; e < edges.length; e++) {
      var edge = edges[e];
      var alpha = 1 - (edge.dist / 200);
      ctx.beginPath();
      ctx.moveTo(nodes[edge.a].x, nodes[edge.a].y);
      ctx.lineTo(nodes[edge.b].x, nodes[edge.b].y);
      ctx.strokeStyle = "rgba(0, 255, 136, " + (alpha * 0.12) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw nodes
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = scoreColor(n.score);
      ctx.fill();

      // Glow for scored nodes
      if (n.score !== null && n.score >= 70) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 255, 136, 0.08)";
        ctx.fill();
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
})();

// --- Try It: live trust score lookup ---
(function() {
  var RPC = "https://sepolia.base.org";
  var IDENTITY = "0xea16A6AE8591Dd93E09ed8Fb252bd5Da117D451c";
  var REPUTATION = "0x91A8e9D96fe39d4ae11F2E64769B795820a047f4";
  var DEPLOY_BLOCK = 38924000;
  var EXPLORER = "https://sepolia.basescan.org";

  var ID_ABI = [
    "function tokenURI(uint256 agentId) view returns (string)",
    "function ownerOf(uint256 agentId) view returns (address)",
    "function totalAgents() view returns (uint256)",
    "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  ];
  var REP_ABI = [
    "function getClients(uint256 agentId) view returns (address[])",
    "function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryDecimals)",
  ];

  var provider = new ethers.JsonRpcProvider(RPC);
  var identity = new ethers.Contract(IDENTITY, ID_ABI, provider);
  var reputation = new ethers.Contract(REPUTATION, REP_ABI, provider);

  var btn = document.getElementById("try-btn");
  var input = document.getElementById("try-input");
  var result = document.getElementById("try-result");

  if (!btn || !input || !result) return;

  function shortAddr(a) { return a.slice(0, 6) + "..." + a.slice(-4); }

  function scoreClass(s) {
    if (s === null) return "none";
    if (s >= 70) return "high";
    if (s >= 40) return "mid";
    return "low";
  }

  btn.addEventListener("click", doQuery);
  input.addEventListener("keydown", function(e) { if (e.key === "Enter") doQuery(); });

  async function doQuery() {
    var val = input.value.trim();
    if (!val) return;

    result.replaceChildren();
    var loading = document.createElement("div");
    loading.className = "try-loading";
    loading.textContent = "Querying Base Sepolia...";
    result.appendChild(loading);

    try {
      var agentId;
      var owner;
      var agentURI;

      if (val.startsWith("0x")) {
        // Address lookup - find agentId from events
        var filter = identity.filters.Registered(null, null, val);
        var events = await identity.queryFilter(filter, DEPLOY_BLOCK);
        if (events.length === 0) throw new Error("No agent found for address " + shortAddr(val));
        agentId = Number(events[0].args[0]);
        owner = val;
      } else {
        agentId = parseInt(val);
        if (isNaN(agentId) || agentId < 1) throw new Error("Invalid agent ID");
        owner = await identity.ownerOf(agentId);
      }

      agentURI = await identity.tokenURI(agentId);

      // Get reputation
      var rawClients = await reputation.getClients(agentId);
      var clients = Array.from(rawClients);
      var feedbackCount = 0;
      var trustScore = null;

      if (clients.length > 0) {
        var summary = await reputation.getSummary(agentId, clients, "", "");
        feedbackCount = Number(summary[0]);
        if (feedbackCount > 0) {
          trustScore = Math.round(Number(summary[1]) / feedbackCount);
          trustScore = Math.max(0, Math.min(100, trustScore));
        }
      }

      // Try to fetch agent name from URI
      var agentName = "Agent #" + agentId;
      try {
        if (agentURI.startsWith("http")) {
          var resp = await fetch(agentURI);
          if (resp.ok) {
            var json = await resp.json();
            if (json.name) agentName = json.name;
          }
        }
      } catch (e) { /* use default */ }

      // Build result card
      result.replaceChildren();

      var card = document.createElement("div");
      card.className = "try-result-card";

      var orb = document.createElement("div");
      orb.className = "try-score-orb " + scoreClass(trustScore);
      orb.textContent = trustScore !== null ? String(trustScore) : "?";
      card.appendChild(orb);

      var meta = document.createElement("div");
      meta.className = "try-meta";

      var h3 = document.createElement("h3");
      h3.textContent = agentName;
      meta.appendChild(h3);

      var idRow = document.createElement("div");
      idRow.className = "try-meta-row";
      idRow.textContent = "ID: " + agentId + " \u00B7 Owner: ";
      var ownerLink = document.createElement("a");
      ownerLink.href = EXPLORER + "/address/" + owner;
      ownerLink.target = "_blank";
      ownerLink.textContent = shortAddr(owner);
      idRow.appendChild(ownerLink);
      meta.appendChild(idRow);

      var uriRow = document.createElement("div");
      uriRow.className = "try-meta-row";
      var uriLink = document.createElement("a");
      uriLink.href = agentURI;
      uriLink.target = "_blank";
      uriLink.textContent = agentURI.length > 60 ? agentURI.slice(0, 57) + "..." : agentURI;
      uriRow.appendChild(uriLink);
      meta.appendChild(uriRow);

      var breakdown = document.createElement("div");
      breakdown.className = "try-breakdown";

      var scoreItem = document.createElement("div");
      scoreItem.className = "try-breakdown-item";
      scoreItem.textContent = "Trust Score";
      var scoreVal = document.createElement("span");
      scoreVal.className = "try-breakdown-value";
      scoreVal.textContent = trustScore !== null ? String(trustScore) : "Unrated";
      scoreItem.appendChild(scoreVal);
      breakdown.appendChild(scoreItem);

      var reviewItem = document.createElement("div");
      reviewItem.className = "try-breakdown-item";
      reviewItem.textContent = "Reviews";
      var reviewVal = document.createElement("span");
      reviewVal.className = "try-breakdown-value";
      reviewVal.textContent = String(feedbackCount);
      reviewItem.appendChild(reviewVal);
      breakdown.appendChild(reviewItem);

      var clientItem = document.createElement("div");
      clientItem.className = "try-breakdown-item";
      clientItem.textContent = "Unique Reviewers";
      var clientVal = document.createElement("span");
      clientVal.className = "try-breakdown-value";
      clientVal.textContent = String(clients.length);
      clientItem.appendChild(clientVal);
      breakdown.appendChild(clientItem);

      meta.appendChild(breakdown);
      card.appendChild(meta);
      result.appendChild(card);

    } catch (err) {
      result.replaceChildren();
      var errDiv = document.createElement("div");
      errDiv.className = "try-error";
      errDiv.textContent = err.message || "Query failed";
      result.appendChild(errDiv);
    }
  }
})();

// --- Counter animation ---
(function() {
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        var target = parseInt(el.getAttribute("data-count"));
        animateCount(el, target);
        observer.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  document.querySelectorAll("[data-count]").forEach(function(el) {
    observer.observe(el);
  });

  function animateCount(el, target) {
    var current = 0;
    var duration = 1200;
    var start = performance.now();

    function step(now) {
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      current = Math.round(eased * target);
      el.textContent = current;
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
})();

// --- Scroll reveal ---
(function() {
  var sections = document.querySelectorAll("section:not(.hero)");
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  sections.forEach(function(s) {
    s.style.opacity = "0";
    s.style.transform = "translateY(30px)";
    s.style.transition = "opacity 0.6s ease, transform 0.6s ease";
    observer.observe(s);
  });

  // CSS class for revealed
  var style = document.createElement("style");
  style.textContent = ".revealed { opacity: 1 !important; transform: translateY(0) !important; }";
  document.head.appendChild(style);
})();
