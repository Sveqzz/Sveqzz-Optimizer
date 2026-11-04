'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('velox', {
  call: (method, ...args) => ipcRenderer.invoke('api', method, args),
  cmd: (name, arg) => ipcRenderer.invoke('cmd', name, arg),
  onEvent: (cb) => ipcRenderer.on('ev', (_e, name, payload) => cb(name, payload)),
  onOverlay: (cb) => ipcRenderer.on('overlay-data', (_e, d) => cb(d)),
});
