import { normalizeDatabase } from '../schema/database.mjs';

export const DEFAULT_DATABASE_KEY='project-resource-db';

export function createLocalDatabaseRepository({ storage = globalThis.localStorage, key = DEFAULT_DATABASE_KEY } = {}) {
  return {
    load() {
      try {
        const raw=storage?.getItem(key);
        return normalizeDatabase(raw ? JSON.parse(raw) : null);
      } catch {
        return normalizeDatabase(null);
      }
    },
    save(data) {
      const normalized=normalizeDatabase(data);
      storage?.setItem(key, JSON.stringify(normalized));
      return { ok:true, data:normalized };
    },
    update(mutator) {
      const data=this.load();
      const result=mutator(data);
      if (result?.ok === false) return result;
      const saved=this.save(data);
      return result ?? { ok:true, data:saved.data };
    }
  };
}
