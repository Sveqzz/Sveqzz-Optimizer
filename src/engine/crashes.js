'use strict';
// Diagnóstico de crashes: lee el visor de eventos y los reportes de Fortnite y dice QUÉ ajuste es sospechoso.
const fs = require('fs');
const path = require('path');
const tw = require('./tweaks');

const GPU = ['gpu-preemption-off', 'nv-preempt-off', 'amd-preempt-off', 'gpu-tdr-off', 'gpu-msi', 'hags-on', 'nv-max-perf', 'nv-no-dynamic-pstate', 'dwm-mpo-off', 'amd-ulps-off', 'amd-powerdown-off', 'amd-drmdma', 'fso-off'];
const MEM = ['memory-compression-off', 'disable-paging-executive', 'large-system-cache', 'svchost-split', 'ntfs-memory-usage', 'prefetch-off'];
const TIMER = ['bcd-platformtick', 'dynamic-tick-off', 'bcd-tscsync', 'bcd-platformclock-off', 'timer-resolution', 'idle-disable', 'core-parking-off', 'cpu-min-100', 'perf-boost-aggressive', 'perf-epp-performance'];
const IRQ = ['gpu-msi', 'nic-msi', 'nic-lso-off', 'tcp-rsc-off', 'nic-interrupt-mod-off', 'usb-suspend-off', 'csrss-high'];
const POWER = ['idle-disable', 'cpu-min-100', 'perf-boost-aggressive', 'perf-epp-performance', 'cpu-max-100', 'pcie-aspm-off', 'nv-no-dynamic-pstate'];
const BUGS = {
  0x116: ['El driver de la gráfica dejó de responder (VIDEO_TDR_FAILURE)', GPU], 0x117: ['La gráfica tardó demasiado (VIDEO_TDR_TIMEOUT)', GPU], 0x141: ['Fallo del motor de vídeo (VIDEO_ENGINE_TIMEOUT)', GPU], 0x119: ['Error del planificador de vídeo', GPU], 0x10e: ['Error de memoria de vídeo', GPU],
  0x124: ['Error de hardware (WHEA): CPU, RAM o fuente inestables, normalmente por temperatura o sobreaceleración', POWER], 0x133: ['Un driver tardó demasiado (DPC watchdog)', [...TIMER, ...IRQ]], 0x101: ['Un núcleo de la CPU no respondió (clock watchdog)', TIMER], 0x1a: ['Error de gestión de memoria', MEM], 0x50: ['Página de memoria inválida', MEM], 0x3b: ['Excepción en un servicio del sistema', [...MEM, ...GPU]],
  0xa: ['Acceso inválido a memoria por un driver (IRQL)', IRQ], 0xd1: ['Un driver accedió mal a la memoria', IRQ], 0x9f: ['Un driver bloqueó el ahorro de energía', POWER], 0xc4: ['Un driver hizo algo ilegal (Driver Verifier)', IRQ], 0x7e: ['Excepción de un driver', [...GPU, ...IRQ]], 0x1e: ['Excepción del kernel', [...MEM, ...IRQ]],
};
function parse(out) { const m = out.match(/@@SVQ@@(.*)$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } }

async function readEvents(be) {
  if (be.mock) return be._mockCrash || { ev: [{ t: new Date().toISOString(), id: 41, code: 0x116, prov: 'Kernel-Power' }, { t: new Date().toISOString(), id: 4101, prov: 'Display', msg: 'nvlddmkm' }], app: [{ t: new Date().toISOString(), app: 'FortniteClient-Win64-Shipping.exe', mod: 'nvwgf2umx.dll', exc: 'c0000005' }] };
  const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
$s = (Get-Date).AddDays(-14)
$ev = @(Get-WinEvent -FilterHashtable @{ LogName='System'; StartTime=$s; Id=41,1001,4101,117,141 } -MaxEvents 120 | ForEach-Object {
  $code = $null; if ($_.Id -eq 41) { $code = [int64]$_.Properties[0].Value } elseif ($_.Id -eq 1001 -and $_.Message -match '0x0*([0-9a-fA-F]+)') { $code = [Convert]::ToInt64($Matches[1], 16) }
  [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); id = $_.Id; prov = $_.ProviderName; code = $code; msg = $(if ($_.Id -in 4101,117,141) { ($_.Message -replace '\s+', ' ').Substring(0, [Math]::Min(90, $_.Message.Length)) }) } })
