// Bridge between the hidden recorder page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shotkit', {
  started: (ext) => ipcRenderer.invoke('recording-started', ext),
  chunk: (data) => ipcRenderer.invoke('recording-chunk', data),
  stopped: (error) => ipcRenderer.invoke('recording-stopped', error),
  onStop: (fn) => ipcRenderer.on('stop', fn),
});
