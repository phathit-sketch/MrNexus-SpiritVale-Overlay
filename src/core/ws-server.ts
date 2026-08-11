/** WebSocket broadcast server (localhost) — หน้าต่าง overlay ต่อมารับ feed */
export function startWsServer(port: number): { broadcast: (e: unknown) => void } {
  const clients = new Set<any>();
  Bun.serve({
    port,
    fetch(req, server) {
      if (new URL(req.url).pathname === "/ws") {
        if (server.upgrade(req)) return;
        return new Response("upgrade failed", { status: 400 });
      }
      return new Response("SpiritVale Drops overlay WS", { status: 200 });
    },
    websocket: { open(ws) { clients.add(ws); }, close(ws) { clients.delete(ws); }, message() {} },
  });
  function broadcast(evt: unknown) {
    const s = JSON.stringify(evt);
    for (const ws of clients) { try { ws.send(s); } catch {} }
  }
  return { broadcast };
}
