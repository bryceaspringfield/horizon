// The plugin API (ProjectionLab's Plugin API, 2026-11-23): scripts running in the page read the active plan's accounts and
// update balances, values, or cost basis, matched by account id, with the key shown in Settings. Off until enabled.
import { useStore } from './store';

type Update = { id: string; balance?: number; costBasis?: number };

function check(key: string) {
  const s = useStore.getState().settings;
  if (!s.pluginsEnabled || !s.pluginKey || key !== s.pluginKey) throw new Error('Horizon plugin API: plugins are off or the key is wrong');
}
const active = () => { const st = useStore.getState(); return st.plans.find((p) => p.id === st.activeId)!; };

export const pluginAPI = {
  /** The active plan's accounts: id, name, kind, owner, and balance (debts as positive amounts owed). */
  getAccounts(key: string) {
    check(key);
    return active().accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, ownerId: a.ownerId, balance: a.kind === 'debt' ? Math.abs(a.balance) : a.balance, costBasis: a.costBasis }));
  },
  /** Updates balances (debts as positive amounts owed) and cost basis by account id; returns the ids not found. */
  updateAccountValues(key: string, updates: Update[]) {
    check(key);
    const ids = new Set(active().accounts.map((a) => a.id));
    const missing = updates.filter((u) => !ids.has(u.id)).map((u) => u.id);
    useStore.getState().update((p) => {
      for (const u of updates) {
        const a = p.accounts.find((x) => x.id === u.id);
        if (!a) continue;
        if (typeof u.balance === 'number' && isFinite(u.balance)) a.balance = a.kind === 'debt' ? Math.abs(u.balance) : u.balance;
        if (typeof u.costBasis === 'number' && isFinite(u.costBasis)) a.costBasis = u.costBasis;
      }
    });
    return { missing };
  },
  /** Every plan, the progress records, and the settings, as the app's backup file holds them. */
  exportData(key: string) {
    check(key);
    const { plans, snapshots, settings } = useStore.getState();
    return structuredClone({ plans, snapshots, settings: { ...settings, pluginKey: undefined } });
  },
};

export function installPlugins() {
  (window as unknown as { horizonPluginAPI: typeof pluginAPI }).horizonPluginAPI = pluginAPI;
}
