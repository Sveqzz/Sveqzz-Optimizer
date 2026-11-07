'use strict';
// Detección y optimización de juegos.
const { run } = require('./backend');

const KNOWN = {
  'robloxplayerbeta.exe': 'Roblox', 'fortniteclient-win64-shipping.exe': 'Fortnite', 'valorant-win64-shipping.exe': 'VALORANT', 'cs2.exe': 'Counter-Strike 2', 'csgo.exe': 'CS:GO',
  'r5apex.exe': 'Apex Legends', 'r5apex_dx12.exe': 'Apex Legends', 'gta5.exe': 'GTA V', 'gta5_enhanced.exe': 'GTA V', 'eldenring.exe': 'Elden Ring', 'overwatch.exe': 'Overwatch 2', 'league of legends.exe': 'League of Legends',
  'dota2.exe': 'Dota 2', 'rainbowsix.exe': 'Rainbow Six Siege', 'rainbowsix_vulkan.exe': 'Rainbow Six Siege', 'cod.exe': 'Call of Duty', 'cyberpunk2077.exe': 'Cyberpunk 2077', 'rocketleague.exe': 'Rocket League',
  'tslgame.exe': 'PUBG', 'destiny2.exe': 'Destiny 2', 'helldivers2.exe': 'Helldivers 2', 'palworld-win64-shipping.exe': 'Palworld', 'rustclient.exe': 'Rust', 'escapefromtarkov.exe': 'Escape from Tarkov',
  'minecraft.windows.exe': 'Minecraft', 'fc25.exe': 'EA FC 25', 'fc26.exe': 'EA FC 26', 'marvel-win64-shipping.exe': 'Marvel Rivals', 'deadlock.exe': 'Deadlock', 'thefinals.exe': 'THE FINALS',
  'warthunder.exe': 'War Thunder', 'bf2042.exe': 'Battlefield 2042', 'bf6.exe': 'Battlefield 6', 'wow.exe': 'World of Warcraft', 'diablo iv.exe': 'Diablo IV', 'hogwartslegacy.exe': 'Hogwarts Legacy',
  'baldursgate3.exe': "Baldur's Gate 3", 'bg3_dx11.exe': "Baldur's Gate 3", 'witcher3.exe': 'The Witcher 3', 'stardewvalley.exe': 'Stardew Valley', 'gtavi.exe': 'GTA VI',
};
const LAUNCHER_PATH = String.raw`steamapps\\common|\\Epic Games\\|\\Riot Games\\|\\XboxGames\\|Battle\.net|\\Ubisoft Game Launcher\\games|\\EA Games\\|\\Origin Games\\|\\GOG Galaxy\\Games|\\GOG Games\\|\\Roblox\\Versions`;

async function running(be, profiles = []) {
  if (be.mock) return be._mockGames || [];
  const r = await run('tasklist', ['/FO', 'CSV', '/NH'], 8000);
  if (r.code !== 0) return [];
  const prof = new Map(profiles.map((p) => [p.exe.toLowerCase(), p.name]));
  const out = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/^"([^"]+)","(\d+)"/);
    if (!m) continue;
    const exe = m[1].toLowerCase();
    const name = prof.get(exe) || KNOWN[exe];
    if (name) out.push({ exe: m[1], pid: Number(m[2]), name });
  }
  return out;
}

