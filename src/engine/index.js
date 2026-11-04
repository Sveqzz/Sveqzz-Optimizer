'use strict';
const { EventEmitter } = require('events');
const { createBackend } = require('./backend');
const { State } = require('./state');
const { TWEAKS, CATEGORIES, MODES, modeTweakIds, reqOK } = require('./catalog');
const tw = require('./tweaks');
const cleaner = require('./cleaner');
const network = require('./network');
const system = require('./system');
const startup = require('./startup');
const games = require('./games');
const procs = require('./procs');
const devices = require('./devices');
const launchers = require('./launchers');
const crashes = require('./crashes');
const fortnite = require('./fortnite');
const { FpsMeter } = require('./fps');
const { DiscordRPC } = require('./discord');
const DISCORD_APP_ID = '1566908340724834494'; // fijo: no se puede cambiar desde la app
const DISCORD_IMAGE = 'logo';

const APP = 'Sveqzz Optimizer';

function create(dataDir, opts = {}) {
  const be = createBackend(opts.mock);
  const state = new State(dataDir);
  const events = new EventEmitter();
  const fps = new FpsMeter(dataDir);
  const discord = new DiscordRPC();
  let hw = null, facts = null, restoreDone = false, busy = Promise.resolve(), listCache = null, hwView = null, fpsError = '';
  const sessions = new Map(); // pid -> sesión de juego
  const hwReady = be.hwScan().then((h) => { hw = h; facts = system.factsFrom(h); }).catch(() => {});
  // Todas las escrituras van en cola: nunca dos cambios a la vez.
  const exclusive = (fn) => { const p = busy.then(fn, fn); busy = p.catch(() => {}); return p; };
  const invalidate = () => { listCache = null; };

  async function requireAdmin() {
    if (!(await be.isAdmin())) throw new Error(`${APP} necesita ejecutarse como administrador para cambiar estos ajustes.`);
  }
  async function restorePoint() {
    if (be.mock) return { ok: true, mock: true };
    const r = await be.ps(`Enable-ComputerRestore -Drive "$env:SystemDrive\\" -ErrorAction SilentlyContinue; Checkpoint-Computer -Description "${APP}" -RestorePointType MODIFY_SETTINGS -ErrorAction Stop`, 120000);
    const ok = r.code === 0;
    state.log('sistema', ok ? 'Punto de restauración creado' : 'No se pudo crear punto de restauración (Windows limita uno cada 24 h)');
    return { ok };
  }
  const summarize = (results, ids) => {
    const t = ids.map((i) => tw.byId.get(i)).filter(Boolean);
    return { results, reboot: t.some((x) => x.reboot), relog: t.some((x) => x.relog), failed: results.filter((r) => !r.ok) };
  };
  async function doApply(ids, label) {
    await requireAdmin();
    let list = ids.map((i) => tw.byId.get(i)).filter(Boolean);
    // excluyentes: dentro del lote se queda el primero; los ya aplicados que chocan se revierten antes
    const chosen = [], skipped = [];
    for (const t of list) { const c = tw.conflictsOf(t.id); (chosen.some((x) => c.has(x.id)) ? skipped : chosen).push(t); }
    list = chosen;
    const clash = [...new Set(list.flatMap((t) => [...tw.conflictsOf(t.id)]))].filter((id) => state.data.tweaks[id] && !list.some((t) => t.id === id));
    if (clash.length) await tw.revertMany(be, state, clash.map((i) => tw.byId.get(i)));
    if (list.length > 3 && !restoreDone) { restoreDone = true; await restorePoint(); }
    const before = new Set(Object.keys(state.data.tweaks));
    const results = await tw.applyMany(be, state, list);
    const fresh = list.filter((t) => !before.has(t.id) && state.data.tweaks[t.id]).map((t) => t.id);
    if (fresh.length) {
      const b = state.data.blocks = state.data.blocks || [];
      b.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: Date.now(), title: label || 'Cambios manuales', kind: /^Modo/.test(label || '') ? 'modo' : label ? 'auto' : 'manual', ids: fresh });
      b.length = Math.min(b.length, 60);
    }
    for (const t of skipped) results.push({ id: t.id, ok: true, skipped: true });
    state.save(); invalidate();
    state.log('aplicar', `${label || 'Aplicados'}: ${list.length} ajuste(s)${results.some((r) => !r.ok) ? ` (${results.filter((r) => !r.ok).length} con error)` : ''}`);
    return summarize(results, ids);
  }
  async function doRevert(ids, label) {
    await requireAdmin();
    const list = ids.map((i) => tw.byId.get(i)).filter(Boolean);
    const results = await tw.revertMany(be, state, list);
    state.save(); invalidate();
    state.log('revertir', `${label || 'Revertidos'}: ${list.length} ajuste(s)`);
    return summarize(results, ids);
  }
  // «Recomendado»: seguros, que ayudan (juegos / eficiencia / trabajo), sin efectos secundarios avisados y no cosméticos.
  const isRec = (t) => t.risk === 'safe' && t.cat !== 'personalizacion' && !t.warn && (t.tier === 1 || t.eco || t.work || t.lap) && reqOK(t, facts) && !(facts && facts.laptop && t.noLaptop);

  async function listAll() {
    await hwReady;
    if (listCache && Date.now() - listCache.at < 20000) return listCache.data;
    const status = await tw.statusAll(be, state, facts);
    const tweaks = TWEAKS.map(({ ops, ...t }) => ({ ...t, status: status[t.id], touched: !!state.data.tweaks[t.id], rec: isRec(t) }));
    const rec = tweaks.filter((t) => t.rec && t.status !== 'na');
    const data = {
      categories: CATEGORIES.map(([id, name]) => ({ id, name })).filter((c) => tweaks.some((t) => t.cat === c.id && t.status !== 'na')),
      tweaks, score: rec.length ? Math.round(100 * rec.filter((t) => t.status === 'on').length / rec.length) : 0, recommended: rec.length, recommendedOn: rec.filter((t) => t.status === 'on').length,
    };
    listCache = { at: Date.now(), data };
    return data;
  }

  // ───── juegos ─────
  const S = () => state.data.settings;
  const current = () => [...sessions.values()].sort((a, b) => b.start - a.start)[0]; // el juego más reciente
  function updateDiscord(extra) {
    const mode = MODES.find((m) => m.id === state.data.activeMode);
    const g = current();
    const a = { details: g ? `Optimizando ${g.name}` : 'Optimizando el PC', state: mode && mode.id !== 'normal' ? `Modo ${mode.name}` : 'Windows más rápido' };
    a.assets = { large_image: DISCORD_IMAGE, large_text: APP };
    discord.set({ ...a, ...extra });
  }
  let lastPurge = 0;
  async function gameTick() {
    if (sessions.size && S().gameOpts.standby && Date.now() - lastPurge > 45000) { lastPurge = Date.now(); games.purgeStandby(be, true).then((r) => { if (r.purged) state.log('juego', `Memoria en espera vaciada (${r.standbyMB} MB) para evitar tirones`); }).catch(() => {}); }
    if (!S().autoDetect) return;
    const now = await games.running(be, state.data.profiles);
    const alive = new Set(now.map((g) => g.pid));
    for (const g of now) {
      if (sessions.has(g.pid)) continue;
      const s = { ...g, start: Date.now(), applied: [], status: 'detectado' };
      sessions.set(g.pid, s); state.log('juego', `Juego detectado: ${g.name}`);
      events.emit('game-start', s); updateDiscord();
      if (S().autoOptimize) optimizeSession(s).catch(() => {});
    }
    for (const [pid, s] of sessions) if (!alive.has(pid)) {
      games.restoreBg(be, s.bgPrev).catch(() => {}); sessions.delete(pid); state.log('juego', `${s.name} cerrado tras ${Math.round((Date.now() - s.start) / 60000)} min`);
      events.emit('game-end', s); updateDiscord();
    }
  }
  async function optimizeSession(s) {
    s.status = 'optimizando';
    const mode = state.data.activeMode, comp = ['competitivo', 'ultimate', 'extremo'].includes(mode);
    const o = { ...S().gameOpts }; if (comp) o.fso = o.fso || true;
    if (facts && !facts.laptop) o.gpuHigh = o.gpuHigh && (facts.nvidia || facts.amd) && (facts.intel || (hw && hw.gpus && hw.gpus.length > 1));
    try { const r = await games.optimize(be, state, s, o); if (o.bgLow) { s.bgPrev = await games.lowerBg(be).catch(() => []); r.applied.push('Launchers y apps de fondo con menos prioridad'); } s.applied = r.applied; s.status = 'optimizado'; state.log('juego', `${s.name} optimizado: ${r.applied.join(', ')}`); }
    catch (e) { s.status = 'error'; s.error = String(e.message || e); }
    events.emit('game-update', s);
  }
  const gameTimer = setInterval(() => gameTick().catch(() => {}), 6000);
  if (gameTimer.unref) gameTimer.unref();

  const api = {
    async sysinfo() { await hwReady; return system.sysinfo(be, hw, facts); },
    async stats() { return system.stats(); },
    async hardware() {
      await hwReady; if (!hw) throw new Error('No pude leer el hardware');
      if (!hwView || Date.now() - hwView.at > 60000) { const st = await startup.list(be).catch(() => []); hwView = { at: Date.now(), data: system.describe(hw, facts, st.filter((s) => s.enabled).length) }; }
      return hwView.data;
    },
    perf: () => system.topProcesses(be),

    tweaksList: listAll,
    apply: (ids) => exclusive(() => doApply(ids)),
    revert: (ids) => exclusive(() => doRevert(ids)),
    optimizeRecommended: () => exclusive(async () => {
      const d = await listAll();
      const ids = d.tweaks.filter((t) => t.rec && t.status !== 'on' && t.status !== 'na').map((t) => t.id);
      const r = ids.length ? await doApply(ids, 'Optimización recomendada') : { results: [], reboot: false, relog: false, failed: [] };
      return { ...r, count: ids.length };
    }),
    revertAll: () => exclusive(async () => {
      const ids = Object.keys(state.data.tweaks);
      state.data.activeMode = 'normal'; state.data.modeApplied = [];
      const r = await doRevert(ids, `Revertidos todos los cambios de ${APP}`);
      await games.undoPrefs(be, state).catch(() => {}); updateDiscord();
      return r;
    }),

    async modesList() {
      await hwReady; const d = await listAll(); const st = Object.fromEntries(d.tweaks.map((t) => [t.id, t.status]));
      const lap = !!(facts && facts.laptop);
      return MODES.map((m) => {
        const ids = modeTweakIds(m, facts).filter((i) => st[i] !== 'na');
        const adv = ids.filter((i) => tw.byId.get(i).risk === 'advanced').length;
        return { id: m.id, name: m.name, tag: m.tag, badge: m.badge, icon: m.icon, desc: m.desc, count: ids.length, on: ids.filter((i) => st[i] === 'on').length, advanced: adv, active: state.data.activeMode === m.id, recommended: m.id === (lap ? 'laptop' : 'gaming'), warnLaptop: lap && ['competitivo', 'ultimate', 'extremo'].includes(m.id), hide: m.laptop && !lap && false };
      });
    },
    modesActivate: (id) => exclusive(async () => {
      await hwReady;
      const mode = MODES.find((m) => m.id === id); if (!mode) throw new Error('Modo desconocido');
      const ids = modeTweakIds(mode, facts);
      const stale = (state.data.modeApplied || []).filter((i) => !ids.includes(i) && state.data.tweaks[i]);
      if (stale.length) await doRevert(stale, `Saliendo del modo ${state.data.activeMode}`);
      const status = await tw.statusAll(be, state, facts, ids);
      const todo = ids.filter((i) => status[i] !== 'on' && status[i] !== 'na');
      const r = todo.length ? await doApply(todo, `Modo ${mode.name}`) : { results: [], reboot: false, relog: false, failed: [] };
      state.data.activeMode = id; state.data.modeApplied = ids.filter((i) => state.data.tweaks[i]);
      state.save(); state.log('modo', `Modo ${mode.name} activado`); invalidate(); updateDiscord();
      return { ...r, count: todo.length, mode: id };
    }),

    cleanScan: () => cleaner.scan(),
    cleanRun: (ids) => exclusive(async () => { const r = await cleaner.clean(ids || []); state.log('limpieza', `Limpieza: ${(r.freed / 2 ** 20).toFixed(1)} MB liberados`); return r; }),
    async cleanBin() { const r = await be.ps('Clear-RecycleBin -Force -ErrorAction SilentlyContinue'); state.log('limpieza', 'Papelera vaciada'); return { ok: r.code === 0 }; },
    async flushDns() { await be.exec('ipconfig', ['/flushdns']); state.log('red', 'Caché DNS vaciada'); return { ok: true }; },
    cleanLarge: () => cleaner.large(),
    async appsOptimize() { const r = await games.optimizeApps(be); state.log('sistema', `Apps optimizadas: ${r.totalMB} MB liberados`); return r; },
    async ramFree() { const mb = await games.freeRam(be); state.log('sistema', `RAM liberada: ${mb} MB`); return { mb }; },

    netPing: (host, count) => network.measure(host, count),
    netRegions: () => network.regions(),
    netDnsBench: () => network.dnsBench(),
    netDnsSet: (id) => exclusive(async () => { await requireAdmin(); await network.setDns(be, state, id); return { ok: true }; }),
    netDnsReset: () => exclusive(async () => { await requireAdmin(); await network.resetDns(be, state); return { ok: true }; }),

    startupList: () => startup.list(be),
    startupToggle: (id, enabled) => exclusive(async () => { await startup.toggle(be, id, enabled); hwView = null; state.log('inicio', `${enabled ? 'Activado' : 'Desactivado'} al inicio: ${id.split('::').slice(1).join('::')}`); return { ok: true }; }),

    async history() { return state.data.history; },
    // procesos y servicios
    procsList: () => procs.list(be, state),
    procsKill: async (name) => { await procs.kill(be, String(name)); return { ok: true }; },
    procsDisable: (id) => exclusive(async () => { await requireAdmin(); return procs.disable(be, state, String(id)); }),
    procsRestore: (id) => exclusive(async () => { await requireAdmin(); await procs.restore(be, state, String(id)); return { ok: true }; }),
    // prioridad por dispositivo
    devicesList: () => devices.list(be, state),
    devicesBoost: (id) => exclusive(async () => { await requireAdmin(); return devices.boost(be, state, String(id)); }),
    devicesRestore: (id) => exclusive(async () => { await requireAdmin(); await devices.restore(be, state, String(id)); return { ok: true }; }),
    // diagnóstico de crashes y perfil de Fortnite
    driversScan: () => require('./drivers').scan(be),
    crashesScan: async () => { const r = await crashes.scan(be, state); return r; },
    fortniteState: () => fortnite.status(be, state),
    fortniteApply: (level) => exclusive(async () => { const r = await fortnite.apply(be, state, String(level || 'max')); state.log('juego', 'Perfil de Fortnite aplicado: ' + r.changed + ' ajustes'); return r; }),
    fortniteRestore: () => exclusive(async () => { await fortnite.restore(be, state); state.log('juego', 'Configuración de Fortnite restaurada'); return { ok: true }; }),
    // launchers
    launchersState: () => launchers.status(be, state),
    launchersOptimize: (id) => exclusive(async () => launchers.optimize(be, state, String(id))),
    launchersRestore: (id) => exclusive(async () => launchers.restore(be, state, String(id))),
    async historyBlocks() {
      return (state.data.blocks || []).map((b) => {
        const items = b.ids.map((id) => { const t = tw.byId.get(id); return t ? { id, name: t.name, risk: t.risk, active: !!state.data.tweaks[id] } : null; }).filter(Boolean);
        return { id: b.id, t: b.t, title: b.title, kind: b.kind, total: items.length, active: items.filter((i) => i.active).length, items };
      }).filter((b) => b.total);
    },
    undoBlock: (id) => exclusive(async () => {
      const b = (state.data.blocks || []).find((x) => x.id === id); if (!b) throw new Error('Ese bloque ya no existe');
      const ids = b.ids.filter((i) => state.data.tweaks[i]);
      if (!ids.length) return { results: [], failed: [], reboot: false, relog: false };
      const r = await doRevert(ids, `Bloque deshecho: ${b.title}`);
      state.data.modeApplied = (state.data.modeApplied || []).filter((i) => state.data.tweaks[i]);
      if (!state.data.modeApplied.length && b.kind === 'modo') state.data.activeMode = 'normal';
      state.save(); invalidate(); updateDiscord(); return r;
    }),
    restorePoint: () => exclusive(restorePoint),

    // juegos
    async gamesState() {
      const running = await games.running(be, state.data.profiles);
      return { sessions: [...sessions.values()], running, profiles: state.data.profiles, settings: S(), known: Object.keys(games.KNOWN).length, fps: fps.snapshot(), fpsInstalled: fps.available(), fpsError, facts, fn: await fortnite.status(be, state) };
    },
    gamesScan: () => games.scanByPath(be),
    gamesOptimize: (pid) => exclusive(async () => {
      let s = sessions.get(pid);
      if (!s) { const g = (await games.running(be, state.data.profiles)).find((x) => x.pid === pid) || (await games.scanByPath(be)).find((x) => x.pid === pid); if (!g) throw new Error('Ese proceso ya no está abierto'); s = { ...g, start: Date.now(), applied: [] }; sessions.set(pid, s); }
      await optimizeSession(s); return s;
    }),
    gamesProfileAdd: (exe, name) => {
      exe = String(exe || '').trim(); if (!/^[\w .()-]+\.exe$/i.test(exe)) throw new Error('Escribe el nombre del .exe (por ejemplo juego.exe)');
      if (!state.data.profiles.find((p) => p.exe.toLowerCase() === exe.toLowerCase())) state.data.profiles.push({ exe, name: String(name || exe.replace(/\.exe$/i, '')).slice(0, 40) });
      state.save(); return state.data.profiles;
    },
    gamesProfileRemove: (exe) => exclusive(async () => {
      state.data.profiles = state.data.profiles.filter((p) => p.exe.toLowerCase() !== String(exe).toLowerCase());
      await games.undoPrefs(be, state, exe).catch(() => {}); state.save(); return state.data.profiles;
    }),
    async gamesUndoAll() { await games.undoPrefs(be, state); return { ok: true }; },
    async fpsInstall() { try { await fps.ensure(); fpsError = ''; return { ok: true }; } catch (e) { fpsError = String(e.message || e); throw e; } },
    async overlayData() {
      const s = current();
      if (s && fps.target !== s.exe) fps.start(s.exe).catch((e) => { fpsError = String(e.message || e); });
      if (!s && fps.target) fps.stop();
      const st = await system.stats();
      return { game: s ? s.name : null, ...fps.snapshot(), fpsError, ping: st.ping.ms, cpu: st.cpu, gpu: st.gpu ? st.gpu.usage : null, gpuTemp: st.gpu ? st.gpu.temp : null, ram: st.ram };
    },

    // ajustes
    async settingsGet() { return { ...S(), discordClientId: undefined, discordImage: undefined, discord: discord.status }; },
    settingsSet: (patch) => {
      const cur = S(); const allowed = ['autoDetect', 'autoOptimize', 'overlayAuto', 'overlayCorner', 'discordEnabled', 'fx3d'];
      for (const k of allowed) if (k in patch) cur[k] = typeof cur[k] === 'boolean' ? !!patch[k] : String(patch[k]).slice(0, 64);
      if (patch.gameOpts) for (const k of Object.keys(cur.gameOpts)) if (k in patch.gameOpts) cur.gameOpts[k] = !!patch.gameOpts[k];
      state.save(); discord.configure(DISCORD_APP_ID, cur.discordEnabled); updateDiscord(); events.emit('settings', cur);
      return { ...cur, discord: discord.status };
    },
  };

  discord.configure(DISCORD_APP_ID, S().discordEnabled); updateDiscord();
  const dispose = () => { clearInterval(gameTimer); fps.stop(); discord.stop(); };
  return { api, be, state, events, fps, discord, dispose, getFacts: () => facts, gameTick, sessions };
}

module.exports = { create, APP };
