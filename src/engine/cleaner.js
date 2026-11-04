'use strict';
// Limpieza: solo borra DENTRO de carpetas de la lista blanca de abajo. Nunca rutas que vengan de la UI.
const fs = require('fs');
const path = require('path');

const E = process.env;
const LAD = E.LOCALAPPDATA || '', AD = E.APPDATA || '', PD = E.ProgramData || '', WIN = E.SystemRoot || E.windir || 'C:\\Windows';
const j = (...p) => path.join(...p);

// Perfiles de navegador Chromium: Default, Profile 1, ...
function chromium(userData, subs = ['Cache', 'Code Cache', 'GPUCache', 'Service Worker\\CacheStorage']) {
  return () => {
    const out = [];
    let profiles = [];
    try { profiles = fs.readdirSync(userData).filter((d) => d === 'Default' || /^Profile \d+$/.test(d)); } catch { /* no instalado */ }
    for (const p of profiles) for (const s of subs) out.push(j(userData, p, s));
    return out;
  };
}
function firefox() {
  return () => {
    const base = j(LAD, 'Mozilla', 'Firefox', 'Profiles'); const out = [];
    try { for (const d of fs.readdirSync(base)) out.push(j(base, d, 'cache2')); } catch { /* */ }
    return out;
  };
}
const fixed = (...p) => () => p;

