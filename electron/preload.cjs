const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  loadData: () => ipcRenderer.invoke('db:load'),
  saveData: (data) => ipcRenderer.invoke('db:save', data),
  importSheet: (kind) => ipcRenderer.invoke('file:importSheet', kind),
  saveTemplate: (kind) => ipcRenderer.invoke('file:saveTemplate', kind),
  exportBackup: (data) => ipcRenderer.invoke('file:exportBackup', data),
  importBackup: () => ipcRenderer.invoke('file:importBackup'),
  openPath: (target) => ipcRenderer.invoke('path:open', target)
});
