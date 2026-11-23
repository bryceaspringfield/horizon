// Small building blocks shared by every page: money and percent formatting, labeled inputs, cards, and a chart.
import ReactECharts from 'echarts-for-react';
import type { ReactNode } from 'react';
import { useDark } from './store';
import { Icon } from './icons';
import { formatMoney } from './engine/currency';

// Every amount on screen is in the active plan's currency; App sets it before the pages render.
let shownCurrency = 'USD';
export const setShownCurrency = (code: string) => { shownCurrency = code; };
let hidden = false;
export const setAmountsHidden = (h: boolean) => { hidden = h; };
export const money = (v: number, compact = false) => (hidden ? '•••••' : formatMoney(v, shownCurrency, compact));
export const pct = (v: number, d = 1) => `${((v || 0) * 100).toFixed(d)}%`;

export function Card({ title, children, actions, wide }: { title?: string; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  return (
    <section className={'card' + (wide ? ' wide' : '')}>
      {(title || actions) && (
        <header>
          <h3>{title}</h3>
          <div className="actions">{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad'; icon?: string }) {
  return (
    <div className={'stat ' + (tone ?? '')}>
      {icon && <div className="ico"><Icon name={icon} /></div>}
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

type NumProps = { label: string; value: number | undefined; onChange: (v: number) => void; percent?: boolean; step?: number; hint?: string };

export function Num({ label, value, onChange, percent, step, hint }: NumProps) {
  const shown = value === undefined ? '' : percent ? +(value * 100).toFixed(4) : value;
  return (
    <label className="field" title={hint}>
      <span>{label}</span>
      <div className="input">
        <input
          type="number"
          step={step ?? (percent ? 0.1 : 1)}
          value={shown}
          onChange={(e) => {
            const v = e.target.value === '' ? 0 : Number(e.target.value);
            onChange(percent ? v / 100 : v);
          }}
        />
        {percent && <em>%</em>}
      </div>
    </label>
  );
}

export function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input"><input value={value} onChange={(e) => onChange(e.target.value)} /></div>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    </label>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** A list of items, each a card of fields, with add and remove. */
export function ListEditor<T extends { id?: string }>({ items, render, onAdd, onRemove, title, empty }: {
  items: T[];
  render: (item: T, i: number) => ReactNode;
  onAdd: () => void;
  onRemove: (i: number) => void;
  title: (item: T) => string;
  empty: string;
}) {
  return (
    <div className="list">
      {items.length === 0 && <p className="muted">{empty}</p>}
      {items.map((it, i) => (
        <details key={it.id ?? i} className="item">
          <summary>
            <span>{title(it)}</span>
            <button className="ghost danger" onClick={(e) => { e.preventDefault(); onRemove(i); }}>Remove</button>
          </summary>
          <div className="grid">{render(it, i)}</div>
        </details>
      ))}
      <button onClick={onAdd}>+ Add</button>
    </div>
  );
}

export const PALETTE = ['#5b5bf0', '#14b8a6', '#f59e0b', '#a855f7', '#f43f5e', '#0ea5e9', '#ec4899', '#84cc16', '#6366f1', '#10b981', '#fb923c', '#94a3b8'];

/** An ECharts chart with the app's look: muted axes, dashed grid lines, rounded tooltips, and the app palette. */
export function Chart({ option, height = 360 }: { option: Record<string, unknown>; height?: number }) {
  const dark = useDark();
  const muted = dark ? '#959bb4' : '#6b7185', line = dark ? '#262d48' : '#e7e9f2';
  const axis = (ax: unknown) => {
    const style = (x: Record<string, unknown>) => ({
      axisLine: { lineStyle: { color: line } }, axisTick: { show: false },
      splitLine: { lineStyle: { color: line, type: 'dashed' } },
      ...x, axisLabel: { color: muted, ...(x.axisLabel as object) },
    });
    return Array.isArray(ax) ? ax.map(style) : ax ? style(ax as Record<string, unknown>) : ax;
  };
  const full = {
    color: PALETTE, backgroundColor: 'transparent', textStyle: { fontFamily: 'Inter, system-ui, sans-serif' },
    ...option,
    xAxis: axis(option.xAxis), yAxis: axis(option.yAxis),
    legend: option.legend ? { icon: 'roundRect', itemWidth: 12, itemHeight: 12, textStyle: { color: muted }, ...(option.legend as object) } : undefined,
    tooltip: option.tooltip ? { backgroundColor: dark ? '#1a2038' : '#fff', borderColor: line, borderRadius: 12, padding: [10, 14],
      textStyle: { color: dark ? '#e8eaf4' : '#1b2033' }, extraCssText: 'box-shadow: 0 8px 24px rgba(20,24,60,.12);', ...(option.tooltip as object) } : undefined,
  };
  const narrow = typeof window !== 'undefined' && window.innerWidth < 600;
  const f = full as Record<string, unknown>;
  if (narrow && f.grid) { const g = f.grid as { top?: number }; f.grid = { ...g, left: 52, right: 8, top: f.legend ? Math.max(g.top ?? 0, 72) : g.top }; }
  return <ReactECharts option={full} style={{ height: narrow ? Math.min(height, 300) : height }} notMerge />;
}

export const moneyAxis = { type: 'value', axisLabel: { formatter: (v: number) => money(v, true) } };
export const moneyTooltip = { trigger: 'axis', valueFormatter: (v: number) => money(v) };
