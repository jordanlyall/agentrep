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