// Búsqueda más profunda: cualquier proceso que viva dentro de carpetas de juegos de launchers
async function scanByPath(be) {
  if (be.mock) return [];
  const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
$l = Get-Process | Where-Object { $_.Path -and ($_.Path -match '${LAUNCHER_PATH}') -and $_.MainWindowHandle -ne 0 } | ForEach-Object { [pscustomobject]@{ exe = ($_.ProcessName + '.exe'); pid = $_.Id; path = $_.Path } }
'@@SVQ@@' + (ConvertTo-Json -InputObject @($l) -Compress)`;
  const r = await be.ps(ps, 20000); const m = r.stdout.match(/@@SVQ@@(.*)$/m);
  if (!m) return [];
  return [].concat(JSON.parse(m[1]) || []).filter((g) => g && g.exe).map((g) => ({ ...g, name: KNOWN[g.exe.toLowerCase()] || g.exe.replace(/\.exe$/i, '') }));
}

async function pathOf(be, pid) {
  if (be.mock) return `C:\\Games\\${pid}.exe`;
  const r = await be.ps(`(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue).Path`, 10000);
  return r.stdout.trim();
}

const HK_GPU = 'Software\\Microsoft\\DirectX\\UserGpuPreferences';
const HK_FSO = 'Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers';
const IFEO = 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\';

// Optimiza un juego en marcha. opts: { priority, gpuHigh, fso, persist, ram }. Devuelve lo aplicado y lo que hay que deshacer.
async function optimize(be, state, proc, opts) {
  const applied = [], prefs = state.data.gamePrefs = state.data.gamePrefs || {};
  const exePath = proc.path || await pathOf(be, proc.pid);
  const validPath = /^[A-Za-z]:\\[^"<>|*?\r\n]+\.exe$/i.test(exePath);
  if (opts.priority) {
    await be.ps(`$p = Get-Process -Id ${Number(proc.pid)} -ErrorAction SilentlyContinue; if ($p) { $p.PriorityClass = 'High' }`, 10000);
    applied.push('Prioridad de CPU alta');
  }
  if (validPath && opts.gpuHigh && !prefs[exePath + '|gpu']) {
    prefs[exePath + '|gpu'] = { h: 'HKCU', p: HK_GPU, n: exePath, prev: await be.regRead('HKCU', HK_GPU, exePath).then((v) => ({ e: v.exists !== undefined ? v.exists : v.e, k: v.kind || v.k, v: v.data ?? v.v })) };
    await be.regWrite('HKCU', HK_GPU, exePath, 'SZ', 'GpuPreference=2;');
    applied.push('GPU dedicada (alto rendimiento)');
  }
  if (validPath && opts.fso && !prefs[exePath + '|fso']) {
    const cur = await be.regRead('HKCU', HK_FSO, exePath);
    if (!cur.exists && !cur.e) {
      prefs[exePath + '|fso'] = { h: 'HKCU', p: HK_FSO, n: exePath, prev: { e: false } };
      await be.regWrite('HKCU', HK_FSO, exePath, 'SZ', '~ DISABLEDXMAXIMIZEDWINDOWEDMODE');
      applied.push('Pantalla completa clásica (sin optimizaciones de ventana)');
    }
  }
  if (opts.persist && proc.exe && /^[\w .()-]+\.exe$/i.test(proc.exe) && !prefs[proc.exe + '|ifeo']) {
    prefs[proc.exe + '|ifeo'] = { h: 'HKLM', p: IFEO + proc.exe + '\\PerfOptions', n: 'CpuPriorityClass', prev: { e: false } };
    await be.regWrite('HKLM', IFEO + proc.exe + '\\PerfOptions', 'CpuPriorityClass', 'DWORD', 3);
    applied.push('Prioridad alta en cada inicio');
  }
  let freedMB = 0;
  if (opts.killBg) { const k = await killBg(be).catch(() => []); if (k.length) applied.push('Apps de fondo cerradas: ' + k.join(', ')); }
  if (opts.ram) { freedMB = await freeRam(be, proc.pid); applied.push(`RAM liberada: ${freedMB} MB`); }
  state.save();
  return { applied, freedMB };
}

async function undoPrefs(be, state, exeOrPath) {
  const prefs = state.data.gamePrefs || {};
  for (const k of Object.keys(prefs)) {
    if (exeOrPath && !k.toLowerCase().startsWith(exeOrPath.toLowerCase())) continue;
    const p = prefs[k];
    if (p.prev && p.prev.e) await be.regWrite(p.h, p.p, p.n, p.prev.k, p.prev.v);
    else if (k.endsWith('|ifeo')) await be.keyDelete('HKLM', p.p);
    else await be.regDelete(p.h, p.p, p.n);
    delete prefs[k];
  }
  state.save();
}

// Vacía la lista de espera (standby) de la RAM: es lo que causa los tirones cuando la memoria "libre" está llena de caché vieja.
const PURGE = String.raw`Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class SvqMem{[DllImport("ntdll.dll")]public static extern uint RtlAdjustPrivilege(int p,bool e,bool t,out bool o);[DllImport("ntdll.dll")]public static extern uint NtSetSystemInformation(int c,IntPtr i,int l);}' -ErrorAction SilentlyContinue
$o = $false; [void][SvqMem]::RtlAdjustPrivilege(13, $true, $false, [ref]$o)
$p = [Runtime.InteropServices.Marshal]::AllocHGlobal(4); [Runtime.InteropServices.Marshal]::WriteInt32($p, 4); [void][SvqMem]::NtSetSystemInformation(80, $p, 4); [Runtime.InteropServices.Marshal]::FreeHGlobal($p)`;
async function purgeStandby(be, onlyIfNeeded) {
  if (be.mock) return { purged: true, standbyMB: 900 };
  const check = onlyIfNeeded ? String.raw`$m = Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory
$sb = [double]($m.StandbyCacheNormalPriorityBytes + $m.StandbyCacheReserveBytes + $m.StandbyCacheCoreBytes); $fr = [double]$m.FreeAndZeroPageListBytes
if (-not ($sb -gt 2GB -and $fr -lt 1GB)) { '@@SVQ@@' + [int]($sb / 1MB) + ',0'; return }
` : '$sb = 0\n';
  const r = await be.ps(`$ErrorActionPreference='SilentlyContinue'\n${check}${PURGE}\n'@@SVQ@@' + [int]($sb / 1MB) + ',1'`, 20000);
  const m = r.stdout.match(/@@SVQ@@(\d+),(\d)/); return m ? { standbyMB: Number(m[1]), purged: m[2] === '1' } : { purged: false, standbyMB: 0 };
}
// Cierra apps de fondo conocidas que solo gastan recursos mientras juegas (no toca Discord, Steam, Spotify ni nada protegido).
const BG_KILL = ['OneDrive', 'Teams', 'ms-teams', 'Skype', 'SkypeApp', 'YourPhone', 'PhoneExperienceHost', 'Widgets', 'WidgetService', 'AdobeCollabSync', 'CCXProcess', 'Creative Cloud Helper', 'GoogleDriveFS', 'Dropbox'];
async function killBg(be) {
  if (be.mock) return ['OneDrive'];
  const r = await be.ps(`$ErrorActionPreference='SilentlyContinue'; ${JSON.stringify(BG_KILL).replace(/"/g, "'").replace(/^\[/, '@(').replace(/\]$/, ')')} | ForEach-Object { $x = Get-Process -Name $_ -ErrorAction SilentlyContinue; if ($x) { $x | Stop-Process -Force; $_ } }`, 20000);
  return r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}
// Libera memoria: lista de espera + recorta procesos de fondo que NO son del sistema, protegidos ni el juego (antes recortaba todo, y eso podía desestabilizar anti-cheat y drivers).
async function freeRam(be, exceptPid = 0) {
  if (be.mock) return 312;
  const { CORE, PROTECT_RE } = require('./procs');
  const skip = '^(' + [...CORE].map((x) => x.replace(/[^\w-]/g, '.')).join('|') + '|.*(easyanticheat|beservice|battleye|eac|epic|fortnite|nvidia|nvcontainer|amd|radeon|intel|vgc|vgk|riot|valorant|steam|discord|obs).*)$';
  const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
Add-Type -Name M -Namespace W -MemberDefinition '[DllImport("psapi.dll")] public static extern int EmptyWorkingSet(IntPtr h);'
$b = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
Get-Process | Where-Object { $_.Id -gt 4 -and $_.Id -ne ${Number(exceptPid)} -and $_.Id -ne $PID -and $_.Path -and $_.Path -notmatch '^[A-Za-z]:\\Windows\\' -and $_.ProcessName -notmatch '(?i)${skip.replace(/'/g, "''")}' } | ForEach-Object { try { [void][W.M]::EmptyWorkingSet($_.Handle) } catch {} }
${PURGE}
$a = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory
[math]::Max(0, [math]::Round(($a - $b) / 1024))`;
  const r = await be.ps(ps, 40000);
  return Number(r.stdout.trim().split(/\r?\n/).pop()) || 0;
}

// Mientras juegas: baja la prioridad de launchers y apps de fondo (Discord, Steam/Epic web, OneDrive, Teams, Spotify). Se restaura al cerrar el juego.
const BG = ['discord', 'steamwebhelper', 'epicwebhelper', 'epicgameslauncher', 'onedrive', 'teams', 'ms-teams', 'spotify'];
async function lowerBg(be) {
  if (be.mock) return [{ pid: 1, cls: 'Normal' }];
  const r = await be.ps(String.raw`$ErrorActionPreference='SilentlyContinue'
Get-Process -Name ${BG.map((n) => `'${n}'`).join(',')} | ForEach-Object { '{0}:{1}' -f $_.Id, $_.PriorityClass; $_.PriorityClass = 'BelowNormal' }`, 15000);
  return r.stdout.split(/\r?\n/).map((l) => l.trim().match(/^(\d+):(Idle|BelowNormal|Normal|AboveNormal|High)$/)).filter(Boolean).map((m) => ({ pid: Number(m[1]), cls: m[2] }));
}
async function restoreBg(be, prev) {
  if (be.mock || !prev || !prev.length) return;
  const lines = prev.filter((p) => Number.isInteger(p.pid) && /^(Idle|BelowNormal|Normal|AboveNormal|High)$/.test(p.cls)).map((p) => `$x = Get-Process -Id ${p.pid} -ErrorAction SilentlyContinue; if ($x) { $x.PriorityClass = '${p.cls}' }`);
  if (lines.length) await be.ps(lines.join('; '), 15000);
}


// Libera y optimiza apps pesadas (navegadores, Discord, Spotify…): recorta su memoria en uso y les baja la prioridad para que no quiten rendimiento.
const HEAVY = ['brave', 'chrome', 'msedge', 'firefox', 'opera', 'operagx', 'vivaldi', 'discord', 'spotify', 'steamwebhelper', 'epicwebhelper', 'ms-teams', 'teams', 'slack', 'code', 'whatsapp', 'telegram'];
async function optimizeApps(be) {
  if (be.mock) return { totalMB: 640, apps: [{ name: 'brave', before: 1400, after: 520 }, { name: 'discord', before: 520, after: 210 }] };
  const ps = String.raw`$ErrorActionPreference='SilentlyContinue'
Add-Type -Name M -Namespace W -MemberDefinition '[DllImport("psapi.dll")] public static extern int EmptyWorkingSet(IntPtr h);'
$names = ${HEAVY.map((n) => `'${n}'`).join(',')}
$ps = @(Get-Process -Name $names)
$b = @{}; $ps | ForEach-Object { $b[$_.ProcessName] += $_.WorkingSet64 }
$ps | ForEach-Object { try { [void][W.M]::EmptyWorkingSet($_.Handle); if ($_.PriorityClass -eq 'Normal') { $_.PriorityClass = 'BelowNormal' } } catch {} }
Start-Sleep -Milliseconds 400
$a = @{}; Get-Process -Name $names | ForEach-Object { $a[$_.ProcessName] += $_.WorkingSet64 }
$b.Keys | ForEach-Object { '{0}:{1}:{2}' -f $_, [math]::Round($b[$_]/1MB), [math]::Round(([double]$a[$_])/1MB) }`;
  const r = await be.ps(ps, 40000);
  const apps = r.stdout.split(/\r?\n/).map((l) => l.trim().match(/^([\w.-]+):(\d+):(\d+)$/)).filter(Boolean).map((m) => ({ name: m[1], before: +m[2], after: +m[3] })).sort((a, b) => (b.before - b.after) - (a.before - a.after));
  return { apps, totalMB: apps.reduce((t, a) => t + Math.max(0, a.before - a.after), 0) };
}

// Juegos donde un overlay encima rompe la pantalla completa exclusiva (pasan a «pantalla completa extendida» y bajan los FPS)
const SENSITIVE = new Set(['cod.exe', 'valorant-win64-shipping.exe', 'cs2.exe', 'csgo.exe', 'r5apex.exe', 'r5apex_dx12.exe', 'rainbowsix.exe', 'rainbowsix_vulkan.exe', 'escapefromtarkov.exe', 'tslgame.exe', 'bf2042.exe', 'bf6.exe', 'fortniteclient-win64-shipping.exe', 'overwatch.exe', 'thefinals.exe', 'marvel-win64-shipping.exe', 'deadlock.exe', 'destiny2.exe']);


// Catálogo para la página de perfiles: foto (Steam CDN, si existe) y consejos dentro del juego.
const CATALOG = [
  { exe: 'cod.exe', name: 'Call of Duty / Warzone', steam: 1938090, tip: 'Pantalla completa exclusiva, DirectX 12, sombras/partículas bajas, Nvidia Reflex ON. Cierra el overlay de FPS (esta app lo oculta sola).' },
  { exe: 'fortniteclient-win64-shipping.exe', name: 'Fortnite', tip: 'Modo Rendimiento (DX11), resolución 3D 100 %, sombras y efectos en bajo. Usa también el perfil de la pestaña Centro de juegos.' },
  { exe: 'valorant-win64-shipping.exe', name: 'VALORANT', tip: 'Limita FPS a ilimitado, Multithreaded Rendering ON, Nvidia Reflex ON, calidad de material/detalle en bajo.' },
  { exe: 'cs2.exe', name: 'Counter-Strike 2', steam: 730, tip: 'Opciones de lanzamiento: -novid -high. Reflex ON, sombras bajas, MSAA 2x/4x.' },
  { exe: 'r5apex.exe', name: 'Apex Legends', steam: 1172470, tip: 'Sin límite de FPS (fps_max unlimited), texturas según tu VRAM, modelo de sombras y efectos bajos.' },
  { exe: 'robloxplayerbeta.exe', name: 'Roblox', tip: 'Calidad gráfica manual al mínimo y límite de FPS ilimitado en la configuración de Roblox.' },
  { exe: 'rainbowsix.exe', name: 'Rainbow Six Siege', steam: 359550, tip: 'Vulkan en equipos modestos, sin V-Sync, calidad de textura según VRAM.' },
  { exe: 'overwatch.exe', name: 'Overwatch 2', steam: 2357570, tip: 'Reduce buffering ON, calidad de sombras/efectos baja, Nvidia Reflex ON.' },
  { exe: 'marvel-win64-shipping.exe', name: 'Marvel Rivals', steam: 2767030, tip: 'Modo de render DX12 o DX11 según el equipo, DLSS/FSR en calidad, sombras y efectos bajos.' },
  { exe: 'thefinals.exe', name: 'THE FINALS', steam: 2073850, tip: 'Reflex ON, sombras/GI bajas, DLSS/FSR en calidad.' },
  { exe: 'gta5.exe', name: 'GTA V', steam: 271590, tip: 'DirectX 11, sin MSAA, sombras suaves y distancia de dibujado media.' },
  { exe: 'rocketleague.exe', name: 'Rocket League', steam: 252950, tip: 'Rendimiento en High Performance, sin V-Sync, efectos en bajo.' },
  { exe: 'eldenring.exe', name: 'Elden Ring', steam: 1245620, tip: 'Calidad de sombras y efectos en media/baja, sin anti-aliasing extra.' },
  { exe: 'cyberpunk2077.exe', name: 'Cyberpunk 2077', steam: 1091500, tip: 'DLSS/FSR en calidad, trazado de rayos solo si tu GPU lo aguanta.' },
  { exe: 'tslgame.exe', name: 'PUBG', steam: 578080, tip: 'Sin V-Sync, sombras y efectos en bajo, anti-aliasing medio.' },
  { exe: 'rustclient.exe', name: 'Rust', steam: 252490, tip: 'Reduce la distancia de dibujado y la calidad de sombras.' },
  { exe: 'dota2.exe', name: 'Dota 2', steam: 570, tip: 'Opción de lanzamiento -high; sombras bajas.' },
  { exe: 'league of legends.exe', name: 'League of Legends', tip: 'Calidad de sombras y efectos en bajo, límite de FPS según el monitor.' },
  { exe: 'minecraft.windows.exe', name: 'Minecraft', tip: 'Distancia de renderizado 8-12, con Sodium/OptiFine en Java.' },
  { exe: 'escapefromtarkov.exe', name: 'Escape from Tarkov', tip: 'Sombras y calidad de objetos en bajo, ideal con SSD.' },
];
// Perfil por juego: lo que hace Sveqzz Optimizer al detectarlo.
const PRESET = {
  max: { priority: 'high', gpuHigh: true, fso: true, ram: true, bgLow: true, killBg: true, standby: true },
  balanced: { priority: false, gpuHigh: true, fso: false, ram: true, bgLow: true, killBg: false, standby: true },
  off: { priority: '', gpuHigh: false, fso: false, ram: false, bgLow: false, killBg: false, standby: false },
};

module.exports = { CATALOG, PRESET, SENSITIVE, optimizeApps, purgeStandby, killBg, lowerBg, restoreBg, KNOWN, running, scanByPath, optimize, undoPrefs, freeRam };
