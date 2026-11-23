// Life in years (ProjectionLab's timeline, 2026-11-23): one row a year with each person's age, and the year's life
// events, milestones reached, retirements, and the year money runs short, if it does.
import { refLabel } from '../engine/dates';
import { useProjection } from '../useProjection';
import { Card, money } from '../ui';

export function TimelinePage() {
  const { plan, proj } = useProjection();
  const names = (ids: string[]) => ids.map((id) => plan.milestones.find((m) => m.id === id)?.name).filter(Boolean) as string[];
  return (
    <Card title="Life in years" wide>
      <div className="timeline">
        {proj.years.map((y) => {
          const events = (plan.events ?? []).filter((e) => e.year === y.year).map((e) => e.name);
          const retire = plan.people.filter((p) => p.birthYear + (plan.strategy.retirementAge[p.id] ?? 200) === y.year).map((p) => (p.name || 'You') + ' retires');
          const marks = [...events.map((t) => ['event', t]), ...names(y.milestonesReached).map((t) => ['milestone', t]), ...retire.map((t) => ['retire', t])];
          if (proj.depletionYear === y.year) marks.push(['short', 'Money runs short']);
          const starts = plan.incomes.filter((i) => i.start && Math.floor(i.startYear) === y.year).map((i) => ['event', i.name + ' starts (' + refLabel(i.start, plan) + ')']);
          marks.push(...starts);
          return (
            <div key={y.year} className={'tl' + (marks.length ? ' has' : '')}>
              <span className="tly">{y.year}</span>
              <span className="tla">{plan.people.map((p) => (p.name || 'You') + ' ' + (y.year - p.birthYear)).join(' · ')}</span>
              <span className="tlm">{marks.map(([k, t], i) => <i key={i} className={'mk ' + k}>{t}</i>)}</span>
              <span className="tln">{money(y.netWorth, true)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
