'use strict';
const fs = require('fs');
const path = require('path');

class State {
  constructor(dir) {
    this.file = path.join(dir, 'velox-state.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = {
      tweaks: {}, activeMode: 'normal', modeApplied: [], history: [], blocks: [], procDisabled: {}, devPrio: {}, dnsPrev: null, profiles: [], gamePrefs: {},
      settings: { autoDetect: true, autoOptimize: true, overlayAuto: true, overlayAlways: false, overlayCorner: 'tl', discordEnabled: true, discordClientId: '', discordImage: '', fx3d: true,
        gameOpts: { priority: true, gpuHigh: true, fso: false, persist: false, ram: true, bgLow: true, killBg: true, standby: true } },
    };
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const def = this.data.settings; Object.assign(this.data, saved);
      this.data.settings = { ...def, ...(saved.settings || {}), gameOpts: { ...def.gameOpts, ...((saved.settings || {}).gameOpts || {}) } };
    } catch { /* primera vez */ }
  }
  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1));
    fs.renameSync(tmp, this.file);
  }
  log(type, text) {
    this.data.history.unshift({ t: Date.now(), type, text });
    this.data.history.length = Math.min(this.data.history.length, 300);
    this.save();
  }
}
module.exports = { State };
