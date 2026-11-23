import { describe, expect, it, vi } from 'vitest';
import { examplePlan } from '../defaults';

// The store persists to localStorage, which the test environment lacks: a map stands in.
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v), removeItem: (k: string) => mem.delete(k) });

describe('plugin API', () => {
  it('refuses a wrong key and updates balances by id with the right one', async () => {
    const { useStore } = await import('../../store');
    const { pluginAPI } = await import('../../plugins');
    const plan = examplePlan();
    useStore.setState({ plans: [plan], activeId: plan.id, settings: { ...useStore.getState().settings, pluginsEnabled: true, pluginKey: 'k' } });
    expect(() => pluginAPI.getAccounts('bad')).toThrow();
    const a = pluginAPI.getAccounts('k')[0];
    const r = pluginAPI.updateAccountValues('k', [{ id: a.id, balance: 12345 }, { id: 'nope', balance: 1 }]);
    expect(r.missing).toEqual(['nope']);
    expect(pluginAPI.getAccounts('k')[0].balance).toBe(12345);
    expect((pluginAPI.exportData('k').settings as { pluginKey?: string }).pluginKey).toBeUndefined();
  });
});
