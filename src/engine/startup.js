'use strict';
// Programas de inicio. Se activan/desactivan igual que el Administrador de tareas (StartupApproved), sin borrar nada.
const SOURCES = [
  { id: 'hkcu', h: 'HKCU', run: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', ap: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', label: 'Usuario' },
  { id: 'hklm', h: 'HKLM', run: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run', ap: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run', label: 'Sistema' },
  { id: 'hklm32', h: 'HKLM', run: 'SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run', ap: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32', label: 'Sistema (32 bits)' },
];
const ENABLED = '020000000000000000000000', DISABLED = '030000000000000000000000';

async function list(be) {
  const out = [];
  for (const s of SOURCES) {
    const runs = await be.regReadAll(s.h, s.run);
    const appr = await be.regReadAll(s.h, s.ap);
    for (const r of runs) {
      const a = appr.find((x) => x.name.toLowerCase() === r.name.toLowerCase());
      const first = a && a.data ? parseInt(String(a.data).slice(0, 2), 16) : 2;
      out.push({ id: `${s.id}::${r.name}`, name: r.name, cmd: String(r.data), scope: s.label, enabled: !(first & 1) });
    }
  }
  return out;
}

async function toggle(be, id, enabled) {
  const [sid, ...rest] = id.split('::'); const name = rest.join('::');
  const s = SOURCES.find((x) => x.id === sid);
  if (!s) throw new Error('Origen desconocido');
  const runs = await be.regReadAll(s.h, s.run);
  if (!runs.find((r) => r.name === name)) throw new Error('Esa entrada ya no existe');
  await be.regWrite(s.h, s.ap, name, 'BINARY', enabled ? ENABLED : DISABLED);
}

module.exports = { list, toggle };
