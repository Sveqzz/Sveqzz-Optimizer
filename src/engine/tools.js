'use strict';
// Herramientas: quitar apps preinstaladas, benchmark antes/después y autoprueba de ajustes.
const tw = require('./tweaks');
const network = require('./network');

// Apps de Windows que casi nadie usa. Se quitan solo del usuario actual; se reinstalan desde Microsoft Store.
const APPS = [
  ['Microsoft.XboxApp', 'Xbox (app)'], ['Microsoft.GamingApp', 'Xbox Game Pass app'], ['Microsoft.Xbox.TCUI', 'Xbox TCUI'], ['Microsoft.XboxGameOverlay', 'Xbox Game Overlay'], ['Microsoft.XboxIdentityProvider', 'Xbox Identity'],
  ['Microsoft.BingNews', 'Noticias'], ['Microsoft.BingWeather', 'El Tiempo'], ['Microsoft.BingFinance', 'Finanzas'], ['Microsoft.BingSports', 'Deportes'],
  ['Clipchamp.Clipchamp', 'Clipchamp'], ['MicrosoftTeams', 'Teams (personal)'], ['MSTeams', 'Teams (nuevo)'], ['Microsoft.549981C3F5F10', 'Cortana'],
  ['Microsoft.GetHelp', 'Obtener ayuda'], ['Microsoft.Getstarted', 'Consejos'], ['Microsoft.WindowsFeedbackHub', 'Centro de opiniones'], ['Microsoft.MicrosoftOfficeHub', 'Office (promoción)'],
  ['Microsoft.MicrosoftSolitaireCollection', 'Solitario'], ['Microsoft.People', 'Contactos'], ['Microsoft.WindowsMaps', 'Mapas'], ['Microsoft.ZuneMusic', 'Groove / Música'], ['Microsoft.ZuneVideo', 'Películas y TV'],
  ['Microsoft.YourPhone', 'Vincular móvil'], ['Microsoft.SkypeApp', 'Skype'], ['Microsoft.MixedReality.Portal', 'Realidad mixta'], ['Microsoft.Todos', 'Microsoft To Do'], ['Microsoft.PowerAutomateDesktop', 'Power Automate'],
  ['Microsoft.OneConnect', 'Mobile Plans'], ['Microsoft.Wallet', 'Cartera'], ['MicrosoftCorporationII.QuickAssist', 'Asistencia rápida'], ['Microsoft.MicrosoftStickyNotes', 'Notas rápidas'], ['MicrosoftCorporationII.MicrosoftFamily', 'Microsoft Family'],
  ['Microsoft.OutlookForWindows', 'Outlook (nuevo)'], ['Microsoft.Windows.DevHome', 'Dev Home'], ['Microsoft.Copilot', 'Copilot'],
];
const NAMES = new Set(APPS.map((a) => a[0]));

async function scanApps(be) {
  if (be.mock) return APPS.slice(0, 8).map(([id, name]) => ({ id, name }));
  const raw = await be.psValue(`Get-AppxPackage | Where-Object { ${'$'}_.Name -in (${APPS.map((a) => `'${a[0]}'`).join(',')}) } | Select-Object -ExpandProperty Name`);
  const have = new Set(raw.split(/\r?\n/).map((x) => x.trim()).filter(Boolean));
  const apps = APPS.filter((a) => have.has(a[0])).map(([id, name]) => ({ id, name }));
  const od = await be.psValue("if (Test-Path \"$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe\" -or (Test-Path \"$env:SystemRoot\\System32\\OneDriveSetup.exe\")) { 'yes' }");
  if (od.trim() === 'yes') apps.push({ id: 'OneDrive', name: 'OneDrive (desinstalar)' });
  return apps;
}
async function removeApps(be, state, ids) {
  const list = (ids || []).filter((i) => NAMES.has(i) || i === 'OneDrive');
  const done = [], failed = [];
  for (const id of list) {
    if (be.mock) { done.push(id); continue; }
    let r;
    if (id === 'OneDrive') r = await be.ps("Stop-Process -Name OneDrive -Force -ErrorAction SilentlyContinue; $p = if (Test-Path \"$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe\") { \"$env:SystemRoot\\SysWOW64\\OneDriveSetup.exe\" } else { \"$env:SystemRoot\\System32\\OneDriveSetup.exe\" }; Start-Process $p -ArgumentList '/uninstall' -Wait", 90000);
    else r = await be.ps(`Get-AppxPackage -Name '${id}' | Remove-AppxPackage -ErrorAction Stop`, 60000);
    (r.code === 0 ? done : failed).push(id);
  }
  state.log('apps', `Apps quitadas: ${done.length}${failed.length ? `, ${failed.length} con error` : ''}`);
  state.save();
  return { done, failed };
}

// Benchmark ligero y repetible: CPU, memoria, precisión del temporizador (input lag), ping y disco.
async function bench() {
  const t0 = process.hrtime.bigint();
  let x = 0; for (let i = 0; i < 4e7; i++) x = (x + i * 31) % 1000003;
  const cpuMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const a = Buffer.alloc(64 * 1024 * 1024, 1), b = Buffer.alloc(64 * 1024 * 1024);
  const m0 = process.hrtime.bigint(); for (let i = 0; i < 6; i++) a.copy(b); const memMs = Number(process.hrtime.bigint() - m0) / 1e6;
  const dev = [];
  for (let i = 0; i < 120; i++) { const s = process.hrtime.bigint(); await new Promise((r) => setTimeout(r, 1)); dev.push(Number(process.hrtime.bigint() - s) / 1e6); }
  dev.sort((p, q) => p - q);
  const ping = []; for (let i = 0; i < 6; i++) { const v = await network.tcpPing('1.1.1.1'); if (v != null) ping.push(v); }
  return {
    t: Date.now(), cpuMs: Math.round(cpuMs), memGBs: +(6 * 64 / 1024 / (memMs / 1000)).toFixed(1), timerAvg: +(dev.reduce((s, v) => s + v, 0) / dev.length).toFixed(2), timerP95: +dev[Math.floor(dev.length * 0.95)].toFixed(2),
    ping: ping.length ? +(ping.reduce((s, v) => s + v, 0) / ping.length).toFixed(1) : null, _x: x & 1,
  };
}

// Autoprueba: aplica cada ajuste apagado, comprueba que quedó activo, lo revierte y comprueba que volvió.
async function selfTest(be, state, facts, ids) {
  const out = { ok: [], failApply: [], failRevert: [], error: [] };
  for (const id of ids) {
    const t = tw.byId.get(id); if (!t || t.crash) continue;
    try {
      const s0 = (await tw.statusAll(be, state, facts, [id]))[id];
      if (s0 !== 'off') continue;
      await tw.applyMany(be, state, [t]);
      const s1 = (await tw.statusAll(be, state, facts, [id]))[id];
      await tw.revertMany(be, state, [t]);
      const s2 = (await tw.statusAll(be, state, facts, [id]))[id];
      if (s1 !== 'on') out.failApply.push({ id, name: t.name, status: s1 });
      else if (s2 !== 'off') out.failRevert.push({ id, name: t.name, status: s2 });
      else out.ok.push(id);
    } catch (e) { out.error.push({ id, name: t && t.name, msg: String((e && e.message) || e).slice(0, 120) }); }
  }
  state.save();
  return out;
}
module.exports = { scanApps, removeApps, bench, selfTest };
