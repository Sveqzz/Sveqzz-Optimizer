'use strict';
const { TWEAKS, reqOK } = require('./catalog');

const byId = new Map(TWEAKS.map((t) => [t.id, t]));
const SVC_KEY = 'SYSTEM\\CurrentControlSet\\Services\\';

async function pmap(arr, fn, n = 6) {
  const out = new Array(arr.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => {
    while (i < arr.length) { const k = i++; out[k] = await fn(arr[k], k); }
  }));
  return out;
}
// Los scripts de PowerShell/powercfg se ejecutan de uno en uno (powercfg no admite escrituras simultáneas).
let psChain = Promise.resolve();
const psLock = (fn) => { const p = psChain.then(fn, fn); psChain = p.catch(() => {}); return p; };

function regMatches(cur, k, v) {
  if (!cur || !cur.e) return false;
  if (k === 'DWORD' || k === 'QWORD') return Number(cur.v) === Number(v);
  if (k === 'BINARY') return String(cur.v).toLowerCase() === String(v).toLowerCase();
  return String(cur.v) === String(v);
}
const safeSnap = (s) => String(s || '').replace(/[^A-Za-z0-9{}\-., :]/g, '').slice(0, 80);

// ───── Probe: acumula todo lo que hay que leer y lo pide al sistema en UNA llamada ─────
class Probe {
  constructor() { this.req = { regs: [], svcs: [], tasks: [], keys: [], checks: [], vals: [] }; this.m = new Map(); this.res = null; }
  _add(list, key, item) { const k = list + '|' + key; if (!this.m.has(k)) { this.m.set(k, this.req[list].length); this.req[list].push(item); } return this.m.get(k); }
  reg(h, p, n) { return this._add('regs', `${h}\\${p}\\${n}`.toLowerCase(), { h, p, n }); }
  svc(n) { return this._add('svcs', n.toLowerCase(), n); }
  task(path, name) { this._add('tasks', path + name, { path, name }); return path + name; }
  key(h, p) { return this._add('keys', `${h}\\${p}`.toLowerCase(), { h, p }); }
  check(s) { return this._add('checks', s, s); }
  val(s) { return this._add('vals', s, s); }
  async run(be) { this.res = await be.probe(this.req); }
}

function refsFor(pr, op, { check, snap }) {
  switch (op.t) {
    case 'reg': return { reg: pr.reg(op.h, op.p, op.n) };
    case 'svc': return { reg: pr.reg('HKLM', SVC_KEY + op.n, 'Start'), svc: pr.svc(op.n) };
    case 'task': return { task: pr.task(op.path, op.name) };
    case 'keydef': return { key: pr.key(op.h, op.p) };
    case 'ps': return { check: check && op.c ? pr.check(op.c) : null, val: snap && op.s ? pr.val(op.s) : null };
    default: return {};
  }
}

function opStatusFrom(pr, op, refs, assumed) {
  const r = pr.res;
  switch (op.t) {
    case 'reg': return regMatches(r.regs[refs.reg], op.k, op.v);
    case 'svc': { const cur = r.regs[refs.reg]; return cur && cur.e ? regMatches(cur, 'DWORD', op.start) : 'na'; }
    case 'task': { const s = r.tasks[refs.task]; return s == null ? 'na' : s === 'Disabled'; }
    case 'keydef': return !!r.keys[refs.key];
    case 'ps': { const c = refs.check == null ? null : r.checks[refs.check]; return c === null || c === undefined ? assumed : c; }
    default: return false;
  }
}
function snapFrom(pr, op, refs) {
  const r = pr.res;
  switch (op.t) {
    case 'reg': return { ...r.regs[refs.reg] };
    case 'svc': return { start: { ...r.regs[refs.reg] }, running: !!r.svcs[refs.svc] };
    case 'task': return { state: r.tasks[refs.task] };
    case 'keydef': return { existed: !!r.keys[refs.key] };
    case 'ps': return { val: refs.val == null ? '' : safeSnap(r.vals[refs.val]) };
    default: return null;
  }
}

// Estado de los tweaks: 'on' | 'partial' | 'off' | 'na'  (una sola llamada al sistema)
async function statusAll(be, state, facts, ids) {
  const list = (ids ? ids.map((i) => byId.get(i)) : TWEAKS).filter(Boolean);
  const out = {}; const plan = [];
  const pr = new Probe();
  for (const t of list) {
    if (!reqOK(t, facts)) { out[t.id] = 'na'; continue; }
    plan.push([t, t.ops.map((op) => refsFor(pr, op, { check: true }))]);
  }
  if (plan.length) await pr.run(be);
  for (const [t, refs] of plan) {
    const assumed = !!state.data.tweaks[t.id];
    const res = t.ops.map((op, i) => opStatusFrom(pr, op, refs[i], assumed));
    const real = res.filter((r) => r !== 'na');
    out[t.id] = !real.length ? 'na' : real.every(Boolean) ? 'on' : real.some(Boolean) ? 'partial' : 'off';
  }
  return out;
}

