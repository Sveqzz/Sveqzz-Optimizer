'use strict';
// Steam, Epic Games y Discord: limpia lo que ocupa espacio y ajusta lo que gasta recursos.
const fs = require('fs');
const path = require('path');
const { run } = require('./backend');
const cleaner = require('./cleaner');

const LAD = process.env.LOCALAPPDATA || '', AD = process.env.APPDATA || '';
const DISCORD_CFG = path.join(AD, 'discord', 'settings.json');
const IDS = { steam: ['steam', 'steam-logs', 'steam-tmp'], epic: ['epic', 'epic-logs'], discord: ['discord'] };

async function running(be, exe) {
  if (be.mock) return false;
  const r = await run('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/NH'], 8000);
  return r.stdout.toLowerCase().includes(exe.toLowerCase());
}
async function steamPath(be) {
  const v = await be.regRead('HKCU', 'Software\\Valve\\Steam', 'SteamPath');
  if (v.exists) cleaner.setSteamPath(String(v.data));
  return v.exists ? String(v.data) : '';
}

async function status(be, state) {
  const sp = await steamPath(be);
  const l = (state.data.launch = state.data.launch || {});
  const inst = { steam: be.mock || !!sp, epic: be.mock || fs.existsSync(path.join(LAD, 'EpicGamesLauncher')), discord: be.mock || fs.existsSync(path.join(AD, 'discord')) };
  const all = await cleaner.scan();
  const out = {};
  for (const id of Object.keys(IDS)) {
    const items = all.filter((t) => IDS[id].includes(t.id));
    const shader = id === 'steam' ? all.find((t) => t.id === 'steam-shader') : null;
    out[id] = { installed: inst[id], reclaimable: items.reduce((a, t) => a + t.size, 0), shaderBytes: shader ? shader.size : 0, running: await running(be, { steam: 'steam.exe', epic: 'EpicGamesLauncher.exe', discord: 'Discord.exe' }[id]) };
  }
  let hw = null; try { hw = JSON.parse(fs.readFileSync(DISCORD_CFG, 'utf8')).enableHardwareAcceleration; } catch { /* */ }
  out.discord.hwAccelOff = hw === false; out.discord.optimized = !!l.discordHw;
  return out;
}

async function optimize(be, state, id) {
  if (!IDS[id]) throw new Error('Launcher desconocido');
  await steamPath(be);
  const r = await cleaner.clean(IDS[id]);
  const done = [`${(r.freed / 2 ** 20).toFixed(0)} MB liberados`];
  if (id === 'discord') {
    if (await running(be, 'Discord.exe')) { state.log('limpieza', `Discord: caché limpiada (${(r.freed / 2 ** 20).toFixed(0)} MB)`); return { freed: r.freed, done, note: 'Cierra Discord del todo (icono de la bandeja → Salir) y vuelve a pulsar para desactivar su aceleración por hardware.' }; }
    try {
      const cur = fs.existsSync(DISCORD_CFG) ? JSON.parse(fs.readFileSync(DISCORD_CFG, 'utf8')) : {};
      const l = (state.data.launch = state.data.launch || {});
      if (!l.discordHw) l.discordHw = { prev: Object.prototype.hasOwnProperty.call(cur, 'enableHardwareAcceleration') ? cur.enableHardwareAcceleration : null };
      cur.enableHardwareAcceleration = false;
      if (!be.mock) { fs.mkdirSync(path.dirname(DISCORD_CFG), { recursive: true }); fs.writeFileSync(DISCORD_CFG, JSON.stringify(cur, null, 2)); }
      done.push('Aceleración por hardware desactivada (menos GPU mientras juegas)');
    } catch (e) { done.push('No pude editar los ajustes de Discord: ' + e.message); }
  }
  if (id === 'steam') done.push('Mientras juegas, Steam pasa a segundo plano para no quitarte CPU');
  state.log('limpieza', `${id}: ${done.join(' · ')}`); state.save();
  return { freed: r.freed, done };
}

async function restore(be, state, id) {
  if (id !== 'discord') return { ok: true };
  const l = state.data.launch || {};
  if (!l.discordHw) return { ok: true };
  if (await running(be, 'Discord.exe')) throw new Error('Cierra Discord del todo y vuelve a intentarlo');
  const cur = JSON.parse(fs.readFileSync(DISCORD_CFG, 'utf8'));
  if (l.discordHw.prev === null) delete cur.enableHardwareAcceleration; else cur.enableHardwareAcceleration = l.discordHw.prev;
  if (!be.mock) fs.writeFileSync(DISCORD_CFG, JSON.stringify(cur, null, 2));
  delete l.discordHw; state.save();
  return { ok: true };
}
module.exports = { status, optimize, restore };
