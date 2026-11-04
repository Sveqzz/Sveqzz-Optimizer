'use strict';
// Medidor de FPS real con PresentMon (Intel, MIT). Se descarga una vez desde el GitHub oficial del proyecto.
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function httpGet(url, headers = {}, left = 6) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Sveqzz-Optimizer', ...headers } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && left > 0) { res.resume(); return resolve(httpGet(new URL(res.headers.location, url).toString(), headers, left - 1)); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      resolve(res);
    }).on('error', reject);
  });
}
async function readAll(res) { const c = []; for await (const d of res) c.push(d); return Buffer.concat(c); }

class FpsMeter {
  constructor(dir) { this.dir = path.join(dir, 'tools'); this.exe = path.join(this.dir, 'PresentMon.exe'); this.proc = null; this.frames = []; this.target = ''; this.error = ''; this.downloading = false; }
  available() { return fs.existsSync(this.exe); }
  async ensure() {
    if (this.available()) return this.exe;
    if (process.platform !== 'win32') throw new Error('PresentMon solo existe en Windows');
    this.downloading = true;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const rel = JSON.parse((await readAll(await httpGet('https://api.github.com/repos/GameTechDev/PresentMon/releases/latest', { Accept: 'application/vnd.github+json' }))).toString());
      const asset = (rel.assets || []).find((a) => /^PresentMon-[\d.]+-x64\.exe$/i.test(a.name)) || (rel.assets || []).find((a) => /^PresentMon.*x64\.exe$/i.test(a.name) && !/service|capture/i.test(a.name));
      if (!asset) throw new Error('No encontré el ejecutable en la última versión de PresentMon');
      const buf = await readAll(await httpGet(asset.browser_download_url));
      if (buf.length < 100000 || buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error('La descarga de PresentMon no es válida');
      fs.writeFileSync(this.exe + '.tmp', buf); fs.renameSync(this.exe + '.tmp', this.exe);
      fs.writeFileSync(path.join(this.dir, 'version.txt'), asset.name);
      return this.exe;
    } finally { this.downloading = false; }
  }
  async start(exeName) {
    if (!/^[\w .()-]+\.exe$/i.test(exeName)) throw new Error('Nombre de proceso no válido');
    if ((this.proc || this.starting) && (this.target === exeName || this.starting === exeName)) return;
    this.stop(); this.starting = exeName;
    try { await this.ensure(); } catch (e) { this.starting = ''; throw e; }
    if (this.starting !== exeName) return; // llegó otra petición más nueva
    this.starting = ''; this.gen = (this.gen || 0) + 1; const gen = this.gen;
    this.target = exeName; this.frames = []; this.error = '';
    const attempts = [
      ['--process_name', exeName, '--output_stdout', '--no_console_stats', '--stop_existing_session', '--terminate_on_proc_exit', '--session_name', 'SveqzzFPS'],
      ['-process_name', exeName, '-output_stdout', '-stop_existing_session', '-terminate_on_proc_exit', '-session_name', 'SveqzzFPS'],
    ];
    const tryRun = (i) => {
      const p = spawn(this.exe, attempts[i], { windowsHide: true });
      this.proc = p; let buf = '', cols = null, gotData = false, start = Date.now();
      p.stdout.on('data', (d) => {
        if (this.proc !== p || this.gen !== gen) return; // datos de un proceso viejo: se ignoran
        buf += d.toString('utf8'); let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          if (!line) continue;
          const f = line.split(',');
          if (!cols) { if (/Application/i.test(f[0]) && f.some((x) => /MsBetweenPresents|FrameTime/.test(x))) { cols = { sc: f.indexOf('SwapChainAddress'), ft: f.findIndex((x) => x === 'MsBetweenPresents') >= 0 ? f.indexOf('MsBetweenPresents') : f.indexOf('FrameTime') }; } continue; }
          const ft = Number(f[cols.ft]); if (!(ft > 0 && ft < 5000)) continue;
          gotData = true; const now = Date.now();
          this.frames.push({ t: now, ft, sc: cols.sc >= 0 ? f[cols.sc] : '0' });
          if (this.frames.length > 6000) this.frames.splice(0, 2000);
        }
      });
      p.stderr.on('data', (d) => { this.error = d.toString().slice(0, 200); });
      p.on('exit', () => {
        if (this.proc === p) this.proc = null;
        if (!gotData && Date.now() - start < 4000 && i + 1 < attempts.length && this.target === exeName && this.gen === gen) tryRun(i + 1);
      });
    };
    tryRun(0);
  }
  stop() { this.starting = ''; this.gen = (this.gen || 0) + 1; if (this.proc) { try { this.proc.kill(); } catch { /* */ } this.proc = null; } this.frames = []; this.target = ''; }
  snapshot() {
    const now = Date.now(); this.frames = this.frames.filter((f) => now - f.t < 6000);
    const last = this.frames.filter((f) => now - f.t < 1000);
    if (!last.length) return { fps: null, low1: null, running: !!this.proc, downloading: this.downloading, target: this.target };
    const by = new Map(); for (const f of last) by.set(f.sc, (by.get(f.sc) || 0) + 1);
    const sc = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const fps = by.get(sc);
    const fts = this.frames.filter((f) => f.sc === sc).map((f) => f.ft).sort((a, b) => b - a);
    const worst = fts.slice(0, Math.max(1, Math.ceil(fts.length * 0.01)));
    const low1 = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);
    return { fps, low1: Math.min(low1, fps), running: true, downloading: false, target: this.target };
  }
}
module.exports = { FpsMeter };
