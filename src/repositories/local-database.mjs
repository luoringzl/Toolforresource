import { emptyDatabase } from '../core.mjs';

export const DEFAULT_DATABASE_KEY='project-resource-db';

export function createLocalDatabaseRepository({ storage = globalThis.localStorage, key = DEFAULT_DATABASE_KEY } = {}) {
  return {
    load() {
      try {
        const raw=storage?.getItem(key);
        return raw ? JSON.parse(raw) : emptyDatabase();
      } catch {
        return emptyDatabase();
      }
    },
    save(data) {
      storage?.setItem(key, JSON.stringify(data));
      return { ok:true };
    },
    update(mutator) {
      const data=this.load();
      const result=mutator(data);
      if (result?.ok === false) return result;
      this.save(data);
      return result ?? { ok:true, data };
    }
  };
}
