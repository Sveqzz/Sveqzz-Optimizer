'use strict';
const net = require('net');
const dns = require('dns');

// Latencia por TCP (puerto 443): no depende del idioma de Windows ni de que ICMP esté permitido.
function tcpPing(host, port = 443, timeout = 2000) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host, port });
    let done = false;
    const end = (v) => { if (done) return; done = true; s.destroy(); resolve(v); };
    s.setTimeout(timeout, () => end(null));
    s.once('connect', () => end(Number(process.hrtime.bigint() - t0) / 1e6));
    s.once('error', () => end(null));
  });
}

function stats(samples) {
  const ok = samples.filter((x) => x != null).sort((a, b) => a - b);
  if (!ok.length) return { avg: null, jitter: null, loss: 100, min: null, max: null, p95: null, sent: samples.length };
  const avg = ok.reduce((a, b) => a + b, 0) / ok.length;
  const seq = samples.filter((x) => x != null); let jit = 0;
  for (let i = 1; i < seq.length; i++) jit += Math.abs(seq[i] - seq[i - 1]);
  jit = seq.length > 1 ? jit / (seq.length - 1) : 0;
  return { avg, jitter: jit, loss: 100 * (1 - ok.length / samples.length), min: ok[0], max: ok[ok.length - 1], p95: ok[Math.min(ok.length - 1, Math.floor(ok.length * 0.95))], sent: samples.length };
}

const HOSTS = { cloudflare: '1.1.1.1', google: '8.8.8.8', quad9: '9.9.9.9' };
async function measure(hostKey = 'cloudflare', count = 30) {
  const host = HOSTS[hostKey] || HOSTS.cloudflare;
  const samples = [];
  for (let i = 0; i < Math.min(count, 120); i++) { samples.push(await tcpPing(host)); await new Promise((r) => setTimeout(r, 120)); }
  return { host, samples, ...stats(samples) };
}

const REGIONS = [
  ['Este de EE.UU. (Virginia)', 'us-east-1'], ['Oeste de EE.UU. (Oregón)', 'us-west-2'], ['Brasil (São Paulo)', 'sa-east-1'],
  ['Europa (Irlanda)', 'eu-west-1'], ['Europa (Frankfurt)', 'eu-central-1'], ['Asia (Singapur)', 'ap-southeast-1'], ['Asia (Tokio)', 'ap-northeast-1'],
];
async function regions() {
  return Promise.all(REGIONS.map(async ([name, r]) => {
    const host = `dynamodb.${r}.amazonaws.com`; const s = [];
    for (let i = 0; i < 4; i++) s.push(await tcpPing(host));
    const st = stats(s.slice(1)); return { name, region: r, ms: st.avg, loss: st.loss };
  }));
}

const DNS_PRESETS = [
  { id: 'cloudflare', name: 'Cloudflare', servers: ['1.1.1.1', '1.0.0.1'] },
  { id: 'google', name: 'Google', servers: ['8.8.8.8', '8.8.4.4'] },
  { id: 'quad9', name: 'Quad9', servers: ['9.9.9.9', '149.112.112.112'] },
  { id: 'opendns', name: 'OpenDNS', servers: ['208.67.222.222', '208.67.220.220'] },
  { id: 'adguard', name: 'AdGuard', servers: ['94.140.14.14', '94.140.15.15'] },
];
const DOMAINS = ['google.com', 'youtube.com', 'roblox.com', 'twitch.tv', 'amazon.com', 'discord.com', 'steampowered.com', 'wikipedia.org'];

async function dnsBench() {
  const res = [];
  let current = [];
  try { current = dns.getServers(); } catch { /* */ }
  const targets = [{ id: 'current', name: 'Tu DNS actual', servers: current.slice(0, 1) }, ...DNS_PRESETS];
  for (const p of targets) {
    if (!p.servers.length) continue;
    const r = new dns.promises.Resolver({ timeout: 2000, tries: 1 }); r.setServers([p.servers[0]]);
    const times = [];
    for (const d of DOMAINS) {
      const t0 = process.hrtime.bigint();
      try { await r.resolve4(d); times.push(Number(process.hrtime.bigint() - t0) / 1e6); } catch { times.push(null); }
    }
    const ok = times.filter((x) => x != null).sort((a, b) => a - b);
    res.push({ id: p.id, name: p.name, servers: p.servers, ms: ok.length ? ok[Math.floor(ok.length / 2)] : null, fail: times.length - ok.length });
  }
  return res;
}

async function setDns(be, state, id) {
  const p = DNS_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error('DNS desconocido');
  if (!state.data.dnsPrev) {
    // Solo guardamos las interfaces con DNS estático (NameServer en el registro); las de DHCP vuelven a "automático".
    const raw = await be.psValue("Get-NetAdapter -Physical | ForEach-Object { $ns = (Get-ItemProperty ('HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\' + $_.InterfaceGuid) -ErrorAction SilentlyContinue).NameServer; if ($ns) { '{0}={1}' -f $_.ifIndex, (($ns -replace '\\s+', ',') -replace ',+', ',') } }");
    state.data.dnsPrev = raw.split(/\r?\n/).filter((l) => /^\d+=[\d.,]+$/.test(l.trim())).map((l) => l.trim());
  }
  const list = p.servers.map((s) => `'${s}'`).join(',');
  await be.ps(`Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ServerAddresses (${list}) }; ipconfig /flushdns | Out-Null`);
  state.log('red', `DNS cambiado a ${p.name}`);
  state.save();
}
async function resetDns(be, state) {
  await be.ps("Get-NetAdapter -Physical | Where-Object Status -eq 'Up' | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.ifIndex -ResetServerAddresses }; ipconfig /flushdns | Out-Null");
  for (const l of state.data.dnsPrev || []) {
    const [idx, addrs] = l.split('=');
    if (/^\d+$/.test(idx) && /^[\d.,]+$/.test(addrs)) await be.ps(`Set-DnsClientServerAddress -InterfaceIndex ${idx} -ServerAddresses (${addrs.split(',').map((a) => `'${a}'`).join(',')}) -ErrorAction SilentlyContinue`);
  }
  state.data.dnsPrev = null;
  state.log('red', 'DNS restaurado');
  state.save();
}

module.exports = { tcpPing, measure, regions, dnsBench, setDns, resetDns, DNS_PRESETS };
