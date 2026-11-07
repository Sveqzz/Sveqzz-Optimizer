'use strict';
const os = require('os');
const fs = require('fs');
const { run } = require('./backend');

// ───── CPU / RAM / GPU / ping en vivo (barato: sin procesos externos salvo nvidia-smi cada 3 s) ─────
let lastCpu = os.cpus().map((c) => ({ ...c.times }));
function cpuUsage() {
  const now = os.cpus().map((c) => ({ ...c.times }));
  let idle = 0, total = 0;
  now.forEach((t, i) => {
    const p = lastCpu[i] || t, d = (k) => t[k] - p[k];
    idle += d('idle'); total += d('user') + d('nice') + d('sys') + d('idle') + d('irq');
  });
  lastCpu = now;
  return total > 0 ? Math.round(100 * (1 - idle / total)) : 0;
}

let nvidia, gpuCache = null, gpuAt = 0, gpuBusy = false;
let smiProc = null;
function startSmi() {
  if (smiProc || nvidia === false) return;
  const { spawn } = require('child_process');
  try {
    const c = spawn('nvidia-smi', ['--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total,power.draw', '--format=csv,noheader,nounits', '-l', '3'], { windowsHide: true });
    smiProc = c; let buf = '';
    c.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); const [u, t, mu, mt, pw] = line.split(/\s*,\s*/).map(Number); if (!Number.isNaN(u)) { nvidia = true; gpuCache = { usage: u, temp: t, vramUsed: mu, vramTotal: mt, power: pw }; } } });
    c.on('error', () => { nvidia = false; gpuCache = null; smiProc = null; });
    c.on('close', () => { smiProc = null; if (nvidia === undefined) nvidia = false; });
    if (c.unref) c.unref();
  } catch { nvidia = false; }
}
// Un solo proceso nvidia-smi que emite cada 3 s (antes se lanzaba uno nuevo cada vez: lento con antivirus)
async function gpuInfo() { startSmi(); return nvidia === false ? null : gpuCache; }
process.on('exit', () => { try { if (smiProc) smiProc.kill(); } catch { /* */ } });

let lastPing = { ms: null, jitter: null, at: 0 }, pinging = false, prevPing = null;
function refreshPing() {
  if (pinging || Date.now() - lastPing.at < 5000) return;
  pinging = true;
  require('./network').tcpPing('1.1.1.1').then((ms) => {
    lastPing = { ms, jitter: ms != null && prevPing != null ? Math.abs(ms - prevPing) : lastPing.jitter, at: Date.now() };
    prevPing = ms;
  }).finally(() => { pinging = false; });
}

async function stats() {
  refreshPing();
  const total = os.totalmem(), free = os.freemem();
  return { cpu: cpuUsage(), ram: Math.round(100 * (1 - free / total)), ramUsedGB: (total - free) / 2 ** 30, ramTotalGB: total / 2 ** 30, gpu: await gpuInfo(), ping: lastPing };
}

// ───── hardware ─────
const LAPTOP_CHASSIS = [8, 9, 10, 11, 14, 30, 31, 32];
function factsFrom(hw) {
  if (!hw) return null;
  const names = (hw.gpus || []).map((g) => g.Name || '').join(' | ');
  const chassis = [].concat(hw.chassis || []).map(Number);
  const laptop = chassis.length ? chassis.some((c) => LAPTOP_CHASSIS.includes(c)) : !!hw.battery;
  return { nvidia: /nvidia|geforce|quadro/i.test(names), amd: /\bamd\b|radeon/i.test(names), intel: /intel/i.test(names), laptop, win11: (hw.build || 0) >= 22000, gpuNames: names };
}
const RAM_TYPE = { 20: 'DDR', 21: 'DDR2', 24: 'DDR3', 26: 'DDR4', 34: 'DDR5', 35: 'LPDDR5' };
const GB = 2 ** 30;

