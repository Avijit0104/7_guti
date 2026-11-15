// Multiplayer rooms over WebRTC (PeerJS). No game server: the host's browser runs the game,
// guests send their inputs to it and receive ~20 snapshots per second back.
// PeerJS's free public broker is only used to introduce the browsers to each other.

const PREFIX = 'satguti7-';
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function makeCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function newPeer(id) {
  if (!window.Peer) throw new Error('PeerJS did not load');
  return id ? new window.Peer(id, { config: ICE }) : new window.Peer({ config: ICE });
}

// handlers: { onOpen(code), onJoin(conn), onData(conn, msg), onLeave(conn), onError(text) }
export class HostNet {
  constructor(code, h) {
    this.code = code; this.conns = new Map(); this.h = h;
    const peer = this.peer = newPeer(PREFIX + code);
    peer.on('open', () => h.onOpen && h.onOpen(code));
    peer.on('connection', (conn) => {
      conn.on('open', () => { this.conns.set(conn.peer, conn); h.onJoin && h.onJoin(conn); });
      conn.on('data', (d) => h.onData && h.onData(conn, d));
      const bye = () => { if (this.conns.delete(conn.peer)) h.onLeave && h.onLeave(conn); };
      conn.on('close', bye); conn.on('error', bye);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { /* ignore */ } });
    peer.on('error', (e) => h.onError && h.onError(e.type === 'unavailable-id' ? 'That room code is already in use. Try again.' : 'Network error: ' + e.type));
  }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open) { try { c.send(msg); } catch (_) { /* dropped */ } } }
  sendTo(conn, msg) { if (conn.open) { try { conn.send(msg); } catch (_) { /* dropped */ } } }
  close() { try { this.peer.destroy(); } catch (_) { /* ignore */ } }
}

// handlers: { onOpen(), onData(msg), onClose(), onError(text) }
export class GuestNet {
  constructor(code, h) {
    this.h = h; this.conn = null; this.opened = false;
    const peer = this.peer = newPeer();
    const timer = setTimeout(() => { if (!this.opened) h.onError && h.onError('Could not reach that room. Check the code, or try a different network (some mobile networks block direct connections).'); }, 15000);
    peer.on('open', () => {
      const conn = this.conn = peer.connect(PREFIX + code, { serialization: 'json', reliable: false });
      conn.on('open', () => { this.opened = true; clearTimeout(timer); h.onOpen && h.onOpen(); });
      conn.on('data', (d) => h.onData && h.onData(d));
      conn.on('close', () => h.onClose && h.onClose());
    });
    peer.on('error', (e) => {
      clearTimeout(timer);
      h.onError && h.onError(e.type === 'peer-unavailable' ? 'No room with that code was found.' : 'Network error: ' + e.type);
    });
  }
  send(msg) { if (this.conn && this.conn.open) { try { this.conn.send(msg); } catch (_) { /* dropped */ } } }
  close() { try { this.peer.destroy(); } catch (_) { /* ignore */ } }
}
