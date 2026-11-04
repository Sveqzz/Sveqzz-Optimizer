'use strict';
// ───────── puente con el motor (Electron IPC; en desarrollo, HTTP) ─────────
const call = async (method, ...args) => {
  let res;
  if (window.velox) res = await window.velox.call(method, ...args);
  else res = await (await fetch('/api/' + method, { method: 'POST', body: JSON.stringify(args) })).json();
  if (res && res.__error) throw new Error(res.__error);
  return res;
};
const cmd = (n, a) => (window.velox ? window.velox.cmd(n, a) : Promise.resolve(false));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtBytes = (b) => b >= 2 ** 30 ? (b / 2 ** 30).toFixed(1) + ' GB' : b >= 2 ** 20 ? (b / 2 ** 20).toFixed(1) + ' MB' : b >= 1024 ? (b / 1024).toFixed(0) + ' KB' : b + ' B';
const fmtMs = (v) => v == null ? '—' : v.toFixed(v < 10 ? 1 : 0) + ' ms';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────── iconos (trazo, 24×24) ─────────
const P = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>', cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5"/>', sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  gamepad: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 00-3.9 3.1l-1.4 6a3 3 0 005 2.7L8 15h8l1.6 1.8a3 3 0 005-2.7l-1.4-6A4 4 0 0017.3 5z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', wifi: '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0M12 19.5h.01"/>',
  power: '<path d="M12 3v9M6.3 6.6a8 8 0 1011.4 0"/>', history: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', leaf: '<path d="M11 20A7 7 0 019.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6"/>',
  briefcase: '<path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18"/>', laptop: '<path d="M5 5h14v10H5zM2 19h20"/>', radio: '<path d="M12 12h.01M8.5 8.5a5 5 0 000 7M15.5 8.5a5 5 0 010 7M5.6 5.6a9 9 0 000 12.8M18.4 5.6a9 9 0 010 12.8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', flame: '<path d="M12 3c1 3 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>',
  skull: '<path d="M12 3a8 8 0 00-5 14v3h10v-3a8 8 0 00-5-14zM9 12h.01M15 12h.01M10 20v-2M14 20v-2"/>', circle: '<circle cx="12" cy="12" r="9"/>',
  check: '<path d="M5 12l5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  refresh: '<path d="M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5"/>', download: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>', play: '<path d="M7 4l13 8-13 8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', ram: '<rect x="2" y="8" width="20" height="8" rx="1"/><path d="M6 8v8M10 8v8M14 8v8M18 8v8M6 16v3M18 16v3"/>',
  disk: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01M11 15h6"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>', undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>', chevron: '<path d="M6 9l6 6 6-6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  star: '<path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.3L12 17l-5.6 3.1 1.3-6.3L3 9.5l6.3-.7z"/>', discord: '<path d="M8 8c2-1 6-1 8 0M7 17c3 1.5 7 1.5 10 0M5 17c-1-4 0-8 2-11 1.5-.7 3-1 4-1M19 17c1-4 0-8-2-11-1.5-.7-3-1-4-1"/><circle cx="9.5" cy="12.5" r="1"/><circle cx="14.5" cy="12.5" r="1"/>',
};
const I = (n, s = 18) => `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

const NAV = [
  ['inicio', 'Inicio', 'home'], ['mipc', 'Mi PC', 'cpu'], ['modos', 'Modos', 'layers'],
  ['_', 'OPTIMIZAR'], ['optimizacion', 'Optimización', 'sliders'], ['juegos', 'Centro de juegos', 'gamepad'], ['procesos', 'Procesos y servicios', 'cpu'], ['dispositivos', 'Prioridad de dispositivos', 'bolt'], ['launchers', 'Steam, Epic y Discord', 'download'], ['drivers', 'Actualizaciones', 'refresh'], ['herramientas', 'Herramientas', 'sliders'], ['crashes', 'Diagnóstico de crashes', 'alert'], ['limpieza', 'Limpieza', 'trash'], ['red', 'Red y ping', 'wifi'], ['arranque', 'Inicio de Windows', 'power'],
  ['_', 'SEGURIDAD'], ['historial', 'Historial y deshacer', 'history'], ['_', 'APP'], ['ajustes', 'Ajustes y Discord', 'settings'],
];
const S = { pq: '', pf: 'rec', page: 'inicio', info: null, desired: new Map(), cat: 'all', q: '', risk: 'all', only: 'all', busy: false, reboot: false, overlay: false, net: {}, cleanSel: new Set(), openMore: new Set(), game: null };
const C = {}; // caché de datos entre pantallas (se pinta al instante y se refresca por detrás)
let pollTimer = null;

// ───────── utilidades de interfaz ─────────
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 9000 : 4200);
}
function banner(html, bad) { const b = $('#banner'); b.hidden = !html; b.className = 'banner' + (bad ? ' bad' : ''); b.innerHTML = html ? I('alert', 16) + `<span>${html}</span>` : ''; }
function refreshBanner() {
  if (S.info && !S.info.admin) return banner('Sveqzz Optimizer no está como administrador: no podrá aplicar cambios. Ciérralo y ábrelo con clic derecho → <b>Ejecutar como administrador</b>.', true);
  if (S.info && S.info.mock) return banner('Modo de prueba: los cambios son simulados y no tocan tu PC.');
  banner(S.reboot ? 'Algunos cambios necesitan <b>reiniciar Windows</b> para tener efecto completo.' : '');
}
function setPage(html) { const m = $('#main'), y = m.scrollTop; $('#page').innerHTML = html; m.scrollTop = y; }
const skeleton = (n = 6) => '<div style="padding-top:60px">' + '<div class="skel"></div>'.repeat(n) + '</div>';
async function guard(btn, fn) {
  if (S.busy) return; S.busy = true;
  const old = btn && btn.innerHTML; if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Trabajando…'; }
  try { return await fn(); } catch (e) { toast(e.message, 'err'); } finally { S.busy = false; if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = old; } }
}
function dialog({ title, body, ok = 'Continuar', cancel = 'Cancelar', danger = false, info = false }) {
  return new Promise((res) => {
    const m = $('#modal'); m.hidden = false;
    m.innerHTML = `<div class="dlg"><h3>${esc(title)}</h3><div class="body">${body}</div><div class="acts">${info ? '' : `<button class="btn" data-x="0">${cancel}</button>`}<button class="btn ${danger ? 'danger' : 'primary'}" data-x="1">${ok}</button></div></div>`;
    const done = (v) => { m.hidden = true; m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', key); res(v); };
    const key = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', key);
    m.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) done(b.dataset.x === '1'); else if (e.target === m) done(false); };
  });
}
function afterApply(r, what) {
  if (r.reboot) S.reboot = true;
  if (r.failed && r.failed.length) toast(`${r.failed.length} ajuste(s) no se pudieron aplicar: ${r.failed[0].error || 'error desconocido'}`, 'err'); else toast(what || 'Listo', 'ok');
  refreshBanner();
}
const riskLabel = { safe: 'Seguro', medium: 'Medio', advanced: 'Avanzado' };
const reqLabel = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', laptop: 'Laptop', desktop: 'Escritorio', win11: 'Windows 11' };

// ───────── caché «pintar ya, refrescar después» ─────────
async function swr(key, fetcher, render) {
  const page = S.page; const had = !!C[key];
  if (had) render(C[key].v, true);
  try {
    const v = await fetcher(); const same = had && JSON.stringify(C[key].v) === JSON.stringify(v); C[key] = { v, at: Date.now() };
    if (S.page === page && !same) render(v, false);
    return v;
  } catch (e) { if (!had && S.page === page) setPage(`<h1>Algo falló</h1><p class="sub">${esc(e.message)}</p>`); }
}
const getInfo = async () => { if (!S.info) S.info = await call('sysinfo'); return S.info; };
const isLaptop = () => !!(S.info && S.info.facts && S.info.facts.laptop);

// ───────── navegación ─────────
function renderNav() {
  $('#nav').innerHTML = NAV.map(([id, label, ico]) => id === '_' ? `<h6>${label}</h6>` : `<button data-p="${id}" class="${S.page === id ? 'on' : ''}">${I(ico, 18)}<span>${label}</span>${id === 'juegos' && S.game ? '<i class="dotbadge"></i>' : ''}</button>`).join('');
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.p); });
async function go(p) {
  if (!PAGES[p]) p = 'inicio';
  clearInterval(pollTimer); pollTimer = null;
  S.page = p; renderNav(); $('#crumb').textContent = (NAV.find((n) => n[0] === p) || [])[1] || '';
  const pg = $('#page'); pg.classList.remove('enter'); void pg.offsetWidth; pg.classList.add('enter');
  $('#main').scrollTop = 0;
  try { await PAGES[p](); } catch (e) { setPage(`<h1>Algo falló</h1><p class="sub">${esc(e.message)}</p>`); }
}

// ───────── INICIO ─────────
async function pageInicio() {
  const info = await getInfo(); refreshBanner();
  const f = info.facts || {}; const rec = f.laptop ? 'laptop' : 'gaming';
  setPage(`
    <h1>Inicio</h1><p class="sub">Un clic para dejar tu PC listo. Todo se puede deshacer y se guarda el valor original de cada ajuste.</p>
    <div class="card hero tilt">
      <div>
        <div class="eyebrow">TU EQUIPO${f.laptop ? ' · PORTÁTIL' : ''}</div>
        <h2 id="hLabel">Analizando tu PC…</h2>
        <div class="muted" id="hText">Leyendo tus ajustes, un momento.</div>
        <div class="row wrap" style="margin-top:18px"><button class="btn primary big" id="oneClick">${I('bolt', 18)} Optimizar con un clic</button><button class="btn big" data-mode="${rec}">${I(f.laptop ? 'laptop' : 'gamepad', 18)} Modo ${f.laptop ? 'Laptop Gaming' : 'Gaming'}</button></div>
        <div class="kv">${[[info.cpu, 'cpu'], [info.ramGB + ' GB RAM', 'ram'], [info.gpu || 'GPU no detectada', 'monitor'], [info.os, 'shield'], [info.freeGB != null ? info.freeGB.toFixed(0) + ' GB libres' : '', 'disk']].filter((x) => x[0]).map(([t, i]) => `<span>${I(i, 13)}${esc(t)}</span>`).join('')}</div>
      </div>
      <div class="orb"><i class="r r1"></i><i class="r r2"></i><i class="r r3"></i>
        <svg viewBox="0 0 168 168"><circle cx="84" cy="84" r="76" stroke="#1b2132" stroke-width="9" fill="none"/><circle id="ring" cx="84" cy="84" r="76" stroke="url(#gr)" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="477.5" stroke-dashoffset="477.5"/><defs><linearGradient id="gr"><stop offset="0" stop-color="#3b9cff"/><stop offset="1" stop-color="#5ee0ff"/></linearGradient></defs></svg>
        <div class="num"><div><span id="score">–</span><small>PUNTUACIÓN</small></div></div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><div class="row"><div class="ico sm">${I('gamepad', 16)}</div><b class="sp">Juegos</b><button class="btn ghost" data-go="juegos">Abrir ${I('arrow', 14)}</button></div><div id="homeGame" class="muted" style="margin-top:10px">Buscando juegos abiertos…</div></div>
      <div class="card"><div class="row"><div class="ico sm">${I('layers', 16)}</div><b class="sp">Modo activo</b><button class="btn ghost" data-go="modos">Cambiar ${I('arrow', 14)}</button></div><div id="homeMode" class="muted" style="margin-top:10px">—</div></div>
    </div>
    <div class="row wrap" style="margin-top:14px"><button class="btn" id="hBackup">${I('shield', 15)} Crear backup</button><button class="btn" data-go="historial">${I('layers', 15)} Historial de cambios</button><button class="btn" id="hRam">${I('ram', 15)} Liberar y optimizar apps</button><button class="btn danger" id="hUndo">${I('undo', 15)} Deshacer todo</button></div>
    <h2>Recomendaciones para tu PC</h2><div id="homeTips"><div class="skel" style="height:60px"></div></div>
    <h2>Accesos rápidos</h2>
    <div class="grid g4">${[['optimizacion', 'sliders', 'Optimización', 'Cientos de ajustes con el riesgo a la vista'], ['juegos', 'gamepad', 'Centro de juegos', 'Detecta y optimiza tus juegos + overlay'], ['limpieza', 'trash', 'Limpieza', 'Cachés, temporales y RAM'], ['red', 'wifi', 'Red y ping', 'Ping, DNS y regiones'], ['mipc', 'cpu', 'Mi PC', 'Tus componentes y su estado'], ['arranque', 'power', 'Inicio de Windows', 'Quita lo que frena el arranque'], ['historial', 'history', 'Historial', 'Deshaz cualquier cambio'], ['ajustes', 'discord', 'Discord', 'Muestra «Jugando a Sveqzz Optimizer»']].map(([p, i, t, d]) => `<button class="tile tilt" data-go="${p}"><div class="ico">${I(i, 18)}</div><b>${t}</b><span>${d}</span></button>`).join('')}</div>`);
  fillHome();
}
function setScore(tw) {
  const s = tw.score, ring = $('#ring'); if (!ring) return;
  ring.style.strokeDashoffset = 477.5 * (1 - s / 100); $('#score').textContent = s;
  $('#hLabel').textContent = 'Nivel de optimización: ' + (s >= 85 ? 'excelente' : s >= 60 ? 'bueno' : s >= 30 ? 'mejorable' : 'sin optimizar');
  const miss = tw.tweaks.filter((t) => t.rec && t.status === 'off').slice(0, 4).map((t) => t.name);
  $('#hText').title = miss.length ? 'Te faltan: ' + miss.join(', ') : '';
  $('#hText').textContent = `${tw.recommendedOn} de ${tw.recommended} ajustes recomendados para tu PC están activos.` + (isLaptop() ? ' En portátil solo se aplican los que no fuerzan CPU/GPU.' : '');
}
async function fillHome() {
  const page = 'inicio';
  call('tweaksList').then((tw) => { C.tw = { v: tw, at: Date.now() }; if (S.page === page) setScore(tw); }).catch(() => {});
  call('hardware').then((hw) => { C.hw = { v: hw, at: Date.now() }; if (S.page === page && $('#homeTips')) $('#homeTips').innerHTML = tipsHtml(hw.tips.slice(0, 4)); }).catch((e) => { if ($('#homeTips')) $('#homeTips').innerHTML = `<p class="muted">No pude leer el hardware: ${esc(e.message)}</p>`; });
  call('modesList').then((m) => { C.modes = { v: m, at: Date.now() }; const a = m.find((x) => x.active); if (S.page === page && $('#homeMode')) $('#homeMode').innerHTML = a && a.id !== 'normal' ? `<b style="font-size:17px;color:#fff">${esc(a.name)}</b> · ${esc(a.tag)}<div class="bar" style="margin-top:10px"><i style="width:${a.count ? Math.round(100 * a.on / a.count) : 0}%"></i></div>` : 'Ninguno: Windows tal como lo dejaste.'; }).catch(() => {});
  call('gamesState').then((g) => { if (S.page === page && $('#homeGame')) $('#homeGame').innerHTML = g.running.length ? g.running.map((x) => `<span class="pill on">${I('gamepad', 12)} ${esc(x.name)}</span>`).join(' ') : 'Ningún juego abierto. Cuando abras uno, lo detecto solo.'; }).catch(() => {});
}
const appsMsg = (r) => r.apps.length ? `${r.totalMB} MB liberados: ` + r.apps.slice(0, 4).map((a) => `${a.name} ${a.before}→${a.after} MB`).join(', ') : 'No hay apps pesadas abiertas';
const tipsHtml = (tips) => tips.map((t) => `<div class="tip ${t.level}"><div class="ico sm">${I(t.level === 'ok' ? 'check' : t.level === 'warn' ? 'alert' : 'info', 15)}</div><div class="sp"><b>${esc(t.title)}</b><p>${esc(t.text)}</p>${t.go ? `<button class="btn ghost" style="padding:4px 0;margin-top:4px" data-go="${t.go}">Ir allí ${I('arrow', 12)}</button>` : ''}</div></div>`).join('');

// ───────── MI PC ─────────
function reportText(hw) {
  const s = hw.summary, g = (s.gpus || []).map((x) => `${x.name}${x.vramGB ? ` (${x.vramGB} GB)` : ''}${x.driver ? ` · driver ${x.driver}` : ''}`).join('; ');
  const c = s.cpu || {};
  return ['SVEQZZ OPTIMIZER · Informe de este PC', `Equipo: ${s.model || '—'}${s.laptop ? ' (portátil)' : ''}`, `CPU: ${c.name || c} ${c.cores ? `· ${c.cores} núcleos / ${c.threads} hilos` : ''}`, `RAM: ${s.ramGB} GB ${s.ramType || ''} ${s.ramMHz ? s.ramMHz + ' MHz' : ''} (${s.ramModules || '?'} módulo/s)`, `GPU: ${g || '—'}`,
    `Discos: ${(s.disks || []).map((d) => `${d.name} ${d.sizeGB} GB ${d.type || ''}`).join('; ')}`, `Sistema: ${s.os || ''} (build ${s.build || '?'}) · plan de energía: ${s.plan || '—'}`, `Programas al inicio: ${s.startupCount ?? '?'} · Encendido hace ${s.uptimeH ?? '?'} h`, '',
    'Recomendaciones:', ...hw.tips.map((t) => `- ${t.title}: ${t.text}`)].join('\n');
}
async function pageMiPc() {
  setPage('<h1>Mi PC</h1><p class="sub">Esto es lo que Sveqzz Optimizer detecta en <b>este</b> equipo.</p>' + skeleton(4));
  swr('hw', () => call('hardware'), (hw) => {
    const s = hw.summary, c = s.cpu || {}; const dl = (rows) => `<dl class="spec">${rows.filter((r) => r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    setPage(`<h1>Mi PC</h1><p class="sub">Esto es lo que Sveqzz Optimizer detecta en <b>este</b> equipo: componentes, estado y qué mejorar.</p>
      <div class="row wrap" style="margin-bottom:16px"><button class="btn" id="copyReport">${I('copy', 16)} Copiar informe</button><button class="btn" data-go="optimizacion">${I('sliders', 16)} Optimizar</button></div>
      <div class="grid g2">
        <div class="card tilt"><div class="row"><div class="ico sm">${I('cpu', 16)}</div><b>Procesador y equipo</b></div><div style="height:12px"></div>${dl([['Equipo', esc(s.model)], ['Procesador', esc(c.name || c)], ['Núcleos / hilos', c.cores ? `${c.cores} / ${c.threads}` : ''], ['Placa base', esc(s.board)], ['BIOS', esc(s.bios)], ['Tipo', s.laptop ? 'Portátil' : 'Escritorio'], ['Temp. CPU', s.cpuTempC ? s.cpuTempC + ' °C' : '']])}</div>
        <div class="card tilt"><div class="row"><div class="ico sm">${I('ram', 16)}</div><b>Memoria RAM</b></div><div style="height:12px"></div>${dl([['Capacidad', s.ramGB + ' GB'], ['Tipo', esc(s.ramType)], ['Velocidad', s.ramMHz ? s.ramMHz + ' MHz' + (s.ramRatedMHz && s.ramRatedMHz !== s.ramMHz ? ` (de serie ${s.ramRatedMHz})` : '') : ''], ['Módulos', s.ramModules]])}</div>
        <div class="card tilt"><div class="row"><div class="ico sm">${I('monitor', 16)}</div><b>Gráficos</b></div><div style="height:12px"></div>${(s.gpus || []).map((g) => dl([['GPU', esc(g.name)], ['VRAM', g.vramGB ? g.vramGB + ' GB' : ''], ['Driver', esc(g.driver)], ['Pantalla', g.res ? `${g.res} @ ${g.hz} Hz` : '']])).join('<hr style="border:0;border-top:1px solid var(--line);margin:10px 0">') || '<span class="muted">No detectada</span>'}</div>
        <div class="card tilt"><div class="row"><div class="ico sm">${I('disk', 16)}</div><b>Almacenamiento</b></div><div style="height:12px"></div>${(s.disks || []).map((d) => `<div class="row small" style="margin-bottom:6px"><span class="sp">${esc(d.name)}</span><span class="pill">${esc(d.type || d.bus || '')}</span><span>${d.sizeGB} GB</span></div>`).join('')}${(s.vols || []).map((v) => `<div style="margin-top:10px"><div class="row small"><span class="sp">${esc(v.letter)}:</span><span class="muted">${v.freeGB} GB libres de ${v.sizeGB} GB</span></div><div class="bar" style="margin-top:4px"><i style="width:${v.sizeGB ? Math.round(100 * (1 - v.freeGB / v.sizeGB)) : 0}%"></i></div></div>`).join('')}</div>
      </div>
      <div class="card" style="margin-top:14px"><div class="row"><div class="ico sm">${I('shield', 16)}</div><b>Sistema</b></div><div style="height:12px"></div>${dl([['Windows', esc(s.os) + (s.build ? ` · build ${s.build}` : '')], ['Plan de energía', esc(s.plan)], ['Programas al inicio', s.startupCount != null ? s.startupCount : ''], ['Encendido hace', s.uptimeH != null ? s.uptimeH + ' h' : ''], ['Monitor', s.refreshHz ? s.refreshHz + ' Hz' : '']])}</div>
      <h2>Recomendaciones</h2>${tipsHtml(hw.tips)}
      <h2>Qué consume más ahora <small>mide 1 segundo</small></h2><div id="procs" class="card"><span class="muted">Midiendo…</span></div>`);
    call('perf').then((p) => { if (S.page === 'mipc' && $('#procs')) $('#procs').innerHTML = `<div class="grid g2"><div><div class="eyebrow" style="margin-bottom:8px">MÁS CPU</div>${p.cpu.slice(0, 6).map((x) => `<div class="row small" style="padding:4px 0"><span class="sp">${esc(x.name)}</span><span class="mono">${x.cpu}%</span></div>`).join('')}</div><div><div class="eyebrow" style="margin-bottom:8px">MÁS RAM</div>${p.ram.slice(0, 6).map((x) => `<div class="row small" style="padding:4px 0"><span class="sp">${esc(x.name)}</span><span class="mono">${x.ramMB} MB</span></div>`).join('')}</div></div><div class="row" style="margin-top:12px"><button class="btn" id="ramFree">${I('refresh', 15)} Liberar y optimizar apps</button></div>`; }).catch(() => {});
  });
}

