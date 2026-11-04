'use strict';
// Ida y vuelta con el backend simulado: aplicar -> revertir debe dejar el registro EXACTAMENTE como estaba.
const assert = require('assert');
const os = require('os'), path = require('path'), fs = require('fs');
const { create } = require('../src/engine');
const { TWEAKS, MODES, modeTweakIds } = require('../src/engine/catalog');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svq-'));
  const eng = create(dir, { mock: true }); const { api, be } = eng;
  be.reg.set('hkcu\\control panel\\desktop\\menushowdelay', { kind: 'SZ', data: '400' });
  be.reg.set('hklm\\system\\currentcontrolset\\services\\diagtrack\\start', { kind: 'DWORD', data: 2 });
  be.reg.set('hklm\\system\\currentcontrolset\\services\\sysmain\\start', { kind: 'DWORD', data: 2 });
  const snap = () => JSON.stringify([...be.reg.entries()].sort());
  const before = snap();

  assert.strictEqual(new Set(TWEAKS.map((t) => t.id)).size, TWEAKS.length, 'ids duplicados');
  const info = await api.sysinfo(); assert(info.facts.laptop && info.facts.nvidia, 'el mock debería ser laptop con NVIDIA');

  let list = await api.tweaksList();
  const avail = list.tweaks.filter((t) => t.status !== 'na');
  console.log(`tweaks: ${TWEAKS.length} totales, ${avail.length} disponibles en este PC`);
  const amd = list.tweaks.find((t) => t.id === 'amd-ulps-off'); assert.strictEqual(amd.status, 'na', 'AMD no debe ofrecerse con NVIDIA');
  assert(list.tweaks.find((t) => t.id === 'lap-cap-boost').status !== 'na', 'tweak de laptop debe ofrecerse');

  const all = avail.map((t) => t.id).filter((i) => i !== 'ipv6-off'); // excluyente con ipv4-prefer
  const r = await api.apply(all);
  assert.strictEqual(r.failed.length, 0, 'fallos: ' + JSON.stringify(r.failed));
  list = await api.tweaksList(); // cache invalidada
  const bad = list.tweaks.filter((t) => !['on', 'na', 'partial'].includes(t.status) && all.includes(t.id));
  assert.deepStrictEqual(bad.map((t) => t.id), [], 'no quedaron aplicados');
  assert.strictEqual((await be.regRead('HKCU', 'Control Panel\\Desktop', 'MenuShowDelay')).data, '0');
  assert.strictEqual(be.svcRunning.has('DiagTrack'), false, 'DiagTrack debió detenerse');

  const rv = await api.revert(all);
  assert.strictEqual(rv.failed.length, 0);
  assert.strictEqual((await be.regRead('HKCU', 'Control Panel\\Desktop', 'MenuShowDelay')).data, '400');
  assert.strictEqual(be.svcRunning.has('DiagTrack'), true, 'DiagTrack debió reiniciarse');
  assert.strictEqual(snap(), before, 'el registro no quedó idéntico tras revertir');
  assert.strictEqual(be.keys.size, 0, 'quedó una clave creada');

  // Herramientas: apps, benchmark y autoprueba (backend simulado)
  assert((await api.toolsApps()).length > 0);
  const bn = await api.benchRun('before'); assert(bn.before && bn.before.cpuMs > 0);
  const tids = await api.testIds(); assert(tids.length > 50, 'testIds vacío');
  const tr = await api.testRun(tids.slice(0, 20)); assert(tr.ok.length + tr.failApply.length + tr.failRevert.length + tr.error.length > 0);
  assert.strictEqual(snap(), before, 'la autoprueba dejó cambios en el registro');

  // Modos (con hardware laptop: noLaptop se omite)
  const facts = eng.getFacts();
  for (const m of MODES) console.log(m.id.padEnd(12), String(modeTweakIds(m, facts).length).padStart(3), 'ajustes');
  const gaming = modeTweakIds(MODES.find((m) => m.id === 'gaming'), facts);
  assert(!gaming.includes('power-plan-ultimate'), 'Gaming en laptop no debe forzar el plan Ultimate');
  assert(modeTweakIds(MODES.find((m) => m.id === 'laptop'), facts).includes('lap-cap-boost'));
  assert(!modeTweakIds(MODES.find((m) => m.id === 'ultimate'), facts).includes('vbs-off'), 'Ultimate no debe incluir VBS');
  assert(!modeTweakIds(MODES.find((m) => m.id === 'extremo'), facts).includes('vbs-off'), 'Extremo en laptop no debe incluir VBS');
  for (const m of MODES) for (const id of modeTweakIds(m, facts)) assert(!/preempt|tdr-off|msi|hags|mitigations|hypervisor|idle-disable/.test(id), 'laptop: ajuste peligroso ' + id + ' en ' + m.id);
  assert(!modeTweakIds(MODES.find((m) => m.id === 'streaming'), facts).includes('gamedvr-off'), 'Streaming no debe quitar la captura');
  await api.modesActivate('laptop'); assert((await api.modesList()).find((m) => m.id === 'laptop').active);
  await api.modesActivate('gaming'); await api.modesActivate('normal');
  assert.strictEqual(snap(), before, 'tras Normal el registro debe ser el original');

  const o = await api.optimizeRecommended(); assert(o.count > 20, 'recomendado aplicó ' + o.count);
  list = await api.tweaksList(); assert(list.score >= 90, 'score ' + list.score);
  assert(!list.tweaks.find((t) => t.id === 'dark-mode').rec, 'cosméticos no son "recomendados"');
  await api.revertAll(); assert.strictEqual(snap(), before, 'revertAll no restauró');

  // Juegos: detección, optimización, deshacer
  be._mockGames = [{ exe: 'RobloxPlayerBeta.exe', pid: 4242, name: 'Roblox' }];
  await eng.gameTick(); assert.strictEqual(eng.sessions.size, 1);
  await new Promise((r) => setTimeout(r, 200));
  const gs = await api.gamesState(); assert(gs.sessions[0].applied.length >= 2, 'debió optimizar el juego: ' + JSON.stringify(gs.sessions[0]));
  await api.gamesUndoAll(); assert.strictEqual(snap(), before, 'deshacer perfiles de juego');
  be._mockGames = []; await eng.gameTick(); assert.strictEqual(eng.sessions.size, 0);
  assert.throws(() => api.gamesProfileAdd('../../evil'), /\.exe/);

  // Ajustes
  const s = api.settingsSet({ discordClientId: '123456789012345678', fx3d: false, gameOpts: { ram: false } });
  assert.strictEqual(s.fx3d, false); assert.strictEqual(s.gameOpts.ram, false);
  api.settingsSet({ discordEnabled: false });

  // Programas de inicio
  be.reg.set('hkcu\\software\\microsoft\\windows\\currentversion\\run\\discord', { kind: 'SZ', data: 'C:\\x\\Discord.exe' });
  let st = await api.startupList(); assert.strictEqual(st[0].enabled, true);
  await api.startupToggle(st[0].id, false); st = await api.startupList(); assert.strictEqual(st[0].enabled, false);
  await api.startupToggle(st[0].id, true);

  // Hardware / diagnóstico
  const hwv = await api.hardware(); assert(hwv.tips.length && hwv.summary.cpu.name);

  // Limpieza segura
  const { wipe } = require('../src/engine/cleaner');
  const tmp = path.join(dir, 'cache-test-folder'); fs.mkdirSync(path.join(tmp, 'a'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'a', 'f.bin'), Buffer.alloc(2048));
  const w = await wipe(tmp); assert.strictEqual(w.freed, 2048); assert(fs.existsSync(tmp));
  assert.deepStrictEqual(await wipe('/'), { freed: 0, count: 0 });

  // Bloques de historial: un modo crea un bloque y «deshacer bloque» restaura el registro
  const pre = snap();
  await api.modesActivate('gaming');
  let bl = await api.historyBlocks(); assert(bl.length && bl[0].title === 'Modo Gaming' && bl[0].active > 5, 'bloque de modo');
  await api.undoBlock(bl[0].id);
  bl = await api.historyBlocks(); assert.strictEqual(bl[0].active, 0, 'bloque debe quedar deshecho');
  assert.strictEqual(snap(), pre, 'deshacer bloque debe restaurar el registro');

  // Procesos: protegidos no se tocan; desactivar servicio es reversible
  const pl = await api.procsList();
  assert(pl.find((i) => i.tech === 'lsass' || i.name === 'lsass').level === 'system', 'lsass debe ser Windows');
  assert(pl.find((i) => i.tech === 'EasyAntiCheat').level === 'protected', 'anti-cheat protegido');
  await assert.rejects(() => api.procsKill('lsass'), /protegido/);
  await assert.rejects(() => api.procsDisable('svc::EasyAntiCheat'), /protegido|No se puede/);
  be.reg.set('hklm\\system\\currentcontrolset\\services\\diagtrack\\start', { kind: 'DWORD', data: 2 });
  const pre2 = snap(); await api.procsDisable('svc::DiagTrack');
  assert.strictEqual((await be.regRead('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\DiagTrack', 'Start')).data, 4);
  await api.procsRestore('svc::DiagTrack'); assert.strictEqual(snap(), pre2, 'reactivar debe restaurar el servicio');
  // Dispositivos
  const dv = await api.devicesList(); assert(dv.length >= 4);
  const wifi = dv.find((d) => d.kind === 'Wi-Fi'); const pre3 = snap();
  const br = await api.devicesBoost(wifi.id); assert(br.steps.length >= 2);
  await api.devicesRestore(wifi.id); assert.strictEqual(snap(), pre3, 'restaurar dispositivo debe dejar el registro igual');
  // Launchers
  const ls = await api.launchersState(); assert(ls.steam && ls.epic && ls.discord);
  // FPS: el juego más reciente manda
  const f = require('../src/engine/fps'); assert(f.FpsMeter);

  eng.dispose();
  console.log('OK: todas las pruebas pasaron');
})().catch((e) => { console.error('FALLO:', e.stack || e.message); process.exit(1); });