$ap = @(Get-WinEvent -FilterHashtable @{ LogName='Application'; StartTime=$s; Id=1000 } -MaxEvents 200 | Where-Object { $_.Properties[0].Value -match 'Fortnite|EpicGames|EasyAntiCheat|Roblox|VALORANT|cs2|Overwatch|Apex|r5apex' } | Select-Object -First 15 | ForEach-Object {
  [pscustomobject]@{ t = $_.TimeCreated.ToString('o'); app = [string]$_.Properties[0].Value; mod = [string]$_.Properties[3].Value; exc = [string]$_.Properties[6].Value } })
'@@SVQ@@' + (ConvertTo-Json -InputObject @{ ev = $ev; app = $ap } -Compress -Depth 4)`;
  return parse((await be.ps(ps, 40000)).stdout) || { ev: [], app: [] };
}
function fortniteCrashes() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'FortniteGame', 'Saved', 'Crashes'); const out = [];
  try {
    const dirs = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ n: d.name, t: fs.statSync(path.join(base, d.name)).mtimeMs })).sort((a, b) => b.t - a.t).slice(0, 5);
    for (const d of dirs) {
      let msg = '';
      try { const x = fs.readFileSync(path.join(base, d.n, 'CrashContext.runtime-xml'), 'utf8').slice(0, 20000); msg = ((x.match(/<ErrorMessage>([^<]{0,300})/) || [])[1] || (x.match(/<CrashType>([^<]*)/) || [])[1] || '').trim(); } catch { /* */ }
      out.push({ t: d.t, name: d.n.slice(0, 40), msg });
    }
  } catch { /* sin carpeta */ }
  return out;
}

async function scan(be, state) {
  const raw = await readEvents(be); const arr = (x) => [].concat(x || []).filter(Boolean);
  const ev = arr(raw.ev), app = arr(raw.app), fn = fortniteCrashes();
  const codes = new Map(); const sus = new Map();
  for (const e of ev) if (e.code) codes.set(e.code, (codes.get(e.code) || 0) + 1);
  const reasons = [];
  for (const [code, n] of codes) { const b = BUGS[code]; reasons.push({ code: '0x' + code.toString(16).toUpperCase().padStart(8, '0'), n, text: b ? b[0] : 'Código de pantallazo azul poco común', hasMap: !!b }); if (b) for (const id of b[1]) sus.set(id, (sus.get(id) || 0) + n); }
  const display = ev.filter((e) => e.id === 4101 || e.id === 117 || e.id === 141).length;
  if (display) { reasons.push({ code: 'Display', n: display, text: 'El driver de la gráfica se reinició o dejó de responder (TDR)', hasMap: true }); for (const id of GPU) sus.set(id, (sus.get(id) || 0) + display); }
  const hard = ev.filter((e) => e.id === 41 && !e.code).length;
  if (hard) { reasons.push({ code: 'Kernel-Power 41', n: hard, text: 'El PC se apagó o reinició de golpe sin pantallazo: casi siempre temperatura, fuente de alimentación o un ajuste de energía muy agresivo', hasMap: true }); for (const id of POWER) sus.set(id, (sus.get(id) || 0) + hard); }
  const touched = Object.keys(state.data.tweaks || {});
  const suspects = [...sus.entries()].filter(([id]) => touched.includes(id) && tw.byId.get(id)).sort((a, b) => b[1] - a[1]).map(([id]) => ({ id, name: tw.byId.get(id).name, risk: tw.byId.get(id).risk }));
  const modules = [...new Set(app.map((a) => a.mod).filter(Boolean))].slice(0, 6);
  return { reasons, suspects, app: app.slice(0, 8), fortnite: fn, modules, total: ev.length + app.length, hint: modules.some((m) => /nvwgf|nvoglv|nvd3d|atidx|amdxx|igd/i.test(m)) ? 'Los fallos de las apps ocurren dentro del driver de la gráfica: prueba con una instalación limpia del driver (DDU) y revisa la temperatura.' : '' };
}
module.exports = { scan };
