// Line icons for the sidebar and tiles, drawn on a 24-pixel grid in the current text color.
const paths: Record<string, string> = {
  dashboard: 'M3 13h8V3H3zM13 21h8v-8h-8zM3 21h8v-6H3zM13 11h8V3h-8z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  accounts: 'M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M2 21h20M12 2l10 5H2z',
  income: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  expenses: 'M2 7h20v12H2zM2 11h20M6 15h4',
  milestones: 'M4 22V4M4 4h12l-2 4 2 4H4',
  strategy: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  taxhealth: 'M9 14l6-6M9.5 8.5h.01M14.5 13.5h.01M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z',
  assumptions: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  networth: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  cashflow: 'M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3',
  taxes: 'M4 2h16v20l-4-2-4 2-4-2-4 2zM8 7h8M8 11h8M8 15h5',
  montecarlo: 'M3 12h4l3-9 4 18 3-9h4',
  compare: 'M18 20V10M12 20V4M6 20v-6',
  progress: 'M22 12h-4l-3 9L9 3l-3 9H2',
  table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  report: 'M6 2h9l5 5v15H6zM15 2v5h5M9 12h8M9 16h8M9 8h3',
  terms: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  settings: 'M12 1v4M12 19v4M4.2 4.2l2.9 2.9M16.9 16.9l2.9 2.9M1 12h4M19 12h4M4.2 19.8l2.9-2.9M16.9 7.1l2.9-2.9',
  events: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01',
  fire: 'M12 2c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8M8.5 14.5A3.5 3.5 0 0 0 12 22a3.5 3.5 0 0 0 3.5-3.5',
  optimize: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z',
  estate: 'M3 21h18M5 21V10l7-6 7 6v11M9 21v-6h6v6',
  plot: 'M3 3v18h18M7 14l3-3 3 3 5-6M18 8h-3M18 8v3',
  menu: 'M3 6h18M3 12h18M3 18h18',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  trend: 'M23 6l-9.5 9.5-5-5L1 18',
  coins: 'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12M18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8',
};

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name] ?? paths.dashboard} />
    </svg>
  );
}
