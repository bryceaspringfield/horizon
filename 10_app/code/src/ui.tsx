import { useState } from 'react';
import { HELP } from './help';
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

/** A small info icon whose bubble explains a field: shown on hover and keyboard focus, and toggled by a tap on phones. */
export function InfoTip({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className={'info' + (open ? ' open' : '')} tabIndex={0} role="button" aria-label={text}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }} onBlur={() => setOpen(false)}>
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="4.8" r="1" fill="currentColor" /><path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <span className="tip" role="tooltip">{text}</span>
    </span>
  );
}

const help = (label: string, hint?: string) => hint ?? HELP[label];

type NumProps = { label: string; value: number | undefined; onChange: (v: number) => void; percent?: boolean; step?: number; hint?: string };

export function Num({ label, value, onChange, percent, step, hint }: NumProps) {
  const shown = value === undefined ? '' : String(percent ? +(value * 100).toFixed(4) : value);
  // the text being typed: an emptied box stays empty while focused (it used to snap back to 0), and becomes 0 on leaving
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="field">
      <span>{label}<InfoTip text={help(label, hint)} /></span>
      <div className="input">
        <input
          type="number"
          step={step ?? (percent ? 0.1 : 1)}
          value={draft ?? shown}
          onChange={(e) => {
            const t = e.target.value;
            setDraft(t);
            if (t === '' || t === '-' || Number.isNaN(Number(t))) return;
            const v = Number(t);
            onChange(percent ? v / 100 : v);
          }}
          onBlur={() => {
            if (draft === '' || draft === '-') onChange(0);
            setDraft(null);
          }}
        />
        {percent && <em>%</em>}
      </div>
    </label>
  );
}

export function Text({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="field">
      <span>{label}<InfoTip text={help(label, hint)} /></span>
      <div className="input"><input value={value} onChange={(e) => onChange(e.target.value)} /></div>
    </label>
  );
}

/** A choice drawn as controls, not a browser list: up to 4 short options as a row of pills, more as a styled menu
 * (keyboard: arrows, Enter, Escape). Each option carries data-value, which the browser checks click. */
export function Select<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const pills = options.length <= 4 && options.every(([, l]) => l.length <= 18);
  const current = options.find(([v]) => v === value)?.[1] ?? '';
  const pick = (v: T) => { onChange(v); setOpen(false); };
  return (
    <div className="field">
      <span>{label}<InfoTip text={help(label, hint)} /></span>
      {pills ? (
        <div className="pills" role="radiogroup" aria-label={label}>
          {options.map(([v, l]) => (
            <button type="button" key={v} data-value={v} role="radio" aria-checked={v === value} className={v === value ? 'on' : ''} onClick={() => pick(v)}>{l}</button>
          ))}
        </div>
      ) : (
        <div className="dd" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
          <button type="button" className="ddbtn" aria-haspopup="listbox" aria-expanded={open}
            onClick={() => { setOpen(!open); setHi(Math.max(0, options.findIndex(([v]) => v === value))); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); else setHi((h) => Math.min(options.length - 1, h + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              else if (e.key === 'Enter' && open) { e.preventDefault(); pick(options[hi][0]); }
              else if (e.key === 'Escape') setOpen(false);
            }}>
            <span>{current}</span>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
          {open && (
            <ul className="ddlist" role="listbox" aria-label={label}>
              {options.map(([v, l], k) => (
                <li key={v} data-value={v} role="option" aria-selected={v === value} tabIndex={-1}
                  className={(v === value ? 'on ' : '') + (k === hi ? 'hi' : '')}
                  onMouseEnter={() => setHi(k)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)}>
                  <span>{l}</span>
                  {v === value && <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function Check({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}<InfoTip text={help(label, hint)} />
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
  // a card just added opens at once: the add button notes the count, and the item past the old count renders open
  const [addedAt, setAddedAt] = useState<number | null>(null);
  return (
    <div className="list">
      {items.length === 0 && <p className="muted">{empty}</p>}
      {items.map((it, i) => (
        <details key={it.id ?? i} className="item" open={addedAt !== null && i >= addedAt && i < items.length ? true : undefined}>
          <summary>
            <span>{title(it)}</span>
            <button className="ghost danger" onClick={(e) => { e.preventDefault(); onRemove(i); }}>Remove</button>
          </summary>
          <div className="grid">{render(it, i)}</div>
        </details>
      ))}
      <button onClick={() => { setAddedAt(items.length); onAdd(); }}>+ Add</button>
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
