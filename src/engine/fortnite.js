'use strict';
// Perfil de máximo FPS para Fortnite: edita GameUserSettings.ini (con copia de seguridad) y lo deja listo para competir.
// Fortnite debe estar cerrado: al salir reescribe el archivo.
const fs = require('fs');
const path = require('path');
const { run } = require('./backend');

const file = () => path.join(process.env.LOCALAPPDATA || require('os').tmpdir(), 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
const SG = { 'sg.ShadowQuality': 0, 'sg.EffectsQuality': 0, 'sg.PostProcessQuality': 0, 'sg.FoliageQuality': 0, 'sg.ShadingQuality': 0, 'sg.GlobalIlluminationQuality': 0, 'sg.ReflectionQuality': 0, 'sg.AntiAliasingQuality': 0 };
const GAME = { FrameRateLimit: '0.000000', MenuFrameRateLimit: '60.000000', bUseVSync: 'False', bMotionBlur: 'False', bShowGrass: 'False', bDisableMouseAcceleration: 'True', bUseHeadphoneMode: 'False' };
const RHI = { PreferredRHI: 'dx11', PreferredFeatureLevel: 'es31' }; // «Modo Rendimiento» del juego

function setKeys(text, section, kv) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text ? text.split(/\r?\n/) : [];
  let start = lines.findIndex((l) => l.trim().toLowerCase() === `[${section.toLowerCase()}]`);
  if (start < 0) { if (lines.length && lines[lines.length - 1] !== '') lines.push(''); lines.push(`[${section}]`); start = lines.length - 1; }
  let end = lines.findIndex((l, i) => i > start && /^\s*\[/.test(l)); if (end < 0) end = lines.length;
  let n = 0;
  for (const [k, v] of Object.entries(kv)) {
    const i = lines.slice(start + 1, end).findIndex((l) => l.split('=')[0].trim().toLowerCase() === k.toLowerCase());
    if (i >= 0) { if (lines[start + 1 + i] !== `${k}=${v}`) { lines[start + 1 + i] = `${k}=${v}`; n++; } } else { lines.splice(end, 0, `${k}=${v}`); end++; n++; }
  }
  return { text: lines.join(eol), n };
}
async function running(be) {
  if (be.mock) return false;
  const r = await run('tasklist', ['/FI', 'IMAGENAME eq FortniteClient-Win64-Shipping.exe', '/NH'], 8000);
  return /fortniteclient/i.test(r.stdout);
}
const bak = (state) => path.join(path.dirname(state.file), 'fortnite-GameUserSettings.ini.bak');

async function status(be, state) {
  const f = file();
  return { installed: fs.existsSync(f), applied: !!(state.data.fortnite && state.data.fortnite.applied), running: await running(be) };
}
async function apply(be, state, level) {
  const f = file();
  if (!fs.existsSync(f)) throw new Error('No encontré la configuración de Fortnite. Abre Fortnite una vez, ciérralo y vuelve a intentarlo.');
  if (await running(be)) throw new Error('Cierra Fortnite del todo primero: al salir reescribe su configuración.');
  const orig = fs.readFileSync(f, 'utf8');
  if (!state.data.fortnite || !state.data.fortnite.applied) fs.writeFileSync(bak(state), orig);
  await run('attrib', ['-R', f], 5000);
  let t = orig, changed = 0;
  for (const [sec, kv] of [['ScalabilityGroups', SG], ['/Script/FortniteGame.FortGameUserSettings', GAME], ['D3DRHIPreference', RHI]]) { const r = setKeys(t, sec, kv); t = r.text; changed += r.n; }
  fs.writeFileSync(f, t);
  state.data.fortnite = { applied: true, at: Date.now() }; state.save();
  return { changed, note: 'Pon también en el juego: Resolución 3D al 100%, Sombras/Efectos/Post-proceso en Bajo y límite de FPS sin tope.' };
}
async function restore(be, state) {
  if (!(state.data.fortnite && state.data.fortnite.applied)) return;
  if (await running(be)) throw new Error('Cierra Fortnite del todo primero');
  if (fs.existsSync(bak(state))) fs.copyFileSync(bak(state), file());
  state.data.fortnite = { applied: false }; state.save();
}
module.exports = { status, apply, restore, setKeys };