function describe(hw, facts, startupCount) {
  const ramBytes = (hw.ram || []).reduce((a, m) => a + (m.Capacity || 0), 0) || os.totalmem();
  const mod = (hw.ram || [])[0] || {};
  const sysVol = (hw.vols || []).find((v) => String(v.DriveLetter).toUpperCase() === (process.env.SystemDrive || 'C:')[0].toUpperCase()) || (hw.vols || [])[0];
  const refresh = Math.max(0, ...(hw.gpus || []).map((g) => g.CurrentRefreshRate || 0));
  const out = {
    summary: {
      model: hw.model, cpu: hw.cpu, ramGB: Math.round(ramBytes / GB), ramType: RAM_TYPE[mod.SMBIOSMemoryType] || '', ramMHz: mod.ConfiguredClockSpeed || mod.Speed || 0, ramRatedMHz: mod.Speed || 0, ramModules: (hw.ram || []).length,
      gpus: (hw.gpus || []).map((g) => ({ name: g.Name, driver: g.DriverVersion, vramGB: g.AdapterRAM ? Math.round(g.AdapterRAM / GB * 10) / 10 : null, res: g.CurrentHorizontalResolution ? `${g.CurrentHorizontalResolution}×${g.CurrentVerticalResolution}` : '', hz: g.CurrentRefreshRate })),
      disks: (hw.disks || []).map((d) => ({ name: d.FriendlyName, type: d.MediaType, bus: d.BusType, sizeGB: Math.round(d.Size / GB), health: d.HealthStatus })),
      vols: (hw.vols || []).map((v) => ({ letter: v.DriveLetter, sizeGB: Math.round(v.Size / GB), freeGB: Math.round(v.SizeRemaining / GB) })),
      board: hw.board, bios: hw.bios, os: hw.os, build: hw.build, arch: hw.arch, plan: hw.plan, cpuTempC: hw.cpuTempC, laptop: facts.laptop, refreshHz: refresh,
      uptimeH: hw.boot ? Math.round((Date.now() - new Date(hw.boot).getTime()) / 36e5) : null, startupCount,
    }, tips: [],
  };
  const tip = (level, title, text, go) => out.tips.push({ level, title, text, go });
  if (facts.laptop) tip('info', 'Eres un portátil', 'Para jugar sin sobrecalentar usa el modo «Laptop Gaming». Evita Competitivo/Ultimate: fuerzan la CPU y la GPU al máximo.', 'modos');
  if (facts.laptop && facts.nvidia && facts.intel) tip('info', 'Tienes dos GPU', 'Windows puede ejecutar el juego en la gráfica integrada. En Centro de juegos, tus juegos se fijan a la GPU dedicada.', 'juegos');
  if ((hw.ram || []).length === 1 && !facts.laptop) tip('warn', 'RAM en un solo módulo', 'Con un solo módulo trabajas en canal simple. Dos módulos iguales (dual channel) dan más FPS, sobre todo con gráfica integrada y en CPUs Ryzen.');
  if (mod.Speed && mod.ConfiguredClockSpeed && mod.ConfiguredClockSpeed < mod.Speed - 100) tip('warn', 'Tu RAM no va a su velocidad', `Va a ${mod.ConfiguredClockSpeed} MHz y es de ${mod.Speed} MHz. Activa XMP/EXPO/DOCP en la BIOS.`);
  if (ramBytes / GB < 15) tip('warn', 'Poca memoria RAM', `Tienes ${Math.round(ramBytes / GB)} GB. Para juegos actuales 16 GB es el mínimo cómodo; cierra apps de fondo (Chrome, launchers).`);
  const sys = (hw.disks || []).find((d) => /hdd|unspecified/i.test(d.MediaType || ''));
  if (sys && (hw.disks || []).length === 1) tip('warn', 'Tu único disco es un HDD', 'Instalar Windows y tus juegos en un SSD es la mejora más grande que puedes hacer.');
  if (sysVol && sysVol.Size && sysVol.SizeRemaining / sysVol.Size < 0.12) tip('warn', 'Poco espacio libre en el disco del sistema', `Quedan ${Math.round(sysVol.SizeRemaining / GB)} GB. Por debajo del 10-15% Windows y los SSD rinden peor. Usa Limpieza.`, 'limpieza');
  if (startupCount > 12) tip('warn', `${startupCount} programas arrancan con Windows`, 'Cada uno alarga el arranque y gasta RAM. Desactiva los que no necesites.', 'arranque');
  if (out.summary.uptimeH > 24 * 7) tip('info', 'Llevas más de una semana sin reiniciar', 'Reiniciar libera memoria y aplica actualizaciones pendientes.');
  if (!facts.laptop && /equilibr|balanced|ahorro|saver/i.test(hw.plan || '')) tip('info', `Plan de energía: ${hw.plan}`, 'En un PC de sobremesa el plan «Máximo rendimiento» evita microtirones. Está en Optimización → CPU y energía.', 'optimizacion');
  if (hw.cpuTempC && hw.cpuTempC >= 85) tip('warn', `Temperatura alta (${hw.cpuTempC} °C)`, 'Limpia ventiladores, cambia la pasta térmica o usa el modo Laptop Gaming para limitar el calor.');
  if (refresh && refresh <= 60) tip('info', 'Tu monitor va a 60 Hz', 'Si tu monitor admite más, actívalo en Configuración → Pantalla → Frecuencia de actualización.');
  if ((hw.build || 0) && hw.build < 22000) tip('info', 'Windows 10', 'Windows 10 terminó su soporte general en octubre de 2025. Considera Windows 11 para seguir recibiendo parches.');
  if (!out.tips.length) tip('ok', 'Todo en orden', 'No encontré problemas evidentes en tu equipo.');
  return out;
}

