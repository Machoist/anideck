// File: preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  config: () => ipcRenderer.invoke('config:get'),
  get: (key) => ipcRenderer.invoke('store:get', key),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  getSecret: (key) => ipcRenderer.invoke('secret:get', key),
  setSecret: (key, value) => ipcRenderer.invoke('secret:set', key, value),
  request: (req) => ipcRenderer.invoke('http:request', req),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  oauth: (opts) => ipcRenderer.invoke('oauth:open', opts),
  version: () => ipcRenderer.invoke('app:version'),
  saveArtifact: artifact => ipcRenderer.invoke('artifact:save', artifact),
  setFullscreen: (on) => ipcRenderer.invoke('win:fullscreen', on),
  updateState: () => ipcRenderer.invoke('update:state'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: (cb) => ipcRenderer.on('update:status', (_e, s) => cb(s)),

  // Stream resolver supports either a params object or provider plus episode data.
  resolveStream: (arg1, arg2) => {
    if (arg1 && typeof arg1 === 'object' && arg2 === undefined) {
      return ipcRenderer.invoke('resolveStream', arg1);
    }
    return ipcRenderer.invoke('resolveStream', { provider: arg1, ...(arg2 || {}) });
  },
  cancelStreamResolution: () => ipcRenderer.invoke('cancelStreamResolution'),
  getQualityOptions: (source, episodeData) => ipcRenderer.invoke('stream:getQualityOptions', source, episodeData),

  // The receiver gets proxied media, never account sign-in credentials.
  cast: {
    start: () => ipcRenderer.invoke('cast:start'),
    status: () => ipcRenderer.invoke('cast:status'),
    connect: code => ipcRenderer.invoke('cast:connect', code),
    load: media => ipcRenderer.invoke('cast:load', media),
    command: (action, value) => ipcRenderer.invoke('cast:command', action, value),
    disconnect: () => ipcRenderer.invoke('cast:disconnect'),
    stop: () => ipcRenderer.invoke('cast:stop'),
  },

  // Website opening & file download methods
  openWebsite: (animeId) => ipcRenderer.invoke('website:open', animeId),
  download: (url) => ipcRenderer.invoke('file:download', url),
});