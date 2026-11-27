// Bridge between the Jhuli windows and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tk', {
  call: (cmd, arg) => ipcRenderer.invoke('tk', cmd, arg),
  onChange: (fn) => ipcRenderer.on('changed', (_e, what) => fn(what)),
  onOpenTool: (fn) => ipcRenderer.on('open-tool', (_e, tool) => fn(tool)),
});
