'use strict';
// Servidor de desarrollo: sirve la interfaz en el navegador con el motor en modo simulado (no toca tu PC).
//   node dev-server.js   ->   http://localhost:5177
const http = require('http');
const fs = require('fs');
const path = require('path');
const { create } = require('./src/engine');

const engine = create(path.join(__dirname, '.devdata'), { mock: true });
if (process.env.DEMO) engine.be._mockGames = [{ exe: 'RobloxPlayerBeta.exe', pid: 4242, name: 'Roblox' }];
const ROOT = path.join(__dirname, 'renderer');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = ''; for await (const c of req) body += c;
    const fn = engine.api[url.pathname.slice(5)];
    res.setHeader('Content-Type', 'application/json');
    if (!fn) return res.end(JSON.stringify({ __error: 'método desconocido' }));
    try { res.end(JSON.stringify((await fn(...(JSON.parse(body || '[]')))) ?? null)); } catch (e) { res.end(JSON.stringify({ __error: String(e.message || e) })); }
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.statusCode = 404; return res.end('no encontrado'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(5177, '127.0.0.1', () => console.log('VELOX (modo simulado) en http://localhost:5177'));
