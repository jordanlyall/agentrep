import http from "http";

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/test") {
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        data: "Agent Alpha responding with high-quality data",
        latency: 50,
        confidence: 0.95,
      }));
    }, 50);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3001, () => {
  console.log("Agent Alpha running on http://localhost:3001");
});
