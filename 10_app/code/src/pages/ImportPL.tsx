// Import from ProjectionLab (engine/projectionlab.ts): the file button, and the report of the last import, shown above
// the page until dismissed.
import { useSyncExternalStore } from 'react';
import { importProjectionLab, isProjectionLabExport, type ImportReport } from '../engine/projectionlab';
import { useStore } from '../store';

let report: ImportReport | null = null;
const listeners = new Set<() => void>();
const setReport = (r: ImportReport | null) => { report = r; listeners.forEach((f) => f()); };

/** Reads a ProjectionLab export and adds its plans; `replace` drops the plans here first (the first-run setup). */
async function run(file: File, replace: boolean) {
  try {
    const data = JSON.parse(await file.text());
    if (!isProjectionLabExport(data)) throw new Error('this file is no ProjectionLab export (in ProjectionLab: Account Settings, Data, Export Data)');
    const r = importProjectionLab(data);
    if (r.plans.length === 0) throw new Error('the file holds no plans');
    useStore.setState((st) => ({
      plans: replace ? r.plans : [...st.plans, ...r.plans], activeId: r.plans[0].id, compareIds: replace ? [] : st.compareIds,
      settings: { ...st.settings, setupDone: true, mainPlanId: replace ? r.plans[0].id : st.settings.mainPlanId },
    }));
    setReport(r);
    window.scrollTo(0, 0);
  } catch (e) {
    alert('Could not import: ' + (e as Error).message);
  }
}

export function ProjectionLabButton({ replace = false, ghost = false }: { replace?: boolean; ghost?: boolean }) {
  return (
    <label className={'button' + (ghost ? ' ghost' : '')}>Import from ProjectionLab
      <input type="file" name="projectionlab" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(f, replace); }} />
    </label>
  );
}

export function ImportReportCard() {
  const r = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => report, () => null);
  if (!r) return null;
  return (
    <section className="card importreport">
      <h3>Imported from ProjectionLab</h3>
      <p>{r.imported.map((x) => `${x.count} ${x.label}`).join(', ')}.</p>
      <p className="muted">Check these points, since the two apps model some things differently:</p>
      <ul className="muted">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      <div className="row"><button onClick={() => setReport(null)}>Done</button></div>
    </section>
  );
}