async function sysinfo(be, hw, facts) {
  const cpus = os.cpus();
  let freeGB = null;
  try { const s = await fs.promises.statfs(process.platform === 'win32' ? (process.env.SystemDrive || 'C:') + '\\' : '/'); freeGB = (s.bavail * s.bsize) / GB; } catch { /* */ }
  const gpuMain = hw ? ((hw.gpus || []).find((g) => /nvidia|amd|radeon|geforce/i.test(g.Name)) || (hw.gpus || [])[0] || {}).Name : '';
  return {
    cpu: ((hw && hw.cpu && hw.cpu.name) || (cpus[0] ? cpus[0].model : 'CPU')).replace(/\s+/g, ' ').trim(), cores: hw && hw.cpu ? hw.cpu.cores : cpus.length, threads: hw && hw.cpu ? hw.cpu.threads : cpus.length,
    ramGB: Math.round(os.totalmem() / GB), gpu: gpuMain || '', os: hw ? hw.os : `${os.type()} ${os.release()}`, build: hw ? hw.build : 0, freeGB,
    facts, admin: await be.isAdmin(), mock: !!be.mock, model: hw ? hw.model : '',
  };
}

// Procesos que más consumen (CPU medida en 0,8 s + RAM)
async function topProcesses(be) {
  if (be.mock) return { cpu: [{ name: 'chrome', pid: 4120, cpu: 12.4, ramMB: 1480 }, { name: 'Discord', pid: 5301, cpu: 4.1, ramMB: 520 }], ram: [{ name: 'chrome', pid: 4120, cpu: 12.4, ramMB: 1480 }, { name: 'Discord', pid: 5301, cpu: 4.1, ramMB: 520 }] };
  const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
$a = @{}; Get-Process | ForEach-Object { $a[$_.Id] = $_.CPU }
Start-Sleep -Milliseconds 800
$n = [int]$env:NUMBER_OF_PROCESSORS
$l = Get-Process | Where-Object { $_.Id -gt 4 } | ForEach-Object { $c = 0; if ($a.ContainsKey($_.Id) -and $_.CPU -ne $null) { $c = [math]::Round((($_.CPU - $a[$_.Id]) / 0.8) / $n * 100, 1) }; [pscustomobject]@{ name = $_.ProcessName; pid = $_.Id; cpu = $c; ramMB = [math]::Round($_.WorkingSet64 / 1MB) } }
$o = [ordered]@{ cpu = @($l | Sort-Object cpu -Descending | Select-Object -First 8); ram = @($l | Sort-Object ramMB -Descending | Select-Object -First 8) }
'@@SVQ@@' + (ConvertTo-Json -InputObject $o -Compress -Depth 4)`;
  const r = await be.ps(ps, 30000); const m = r.stdout.match(/@@SVQ@@(.*)$/m);
  return m ? JSON.parse(m[1]) : { cpu: [], ram: [] };
}

module.exports = { stats, sysinfo, factsFrom, describe, topProcesses };
