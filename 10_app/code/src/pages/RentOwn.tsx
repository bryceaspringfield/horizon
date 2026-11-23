// Rent or buy (2026-11-23): the two paths' wealth by year and the year buying comes out ahead (engine/rentown.ts).
import { useState } from 'react';
import { rentVsOwn, type RentOwnInputs } from '../engine/rentown';
import { Card, Chart, Num, Stat, money, moneyAxis, moneyTooltip } from '../ui';

export function RentOwnPage() {
  const [x, setX] = useState<RentOwnInputs>({
    price: 0, downShare: 0.2, closingShare: 0.03, rate: 0, termYears: 30, propertyTaxRate: 0.011, insuranceYearly: 0,
    upkeepRate: 0.01, appreciation: 0.03, sellingShare: 0.06, rentMonthly: 0, rentGrowth: 0.03, investReturn: 0.065, years: 30,
  });
  const set = (k: keyof RentOwnInputs) => (v: number) => setX({ ...x, [k]: v });
  const ready = x.price > 0 && x.rentMonthly > 0;
  const r = ready ? rentVsOwn(x) : null;
  const last = r?.years[r.years.length - 1];
  return (
    <>
      <Card title="The home and the loan">
        <div className="grid">
          <Num label="Home price" value={x.price} onChange={set('price')} />
          <Num label="Down payment" percent value={x.downShare} onChange={set('downShare')} />
          <Num label="Closing costs" percent value={x.closingShare} onChange={set('closingShare')} />
          <Num label="Mortgage rate" percent value={x.rate} onChange={set('rate')} />
          <Num label="Term (years)" value={x.termYears} onChange={set('termYears')} />
          <Num label="Property tax (share of home value)" percent value={x.propertyTaxRate} onChange={set('propertyTaxRate')} />
          <Num label="Home insurance a year" value={x.insuranceYearly} onChange={set('insuranceYearly')} />
          <Num label="Upkeep (share of home value a year)" percent value={x.upkeepRate} onChange={set('upkeepRate')} />
          <Num label="Home appreciation a year" percent value={x.appreciation} onChange={set('appreciation')} />
          <Num label="Selling costs" percent value={x.sellingShare} onChange={set('sellingShare')} />
        </div>
      </Card>
      <Card title="Renting">
        <div className="grid">
          <Num label="Rent a month" value={x.rentMonthly} onChange={set('rentMonthly')} />
          <Num label="Rent increase a year" percent value={x.rentGrowth} onChange={set('rentGrowth')} />
          <Num label="Return on money invested instead" percent value={x.investReturn} onChange={set('investReturn')} />
          <Num label="Years to compare" value={x.years} onChange={(v) => set('years')(Math.max(1, Math.min(60, Math.round(v))))} />
        </div>
      </Card>
      {r && last && <>
        <div className="stats">
          <Stat icon="trend" label="Buying comes out ahead" value={r.breakEven ? 'In year ' + r.breakEven : 'Not within ' + x.years + ' years'} tone={r.breakEven ? 'good' : 'bad'} />
          <Stat icon="trend" label={'Buying, after ' + x.years + ' years'} value={money(last.buy, true)} sub="home equity after selling costs" />
          <Stat icon="trend" label={'Renting, after ' + x.years + ' years'} value={money(last.rent, true)} sub="investments" />
        </div>
        <Card title="Wealth on each path" wide>
          <Chart option={{
            tooltip: moneyTooltip, legend: { top: 0 }, grid: { left: 70, right: 20, top: 40, bottom: 30 },
            xAxis: { type: 'category', data: r.years.map((y) => 'Year ' + y.year) }, yAxis: moneyAxis,
            series: [
              { name: 'Buy', type: 'line', symbol: 'none', data: r.years.map((y) => Math.round(y.buy)) },
              { name: 'Rent and invest', type: 'line', symbol: 'none', data: r.years.map((y) => Math.round(y.rent)) },
            ],
          }} />
        </Card>
      </>}
    </>
  );
}
