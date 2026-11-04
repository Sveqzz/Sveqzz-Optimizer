'use strict';
// Discord Rich Presence por IPC (sin dependencias). Muestra «Jugando a Sveqzz Optimizer» bajo tu perfil.
// El nombre y el logo salen de tu aplicación en https://discord.com/developers/applications (el Client ID va en Ajustes).
const net = require('net');
const crypto = require('crypto');

const frame = (op, payload) => { const d = Buffer.from(JSON.stringify(payload)); const h = Buffer.alloc(8); h.writeInt32LE(op, 0); h.writeInt32LE(d.length, 4); return Buffer.concat([h, d]); };

class DiscordRPC {
  constructor() { this.sock = null; this.ready = false; this.clientId = ''; this.activity = null; this.timer = null; this.start = Math.floor(Date.now() / 1000); this.status = 'apagado'; this.user = ''; }
  configure(clientId, enabled) {
    clientId = String(clientId || '').trim();
    if (!enabled || !/^\d{15,22}$/.test(clientId)) { this.stop(); this.status = enabled ? (clientId ? 'Client ID no válido' : 'sin Client ID') : 'apagado'; return; }
    if (clientId !== this.clientId) this.stop();
    this.clientId = clientId; this.status = 'conectando…';
    if (!this.timer) { this.timer = setInterval(() => { if (!this.sock) this.connect(); }, 15000); this.connect(); }
  }
  connect(i = 0) {
    if (this.sock || !this.clientId || i > 9) return;
    const p = process.platform === 'win32' ? `\\\\?\\pipe\\discord-ipc-${i}` : `${process.env.XDG_RUNTIME_DIR || '/tmp'}/discord-ipc-${i}`;
    const s = net.createConnection(p);
    let buf = Buffer.alloc(0), opened = false;
    s.on('connect', () => { opened = true; this.sock = s; s.write(frame(0, { v: 1, client_id: this.clientId })); });
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8) {
        const len = buf.readInt32LE(4); if (buf.length < 8 + len) break;
        let msg = null; try { msg = JSON.parse(buf.slice(8, 8 + len).toString('utf8')); } catch { /* */ }
        const op = buf.readInt32LE(0); buf = buf.slice(8 + len);
        if (op === 3) s.write(frame(4, msg || {})); // ping -> pong
        if (msg && msg.evt === 'READY') { this.ready = true; this.user = msg.data && msg.data.user ? msg.data.user.username : ''; this.status = 'conectado' + (this.user ? ` como ${this.user}` : ''); this.push(); }
        if (msg && msg.evt === 'ERROR') this.status = 'error: ' + ((msg.data && msg.data.message) || 'desconocido');
      }
    });
    const drop = () => { if (this.sock === s) { this.sock = null; this.ready = false; if (!/error/.test(this.status)) this.status = 'Discord no está abierto'; } };
    s.on('close', drop);
    s.on('error', () => { if (!opened) { s.destroy(); this.connect(i + 1); } else drop(); });
  }
  set(activity) { this.activity = activity; this.push(); }
  push() {
    if (!this.sock || !this.ready || !this.activity) return;
    const a = { ...this.activity, timestamps: { start: this.start } };
    this.sock.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: a }, nonce: crypto.randomUUID() }));
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.sock) { try { this.sock.write(frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid }, nonce: crypto.randomUUID() })); this.sock.end(); } catch { /* */ } }
    this.sock = null; this.ready = false; this.clientId = '';
  }
}
module.exports = { DiscordRPC };
