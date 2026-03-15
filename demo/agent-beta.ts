import http from "http";

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/test") {
    const delay = 500 + Math.random() * 1500;
    const willFail = Math.random() > 0.7;

    setTimeout(() => {
      if (willFail) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "error", message: "Internal failure" }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: "ok",
          data: "Partial response from Beta",
          latency: Math.round(delay),
          confidence: 0.4 + Math.random() * 0.3,
        }));
      }
    }, delay);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3002, () => {
  console.log("Agent Beta running on http://localhost:3002");
});
