const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const { createAuthService } = require('./auth.cjs');
const { DB_VERSION, emptyDatabase } = require('./database-defaults.cjs');

const DB_NAME = 'project-resource-database.json';
const AUTH_NAME = 'project-resource-auth.json';
let authService;

function databasePath() { return path.join(app.getPath('userData'), DB_NAME); }
function authPath() { return path.join(app.getPath('userData'), AUTH_NAME); }
function localDateString(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadDatabase() {
  const file = databasePath();
  if (!fs.existsSync(file)) return emptyDatabase();
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...emptyDatabase(), ...value };
  } catch (error) {
    const broken = `${file}.broken-${Date.now()}`;
    fs.copyFileSync(file, broken);
    return { ...emptyDatabase(), recoveryWarning: `数据库读取失败，已备份为 ${broken}` };
  }
}

function saveDatabase(data) {
  const file = databasePath();
  const next = { ...data, version: DB_VERSION, meta:{...(data.meta||{}),schemaVersion:DB_VERSION}, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return { ok: true, updatedAt: next.updatedAt };
}

function syncAccountsWithDatabase(data) {
  if (!authService) return;
  authService.syncPeople(Array.isArray(data?.people) ? data.people : []);
}

function workbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 1120, minHeight: 720,
    backgroundColor: '#f4f7f8', title: '项目人员调度台', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
}

app.whenReady().then(() => {
  authService = createAuthService(authPath());
  syncAccountsWithDatabase(loadDatabase());
  const requireLogin = () => { if (!authService.status().authenticated) throw new Error('请先登录'); };
  const requireManager = () => { const role=authService.status().user?.role;if(!['admin','manager'].includes(role))throw new Error('当前账号只有查看权限'); };
  const requireAdmin = () => { if(authService.status().user?.role!=='admin')throw new Error('仅高级管理员可执行此操作'); };

  ipcMain.handle('auth:status', () => authService.status());
  ipcMain.handle('auth:login', (_event, username, password) => authService.login(username, password));
  ipcMain.handle('auth:logout', () => authService.logout());
  ipcMain.handle('auth:changePassword', (_event, oldPassword, newPassword) => authService.changePassword(oldPassword, newPassword));
  ipcMain.handle('auth:syncPeople', (_event, people) => { requireManager(); return authService.syncPeople(people); });
  ipcMain.handle('auth:listAccounts', () => { requireAdmin(); return authService.listAccounts(); });
  ipcMain.handle('auth:saveAccount', (_event, values) => { requireAdmin(); return authService.saveAccount(values); });
  ipcMain.handle('auth:resetPassword', (_event, id, password) => { requireAdmin(); return authService.resetPassword(id, password); });
  ipcMain.handle('auth:deleteAccount', (_event, id) => { requireAdmin(); return authService.deleteAccount(id); });

  ipcMain.handle('db:load', () => { requireLogin(); const data=loadDatabase();syncAccountsWithDatabase(data);return data; });
  ipcMain.handle('db:save', (_event, data) => { requireManager(); const result=saveDatabase(data);syncAccountsWithDatabase(data);return result; });
  ipcMain.handle('person:updateAvatar', (_event, personId, avatarData = '') => {
    requireLogin();
    const user=authService.status().user;
    if(!['admin','manager'].includes(user?.role)&&user?.personId!==personId)throw new Error('只能修改自己的头像');
    const value=String(avatarData||'');
    if(value&&!/^data:image\/(?:png|jpeg|webp);base64,/i.test(value))throw new Error('头像格式不受支持');
    if(Buffer.byteLength(value,'utf8')>3*1024*1024)throw new Error('头像数据不能超过 3MB');
    const data=loadDatabase();const person=data.people.find(item=>item.id===personId);if(!person)throw new Error('人员档案不存在');
    person.avatarData=value;return saveDatabase(data);
  });

  ipcMain.handle('file:importSheet', async (_event, kind) => {
    requireManager();
    const result = await dialog.showOpenDialog({
      title: kind === 'projects' ? '导入项目资料' : '导入人员资料',
      properties: ['openFile'], filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try { return { canceled: false, filePath: result.filePaths[0], rows: workbookRows(result.filePaths[0]) }; }
    catch (error) { return { canceled: false, error: error.message }; }
  });

  ipcMain.handle('file:saveTemplate', async (_event, kind) => {
    requireLogin();
    const name = kind === 'projects' ? '项目资料导入模板.xlsx' : '人员资料导入模板.xlsx';
    const source = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..'), 'templates', name);
    const result = await dialog.showSaveDialog({ title: '保存导入模板', defaultPath: name, filters: [{ name: 'Excel', extensions: ['xlsx'] }] });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.copyFileSync(source, result.filePath);
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('file:exportBackup', async (_event, data) => {
    requireAdmin();
    const day = localDateString();
    const result = await dialog.showSaveDialog({
      title: '导出完整数据备份', defaultPath: `项目人员调度台-备份-${day}.json`,
      filters: [{ name: 'JSON 数据备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('file:importBackup', async () => {
    requireAdmin();
    const result = await dialog.showOpenDialog({
      title: '恢复数据备份', properties: ['openFile'], filters: [{ name: 'JSON 数据备份', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    try {
      const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
      if (!Array.isArray(data.projects) || !Array.isArray(data.people)) throw new Error('不是有效的调度台备份文件');
      return { canceled: false, data };
    } catch (error) { return { canceled: false, error: error.message }; }
  });

  ipcMain.handle('path:open', async (_event, target) => {
    if (!target) return '路径为空';
    return shell.openPath(target);
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