async function snapshotMany(be, list) {
  const pr = new Probe(); const plan = [];
  for (const t of list) plan.push([t, t.ops.map((op) => refsFor(pr, op, { snap: true }))]);
  await pr.run(be);
  const snaps = new Map();
  for (const [t, refs] of plan) snaps.set(t.id, t.ops.map((op, i) => snapFrom(pr, op, refs[i])));
  return snaps;
}

async function applyOp(be, op, snap) {
  switch (op.t) {
    case 'reg': return be.regWrite(op.h, op.p, op.n, op.k, op.v);
    case 'svc':
      if (!snap.start.e && !snap.start.exists) return; // el servicio no existe en este PC
      await be.regWrite('HKLM', SVC_KEY + op.n, 'Start', 'DWORD', op.start);
      if (snap.running && !op.nostop) await be.serviceStop(op.n);
      return;
    case 'task': if (snap.state != null) await be.taskSet(op.path, op.name, false); return;
    case 'keydef': return be.keyWriteDefault(op.h, op.p);
    case 'ps': return psLock(async () => {
      const r = await be.ps(op.a);
      if (r.code !== 0 && !be.mock) throw new Error((r.stderr || r.stdout || 'comando falló').trim().slice(0, 200));
    });
  }
}

async function revertOp(be, op, snap) {
  switch (op.t) {
    case 'reg':
      if (snap && snap.e) return be.regWrite(op.h, op.p, op.n, snap.k, snap.v);
      return be.regDelete(op.h, op.p, op.n); // si no existía, borrarlo = valor por defecto de Windows
    case 'svc': {
      if (snap && !snap.start.e) return;
      const prev = snap && snap.start.e ? snap.start.v : 3; // sin copia: Manual
      await be.regWrite('HKLM', SVC_KEY + op.n, 'Start', 'DWORD', prev);
      if (snap && snap.running && prev !== 4) await be.serviceStart(op.n);
      return;
    }
    case 'task':
      if (!snap || snap.state == null) return be.taskSet(op.path, op.name, true);
      return be.taskSet(op.path, op.name, snap.state !== 'Disabled');
    case 'keydef':
      if (!snap || !snap.existed) return be.keyDelete(op.h, op.p);
      return;
    case 'ps': return psLock(async () => { await be.ps(`$prev='${snap ? snap.val : ''}'; ${op.r}`); });
  }
}

// Aplica varios tweaks: 1 lectura de snapshots + escrituras en paralelo.
async function applyMany(be, state, list, onProgress) {
  const fresh = list.filter((t) => !state.data.tweaks[t.id]);
  const snapMap = fresh.length ? await snapshotMany(be, fresh) : new Map();
  let done = 0;
  return pmap(list, async (t) => {
    const had = state.data.tweaks[t.id];
    const snaps = had ? had.snaps : snapMap.get(t.id);
    const errors = [];
    for (let i = 0; i < t.ops.length; i++) {
      try { await applyOp(be, t.ops[i], snaps[i]); } catch (e) { errors.push(String(e.message || e)); }
    }
    if (errors.length < t.ops.length) state.data.tweaks[t.id] = { at: Date.now(), snaps };
    if (onProgress) onProgress(++done, list.length, t);
    return { id: t.id, ok: errors.length === 0, partial: errors.length > 0 && errors.length < t.ops.length, error: errors[0] || null };
  }, 6);
}

async function revertMany(be, state, list, onProgress) {
  let done = 0;
  return pmap(list, async (t) => {
    const had = state.data.tweaks[t.id];
    const errors = [];
    for (let i = 0; i < t.ops.length; i++) {
      try { await revertOp(be, t.ops[i], had ? had.snaps[i] : null); } catch (e) { errors.push(String(e.message || e)); }
    }
    if (!errors.length) delete state.data.tweaks[t.id];
    if (onProgress) onProgress(++done, list.length, t);
    return { id: t.id, ok: errors.length === 0, error: errors[0] || null };
  }, 6);
}

// Tweaks que escriben la misma clave con valores distintos son excluyentes (p. ej. «IPv4 preferido» vs «IPv6 apagado»).
const regOwners = new Map();
for (const t of TWEAKS) for (const o of t.ops) if (o.t === 'reg') {
  const k = `${o.h}\\${o.p}\\${o.n}`.toLowerCase(); if (!regOwners.has(k)) regOwners.set(k, []); regOwners.get(k).push([t.id, String(o.v)]);
}
const conflictMap = new Map();
for (const owners of regOwners.values()) for (const [a, va] of owners) for (const [b, vb] of owners) if (a !== b && va !== vb) { if (!conflictMap.has(a)) conflictMap.set(a, new Set()); conflictMap.get(a).add(b); }
const conflictsOf = (id) => conflictMap.get(id) || new Set();

module.exports = { conflictsOf, byId, statusAll, applyMany, revertMany, pmap, regMatches };