let STEAM = j(E['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam');
const setSteamPath = (p) => { if (p && /^[A-Za-z]:[\\/]/.test(p)) STEAM = path.normalize(p); };
const steamRunning = () => { try { return require('child_process').execFileSync('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], { windowsHide: true, encoding: 'utf8' }).toLowerCase().includes('steam.exe'); } catch { return false; } };
const TARGETS = [
  { id: 'temp-user', name: 'Temporales del usuario', desc: 'Archivos que los programas dejan en %TEMP%.', def: true, paths: fixed(E.TEMP || j(LAD, 'Temp')) },
  { id: 'temp-win', name: 'Temporales de Windows', desc: 'C:\\Windows\\Temp (requiere administrador).', def: true, paths: fixed(j(WIN, 'Temp')) },
  { id: 'd3d', name: 'Caché de sombreadores de DirectX', desc: 'Se regenera sola; útil si un juego da tirones tras actualizar drivers.', def: true, paths: fixed(j(LAD, 'D3DSCache')) },
  { id: 'nvidia', name: 'Caché de sombreadores de NVIDIA', desc: 'DXCache, GLCache y NV_Cache. Útil tras actualizar el driver.', def: true, paths: fixed(j(LAD, 'NVIDIA', 'DXCache'), j(LAD, 'NVIDIA', 'GLCache'), j(PD, 'NVIDIA Corporation', 'NV_Cache')) },
  { id: 'amd', name: 'Caché de sombreadores de AMD', desc: 'DxCache, DxcCache y VkCache.', def: true, paths: fixed(j(LAD, 'AMD', 'DxCache'), j(LAD, 'AMD', 'DxcCache'), j(LAD, 'AMD', 'VkCache')) },
  { id: 'chrome', name: 'Caché de Chrome', desc: 'No borra contraseñas, historial ni sesiones.', def: true, paths: chromium(j(LAD, 'Google', 'Chrome', 'User Data')) },
  { id: 'edge', name: 'Caché de Edge', desc: 'No borra contraseñas, historial ni sesiones.', def: true, paths: chromium(j(LAD, 'Microsoft', 'Edge', 'User Data')) },
  { id: 'brave', name: 'Caché de Brave', desc: 'No borra contraseñas, historial ni sesiones.', def: true, paths: chromium(j(LAD, 'BraveSoftware', 'Brave-Browser', 'User Data')) },
  { id: 'firefox', name: 'Caché de Firefox', desc: 'No borra contraseñas, historial ni sesiones.', def: true, paths: firefox() },
  { id: 'discord', name: 'Caché de Discord', desc: 'Imágenes y vídeos descargados. No cierra tu sesión.', def: true, paths: fixed(j(AD, 'discord', 'Cache'), j(AD, 'discord', 'Code Cache'), j(AD, 'discord', 'GPUCache')) },
  { id: 'steam', name: 'Caché web de Steam', desc: 'Páginas de la tienda y la biblioteca. No toca tus juegos.', def: true, paths: fixed(j(LAD, 'Steam', 'htmlcache')) },
  { id: 'steam-logs', name: 'Registros y volcados de Steam', desc: 'Logs, dumps y caché de la tienda. No toca tus juegos.', def: true, paths: () => [j(STEAM, 'logs'), j(STEAM, 'dumps'), j(STEAM, 'appcache', 'httpcache')] },
  { id: 'steam-tmp', name: 'Descargas incompletas de Steam', desc: 'steamapps\\downloading y temp. Solo se borran si Steam está cerrado (si no, cortarías una descarga).', def: false, paths: () => (steamRunning() ? [] : [j(STEAM, 'steamapps', 'downloading'), j(STEAM, 'steamapps', 'temp')]) },
  { id: 'steam-shader', name: 'Caché de shaders de Steam', desc: 'Puede ocupar muchos GB. Se regenera, pero los juegos darán tirones la primera vez. Solo si necesitas espacio.', def: false, paths: () => [j(STEAM, 'steamapps', 'shadercache')] },
  { id: 'epic-logs', name: 'Registros y volcados de Epic Games', desc: 'Logs y reportes de fallos del launcher. No toca tus juegos.', def: true, paths: fixed(j(LAD, 'EpicGamesLauncher', 'Saved', 'Logs'), j(LAD, 'EpicGamesLauncher', 'Saved', 'Crashes'), j(LAD, 'EpicGamesLauncher', 'Intermediate')) },
  { id: 'epic', name: 'Caché web de Epic Games', desc: 'Páginas del launcher. No toca tus juegos.', def: true, paths: () => { try { return fs.readdirSync(j(LAD, 'EpicGamesLauncher', 'Saved')).filter((d) => d.startsWith('webcache')).map((d) => j(LAD, 'EpicGamesLauncher', 'Saved', d)); } catch { return []; } } },
  { id: 'roblox', name: 'Registros de Roblox', desc: 'Logs de Roblox Player/Studio en %LOCALAPPDATA%\\Roblox\\logs.', def: true, paths: fixed(j(LAD, 'Roblox', 'logs')) },
  { id: 'dumps', name: 'Volcados de errores', desc: 'Informes de bloqueos de programas y minidumps.', def: true, paths: fixed(j(LAD, 'CrashDumps'), j(WIN, 'Minidump'), j(PD, 'Microsoft', 'Windows', 'WER', 'ReportQueue'), j(PD, 'Microsoft', 'Windows', 'WER', 'ReportArchive')) },
  { id: 'wu', name: 'Descargas de Windows Update', desc: 'Instaladores ya aplicados. Windows los vuelve a bajar si hace falta.', def: false, paths: fixed(j(WIN, 'SoftwareDistribution', 'Download')) },
];

async function dirSize(root, limit = 2_000_000) {
  let size = 0, files = 0, seen = 0;
  const stack = [root];
  while (stack.length && seen < limit) {
    const dir = stack.pop();
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      seen++;
      const p = j(dir, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) stack.push(p);
      else { try { size += (await fs.promises.lstat(p)).size; files++; } catch { /* en uso */ } }
    }
  }
  return { size, files };
}

async function scan() {
  const out = [];
  for (const t of TARGETS) {
    let size = 0, files = 0;
    for (const p of t.paths()) { const r = await dirSize(p); size += r.size; files += r.files; }
    out.push({ id: t.id, name: t.name, desc: t.desc, def: t.def, size, files });
  }
  return out;
}

function isSafeRoot(p) {
  const r = path.resolve(p);
  return r.length > 12 && path.parse(r).root !== r && !/^[A-Za-z]:\\?$/.test(r);
}

async function wipe(root) {
  let freed = 0, count = 0;
  if (!isSafeRoot(root)) return { freed, count };
  async function rec(dir, isRoot) {
    let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = j(dir, e.name);
      try {
        if (e.isSymbolicLink()) { await fs.promises.unlink(p); continue; }
        if (e.isDirectory()) { await rec(p, false); try { await fs.promises.rmdir(p); } catch { /* no vacía */ } }
        else { const s = (await fs.promises.lstat(p)).size; await fs.promises.unlink(p); freed += s; count++; }
      } catch { /* archivo en uso: se omite */ }
    }
  }
  await rec(root, true);
  return { freed, count };
}

async function clean(ids) {
  let freed = 0, count = 0;
  const done = [];
  for (const t of TARGETS) {
    if (!ids.includes(t.id)) continue;
    let f = 0;
    for (const p of t.paths()) { const r = await wipe(p); f += r.freed; count += r.count; }
    freed += f; done.push({ id: t.id, freed: f });
  }
  return { freed, count, done };
}

async function large(minBytes = 500 * 1024 * 1024) {
  const home = E.USERPROFILE || require('os').homedir();
  const roots = ['Downloads', 'Desktop', 'Documents', 'Videos'].map((d) => j(home, d));
  const found = [];
  for (const root of roots) {
    const stack = [root]; let seen = 0;
    while (stack.length && seen < 300000) {
      const dir = stack.pop();
      let ents; try { ents = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        seen++; const p = j(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) stack.push(p);
        else try { const s = (await fs.promises.lstat(p)).size; if (s >= minBytes) found.push({ path: p, size: s }); } catch { /* */ }
      }
    }
  }
  return found.sort((a, b) => b.size - a.size).slice(0, 25);
}

module.exports = { setSteamPath, dirSize, TARGETS, scan, clean, large, wipe };
