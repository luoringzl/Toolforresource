import { createLocalDatabaseRepository } from '../repositories/local-database.mjs';

export function createBrowserAPI({ storage = globalThis.localStorage, documentRef = globalThis.document, urlRef = globalThis.URL } = {}) {
  const repository=createLocalDatabaseRepository({storage});
  return {
    async authStatus() {
      return { authenticated:true, user:{ id:'local-admin', username:'admin', displayName:'高级管理员', role:'admin', mustChangePassword:false } };
    },
    async login() { return this.authStatus(); },
    async logout() { return {ok:true}; },
    async changePassword() { return {ok:true}; },
    async syncPeopleAccounts() { return {ok:true,created:[]}; },
    async listAccounts() { return []; },
    async saveAccount() { return {ok:true}; },
    async resetPassword() { return {ok:true,initialPassword:''}; },
    async deleteAccount() { return {ok:true}; },
    async loadData() { return repository.load(); },
    async saveData(data) { return repository.save(data); },
    async databaseDiagnostics() {
      const data=repository.load();
      const raw=storage?.getItem('project-resource-db')||'';
      return {exists:Boolean(raw),valid:true,sizeBytes:new Blob([raw]).size,version:Number(data.version||0),updatedAt:data.updatedAt||'',sha256:'',recoveryCount:0,recoveryPoints:[],browserMode:true};
    },
    async listRecoveryPoints() { return []; },
    async restoreRecoveryPoint() { return {ok:false,error:'浏览器模式不支持自动恢复点'}; },
    async clearRecoveryPoints() { return {ok:true,removed:0}; },
    async updatePersonAvatar(personId, avatarData) {
      return repository.update(data=>{
        const person=data.people.find(item=>item.id===personId);
        if(!person)return {ok:false,error:'人员档案不存在'};
        person.avatarData=avatarData||'';
        return {ok:true};
      });
    },
    async importSheet() { return { canceled:false, error:'请在 Windows 桌面软件中使用 Excel 导入功能' }; },
    async saveTemplate() { return { canceled:false, error:'请在 Windows 桌面软件中下载模板' }; },
    async exportBackup(data) {
      if (!documentRef || !urlRef?.createObjectURL) return { canceled:false, error:'当前环境不支持文件下载' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
      const link = documentRef.createElement('a');
      link.href = urlRef.createObjectURL(blob);
      link.download = '项目人员调度台-备份.json';
      link.click();
      return { canceled:false };
    },
    async importBackup() { return { canceled:false, error:'请在 Windows 桌面软件中恢复备份' }; },
    async openPath() { return ''; }
  };
}
