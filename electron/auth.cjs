const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADMIN_USERNAME = 'admin';

function temporaryPassword() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 14);
}

function normalizePositions(person = {}) {
  const source = Array.isArray(person.positions) ? person.positions : String(person.position || '').split(/[、,，;；|\n]+/);
  return source.map(item => String(item || '').trim()).filter(Boolean);
}

function roleForPerson(person = {}) {
  const positions = normalizePositions(person);
  return positions.some(value => value === '总经理' || value === '项目经理 / PM' || value.toUpperCase() === 'PM') ? 'manager' : 'viewer';
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

function passwordMatches(password, account) {
  const actual = crypto.scryptSync(String(password), account.salt, 64);
  const expected = Buffer.from(account.passwordHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function makeAccount({ username, displayName, personId = '', role = 'viewer', password, mustChangePassword = true, roleOverride = '' }) {
  const encoded = hashPassword(password);
  return {
    id: crypto.randomUUID(), username, displayName: displayName || username, personId, role, roleOverride,
    active: true, mustChangePassword, salt: encoded.salt, passwordHash: encoded.hash,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

function publicAccount(account) {
  if (!account) return null;
  const { passwordHash, salt, temporaryPassword: _temporaryPassword, ...safe } = account;
  return safe;
}

function adminAccount(account) {
  return { ...publicAccount(account), temporaryPassword: account.temporaryPassword || '' };
}

function initialState() {
  const password = temporaryPassword();
  const account = makeAccount({ username:ADMIN_USERNAME, displayName:'高级管理员', role:'admin', password });
  account.temporaryPassword = password;
  return {
    version: 1,
    accounts: [account]
  };
}

function createAuthService(filePath) {
  let currentUser = null;

  function load() {
    if (!fs.existsSync(filePath)) {
      const state = initialState();
      save(state);
      return state;
    }
    try {
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(value.accounts)) throw new Error('账号文件格式错误');
      return value;
    } catch (error) {
      const broken = `${filePath}.broken-${Date.now()}`;
      fs.copyFileSync(filePath, broken);
      const state = initialState();
      save(state);
      return state;
    }
  }

  function save(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive:true });
    const temp = `${filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(temp, filePath);
  }

  function requireAdmin() {
    if (currentUser?.role !== 'admin') throw new Error('仅高级管理员可执行此操作');
  }

  return {
    status() {
      const bootstrap = load().accounts.find(item => item.username === ADMIN_USERNAME)?.temporaryPassword;
      return { authenticated:Boolean(currentUser), user:publicAccount(currentUser), setupCredentials:!currentUser&&bootstrap?{username:ADMIN_USERNAME,password:bootstrap}:null };
    },
    login(username, password) {
      const account = load().accounts.find(item => item.username === String(username || '').trim());
      if (!account || !account.active || !passwordMatches(password, account)) return { ok:false, error:'账号或密码错误' };
      currentUser = account;
      return { ok:true, user:publicAccount(account) };
    },
    logout() { currentUser = null; return { ok:true }; },
    changePassword(oldPassword, newPassword) {
      if (!currentUser) return { ok:false, error:'请先登录' };
      if (String(newPassword || '').length < 6) return { ok:false, error:'新密码至少需要 6 位' };
      const state = load();
      const account = state.accounts.find(item => item.id === currentUser.id);
      if (!account || !passwordMatches(oldPassword, account)) return { ok:false, error:'原密码错误' };
      const encoded = hashPassword(newPassword);
      Object.assign(account, { salt:encoded.salt, passwordHash:encoded.hash, mustChangePassword:false, updatedAt:new Date().toISOString() });
      delete account.temporaryPassword;
      save(state); currentUser = account;
      return { ok:true, user:publicAccount(account) };
    },
    syncPeople(people = []) {
      const state = load();
      const created = [];
      for (const person of people) {
        if (!person?.id || !String(person.name || '').trim()) continue;
        let account = state.accounts.find(item => item.personId === person.id);
        const calculatedRole = roleForPerson(person);
        if (!account) {
          if (state.accounts.some(item => item.username === person.name)) continue;
          const password = temporaryPassword();
          account = makeAccount({ username:person.name, displayName:person.name, personId:person.id, role:calculatedRole, password });
          account.temporaryPassword = password;
          state.accounts.push(account); created.push({ username:person.name, password });
        } else {
          account.username = person.name;
          account.displayName = person.name;
          account.role = account.roleOverride || calculatedRole;
          account.updatedAt = new Date().toISOString();
        }
        if (currentUser?.id === account.id) currentUser = account;
      }
      save(state);
      return { ok:true, created, accounts:currentUser?.role === 'admin' ? state.accounts.map(publicAccount) : undefined };
    },
    listAccounts() { requireAdmin(); return load().accounts.map(adminAccount); },
    saveAccount(values = {}) {
      requireAdmin();
      const state = load();
      let account = state.accounts.find(item => item.id === values.id);
      const username = String(values.username || '').trim();
      if (!username) return { ok:false, error:'账号不能为空' };
      if (state.accounts.some(item => item.username === username && item.id !== values.id)) return { ok:false, error:'账号已存在' };
      if (!account) {
        const password = String(values.password || temporaryPassword());
        account = makeAccount({ username, displayName:values.displayName || username, role:values.role || 'viewer', roleOverride:values.role || 'viewer', password });
        account.temporaryPassword = password;
        state.accounts.push(account);
      } else {
        const protectedAdmin = account.username === ADMIN_USERNAME;
        account.username = protectedAdmin ? ADMIN_USERNAME : username;
        account.displayName = values.displayName || username;
        account.roleOverride = protectedAdmin ? 'admin' : (values.role || account.roleOverride);
        account.role = account.roleOverride || account.role;
        account.active = protectedAdmin ? true : values.active !== false;
        account.updatedAt = new Date().toISOString();
      }
      save(state);
      return { ok:true, account:publicAccount(account) };
    },
    resetPassword(id, password = '') {
      requireAdmin();
      const state = load(); const account = state.accounts.find(item => item.id === id);
      if (!account) return { ok:false, error:'账号不存在' };
      password = String(password || temporaryPassword());
      const encoded = hashPassword(password);
      Object.assign(account, { salt:encoded.salt, passwordHash:encoded.hash, temporaryPassword:password, mustChangePassword:true, updatedAt:new Date().toISOString() });
      save(state); return { ok:true, initialPassword:password };
    },
    deleteAccount(id) {
      requireAdmin();
      const state = load(); const account = state.accounts.find(item => item.id === id);
      if (!account) return { ok:false, error:'账号不存在' };
      if (account.role === 'admin') return { ok:false, error:'高级管理员账号不能删除' };
      state.accounts = state.accounts.filter(item => item.id !== id);
      save(state); return { ok:true };
    }
  };
}

module.exports = {
  ADMIN_USERNAME, temporaryPassword,
  roleForPerson, hashPassword, passwordMatches, makeAccount, publicAccount, initialState, createAuthService
};
