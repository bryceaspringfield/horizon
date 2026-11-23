// The active plan's deterministic projection, recomputed when the plan changes, and a helper turning a year's nominal
// dollars into today's dollars when the "today's dollars" setting is on.
import { useMemo } from 'react';
import { expandEvents, simulate } from './engine/simulate';
import type { Plan, Projection } from './engine/types';
import { useActivePlan, useStore } from './store';

export function deflators(plan: Plan, proj: Projection): number[] {
  let k = 1;
  return proj.years.map(() => {
    const v = k;
    k *= 1 + plan.assumptions.inflation;
    return v;
  });
}

export function useProjection() {
  const raw = useActivePlan();
  const real = useStore((s) => s.settings.realDollars);
  return useMemo(() => {
    // The plan with its life events applied, so the charts know the accounts and expenses the events create.
    const plan = expandEvents(rolled(structuredClone(raw)));
    const proj = simulate(structuredClone(plan));
    const d = deflators(plan, proj);
    const adj = (v: number, i: number) => (real ? v / d[i] : v);
    return { plan, proj, adj, real };
  }, [raw, real]);
}

/** A plan set to start from the current year starts there; events keep their own years. */
function rolled(p: Plan): Plan {
  if (p.rollingStart) p.startYear = Math.max(p.startYear, new Date().getFullYear());
  return p;
}

export function projectPlan(raw: Plan) {
  const plan = expandEvents(rolled(structuredClone(raw)));
  const proj = simulate(structuredClone(plan));
  return { proj, d: deflators(plan, proj) };
}
