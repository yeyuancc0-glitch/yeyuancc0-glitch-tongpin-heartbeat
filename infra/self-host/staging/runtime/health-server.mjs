import http from "node:http";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const startedAt = Date.now();

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    sendJson(res, 200, {
      status: "ok",
      service: "tongpin-self-host-api",
      environment: process.env.API_ENV || "staging",
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
    });
    return;
  }

  sendJson(res, 404, {
    status: "not_found",
    service: "tongpin-self-host-api",
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`tongpin health API listening on ${port}`);
});
