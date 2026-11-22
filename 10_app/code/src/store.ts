// Everything the app keeps, in the browser's local storage only: plans, net-worth snapshots, and settings. Export and
// import move it as one JSON file.
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { vaultStorage } from './vault';
import { examplePlan, uid } from './engine/defaults';
import type { Plan } from './engine/types';

export interface Snapshot {
  id: string;
  date: string;
  /** Balance of each account on that date, and any accounts not in a plan by name. */
  balances: Record<string, number>;
  note?: string;
}

export interface Settings {
  realDollars: boolean;
  theme: 'light' | 'dark';
  mcTrials: number;
  mcMethod: 'normal' | 'historicalBlocks' | 'backtest';
}

interface AppState {
  plans: Plan[];
  activeId: string;
  compareIds: string[];
  snapshots: Snapshot[];
  settings: Settings;
  update: (fn: (p: Plan) => void) => void;
  setActive: (id: string) => void;
  addPlan: (p?: Plan) => void;
  duplicatePlan: (id: string) => void;
  deletePlan: (id: string) => void;
  setCompare: (ids: string[]) => void;
  addSnapshot: (s: Snapshot) => void;
  deleteSnapshot: (id: string) => void;
  setSettings: (s: Partial<Settings>) => void;
  importAll: (data: Pick<AppState, 'plans' | 'snapshots' | 'settings'>) => void;
}

const first = examplePlan();

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      plans: [first],
      activeId: first.id,
      compareIds: [],
      snapshots: [],
      settings: { realDollars: true, theme: 'light', mcTrials: 1000, mcMethod: 'normal' },
      update: (fn) =>
        set((st) => ({
          plans: st.plans.map((p) => {
            if (p.id !== st.activeId) return p;
            const next = structuredClone(p);
            fn(next);
            return next;
          }),
        })),
      setActive: (id) => set({ activeId: id }),
      addPlan: (p) => {
        const plan = p ?? { ...examplePlan(), name: 'New plan' };
        set((st) => ({ plans: [...st.plans, plan], activeId: plan.id }));
      },
      duplicatePlan: (id) => {
        const src = get().plans.find((p) => p.id === id);
        if (!src) return;
        const copy = { ...structuredClone(src), id: uid(), name: src.name + ' (copy)' };
        set((st) => ({ plans: [...st.plans, copy], activeId: copy.id }));
      },
      deletePlan: (id) =>
        set((st) => {
          const plans = st.plans.filter((p) => p.id !== id);
          if (plans.length === 0) plans.push(examplePlan());
          return { plans, activeId: st.activeId === id ? plans[0].id : st.activeId, compareIds: st.compareIds.filter((x) => x !== id) };
        }),
      setCompare: (ids) => set({ compareIds: ids }),
      addSnapshot: (s) => set((st) => ({ snapshots: [...st.snapshots, s].sort((a, b) => a.date.localeCompare(b.date)) })),
      deleteSnapshot: (id) => set((st) => ({ snapshots: st.snapshots.filter((s) => s.id !== id) })),
      setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      importAll: (data) => set({ plans: data.plans, snapshots: data.snapshots ?? [], settings: data.settings ?? get().settings, activeId: data.plans[0].id }),
    }),
    // The state is read only after the login screen (main.tsx) unlocks a vault, or at once when there is none.
    { name: 'horizon-v1', storage: createJSONStorage(() => vaultStorage), skipHydration: true },
  ),
);

export const useActivePlan = () => useStore((st) => st.plans.find((p) => p.id === st.activeId) ?? st.plans[0]);
