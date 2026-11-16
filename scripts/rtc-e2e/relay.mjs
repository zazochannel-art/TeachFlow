// Signalling relay for the automated call tests: a WebSocket "broadcast" per topic (like the
// private Supabase Realtime channel, without auth). Never used in production.
import { WebSocketServer } from "ws";

const port = Number(process.env.RELAY_PORT ?? 8787);
const rooms = new Map();
const wss = new WebSocketServer({ port });
wss.on("connection", (ws, req) => {
  const topic = new URL(req.url ?? "/", "http://x").searchParams.get("topic") ?? "";
  if (!rooms.has(topic)) rooms.set(topic, new Set());
  const room = rooms.get(topic);
  room.add(ws);
  ws.on("message", data => { for (const other of room) if (other !== ws && other.readyState === 1) other.send(String(data)); });
  ws.on("close", () => room.delete(ws));
});
console.log(`relay on ws://localhost:${port}`);