// ───────── MODOS ─────────
async function pageModos() {
  await getInfo();
  const render = (modes) => {
    const lap = isLaptop();
    setPage(`<h1>Modos</h1><p class="sub">Prepara tu PC para lo que vas a hacer. Cada modo agrupa ajustes y se deshace con «Normal».${lap ? ' <b style="color:var(--warn)">Detecté un portátil:</b> usa «Laptop Gaming» para jugar sin sobrecalentar.' : ''}</p>
    <div class="grid g3">${modes.map((m) => `
      <div class="card mode tilt ${m.active ? 'active' : ''}">
        <div class="row"><div class="ico">${I(m.icon, 20)}</div><span class="sp"></span>${m.recommended ? `<span class="pill vio">${I('star', 11)} Recomendado</span>` : ''}<span class="pill ${m.badge === 'Seguro' ? 'safe' : m.badge === 'Avanzado' ? 'medium' : 'advanced'}">${m.badge}</span></div>
        <h3>${esc(m.name)}</h3><div class="tag">${esc(m.tag)}</div><p>${esc(m.desc)}</p>
        ${m.warnLaptop ? `<div class="pill medium" style="align-self:flex-start">${I('alert', 11)} Puede sobrecalentar tu portátil</div>` : ''}
        ${m.count ? `<div class="bar"><i style="width:${Math.round(100 * m.on / m.count)}%"></i></div><small class="muted">${m.on} de ${m.count} ajustes activos${m.advanced ? ` · ${m.advanced} avanzados` : ''}</small>` : '<div style="height:18px"></div>'}
        <div class="row"><span class="sp"></span>${m.active ? `<span class="pill on">${I('check', 12)} Activo</span>` : `<button class="btn ${m.recommended ? 'primary' : 'light'}" data-mode="${m.id}">${I('bolt', 15)} Activar</button>`}</div>
      </div>`).join('')}</div>`);
  };
  setPage(skeleton(3));
  swr('modes', () => call('modesList'), render);
}
async function activateMode(btn, id) {
  const modes = (C.modes && C.modes.v) || await call('modesList'); const m = modes.find((x) => x.id === id); if (!m) return;
  if (m.badge !== 'Seguro' || m.warnLaptop) {
    const items = [m.badge === 'Riesgoso' ? 'Este modo desactiva mitigaciones de CPU y protecciones del kernel. <b>Solo para un PC de escritorio dedicado a juegos.</b>' : 'Incluye ajustes avanzados: fuerzan CPU/GPU y pueden subir consumo y calor.', m.warnLaptop ? '<b>Eres un portátil:</b> puede sobrecalentarse y bajar el rendimiento por temperatura. Para portátiles usa «Laptop Gaming».' : '', 'Se crea un punto de restauración y todo se puede deshacer desde «Normal» o el Historial.'].filter(Boolean);
    if (!(await dialog({ title: `Activar modo ${m.name}`, body: `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`, ok: 'Activar de todos modos', danger: m.badge === 'Riesgoso' }))) return;
  }
  return guard(btn, async () => { const r = await call('modesActivate', id); delete C.modes; delete C.tw; afterApply(r, `Modo ${m.name} activado (${r.count} ajustes)`); updateMode(); if (S.page === 'modos') pageModos(); else if (S.page === 'inicio') pageInicio(); });
}

