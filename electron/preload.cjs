const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('grokDesktop', {
  pickFolder: (start) => ipcRenderer.invoke('pick-folder', typeof start === 'string' ? start : ''),
  revealFile: (path) => ipcRenderer.invoke('reveal-file', path),
})
