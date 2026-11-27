// Bridge between MacShot's pages (recorder, area and colour pickers, tools, annotate)
// and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const kind = new URLSearchParams(location.search).get('kind') || 'screen';

// Main-process events a page may listen to.
const EVENTS = ['stop', 'tab', 'ocr-image', 'clips-changed', 'colors-changed', 'annotate-image', 'picker-image'];

contextBridge.exposeInMainWorld('macshot', {
  kind,
  started: (ext) => ipcRenderer.invoke('recording-started', kind, ext),
  chunk: (data) => ipcRenderer.invoke('recording-chunk', kind, data),
  stopped: (error) => ipcRenderer.invoke('recording-stopped', kind, error),
  onStop: (fn) => ipcRenderer.on('stop', fn),
  // Area and colour pickers
  areaPicked: (rect) => ipcRenderer.invoke('area-picked', rect),
  colorPicked: (hex) => ipcRenderer.invoke('color-picked', hex),
  // Tool pages: call('clips'), call('notes-save', notes), …
  call: (name, ...args) => ipcRenderer.invoke('tool:' + name, ...args),
  on: (event, fn) => { if (EVENTS.includes(event)) ipcRenderer.on(event, (_e, ...args) => fn(...args)); },
});
