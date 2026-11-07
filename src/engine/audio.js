'use strict';
// Audio para juegos de disparos: ecualizador propio (Equalizer APO, gratuito) + utilidades de audio de Windows.
const fs = require('fs');
const path = require('path');

const APO_DIRS = () => [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter(Boolean).map((d) => path.join(d, 'EqualizerAPO', 'config'));
const findApo = () => APO_DIRS().find((d) => { try { return fs.existsSync(path.join(d, 'config.txt')); } catch { return false; } }) || null;
const FILE = 'sveqzz-audio.txt';

// Preajustes propios: bajan los graves (explosiones y disparos) y suben las frecuencias de pasos, recarga y voces.
const PRESETS = {
  suave: ['Preamp: -3 dB', 'Filter: ON LSC Fc 160 Hz Gain -4 dB', 'Filter: ON PK Fc 1800 Hz Gain 2 dB Q 1.2', 'Filter: ON PK Fc 3200 Hz Gain 3.5 dB Q 1.4', 'Filter: ON HSC Fc 9000 Hz Gain -1.5 dB'],
  fuerte: ['Preamp: -5 dB', 'Filter: ON HP Fc 50 Hz', 'Filter: ON LSC Fc 180 Hz Gain -7 dB', 'Filter: ON PK Fc 500 Hz Gain -2 dB Q 1', 'Filter: ON PK Fc 1800 Hz Gain 3 dB Q 1.2', 'Filter: ON PK Fc 3200 Hz Gain 5.5 dB Q 1.4', 'Filter: ON PK Fc 5500 Hz Gain 2.5 dB Q 1.5', 'Filter: ON HSC Fc 9000 Hz Gain -3 dB'],
};

async function state(be) {
  const apo = findApo(); let active = null;
  if (apo) { try { const t = fs.readFileSync(path.join(apo, FILE), 'utf8'); active = /sveqzz:fuerte/.test(t) ? 'fuerte' : /sveqzz:suave/.test(t) ? 'suave' : null; } catch { /* sin perfil */ } }
  let devices = [];
  if (!be.mock) {
    const raw = await be.psValue("ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_SoundDevice | Select-Object Name,Manufacturer,Status)");
    try { devices = [].concat(JSON.parse(raw || '[]')); } catch { /* */ }
  } else devices = [{ Name: 'Realtek High Definition Audio', Manufacturer: 'Realtek', Status: 'OK' }];
  return { apo: !!apo, active, devices };
}
function setProfile(level) {
  const apo = findApo(); if (!apo) throw new Error('Instala Equalizer APO primero (botón «Descargar Equalizer APO»).');
  const cfg = path.join(apo, 'config.txt'); let txt = fs.readFileSync(cfg, 'utf8');
  const bak = path.join(apo, 'config.sveqzz-backup.txt'); if (!fs.existsSync(bak)) fs.writeFileSync(bak, txt);
  const inc = `Include: ${FILE}`;
  if (level === 'off') {
    fs.writeFileSync(cfg, txt.split(/\r?\n/).filter((l) => l.trim() !== inc).join('\r\n'));
    try { fs.unlinkSync(path.join(apo, FILE)); } catch { /* */ }
    return { active: null };
  }
  const lines = PRESETS[level]; if (!lines) throw new Error('Perfil desconocido');
  fs.writeFileSync(path.join(apo, FILE), `# sveqzz:${level}\r\n` + lines.join('\r\n') + '\r\n');
  if (!txt.split(/\r?\n/).some((l) => l.trim() === inc)) fs.writeFileSync(cfg, txt.replace(/\s*$/, '') + '\r\n' + inc + '\r\n');
  return { active: level };
}
async function restartAudio(be) {
  if (be.mock) return { ok: true };
  const r = await be.ps("Restart-Service -Name Audiosrv -Force -ErrorAction Stop", 30000);
  return { ok: r.code === 0 };
}
module.exports = { state, setProfile, restartAudio, PRESETS };