// ───────── OPTIMIZACIÓN ─────────
const isOn = (t) => S.desired.has(t.id) ? S.desired.get(t.id) : t.status === 'on';
const pending = () => (C.tw ? C.tw.v.tweaks : []).filter((t) => t.status !== 'na' && isOn(t) !== (t.status === 'on'));
async function pageOptim() {
  setPage(`<h1>Optimización</h1><p class="sub">Activa lo que quieras y pulsa «Aplicar». Cada ajuste guarda tu valor original y se puede deshacer. Los ajustes se filtran según tu hardware (NVIDIA/AMD, portátil, Windows 11…).</p>
    <div class="toolbar"><button class="btn" id="selRec">${I('star', 15)} Recomendados</button><button class="btn" id="selSafe">${I('shield', 15)} Seguros</button>
      <input type="search" id="q" placeholder="Buscar ajuste…" value="${esc(S.q)}" style="width:170px">
      <select id="risk"><option value="all">Cualquier riesgo</option>${Object.entries(riskLabel).map(([k, v]) => `<option value="${k}" ${S.risk === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="only"><option value="all">Todos</option><option value="game" ${S.only === 'game' ? 'selected' : ''}>Ayudan en juegos</option><option value="rec" ${S.only === 'rec' ? 'selected' : ''}>Recomendados</option><option value="on" ${S.only === 'on' ? 'selected' : ''}>Aplicados</option><option value="off" ${S.only === 'off' ? 'selected' : ''}>No aplicados</option></select></div>
    <div class="twrap"><div class="cats" id="cats"></div><div><div id="twList">${skeleton(5).replace('padding-top:60px', 'padding-top:0')}</div><div id="applyBar"></div></div></div>`);
  swr('tw', () => call('tweaksList'), () => { drawCats(); drawList(); drawBar(); });
}
function drawCats() {
  const tw = C.tw && C.tw.v; if (!tw || !$('#cats')) return;
  const count = (c) => tw.tweaks.filter((t) => t.status !== 'na' && (c === 'all' || t.cat === c)).length;
  $('#cats').innerHTML = `<button data-cat="all" class="${S.cat === 'all' ? 'on' : ''}">Todos <em>${count('all')}</em></button>` + tw.categories.map((c) => `<button data-cat="${c.id}" class="${S.cat === c.id ? 'on' : ''}">${esc(c.name)} <em>${count(c.id)}</em></button>`).join('');
}
function drawList() {
  const tw = C.tw && C.tw.v; const el = $('#twList'); if (!tw || !el) return;
  const q = S.q.toLowerCase();
  const list = tw.tweaks.filter((t) => t.status !== 'na' && (S.cat === 'all' || t.cat === S.cat) && (S.risk === 'all' || t.risk === S.risk) && (S.only === 'all' || (S.only === 'game' && t.tier > 0) || (S.only === 'rec' && t.rec) || (S.only === 'on' && t.status === 'on') || (S.only === 'off' && t.status !== 'on')) && (!q || (t.name + ' ' + t.desc).toLowerCase().includes(q)));
  const short = (d) => { const i = d.search(/[.!?](\s|$)/); return i > 0 && i < 170 ? d.slice(0, i + 1) : d.length > 170 ? d.slice(0, 167) + '…' : d; };
  el.innerHTML = list.map((t) => {
    const open = S.openMore.has(t.id);
    return `<div class="tw ${isOn(t) !== (t.status === 'on') ? 'changed' : ''}" data-id="${t.id}">
      <div class="tw-t"><b>${esc(t.name)}</b></div><label class="sw ${t.status === 'partial' && !S.desired.has(t.id) ? 'part' : ''}"><input type="checkbox" data-tw="${t.id}" ${isOn(t) ? 'checked' : ''}><i></i></label><button class="more" data-more="${t.id}" title="Detalles">${I('chevron', 16)}</button>
      <p>${esc(short(t.desc))}</p>
      <div class="tags"><span class="pill ${t.risk}">${riskLabel[t.risk]}</span>${t.rec ? `<span class="pill vio">${I('star', 10)} Recomendado</span>` : ''}${t.req ? `<span class="pill info">${reqLabel[t.req] || t.req}</span>` : ''}${t.reboot ? '<span class="pill info">Reinicio</span>' : ''}${t.relog ? '<span class="pill info">Cerrar sesión</span>' : ''}${t.status === 'on' ? `<span class="pill on">${I('check', 10)} Aplicado</span>` : t.status === 'partial' ? '<span class="pill partial">En parte</span>' : ''}</div>
      ${open ? `<div class="tw-detail">${esc(t.desc)}${t.warn ? `<div class="w">⚠ ${esc(t.warn)}</div>` : ''}</div>` : ''}</div>`;
  }).join('') || '<div class="empty">Nada coincide con el filtro.</div>';
}
function drawBar() {
  const el = $('#applyBar'); if (!el) return; const p = pending();
  el.innerHTML = p.length ? `<div class="applybar"><b>${p.length} cambio(s) pendientes</b><span class="muted small">${p.filter((x) => isOn(x) && x.risk === 'advanced').length ? '· incluye avanzados' : ''}</span><span class="sp"></span><button class="btn ghost" id="discard">Descartar</button><button class="btn primary" id="applyBtn">${I('check', 16)} Aplicar cambios</button></div>` : '';
}
async function applyPending(btn) {
  const p = pending(); if (!p.length) return;
  const on = p.filter(isOn), off = p.filter((x) => !isOn(x)); const adv = on.filter((x) => x.risk === 'advanced');
  if (adv.length && !(await dialog({ title: 'Ajustes avanzados', body: `<p>Vas a aplicar ajustes con riesgo:</p><ul>${adv.map((x) => `<li><b>${esc(x.name)}</b>${x.warn ? `<br><span style="color:var(--warn)">⚠ ${esc(x.warn)}</span>` : ''}</li>`).join('')}</ul><p>Se crea un punto de restauración y puedes deshacerlos cuando quieras.</p>`, ok: 'Aplicar', danger: true }))) return;
  return guard(btn, async () => {
    let r1 = { failed: [] }, r2 = { failed: [] };
    if (on.length) r1 = await call('apply', on.map((x) => x.id)); if (off.length) r2 = await call('revert', off.map((x) => x.id));
    const bad = new Set([...(r1.failed || []), ...(r2.failed || [])].map((f) => f.id));
    for (const t of p) if (!bad.has(t.id)) { t.status = isOn(t) ? 'on' : 'off'; t.touched = isOn(t); }
    S.desired.clear(); const tw = C.tw.v; const rec = tw.tweaks.filter((t) => t.rec && t.status !== 'na'); tw.score = rec.length ? Math.round(100 * rec.filter((t) => t.status === 'on').length / rec.length) : 0; tw.recommendedOn = rec.filter((t) => t.status === 'on').length;
    afterApply({ reboot: r1.reboot || r2.reboot, failed: [...(r1.failed || []), ...(r2.failed || [])] }, `${p.length} cambio(s) aplicados`); drawList(); drawBar();
    call('tweaksList').then((v) => { C.tw = { v, at: Date.now() }; if (S.page === 'optimizacion' && !S.desired.size) { drawCats(); drawList(); } }).catch(() => {});
  });
}

// ───────── CENTRO DE JUEGOS ─────────
async function pageJuegos() {
  const draw = (g) => {
    const s = g.settings, o = s.gameOpts, sess = new Map(g.sessions.map((x) => [x.pid, x]));
    const sw = (key, v, group) => `<label class="sw"><input type="checkbox" data-set="${key}" ${group ? 'data-grp="1"' : ''} ${v ? 'checked' : ''}><i></i></label>`;
    setPage(`<h1>Centro de juegos</h1><p class="sub">Detecta tus juegos al abrirlos, los optimiza solo y muestra FPS, ping y temperatura en pantalla. Al cerrarlos todo vuelve a como estaba.</p>
      <div class="card"><div class="row"><div class="ico">${I('gamepad', 20)}</div><div class="sp"><b>Juegos abiertos ahora</b><div class="small muted">${g.known}+ juegos conocidos y cualquiera dentro de carpetas de Steam, Epic, Riot, Xbox, EA, Ubisoft, Battle.net y Roblox.</div></div><button class="btn" id="scanGames">${I('search', 15)} Buscar otros</button></div>
        <div style="margin-top:14px">${g.running.length ? g.running.map((r) => { const x = sess.get(r.pid); const st = x ? x.status : 'detectado'; return `<div class="item"><div class="ico sm">${I('gamepad', 15)}</div><div class="sp"><b>${esc(r.name)}</b><small class="mono">${esc(r.exe)} · PID ${r.pid}</small>${x && x.applied && x.applied.length ? `<small>${esc(x.applied.join(' · '))}</small>` : ''}${x && x.error ? `<small style="color:var(--bad)">${esc(x.error)}</small>` : ''}</div><span class="pill ${st === 'optimizado' ? 'on' : st === 'error' ? 'bad' : 'info'}">${esc(st)}</span><button class="btn primary" data-gopt="${r.pid}">${I('bolt', 15)} Optimizar</button></div>`; }).join('') : `<div class="empty">${I('gamepad', 28)}<div style="margin-top:8px">No hay ningún juego abierto.<br><span class="small">Ábrelo y aparecerá aquí en unos segundos. Si no lo detecta, usa «Buscar otros» o añade su .exe abajo.</span></div></div>`}<div id="scanOut"></div></div></div>
      <div class="grid g2" style="margin-top:14px">
        <div class="card"><div class="row"><div class="ico sm">${I('eye', 16)}</div><b class="sp">Overlay en pantalla</b><button class="btn ${S.overlay ? 'danger' : 'primary'}" id="ovToggle">${S.overlay ? 'Ocultar' : 'Mostrar'} overlay</button></div>
          <p class="small muted" style="line-height:1.5">FPS, 1% low, ping, CPU, GPU y temperatura arriba a la izquierda, semitransparente y sin molestar al ratón. Atajo: <kbd>Ctrl</kbd> <kbd>Mayús</kbd> <kbd>O</kbd>. Se ve en juegos en <b>ventana o sin bordes</b>; en pantalla completa exclusiva Windows puede taparlo.</p>
          <div class="sett"><div class="sp"><b>Mostrar al detectar un juego</b></div>${sw('overlayAuto', s.overlayAuto)}</div>
          <div class="sett"><div class="sp"><b>Esquina</b></div><select id="corner"><option value="tl" ${s.overlayCorner === 'tl' ? 'selected' : ''}>Arriba izquierda</option><option value="tr" ${s.overlayCorner === 'tr' ? 'selected' : ''}>Arriba derecha</option><option value="bl" ${s.overlayCorner === 'bl' ? 'selected' : ''}>Abajo izquierda</option><option value="br" ${s.overlayCorner === 'br' ? 'selected' : ''}>Abajo derecha</option></select></div>
          <div class="sett"><div class="sp"><b>Medidor de FPS</b><small>${g.fpsInstalled ? 'Instalado (PresentMon, de Intel).' : 'Necesita PresentMon (Intel, código abierto). Se descarga una sola vez desde GitHub.'}${g.fpsError ? `<br><span style="color:var(--warn)">${esc(g.fpsError)}</span>` : ''}</small></div>${g.fpsInstalled ? '<span class="pill on">Listo</span>' : `<button class="btn primary" id="fpsInstall">${I('download', 15)} Instalar</button>`}</div></div>
        <div class="card"><div class="row"><div class="ico sm">${I('bolt', 16)}</div><b class="sp">Qué se aplica a cada juego</b></div>
          <div class="sett"><div class="sp"><b>Detectar juegos automáticamente</b></div>${sw('autoDetect', s.autoDetect)}</div>
          <div class="sett"><div class="sp"><b>Optimizar al abrirlos</b><small>Usa la plantilla de abajo, se revierte al cerrar.</small></div>${sw('autoOptimize', s.autoOptimize)}</div>
          <div class="sett"><div class="sp"><b>Prioridad de CPU alta</b></div>${sw('priority', o.priority, 1)}</div>
          <div class="sett"><div class="sp"><b>Usar la GPU dedicada</b><small>Evita que el juego corra en la gráfica integrada (portátiles).</small></div>${sw('gpuHigh', o.gpuHigh, 1)}</div>
          <div class="sett"><div class="sp"><b>Pantalla completa clásica</b><small>Menos input lag en juegos DX11.</small></div>${sw('fso', o.fso, 1)}</div>
          <div class="sett"><div class="sp"><b>Liberar RAM al abrir</b></div>${sw('ram', o.ram, 1)}</div>
          <div class="sett"><div class="sp"><b>Bajar prioridad de Discord, Steam y Epic</b><small>Mientras juegas no te quitan CPU. Se restaura al cerrar el juego.</small></div>${sw('bgLow', o.bgLow, 1)}</div>
          <div class="sett"><div class="sp"><b>Cerrar apps de fondo inútiles</b><small>OneDrive, Teams, Skype, Widgets, Adobe… no Discord ni Steam.</small></div>${sw('killBg', o.killBg, 1)}</div>
          <div class="sett"><div class="sp"><b>Vaciar la memoria en espera</b><small>Cada 45 s si hace falta. Evita los tirones por RAM llena de caché vieja.</small></div>${sw('standby', o.standby, 1)}</div>
          <div class="sett"><div class="sp"><b>Mantener la prioridad siempre</b><small>Aunque cierres Sveqzz Optimizer.</small></div>${sw('persist', o.persist, 1)}</div></div></div>
      <div class="card" style="margin-top:14px"><div class="row wrap"><div class="ico">${I('flame', 20)}</div><div class="sp"><b>Fortnite · máximo FPS</b><div class="small muted" style="line-height:1.5">Edita la configuración de Fortnite (con copia de seguridad): Modo Rendimiento (DX11), sombras, efectos y post-proceso en bajo, sin VSync ni límite de FPS, sin desenfoque. ${g.fn && !g.fn.installed ? '<br>Abre Fortnite una vez para que exista su configuración.' : ''} Cierra Fortnite antes de aplicar.</div></div>${g.fn && g.fn.applied ? `<span class="pill on">✓ Aplicado</span><button class="btn ghost" id="fnRestore">${I('undo', 14)} Restaurar</button>` : ''}<button class="btn primary" id="fnApply" ${g.fn && g.fn.installed ? '' : 'disabled'}>${I('bolt', 14)} Aplicar perfil</button></div></div>
      <h2>Perfiles de juego <small>por si un juego no se detecta</small></h2>
      <div class="card"><div class="row wrap"><button class="btn primary" id="pPick">${I('download', 15)} Elegir .exe del juego…</button><input type="text" id="pExe" placeholder="o escribe: juego.exe" style="width:200px"><input type="text" id="pName" placeholder="Nombre (opcional)" style="width:220px"><button class="btn" id="pAdd">${I('check', 15)} Añadir</button><span class="sp"></span><button class="btn ghost" id="gUndo">${I('undo', 15)} Quitar optimizaciones de juegos</button></div>
        <div style="margin-top:12px">${g.profiles.map((p) => `<div class="item"><div class="sp"><b>${esc(p.name)}</b><small class="mono">${esc(p.exe)}</small></div><button class="btn ghost" data-prm="${esc(p.exe)}">${I('x', 15)} Quitar</button></div>`).join('') || '<span class="muted small">Sin perfiles todavía.</span>'}</div></div>`);
  };
  setPage(skeleton(3));
  const refresh = async () => { if (S.page !== 'juegos') return; if (document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName)) return; const g = await call('gamesState'); const prev = JSON.stringify(C.g && C.g.v); C.g = { v: g, at: Date.now() }; if (JSON.stringify(g) !== prev) { const y = $('#main').scrollTop; draw(g); $('#main').scrollTop = y; } };
  await refresh(); pollTimer = setInterval(() => refresh().catch(() => {}), 3000);
}

// ───────── LIMPIEZA ─────────
async function pageLimpieza() {
  setPage('<h1>Limpieza</h1><p class="sub">Mide cuánto ocupa cada cosa y borra solo lo que elijas. Nunca toca contraseñas, historial ni tus juegos.</p>' + skeleton(5));
  const draw = (list) => {
    if (!S.cleanInit) { S.cleanSel = new Set(list.filter((c) => c.def && c.size > 0).map((c) => c.id)); S.cleanInit = true; }
    const total = list.filter((c) => S.cleanSel.has(c.id)).reduce((a, c) => a + c.size, 0);
    setPage(`<h1>Limpieza</h1><p class="sub">Mide cuánto ocupa cada cosa y borra solo lo que elijas. Nunca toca contraseñas, historial ni tus juegos.</p>
      <div class="row wrap" style="margin-bottom:6px"><div class="sp"><div class="eyebrow">PARA LIBERAR</div><div style="font-size:30px;font-weight:700">${fmtBytes(total)}</div></div><button class="btn" id="cScan">${I('refresh', 15)} Medir</button><button class="btn primary" id="cRun">${I('trash', 15)} Limpiar lo marcado</button></div>
      <div class="row wrap" style="margin:12px 0 16px"><button class="btn" id="cBin">Vaciar papelera</button><button class="btn" id="cDns">Vaciar caché DNS</button><button class="btn" id="ramFree">${I('ram', 15)} Liberar RAM</button><button class="btn" id="cLarge">Archivos grandes</button></div>
      ${list.map((c) => `<label class="item"><input type="checkbox" class="check" data-cl="${c.id}" ${S.cleanSel.has(c.id) ? 'checked' : ''}><div class="sp"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small></div><span class="mono muted">${fmtBytes(c.size)} · ${c.files} archivos</span></label>`).join('')}<div id="largeBox"></div>`);
  };
  swr('clean', () => call('cleanScan'), draw);
}

// ───────── RED ─────────
function drawChart(canvas, data, color = '#3b9cff', max) {
  if (!canvas) return; const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return; canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const vals = data.filter((v) => v != null); if (!vals.length) return; const mx = max || Math.max(...vals) * 1.15 || 1;
  g.strokeStyle = color; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); let st = false;
  data.forEach((v, i) => { if (v == null) { st = false; return; } const x = (i / Math.max(1, data.length - 1)) * w, y = h - 3 - (v / mx) * (h - 8); st ? g.lineTo(x, y) : g.moveTo(x, y); st = true; });
  g.stroke(); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = color + '24'; g.fill();
}
function pageRed() {
  const n = S.net;
  setPage(`<h1>Red y ping</h1><p class="sub">Mide tu ping real, compara DNS y mira cómo llegas a cada región de servidores.</p>
  <div class="card"><div class="row"><div class="sp"><b>Latencia por paquete</b><div class="small muted">Conexión TCP a Cloudflare (1.1.1.1). Funciona aunque ICMP esté bloqueado.</div></div><button class="btn primary" id="pingBtn">${I('play', 14)} Medir 40 paquetes</button></div>
    <canvas class="chart" id="pingChart" style="margin:14px 0"></canvas>
    <div class="grid g4">${[['PING MEDIO', n.ping && fmtMs(n.ping.avg)], ['JITTER', n.ping && fmtMs(n.ping.jitter)], ['PÉRDIDA', n.ping && n.ping.loss.toFixed(0) + ' %'], ['MÍN / MÁX / P95', n.ping && [n.ping.min, n.ping.max, n.ping.p95].map((v) => v == null ? '—' : v.toFixed(0)).join(' / ')]].map(([k, v]) => `<div class="stat"><b>${v || '—'}</b><span>${k}</span></div>`).join('')}</div></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="row"><div class="sp"><b>DNS más rápido</b><div class="small muted">Compara servidores y elige el que responde antes.</div></div><button class="btn" id="dnsBtn">Medir</button></div>
      <div style="margin-top:10px">${(n.dns || []).map((d) => `<div class="dnsrow"><div class="sp"><b>${esc(d.name)}</b><div class="mono dim">${esc(d.servers.join(', '))}</div></div><span class="mono">${fmtMs(d.ms)}</span>${d.id !== 'current' ? `<button class="btn" data-dns="${d.id}">Usar</button>` : ''}</div>`).join('') || '<p class="small muted">Pulsa Medir.</p>'}</div>${n.dns ? `<button class="btn ghost" id="dnsReset" style="margin-top:8px">${I('undo', 14)} Volver al DNS original</button>` : ''}</div>
    <div class="card"><div class="row"><div class="sp"><b>Ping por región</b><div class="small muted">Contra servidores públicos de AWS (donde corren la mayoría de juegos).</div></div><button class="btn" id="regBtn">Medir</button></div>
      <div style="margin-top:10px">${(n.regions || []).map((r) => `<div class="dnsrow"><span class="sp">${esc(r.name)}</span><span class="mono">${fmtMs(r.ms)}</span></div>`).join('') || '<p class="small muted">Pulsa Medir.</p>'}</div></div></div>
  <p class="small muted" style="margin-top:16px">Si tu ping sube cuando alguien descarga, activa «QoS» o «Smart Queue» en tu router: eso no se puede hacer desde Windows.</p>`);
  if (n.ping) drawChart($('#pingChart'), n.ping.samples);
}

// ───────── INICIO DE WINDOWS ─────────
async function pageArranque() {
  setPage('<h1>Inicio de Windows</h1><p class="sub">Programas que arrancan con tu PC.</p>' + skeleton(4));
  swr('startup', () => call('startupList'), (list) => setPage(`<h1>Inicio de Windows</h1><p class="sub">Programas que arrancan con tu PC. Desactivar uno no lo desinstala: puedes volver a activarlo cuando quieras. <b>${list.filter((s) => s.enabled).length}</b> activos de ${list.length}.</p>
    ${list.map((s) => `<div class="item"><div class="ico sm">${I('power', 15)}</div><div class="sp"><b>${esc(s.name)}</b><small class="mono">${esc(s.cmd.length > 100 ? s.cmd.slice(0, 100) + '…' : s.cmd)}</small></div><span class="pill">${esc(s.scope)}</span><label class="sw"><input type="checkbox" data-su="${esc(s.id)}" ${s.enabled ? 'checked' : ''}><i></i></label></div>`).join('') || '<div class="empty">No hay programas en el registro de inicio.</div>'}`));
}

// ───────── PROCESOS Y SERVICIOS ─────────
const LV = { known: ['Recomendado cerrar', 'on'], app: ['Programa', 'info'], protected: ['Protegido', 'advanced'], system: ['Windows', ''] };
async function pageProcesos() {
  const draw = (list) => {
    const q = S.pq.toLowerCase();
    let l = list.filter((i) => (!q || (i.name + i.title + i.tech).toLowerCase().includes(q)) && (S.pf === 'all' || (S.pf === 'rec' && (i.byUs || i.level === 'known' || (i.level === 'app' && i.canDisable))) || (S.pf === 'prot' && (i.level === 'protected' || i.level === 'system'))));
    const total = l.length; l = l.slice(0, 120);
    setPage(`<h1>Procesos y servicios</h1><p class="sub">Todo lo que corre en tu PC, con una explicación. Los procesos de Windows, antivirus, drivers y anti-cheat están <b>protegidos</b>: no se pueden tocar. Lo que desactivas se guarda y se puede reactivar.</p>
    <div class="toolbar"><input type="search" id="pq" placeholder="Buscar proceso o servicio…" value="${esc(S.pq)}"><select id="pf"><option value="rec" ${S.pf === 'rec' ? 'selected' : ''}>Recomendados y apps</option><option value="all" ${S.pf === 'all' ? 'selected' : ''}>Todos</option><option value="prot" ${S.pf === 'prot' ? 'selected' : ''}>Protegidos y Windows</option></select><span class="sp"></span><span class="small muted">${total} elemento(s)</span></div>
    ${l.map((i) => `<div class="item pr ${i.disabled ? 'off' : ''}"><div class="ico sm">${I(i.kind === 'svc' ? 'settings' : 'cpu', 15)}</div><div class="sp"><b>${esc(i.title)} ${i.kind === 'svc' ? '<span class="pill">servicio</span>' : ''}${i.count > 1 ? `<span class="muted small"> ×${i.count}</span>` : ''}</b><small>${esc(i.msg)}</small>${i.warn ? '<small style="color:var(--warn)">⚠ Solo si no usas Xbox / Game Pass.</small>' : ''}</div>
      ${i.mb ? `<span class="mono muted">${i.mb} MB</span>` : ''}<span class="pill ${LV[i.level][1]}">${LV[i.level][0]}</span>
      ${i.byUs ? `<button class="btn" data-pr="${esc(i.id)}">${I('undo', 14)} Reactivar</button>` : i.disabled ? '<span class="pill">Desactivado</span>' : `${i.canKill ? `<button class="btn ghost" data-pk="${esc(i.name)}">Cerrar ahora</button>` : ''}${i.canDisable ? `<button class="btn primary" data-pd="${esc(i.id)}" data-pt="${esc(i.title)}">Desactivar siempre</button>` : ''}`}</div>`).join('') || '<div class="empty">Nada coincide.</div>'}${total > 120 ? '<p class="small muted">Mostrando 120. Usa la búsqueda para ver más.</p>' : ''}`);
  };
  setPage('<h1>Procesos y servicios</h1>' + skeleton(6));
  S.pdraw = draw; await swr('procs', () => call('procsList'), draw);
}

// ───────── PRIORIDAD DE DISPOSITIVOS ─────────
async function pageDispositivos() {
  setPage('<h1>Prioridad de dispositivos</h1>' + skeleton(4));
  await swr('devs', () => call('devicesList'), (list) => setPage(`<h1>Prioridad de dispositivos</h1><p class="sub">Da prioridad máxima a lo que tienes conectado ahora: tu Wi-Fi o cable, ratón, teclado, mando y gráfica. Quita el ahorro de energía que los «duerme», sube la prioridad de sus interrupciones y, en red, hace que sea tu ruta principal. Se puede restaurar.</p>
    ${list.map((d) => `<div class="item"><div class="ico sm">${I(d.kind === 'Wi-Fi' || d.kind === 'Ethernet' ? 'wifi' : d.kind === 'Gráfica' ? 'monitor' : d.kind === 'Mando' ? 'gamepad' : 'bolt', 15)}</div><div class="sp"><b>${esc(d.name)}</b><small>${esc(d.kind)}${d.ifName ? ' · ' + esc(d.ifName) : ''}${d.up === false ? ' · desconectado' : ''}</small></div>${d.boosted ? `<span class="pill on">✓ Prioridad máxima</span><button class="btn ghost" data-dvr="${esc(d.id)}">${I('undo', 14)} Restaurar</button>` : `<button class="btn primary" data-dv="${esc(d.id)}">${I('bolt', 14)} Dar prioridad máxima</button>`}</div>`).join('') || '<div class="empty">No encontré dispositivos compatibles.</div>'}
    <p class="small muted" style="margin-top:12px">Algunos cambios (interrupciones de la gráfica o la tarjeta de red) se aplican al reiniciar Windows.</p>`));
}

// ───────── STEAM, EPIC Y DISCORD ─────────
async function pageLaunchers() {
  setPage('<h1>Steam, Epic y Discord</h1>' + skeleton(3));
  const meta = { steam: ['Steam', 'Libera espacio de logs, caché de la tienda y descargas incompletas (solo con Steam cerrado). Mientras juegas, Steam y su navegador pasan a segundo plano.', 'La velocidad de descarga depende sobre todo de tu internet: en Steam → Ajustes → Descargas elige la región más cercana, y en «Red y ping» prueba un DNS más rápido.'], epic: ['Epic Games Launcher', 'Borra logs, informes de fallos y caché web del launcher. Mientras juegas, el launcher pasa a segundo plano.', 'Para que no arranque con Windows desactívalo en «Inicio de Windows».'], discord: ['Discord', 'Limpia su caché y desactiva la aceleración por hardware (usa menos GPU mientras juegas). Mientras juegas, Discord baja de prioridad.', 'Ciérralo del todo (icono de la bandeja → Salir) antes de optimizarlo.'] };
  await swr('launch', () => call('launchersState'), (st) => setPage(`<h1>Steam, Epic y Discord</h1><p class="sub">Optimiza los launchers que más espacio y recursos gastan. Nunca toca tus juegos ni tus cuentas.</p>
  <div class="grid g3">${['steam', 'epic', 'discord'].map((id) => { const x = st[id], m = meta[id]; return `<div class="card tilt"><div class="row"><div class="ico">${I(id === 'discord' ? 'discord' : 'gamepad', 20)}</div><b class="sp" style="font-size:16px">${m[0]}</b>${x.installed ? (x.running ? '<span class="pill info">Abierto</span>' : '<span class="pill">Cerrado</span>') : '<span class="pill">No instalado</span>'}</div>
    <p class="small muted" style="line-height:1.5">${m[1]}</p><div class="stat" style="text-align:left"><b>${fmtBytes(x.reclaimable)}</b><span>RECUPERABLE</span></div>
    ${id === 'steam' && x.shaderBytes ? `<p class="small muted">Además, la caché de shaders ocupa ${fmtBytes(x.shaderBytes)} (opcional en Limpieza).</p>` : ''}${id === 'discord' && x.hwAccelOff ? '<p class="small" style="color:var(--ok)">✓ Aceleración por hardware desactivada</p>' : ''}
    <p class="small muted">${m[2]}</p><div class="row wrap"><button class="btn primary" data-la="${id}" ${x.installed ? '' : 'disabled'}>${I('bolt', 14)} Optimizar</button>${id === 'discord' && x.optimized ? `<button class="btn ghost" data-lr="discord">${I('undo', 14)} Restaurar</button>` : ''}</div></div>`; }).join('')}</div>`));
}

// ───────── ACTUALIZACIONES (DRIVERS) ─────────
async function pageDrivers() {
  setPage('<h1>Actualizaciones</h1><p class="sub">Buscando tus drivers…</p>' + skeleton(4));
  const r = await call('driversScan');
  const row = (d) => `<div class="item"><div class="ico sm">${I(d.status === 'old' ? 'alert' : 'check', 15)}</div><div class="sp"><b>${esc(d.name)}</b><small class="mono">${esc(d.cls)} · v${esc(d.version)}${d.date ? ' · ' + esc(d.date) : ''}</small></div><span class="pill ${d.status === 'old' ? 'advanced' : 'safe'}">${d.status === 'old' ? 'Conviene actualizar' : 'Al día'}</span><button class="btn ${d.status === 'old' ? 'primary' : 'ghost'}" data-open="${esc(d.link)}">${I('download', 14)} ${d.status === 'old' ? 'Descargar' : 'Buscar'} (${esc(d.linkName)})</button></div>`;
  setPage(`<h1>Actualizaciones</h1><p class="sub">Drivers instalados, dispositivos sin driver y descargas oficiales. Actualizar el driver de la gráfica es lo que más FPS puede darte; usa instalación personalizada «limpia» y reinicia.</p>
  ${r.missing.length ? `<h2 style="margin-top:0">Sin driver o con error (${r.missing.length})</h2>${r.missing.map((m) => `<div class="item"><div class="ico sm">${I('alert', 15)}</div><div class="sp"><b>${esc(m.name)}</b><small class="mono">Código ${m.code}</small></div><button class="btn primary" data-open="${esc(m.link)}">${I('download', 14)} Cómo instalar</button></div>`).join('')}` : ''}
  <h2${r.missing.length ? '' : ' style="margin-top:0"'}>${r.old ? r.old + ' por actualizar' : 'Todo al día'}</h2>
  ${r.drivers.length ? r.drivers.map(row).join('') : '<div class="card"><div class="empty">No pude leer los drivers.</div></div>'}
  <div class="row" style="margin-top:14px"><button class="btn" data-go="drivers">${I('refresh', 15)} Volver a buscar</button></div>`);
}

// ───────── HERRAMIENTAS (apps, benchmark, autoprueba) ─────────
const benchRow = (l, a, b, low) => { const d = a != null && b != null ? (b - a) / a * 100 : null; const good = d != null && (low ? d < -1 : d > 1); const bad = d != null && (low ? d > 1 : d < -1); return `<tr><td>${l}</td><td>${a ?? '–'}</td><td>${b ?? '–'}</td><td style="color:${good ? 'var(--ok)' : bad ? 'var(--bad)' : 'var(--muted)'}">${d == null ? '' : (d > 0 ? '+' : '') + d.toFixed(1) + '%'}</td></tr>`; };
function benchHtml(b) {
  const x = b.before, y = b.after;
  if (!x) return '<div class="muted small">Aún no hay medición. Pulsa «Medir ahora (antes)», aplica un modo, reinicia y pulsa «Medir (después)».</div>';
  return `<table class="tbl" style="width:100%;text-align:left"><tr><th>Medida</th><th>Antes</th><th>Después</th><th>Cambio</th></tr>${benchRow('CPU (ms, menos es mejor)', x.cpuMs, y && y.cpuMs, 1)}${benchRow('Memoria (GB/s)', x.memGBs, y && y.memGBs, 0)}${benchRow('Temporizador medio (ms, ~input lag)', x.timerAvg, y && y.timerAvg, 1)}${benchRow('Temporizador p95 (ms)', x.timerP95, y && y.timerP95, 1)}${benchRow('Ping 1.1.1.1 (ms)', x.ping, y && y.ping, 1)}</table>`;
}
async function pageTools() {
  setPage('<h1>Herramientas</h1>' + skeleton(3));
  const [apps, bench] = await Promise.all([call('toolsApps').catch(() => []), call('benchGet')]);
  setPage(`<h1>Herramientas</h1><p class="sub">Quita apps que no usas, mide cuánto mejora tu PC y comprueba que los ajustes funcionan en tu equipo.</p>
  <div class="card"><div class="row"><div class="ico">${I('bolt', 18)}</div><div class="sp"><b>Prueba de rendimiento (antes / después)</b><div class="small muted">Mide CPU, memoria, precisión del temporizador (input lag) y ping. Mide antes de optimizar y otra vez después de reiniciar.</div></div><button class="btn" id="bBefore">Medir (antes)</button><button class="btn primary" id="bAfter">Medir (después)</button></div><div id="benchOut" style="margin-top:12px">${benchHtml(bench)}</div></div>
  <h2>Quitar apps preinstaladas</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Se quitan solo de tu usuario. Si te arrepientes, las reinstalas desde Microsoft Store.</div>
  ${apps.length ? apps.map((a) => `<label class="sett" style="cursor:pointer"><input type="checkbox" class="appchk" value="${esc(a.id)}"><span class="sp"><b>${esc(a.name)}</b></span></label>`).join('') + `<div class="row" style="margin-top:12px"><button class="btn danger" id="tRemove">${I('trash', 15)} Quitar las marcadas</button></div>` : '<div class="muted">No se encontraron apps para quitar.</div>'}</div>
  <h2>Probar los ajustes en este PC</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Aplica cada ajuste apagado, comprueba que funcionó y lo revierte. No toca los que ya tienes activos ni los avanzados. Tarda unos minutos; puedes copiar el informe y mandármelo.</div><div class="row"><button class="btn primary" id="tTest">${I('check', 15)} Probar ajustes</button><span id="tProg" class="small muted"></span></div><pre id="tOut" class="mono small" style="white-space:pre-wrap;margin-top:10px"></pre></div>`);
}
async function runTest(btn) {
  const ids = await call('testIds'); const rep = { ok: 0, failApply: [], failRevert: [], error: [] };
  for (let i = 0; i < ids.length; i += 20) {
    if (S.page !== 'herramientas') return;
    $('#tProg').textContent = `Probando ${Math.min(i + 20, ids.length)} de ${ids.length}…`;
    const r = await call('testRun', ids.slice(i, i + 20)); rep.ok += r.ok.length; for (const k of ['failApply', 'failRevert', 'error']) rep[k].push(...r[k]);
  }
  delete C.tw;
  const txt = `Ajustes que funcionan: ${rep.ok}\nNo se aplicaron (${rep.failApply.length}): ${rep.failApply.map((x) => x.id).join(', ') || '—'}\nNo se revirtieron (${rep.failRevert.length}): ${rep.failRevert.map((x) => x.id).join(', ') || '—'}\nErrores (${rep.error.length}): ${rep.error.map((x) => x.id + ' ' + x.msg).join('; ') || '—'}`;
  $('#tProg').textContent = 'Listo'; $('#tOut').textContent = txt;
  try { await navigator.clipboard.writeText(txt); toast('Informe copiado al portapapeles', 'ok'); } catch { /* */ }
}

// ───────── DIAGNÓSTICO DE CRASHES ─────────
async function pageCrashes() {
  setPage('<h1>Diagnóstico de crashes</h1><p class="sub">Leyendo el visor de eventos de Windows (puede tardar unos segundos)…</p>' + skeleton(3));
  const r = await call('crashesScan'); const when = (t) => new Date(t).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  setPage(`<h1>Diagnóstico de crashes</h1><p class="sub">Revisa los últimos 14 días: pantallazos azules, reinicios bruscos, fallos del driver de la gráfica y reportes de Fortnite. Te dice qué ajuste de los que activaste es sospechoso.</p>
  ${r.total === 0 && !r.fortnite.length ? `<div class="card"><div class="empty">${I('check', 28)}<div style="margin-top:8px">No hay crashes registrados en los últimos 14 días.</div></div></div>` : ''}
  ${r.reasons.length ? `<h2 style="margin-top:0">Qué le pasó a tu PC</h2>${r.reasons.map((x) => `<div class="item"><div class="ico sm">${I('alert', 15)}</div><div class="sp"><b>${esc(x.text)}</b><small class="mono">${esc(x.code)} · ${x.n} vez/veces</small></div></div>`).join('')}` : ''}
  ${r.suspects.length ? `<h2>Ajustes sospechosos que tienes activos</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Según el tipo de fallo, estos ajustes pueden estar involucrados. Revierte los de mayor riesgo primero y prueba.</div>${r.suspects.map((x) => `<div class="blk-it"><span class="dot on"></span><span class="sp">${esc(x.name)}</span><span class="pill ${x.risk}">${riskLabel[x.risk]}</span></div>`).join('')}<div class="row" style="margin-top:12px"><button class="btn danger" data-crev="${r.suspects.map((x) => x.id).join(',')}">${I('undo', 15)} Revertir los ${r.suspects.length} sospechosos</button></div></div>` : (r.reasons.length ? '<p class="muted">Ninguno de tus ajustes activos coincide con el tipo de fallo: probablemente sea temperatura, fuente de alimentación o el driver.</p>' : '')}
  ${r.app.length ? `<h2>Cierres de juegos</h2>${r.app.map((a) => `<div class="item"><div class="sp"><b>${esc(a.app)}</b><small class="mono">${when(a.t)} · módulo ${esc(a.mod)} · excepción ${esc(a.exc)}</small></div></div>`).join('')}` : ''}
  ${r.hint ? `<div class="banner" style="margin:12px 0 0">${I('info', 16)}<span>${esc(r.hint)}</span></div>` : ''}
  ${r.fortnite.length ? `<h2>Reportes de Fortnite</h2>${r.fortnite.map((a) => `<div class="item"><div class="sp"><b>${esc(a.msg || a.name)}</b><small class="mono">${when(a.t)}</small></div></div>`).join('')}` : ''}
  <div class="row" style="margin-top:14px"><button class="btn" data-go="crashes">${I('refresh', 15)} Volver a analizar</button></div>`);
}

// ───────── HISTORIAL ─────────
async function pageHist() {
  setPage('<h1>Historial de cambios</h1>' + skeleton(4));
  const [blocks, tw] = await Promise.all([call('historyBlocks'), call('tweaksList')]); C.tw = { v: tw, at: Date.now() };
  const touched = tw.tweaks.filter((t) => t.touched).length;
  const kindIco = { modo: 'layers', manual: 'sliders', auto: 'bolt' };
  const fmt = (t) => new Date(t).toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  setPage(`<h1>Historial de cambios</h1><p class="sub">Cada cambio que hizo Sveqzz Optimizer, con su fecha. Puedes deshacer cualquiera con un clic. ${touched} ajuste(s) siguen activos.</p>
  <div class="row wrap" style="margin-bottom:16px"><button class="btn danger" id="undoAll" ${touched ? '' : 'disabled'}>${I('undo', 15)} Restaurar todo lo de Sveqzz</button><button class="btn" id="restoreBtn">${I('shield', 15)} Crear punto de restauración</button></div>
  ${blocks.map((b) => `<details class="card blk ${b.active ? '' : 'done'}"><summary><div class="ico sm">${I(kindIco[b.kind] || 'sliders', 16)}</div><div class="sp"><b>${esc(b.title)}</b><small class="muted">${fmt(b.t)} · ${b.total} ajuste(s) · ${b.active ? b.active + ' activos' : 'ya deshecho'}</small></div>${b.active ? `<button class="btn" data-ublk="${esc(b.id)}">${I('undo', 14)} Deshacer todo el bloque</button>` : '<span class="pill">Deshecho</span>'}</summary>
    <div class="blk-items">${b.items.map((i) => `<div class="blk-it"><span class="dot ${i.active ? 'on' : ''}"></span><span class="sp">${esc(i.name)}</span><span class="pill ${i.risk}">${({ safe: 'Seguro', medium: 'Medio', advanced: 'Avanzado' })[i.risk] || ''}</span></div>`).join('')}</div></details>`).join('') || `<div class="card"><div class="empty">Todavía no hay cambios. Activa un modo o aplica ajustes y aparecerán aquí.</div></div>`}`);
}

// ───────── AJUSTES Y DISCORD ─────────
async function pageAjustes() {
  const s = await call('settingsGet');
  setPage(`<h1>Ajustes y Discord</h1><p class="sub">Muestra «Jugando a Sveqzz Optimizer» con el logo en tu perfil de Discord. Activa «Compartir tu actividad» en Discord → Ajustes → Actividad.</p>
  <div class="card"><div class="row"><div class="ico">${I('discord', 20)}</div><div class="sp"><b>Discord Rich Presence</b><div class="small muted">Estado: <b style="color:#fff">${esc(s.discord)}</b></div></div><label class="sw"><input type="checkbox" data-set="discordEnabled" ${s.discordEnabled ? 'checked' : ''}><i></i></label></div>
  </div>
  <div class="card" style="margin-top:14px"><div class="sett"><div class="sp"><b>Efectos 3D e interfaz animada</b><small>Inclinación de tarjetas, anillos y fondo animado. Desactívalo si quieres gastar aún menos recursos.</small></div><label class="sw"><input type="checkbox" data-set="fx3d" ${s.fx3d ? 'checked' : ''}><i></i></label></div>
    <div class="sett"><div class="sp"><b>Sveqzz Optimizer 2.0</b><small>Hecho por Sveqzz. Los ajustes se guardan en tu PC, no se envía nada a internet salvo lo que tú pidas (medidor de FPS, ping, Discord local).</small></div></div></div>`);
}

const PAGES = { herramientas: pageTools, drivers: pageDrivers, crashes: pageCrashes, procesos: pageProcesos, dispositivos: pageDispositivos, launchers: pageLaunchers, inicio: pageInicio, mipc: pageMiPc, modos: pageModos, optimizacion: pageOptim, juegos: pageJuegos, limpieza: pageLimpieza, red: pageRed, arranque: pageArranque, historial: pageHist, ajustes: pageAjustes };

// ───────── eventos de la interfaz ─────────
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.go) return go(d.go);
  if (d.open) return cmd('open', d.open);
  if (d.mode) return activateMode(t, d.mode);
  if (d.cat) { S.cat = d.cat; drawCats(); return drawList(); }
  if (d.more) { S.openMore.has(d.more) ? S.openMore.delete(d.more) : S.openMore.add(d.more); return drawList(); }
  switch (t.id) {
    case 'hBackup': return guard(t, async () => { await call('restorePoint'); toast('Punto de restauración creado', 'ok'); });
    case 'hRam': return guard(t, async () => { const r = await call('appsOptimize'); toast(appsMsg(r), 'ok'); });
    case 'hUndo': if (!window.confirm('¿Deshacer TODOS los ajustes aplicados y volver a los valores originales?')) return; return guard(t, async () => { const r = await call('revertAll'); delete C.tw; delete C.modes; afterApply(r, 'Todo deshecho'); pageInicio(); });
    case 'bBefore': case 'bAfter': return guard(t, async () => { toast('Midiendo… no uses el PC unos segundos', 'ok'); const b = await call('benchRun', t.id === 'bAfter' ? 'after' : 'before'); $('#benchOut').innerHTML = benchHtml(b); });
    case 'tRemove': { const ids = [...document.querySelectorAll('.appchk:checked')].map((x) => x.value); if (!ids.length) return toast('Marca alguna app', 'warn'); if (!window.confirm('¿Quitar ' + ids.length + ' app(s)?')) return; return guard(t, async () => { const r = await call('toolsRemoveApps', ids); toast(`${r.done.length} quitadas${r.failed.length ? ', ' + r.failed.length + ' con error' : ''}`, r.failed.length ? 'warn' : 'ok'); pageTools(); }); }
    case 'tTest': if (!window.confirm('Se aplicarán y revertirán ajustes uno a uno. Cierra tus juegos. ¿Continuar?')) return; return guard(t, () => runTest(t));
    case 'oneClick': return guard(t, async () => { const r = await call('optimizeRecommended'); delete C.tw; afterApply(r, r.count ? `${r.count} ajuste(s) aplicados` : 'Ya estaba todo optimizado'); pageInicio(); });
    case 'selRec': C.tw.v.tweaks.filter((x) => x.rec && x.status !== 'na').forEach((x) => S.desired.set(x.id, true)); drawList(); return drawBar();
    case 'selSafe': C.tw.v.tweaks.filter((x) => x.risk === 'safe' && x.status !== 'na' && !x.warn).forEach((x) => S.desired.set(x.id, true)); drawList(); return drawBar();
    case 'discard': S.desired.clear(); drawList(); return drawBar();
    case 'applyBtn': return applyPending(t);
    case 'copyReport': { const hw = C.hw && C.hw.v; if (hw) { try { await navigator.clipboard.writeText(reportText(hw)); toast('Informe copiado', 'ok'); } catch { toast('No pude copiar', 'err'); } } return; }
    case 'ramFree': return guard(t, async () => { const r = await call('appsOptimize'); toast(appsMsg(r), 'ok'); });
    case 'cScan': return guard(t, async () => { delete C.clean; S.cleanInit = false; await pageLimpieza(); });
    case 'cRun': return guard(t, async () => { const r = await call('cleanRun', [...S.cleanSel]); toast(`${fmtBytes(r.freed)} liberados (${r.count} archivos)`, 'ok'); delete C.clean; await pageLimpieza(); });
    case 'cBin': return guard(t, async () => { await call('cleanBin'); toast('Papelera vaciada', 'ok'); });
    case 'cDns': return guard(t, async () => { await call('flushDns'); toast('Caché DNS vaciada', 'ok'); });
    case 'cLarge': return guard(t, async () => { const l = await call('cleanLarge'); $('#largeBox').innerHTML = `<h2>Archivos grandes (+500 MB)</h2><p class="small muted">Solo lectura: tú decides qué borrar desde el Explorador.</p>` + (l.map((f) => `<div class="item"><span class="mono sp">${esc(f.path)}</span><b>${fmtBytes(f.size)}</b></div>`).join('') || '<div class="empty">No hay archivos tan grandes en Descargas, Escritorio, Documentos o Vídeos.</div>'); });
    case 'pingBtn': return guard(t, async () => { S.net.ping = await call('netPing', 'cloudflare', 40); pageRed(); });
    case 'dnsBtn': return guard(t, async () => { S.net.dns = await call('netDnsBench'); pageRed(); });
    case 'regBtn': return guard(t, async () => { S.net.regions = await call('netRegions'); pageRed(); });
    case 'dnsReset': return guard(t, async () => { await call('netDnsReset'); toast('DNS restaurado', 'ok'); });
    case 'undoAll': if (!(await dialog({ title: 'Deshacer todo', body: 'Se revertirán todos los ajustes aplicados por Sveqzz Optimizer a su valor original.', ok: 'Deshacer todo', danger: true }))) return;
      return guard(t, async () => { const r = await call('revertAll'); delete C.tw; delete C.modes; afterApply(r, 'Todo revertido'); updateMode(); pageHist(); });
    case 'restoreBtn': return guard(t, async () => { const r = await call('restorePoint'); toast(r.ok ? 'Punto de restauración creado' : 'Windows no permitió crear otro punto ahora (límite de 24 h)', r.ok ? 'ok' : 'err'); });
    case 'scanGames': return guard(t, async () => { const l = await call('gamesScan'); $('#scanOut').innerHTML = l.length ? l.map((g) => `<div class="item"><div class="sp"><b>${esc(g.name)}</b><small class="mono">${esc(g.path || g.exe)}</small></div><button class="btn primary" data-gopt="${g.pid}">Optimizar</button></div>`).join('') : '<p class="small muted" style="margin-top:10px">No encontré otros juegos abiertos.</p>'; });
    case 'ovToggle': { const on = await cmd('overlay:toggle'); S.overlay = !!on; if (!window.velox) toast('El overlay solo existe en la app de escritorio'); return pageJuegos(); }
    case 'chipOverlay': { const on = await cmd('overlay:toggle'); S.overlay = !!on; return drawChips(); }
    case 'chipSearch': return openCmd();
    case 'fpsInstall': return guard(t, async () => { await call('fpsInstall'); toast('Medidor de FPS instalado', 'ok'); pageJuegos(); });
    case 'pPick': { const f = await cmd('pickExe'); if (!f) return toast(window.velox ? 'No elegiste ningún archivo' : 'El selector solo existe en la app de escritorio'); const exe = String(f).split(/[\\/]/).pop(); return guard(t, async () => { await call('gamesProfileAdd', exe, ''); toast('Perfil añadido: ' + exe, 'ok'); pageJuegos(); }); }
    case 'fnApply': return guard(t, async () => { const r = await call('fortniteApply', 'max'); toast(r.changed + ' ajustes cambiados. ' + r.note, 'ok'); pageJuegos(); });
    case 'fnRestore': return guard(t, async () => { await call('fortniteRestore'); toast('Configuración de Fortnite restaurada', 'ok'); pageJuegos(); });
    case 'pAdd': return guard(t, async () => { await call('gamesProfileAdd', $('#pExe').value, $('#pName').value); toast('Perfil añadido', 'ok'); pageJuegos(); });
    case 'gUndo': return guard(t, async () => { await call('gamesUndoAll'); toast('Optimizaciones de juegos quitadas', 'ok'); });
    case 'dcSave': return guard(t, async () => { const r = await call('settingsSet', { discordClientId: $('#dcId').value.trim(), discordImage: $('#dcImg').value.trim() }); toast('Guardado · ' + r.discord, 'ok'); await sleep(800); pageAjustes(); });
  }
  if (d.gopt) return guard(t, async () => { await call('gamesOptimize', Number(d.gopt)); toast('Juego optimizado', 'ok'); pageJuegos(); });
  if (d.ublk) return guard(t, async () => { const r = await call('undoBlock', d.ublk); delete C.tw; delete C.modes; afterApply(r, 'Bloque deshecho'); updateMode(); pageHist(); });
  if (d.crev) return guard(t, async () => { const r = await call('revert', d.crev.split(',')); delete C.tw; delete C.modes; afterApply(r, 'Ajustes sospechosos revertidos'); pageCrashes(); });
  if (d.pk) return guard(t, async () => { await call('procsKill', d.pk); toast('Cerrado', 'ok'); delete C.procs; pageProcesos(); });
  if (d.pd) { if (!(await dialog({ title: 'Desactivar siempre', body: `«${t.dataset.pt}» dejará de iniciarse con Windows hasta que lo reactives desde esta misma pantalla.`, ok: 'Desactivar' }))) return; return guard(t, async () => { const r = await call('procsDisable', d.pd); toast(r.persistent ? 'Desactivado para siempre' : 'Cerrado (no hay forma segura de evitar que vuelva a abrirse)', 'ok'); delete C.procs; pageProcesos(); }); }
  if (d.pr) return guard(t, async () => { await call('procsRestore', d.pr); toast('Reactivado', 'ok'); delete C.procs; pageProcesos(); });
  if (d.dv) return guard(t, async () => { const r = await call('devicesBoost', d.dv); if (r.reboot) { S.reboot = true; refreshBanner(); } toast('Prioridad máxima aplicada' + (r.reboot ? ' (reinicia para completar)' : ''), 'ok'); delete C.devs; pageDispositivos(); });
  if (d.dvr) return guard(t, async () => { await call('devicesRestore', d.dvr); toast('Restaurado', 'ok'); delete C.devs; pageDispositivos(); });
  if (d.la) return guard(t, async () => { const r = await call('launchersOptimize', d.la); toast(r.note || r.done.join(' · '), r.note ? '' : 'ok'); delete C.launch; delete C.clean; pageLaunchers(); });
  if (d.lr) return guard(t, async () => { await call('launchersRestore', d.lr); toast('Restaurado', 'ok'); delete C.launch; pageLaunchers(); });
  if (d.prm) return guard(t, async () => { await call('gamesProfileRemove', d.prm); pageJuegos(); });
  if (d.dns) return guard(t, async () => { await call('netDnsSet', d.dns); toast('DNS cambiado', 'ok'); });
});
document.addEventListener('change', (e) => {
  const el = e.target, d = el.dataset;
  if (d.tw) { const t = C.tw.v.tweaks.find((x) => x.id === d.tw); if (el.checked === (t.status === 'on')) S.desired.delete(t.id); else S.desired.set(t.id, el.checked); el.closest('.tw').classList.toggle('changed', S.desired.has(t.id)); return drawBar(); }
  if (d.cl) { el.checked ? S.cleanSel.add(d.cl) : S.cleanSel.delete(d.cl); return pageLimpieza(); }
  if (d.su) return guard(null, async () => { try { await call('startupToggle', d.su, el.checked); delete C.startup; } catch (err) { el.checked = !el.checked; throw err; } });
  if (d.set) return guard(null, async () => { const patch = d.grp ? { gameOpts: { [d.set]: el.checked } } : { [d.set]: el.checked }; await call('settingsSet', patch); if (d.set === 'fx3d') applyFx(el.checked); if (d.set === 'discordEnabled') pageAjustes(); });
  if (el.id === 'pf') { S.pf = el.value; return S.pdraw(C.procs.v); }
  if (el.id === 'risk') { S.risk = el.value; return drawList(); } if (el.id === 'only') { S.only = el.value; return drawList(); }
  if (el.id === 'corner') return guard(null, async () => { await call('settingsSet', { overlayCorner: el.value }); cmd('overlay:corner', el.value); });
});
let qT = 0; document.addEventListener('input', (e) => { if (e.target.id === 'pq') { S.pq = e.target.value; clearTimeout(qT); qT = setTimeout(() => { S.pdraw(C.procs.v); const q = $('#pq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 150); }
  if (e.target.id === 'q') { S.q = e.target.value; clearTimeout(qT); qT = setTimeout(drawList, 120); } });

// efecto 3D: inclinación suave siguiendo el cursor (un solo listener, sin reflow)
let raf = 0;
document.addEventListener('mousemove', (e) => {
  if (document.body.classList.contains('nofx') || raf) return;
  const el = e.target.closest && e.target.closest('.tilt'); if (!el) return;
  raf = requestAnimationFrame(() => {
    raf = 0; const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, big = r.width > 600;
    el.style.setProperty('--ry', ((x - .5) * (big ? 2.2 : 9)).toFixed(2) + 'deg'); el.style.setProperty('--rx', ((.5 - y) * (big ? 1.6 : 7)).toFixed(2) + 'deg'); el.style.setProperty('--mx', (x * 100).toFixed(0) + '%'); el.style.setProperty('--my', (y * 100).toFixed(0) + '%');
  });
});
document.addEventListener('mouseout', (e) => { const el = e.target.closest && e.target.closest('.tilt'); if (el && !el.contains(e.relatedTarget)) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); } });
const applyFx = (on) => document.body.classList.toggle('nofx', !on);
document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

// ───────── paleta de comandos (Ctrl+K) ─────────
function openCmd() {
  const items = [...NAV.filter((n) => n[0] !== '_').map(([id, l, i]) => ({ l: 'Ir a ' + l, i, run: () => go(id) })),
    { l: 'Optimizar con un clic', i: 'bolt', run: () => { go('inicio').then(() => $('#oneClick') && $('#oneClick').click()); } },
    { l: `Activar modo ${isLaptop() ? 'Laptop Gaming' : 'Gaming'}`, i: 'gamepad', run: () => activateMode(null, isLaptop() ? 'laptop' : 'gaming') },
    { l: 'Mostrar u ocultar overlay', i: 'eye', run: () => $('#chipOverlay').click() }];
  const m = $('#cmdk'); m.hidden = false; m.innerHTML = `<div class="cmd"><input id="cq" placeholder="Escribe una acción o pantalla…" autocomplete="off"><div class="list" id="cl"></div></div>`;
  let sel = 0, list = items; const close = () => { m.hidden = true; m.innerHTML = ''; };
  const draw = () => { $('#cl').innerHTML = list.map((x, k) => `<button data-k="${k}" class="${k === sel ? 'sel' : ''}">${I(x.i, 16)}<span>${esc(x.l)}</span></button>`).join(''); };
  draw(); $('#cq').focus();
  $('#cq').oninput = (e) => { const q = e.target.value.toLowerCase(); list = items.filter((x) => x.l.toLowerCase().includes(q)); sel = 0; draw(); };
  $('#cq').onkeydown = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowDown') { sel = Math.min(list.length - 1, sel + 1); draw(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); } else if (e.key === 'Enter' && list[sel]) { close(); list[sel].run(); } };
  m.onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { const x = list[+b.dataset.k]; close(); x.run(); } else if (e.target === m) close(); };
}
document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmd(); } });

// ───────── panel en vivo (solo cuando la ventana es visible) ─────────
const hist = { cpu: [], ram: [], gpu: [] };
const spark = (id, arr, color) => drawChart($(id), arr, color, 100);
async function tick() {
  if (document.hidden) return;
  try {
    const s = await call('stats');
    for (const k of ['cpu', 'ram']) { hist[k].push(s[k]); if (hist[k].length > 36) hist[k].shift(); }
    $('#mCpu').textContent = s.cpu + ' %'; $('#mRam').textContent = s.ram + ' %'; spark('#cCpu', hist.cpu, '#e8ebf3'); spark('#cRam', hist.ram, '#34d399');
    if (s.gpu) { hist.gpu.push(s.gpu.usage); if (hist.gpu.length > 36) hist.gpu.shift(); $('#mGpu').textContent = s.gpu.usage + ' %'; spark('#cGpu', hist.gpu, '#fbbf24'); $('#tempBox').hidden = false; $('#mTemp').textContent = s.gpu.temp + ' °C'; } else $('#gpuBox').style.display = 'none';
    $('#mPing').textContent = s.ping.ms == null ? 'sin datos' : `${s.ping.ms.toFixed(1)} ms · jitter ${s.ping.jitter == null ? '—' : s.ping.jitter.toFixed(1)} ms`;
  } catch { /* se reintenta */ }
}
function drawChips() {
  const m = (C.modes && C.modes.v || []).find((x) => x.active);
  $('#chipMode').innerHTML = m && m.id !== 'normal' ? `${I(m.icon, 13)} Modo ${esc(m.name)}` : '';
  const o = $('#chipOverlay'); o.className = 'chip btn-chip' + (S.overlay ? ' onair' : ''); o.innerHTML = `${I('eye', 13)} Overlay ${S.overlay ? 'activo' : ''}`;
}
async function updateMode() { try { C.modes = { v: await call('modesList'), at: Date.now() }; drawChips(); } catch { /* */ } }

if (window.velox && window.velox.onEvent) window.velox.onEvent((name, p) => {
  if (name === 'overlay') { S.overlay = !!p; drawChips(); }
  if (name === 'game-start') { S.game = p; $('#mGame').textContent = p.name; renderNav(); toast(`Juego detectado: ${p.name}${p.autoOpt ? '' : ' · optimizando…'}`); if (S.page === 'juegos') pageJuegos(); }
  if (name === 'game-update') { toast(p.status === 'optimizado' ? `${p.name} optimizado` : `${p.name}: ${p.error || p.status}`, p.status === 'error' ? 'err' : 'ok'); if (S.page === 'juegos') pageJuegos(); }
  if (name === 'game-end') { S.game = null; $('#mGame').textContent = 'Ninguno'; renderNav(); if (S.page === 'juegos') pageJuegos(); }
});

(async function init() {
  renderNav(); drawChips();
  const info = await getInfo().catch(() => null);
  if (info) { $('#adminBadge').textContent = info.admin ? 'Administrador' : 'Sin admin'; $('#adminBadge').className = 'pill ' + (info.admin ? 'on' : 'bad'); }
  call('settingsGet').then((s) => applyFx(s.fx3d !== false)).catch(() => {});
  cmd('overlay:state').then((v) => { S.overlay = !!v; drawChips(); });
  refreshBanner(); tick(); setInterval(tick, 2000); updateMode();
  go(new URLSearchParams(location.search).get('p') || 'inicio');
  // precarga en segundo plano para que Optimización, Mi PC y Limpieza abran al instante
  setTimeout(() => { call('tweaksList').then((v) => { C.tw = { v, at: Date.now() }; }).catch(() => {}); call('hardware').then((v) => { C.hw = { v, at: Date.now() }; }).catch(() => {}); }, 600);
})();
