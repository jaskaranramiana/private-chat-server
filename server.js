// Chhota signaling server.
// Ye sirf do phone ko milata hai aur encrypted signaling data forward karta hai.
// Chat message kabhi yahan se nahi guzarte, aur server kuch save ya log nahi karta.

const http = require('http');
const { WebSocketServer } = require('ws');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });
const rooms = new Map(); // roomId -> Set<WebSocket> (max 2)

wss.on('connection', (ws) => {
  let roomId = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Room join
    if (msg.type === 'join' && !roomId) {
      const id = msg.room;
      if (typeof id !== 'string' || id.length < 16 || id.length > 64) return;

      const peers = rooms.get(id) || new Set();
      if (peers.size >= 2) {
        ws.send(JSON.stringify({ type: 'full' }));
        ws.close();
        return;
      }
      peers.forEach((p) => {
        if (p.readyState === 1) p.send(JSON.stringify({ type: 'peer-joined' }));
      });
      peers.add(ws);
      rooms.set(id, peers);
      roomId = id;
      return;
    }

    // Encrypted data dusre phone ko forward karo
    if (msg.type === 'relay' && roomId && typeof msg.data === 'string' && msg.data.length < 20000) {
      const peers = rooms.get(roomId);
      if (!peers) return;
      peers.forEach((p) => {
        if (p !== ws && p.readyState === 1) {
          p.send(JSON.stringify({ type: 'relay', data: msg.data }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (!roomId) return;
    const peers = rooms.get(roomId);
    if (!peers) return;
    peers.delete(ws);
    if (peers.size === 0) rooms.delete(roomId);
  });

  ws.on('error', () => {});
});

const port = process.env.PORT || 8080;
server.listen(port, () => console.log('Signaling server chal raha hai, port ' + port));
