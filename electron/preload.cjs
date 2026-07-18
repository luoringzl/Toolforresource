const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  authStatus: () => ipcRenderer.invoke('auth:status'),
  login: (username, password) => ipcRenderer.invoke('auth:login', username, password),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('auth:changePassword', oldPassword, newPassword),
  syncPeopleAccounts: (people) => ipcRenderer.invoke('auth:syncPeople', people),
  listAccounts: () => ipcRenderer.invoke('auth:listAccounts'),
  saveAccount: (values) => ipcRenderer.invoke('auth:saveAccount', values),
  resetPassword: (id, password) => ipcRenderer.invoke('auth:resetPassword', id, password),
  deleteAccount: (id) => ipcRenderer.invoke('auth:deleteAccount', id),
  loadData: () => ipcRenderer.invoke('db:load'),
  saveData: (data) => ipcRenderer.invoke('db:save', data),
  importSheet: (kind) => ipcRenderer.invoke('file:importSheet', kind),
  saveTemplate: (kind) => ipcRenderer.invoke('file:saveTemplate', kind),
  exportBackup: (data) => ipcRenderer.invoke('file:exportBackup', data),
  importBackup: () => ipcRenderer.invoke('file:importBackup'),
  openPath: (target) => ipcRenderer.invoke('path:open', target)
});
