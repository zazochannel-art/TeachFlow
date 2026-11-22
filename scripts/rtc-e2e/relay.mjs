// Signalling relay for the automated call tests: a WebSocket "broadcast" per topic (like the
// private Supabase Realtime channel, without auth), plus the registry of call signing keys that
// the database keeps in production (public.register_call_peer / call_peer, migration 0024).
// Never used in production.
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.RELAY_PORT ?? 8787);
const rooms = new Map();
/** topic → (connection key → { jwk, role, name }) */
const peers = new Map();

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (res, status, body) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
  if (url.pathname !== "/peer") { json(res, 404, { error: "not found" }); return; }
  if (req.method === "GET") {
    const row = peers.get(url.searchParams.get("topic") ?? "")?.get(url.searchParams.get("key") ?? "");
    if (!row) json(res, 404, { error: "unknown key" });
    else json(res, 200, row);
    return;
  }
  let body = "";
  req.on("data", c => { body += c; if (body.length > 10_000) req.destroy(); });
  req.on("end", () => {
    try {
      const { topic, key, jwk, role, name } = JSON.parse(body);
      if (typeof topic !== "string" || typeof key !== "string" || !jwk || typeof jwk.x !== "string") throw new Error("bad");
      if (!peers.has(topic)) peers.set(topic, new Map());
      // Like the database: a key that is already registered keeps its first public key.
      if (!peers.get(topic).has(key)) peers.get(topic).set(key, { jwk, role: role === "teacher" ? "teacher" : "student", name: String(name ?? "") });
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { error: "bad request" });
    }
  });
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws, req) => {
  const topic = new URL(req.url ?? "/", "http://x").searchParams.get("topic") ?? "";
  if (!rooms.has(topic)) rooms.set(topic, new Set());
  const room = rooms.get(topic);
  room.add(ws);
  ws.on("message", data => { for (const other of room) if (other !== ws && other.readyState === 1) other.send(String(data)); });
  ws.on("close", () => room.delete(ws));
});
server.listen(port, () => console.log(`relay on ws://localhost:${port}`));
