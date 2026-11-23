// The dashboard's list of things worth a look in the plan (engine/warnings.ts); each leads to the page which fixes it.
import { useMemo } from 'react';
import { planWarnings } from '../engine/warnings';
import { useProjection } from '../useProjection';

export function PlanWarnings({ go }: { go: (page: string) => void }) {
  const { plan, proj } = useProjection();
  const list = useMemo(() => planWarnings(plan, proj), [plan, proj]);
  if (list.length === 0) return null;
  return (
    <section className="card warnings">
      <h3>Worth a look</h3>
      <ul>
        {list.map((w) => <li key={w.text} className={w.level}><button className="link" onClick={() => go(w.page)}>{w.text}</button></li>)}
      </ul>
    </section>
  );
}
