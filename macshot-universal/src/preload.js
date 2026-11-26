// Bridge between MacShot's hidden recorder pages / area picker and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const kind = new URLSearchParams(location.search).get('kind') || 'screen';

contextBridge.exposeInMainWorld('macshot', {
  kind,
  started: (ext) => ipcRenderer.invoke('recording-started', kind, ext),
  chunk: (data) => ipcRenderer.invoke('recording-chunk', kind, data),
  stopped: (error) => ipcRenderer.invoke('recording-stopped', kind, error),
  onStop: (fn) => ipcRenderer.on('stop', fn),
  // Area picker
  areaPicked: (rect) => ipcRenderer.invoke('area-picked', rect),
});
