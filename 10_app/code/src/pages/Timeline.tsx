// Life in months and years (ProjectionLab's "Your life in months", 2026-11-23): a grid of every month of a person's life,
// past months shaded and today marked, with the plan's events, milestones, retirement, and expected death on their
// months; a list of how many months lie behind and ahead of each; and one row a year with ages and the year's marks.
import { useState } from 'react';
import { yearOf } from '../engine/dates';
import { useProjection } from '../useProjection';
import { Card, Select, money } from '../ui';

type Mark = { t: number; label: string; kind: 'event' | 'milestone' | 'retire' | 'death' | 'short' };

export function TimelinePage() {
  const { plan, proj } = useProjection();
  const [who, setWho] = useState(plan.people[0]?.id ?? '');
  const person = plan.people.find((p) => p.id === who) ?? plan.people[0];
  const now = new Date();
  const today = now.getFullYear() + now.getMonth() / 12;
  const born = person ? (person.birthDate ? yearOf(person.birthDate) : person.birthYear + 0.5) : today;
  const names = (ids: string[]) => ids.map((id) => plan.milestones.find((m) => m.id === id)?.name).filter(Boolean) as string[];
  const marks: Mark[] = [
    ...(plan.events ?? []).map((e) => ({ t: e.date ? yearOf(e.date) : e.year, label: e.name, kind: 'event' as const })),
    ...proj.years.flatMap((y) => names(y.milestonesReached).map((n) => ({ t: y.year + 1, label: n, kind: 'milestone' as const }))),
    ...plan.people.map((p) => ({ t: p.birthYear + (plan.strategy.retirementAge[p.id] ?? 65), label: (p.name || 'You') + "'s retirement", kind: 'retire' as const })),
    ...plan.people.map((p) => ({ t: (p.birthDate ? yearOf(p.birthDate) : p.birthYear + 0.5) + p.lifeExpectancy, label: (p.name || 'You') + "'s life expectancy", kind: 'death' as const })),
    ...(proj.depletionYear ? [{ t: proj.depletionYear, label: 'Money runs short', kind: 'short' as const }] : []),
  ].sort((a, b) => a.t - b.t);
  const years = person ? Math.ceil(person.lifeExpectancy) + 1 : 0;
  const monthOf = (t: number) => Math.floor((t - born) * 12);
  const byMonth = new Map<number, Mark[]>();
  for (const m of marks) { const k = monthOf(m.t); byMonth.set(k, [...(byMonth.get(k) ?? []), m]); }
  const nowMonth = monthOf(today);
  const ahead = (t: number) => {
    const m = Math.round((t - today) * 12);
    return m < 0 ? Math.abs(m) + ' months ago' : m < 24 ? 'in ' + m + ' months' : 'in ' + Math.round(m / 12) + ' years';
  };
  return (
    <>
      <Card title="Your life in months" wide>
        <div className="row"><Select label="Person" value={person?.id ?? ''} options={plan.people.map((p) => [p.id, p.name || 'You'] as [string, string])} onChange={setWho} /></div>
        <div className="lifewrap">
          <div className="lifegrid" role="img" aria-label="Every month of this person's life">
            {Array.from({ length: years }, (_, yr) => (
              <div key={yr} className="liferow">
                <span className="lifeage">{yr % 10 === 0 ? yr : ''}</span>
                {Array.from({ length: 12 }, (_, mo) => {
                  const k = yr * 12 + mo, here = byMonth.get(k);
                  const cls = 'lm' + (k < nowMonth ? ' past' : k === nowMonth ? ' now' : '') + (here ? ' mark ' + here[0].kind : '');
                  return <i key={mo} className={cls} title={here ? here.map((h) => h.label).join(', ') : undefined} />;
                })}
              </div>
            ))}
          </div>
          <ul className="lifelist">
            <li><b>Behind you</b><small>{Math.max(0, nowMonth)} months</small></li>
            <li className="nowi"><b>Today</b><small>{now.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</small></li>
            {marks.filter((m) => m.t >= today - 1).map((m, i) => (
              <li key={i} className={m.kind}><b>{m.label}</b><small>{ahead(m.t)}</small></li>
            ))}
          </ul>
        </div>
      </Card>
      <Card title="Life in years" wide>
        <div className="timeline">
          {proj.years.map((y) => {
            const here = marks.filter((m) => Math.floor(m.t) === y.year);
            return (
              <div key={y.year} className={'tl' + (here.length ? ' has' : '')}>
                <span className="tly">{y.year}</span>
                <span className="tla">{plan.people.map((p) => (p.name || 'You') + ' ' + (y.year - p.birthYear)).join(' · ')}</span>
                <span className="tlm">{here.map((m, i) => <i key={i} className={'mk ' + m.kind}>{m.label}</i>)}</span>
                <span className="tln">{money(y.netWorth, true)}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
