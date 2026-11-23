// Everything the app keeps, in the browser's local storage only: plans, net-worth snapshots, and settings. Export and
// import move it as one JSON file.
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { vaultStorage } from './vault';
import { accountStorage, signedIn } from './account';

/** Signed in: the account's encrypted copy on the server; otherwise this device's storage (a password vault or plain). */
const appStorage = {
  getItem: (n: string) => (signedIn() ? accountStorage.getItem() : vaultStorage.getItem(n)),
  setItem: (n: string, v: string) => (signedIn() ? accountStorage.setItem(n, v) : vaultStorage.setItem(n, v)),
  removeItem: (n: string) => (signedIn() ? accountStorage.removeItem() : vaultStorage.removeItem(n)),
};
import { examplePlan, uid, upgradePlan } from './engine/defaults';
import type { Plan } from './engine/types';

export interface Snapshot {
  id: string;
  date: string;
  /** Balance of each account on that date, and any accounts not in a plan by name. */
  balances: Record<string, number>;
  note?: string;
}

export interface Settings {
  /** The unit money amounts with a period are shown and entered in (Bryce, 2026-11-23); unset, each field's own. */
  amountUnit?: 'year' | 'month';
  realDollars: boolean;
  /** 'auto' follows the device's light or dark setting. */
  theme: 'auto' | 'light' | 'dark';
  mcTrials: number;
  mcMethod: 'normal' | 'historicalBlocks' | 'backtest';
  dismissedLockTip?: boolean;
  /** Set once the first-run setup (pages/Setup.tsx) built a plan or the user chose the example plan. */
  setupDone?: boolean;
  /** The plan the app opens on and other plans compare against. */
  mainPlanId?: string;
  /** Net worth charts count real assets (a home net of its mortgage). */
  chartRealAssets?: boolean;
  /** Show every amount as dots (for a screen someone else can see). */
  hideAmounts?: boolean;
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
  setMain: (id: string) => void;
  openMain: () => void;
  importAll: (data: Pick<AppState, 'plans' | 'snapshots' | 'settings'>) => void;
  undo: () => void;
  redo: () => void;
}

// Undo and redo of plan edits, for this session: the plans before each edit (edits within 0.8 s count as one, so typing a
// number is one step), up to 100 steps. Plans are replaced on every edit and never changed in place, so a step is a reference.
const undoStack: Plan[][] = [], redoStack: Plan[][] = [];
let lastEdit = 0, undoVersion = 0;
const undoListeners = new Set<() => void>();
const undoChanged = () => { undoVersion++; undoListeners.forEach((f) => f()); };
function remember(plans: Plan[]) {
  const now = Date.now();
  if (now - lastEdit > 800 || undoStack.length === 0) { undoStack.push(plans); if (undoStack.length > 100) undoStack.shift(); }
  lastEdit = now;
  redoStack.length = 0;
  undoChanged();
}
/** Whether an edit can be undone or redone now (followed live). */
export function useUndo(): { canUndo: boolean; canRedo: boolean } {
  useSyncExternalStore((f) => { undoListeners.add(f); return () => { undoListeners.delete(f); }; }, () => undoVersion, () => 0);
  return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}

const first = examplePlan();

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      plans: [first],
      activeId: first.id,
      compareIds: [],
      snapshots: [],
      settings: { realDollars: true, theme: 'auto', mcTrials: 1000, mcMethod: 'normal' },
      update: (fn) =>
        set((st) => {
          remember(st.plans);
          let plans = st.plans.map((p) => {
            if (p.id !== st.activeId) return p;
            const next = structuredClone(p);
            fn(next);
            return next;
          });
          // Plans following the main plan take its people, first year, and accounts after each edit of it.
          const main = plans.find((p) => p.id === st.settings.mainPlanId);
          if (main && main.id === st.activeId) {
            plans = plans.map((p) => (p.followsMain && p.id !== main.id
              ? { ...p, people: structuredClone(main.people), startYear: main.startYear, accounts: structuredClone(main.accounts) } : p));
          }
          return { plans };
        }),
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
          remember(st.plans);
          const plans = st.plans.filter((p) => p.id !== id);
          if (plans.length === 0) plans.push(examplePlan());
          return { plans, activeId: st.activeId === id ? plans[0].id : st.activeId, compareIds: st.compareIds.filter((x) => x !== id) };
        }),
      setCompare: (ids) => set({ compareIds: ids }),
      addSnapshot: (s) => set((st) => ({ snapshots: [...st.snapshots, s].sort((a, b) => a.date.localeCompare(b.date)) })),
      deleteSnapshot: (id) => set((st) => ({ snapshots: st.snapshots.filter((s) => s.id !== id) })),
      setSettings: (s) => set((st) => ({ settings: { ...st.settings, ...s } })),
      setMain: (id) => set((st) => ({ settings: { ...st.settings, mainPlanId: id } })),
      openMain: () => set((st) => (st.plans.some((p) => p.id === st.settings.mainPlanId) ? { activeId: st.settings.mainPlanId! } : {})),
      undo: () => {
        const prev = undoStack.pop();
        if (!prev) return;
        redoStack.push(get().plans);
        lastEdit = 0;
        set((st) => ({ plans: prev, activeId: prev.some((p) => p.id === st.activeId) ? st.activeId : prev[0].id }));
        undoChanged();
      },
      redo: () => {
        const next = redoStack.pop();
        if (!next) return;
        undoStack.push(get().plans);
        lastEdit = 0;
        set((st) => ({ plans: next, activeId: next.some((p) => p.id === st.activeId) ? st.activeId : next[0].id }));
        undoChanged();
      },
      importAll: (data) => set({ plans: data.plans.map(upgradePlan), snapshots: data.snapshots ?? [], settings: { ...(data.settings ?? get().settings), setupDone: true }, activeId: data.plans[0].id }),
    }),
    // The state is read only after the login screen (main.tsx) unlocks a vault, or at once when there is none.
    {
      name: 'horizon-v1', storage: createJSONStorage(() => appStorage), skipHydration: true, version: 3,
      migrate: (state, version) => {
        const s = state as { plans?: Plan[]; settings?: { theme?: string; setupDone?: boolean } };
        s.plans?.forEach(upgradePlan);
        // Auto became the default theme in version 3: Light, the old default, becomes Auto; a chosen Dark stays.
        if (version < 3 && s.settings?.theme === 'light') s.settings.theme = 'auto';
        // The first-run setup came with version 3: plans stored before it are the user's own already.
        if (version < 3 && s.settings) s.settings.setupDone = true;
        return s as AppState;
      },
    },
  ),
);

const darkQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
/** Whether the device asks for a dark look. */
export const deviceDark = () => darkQuery?.matches ?? false;
/** Whether the app shows dark now: the chosen theme, or the device's setting under Auto (followed live). */
export function useDark(): boolean {
  const theme = useStore((s) => s.settings.theme);
  const device = useSyncExternalStore(
    (f) => { darkQuery?.addEventListener('change', f); return () => darkQuery?.removeEventListener('change', f); },
    deviceDark, () => false);
  return theme === 'auto' ? device : theme === 'dark';
}

export const useActivePlan = () => useStore((st) => st.plans.find((p) => p.id === st.activeId) ?? st.plans[0]);
