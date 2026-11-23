// Rent or buy (ProjectionLab's rent vs. own, 2026-11-23): two households with the same budget. The buyer pays the down
// payment and closing costs, the mortgage, property tax, insurance, and upkeep, and owns the home's equity less selling
// costs; the renter pays rent and invests what the buyer spends beyond it (the down payment at the start, and each year's
// difference after). Both in nominal dollars; the result is each path's wealth by year and the first year buying is ahead.

export interface RentOwnInputs {
  price: number; downShare: number; closingShare: number; rate: number; termYears: number;
  propertyTaxRate: number; insuranceYearly: number; upkeepRate: number; appreciation: number; sellingShare: number;
  rentMonthly: number; rentGrowth: number; investReturn: number; years: number;
}

export interface RentOwnYear { year: number; buy: number; rent: number }

export function rentVsOwn(x: RentOwnInputs): { years: RentOwnYear[]; breakEven: number | null } {
  const loan = x.price * (1 - x.downShare);
  const r = x.rate / 12, n = x.termYears * 12;
  const monthly = r > 0 ? (loan * r) / (1 - Math.pow(1 + r, -n)) : loan / n;
  let balance = loan, value = x.price, rent = x.rentMonthly * 12;
  let invested = x.price * (x.downShare + x.closingShare);
  const out: RentOwnYear[] = [];
  let breakEven: number | null = null;
  for (let y = 1; y <= x.years; y++) {
    let paid = 0;
    for (let m = 0; m < 12 && balance > 0; m++) {
      const interest = balance * r, pay = Math.min(monthly, balance + interest);
      balance -= pay - interest; paid += pay;
    }
    const owning = paid + value * x.propertyTaxRate + x.insuranceYearly + value * x.upkeepRate;
    // the renter invests the difference when owning costs more, and draws on it when renting costs more
    invested = invested * (1 + x.investReturn) + (owning - rent);
    value *= 1 + x.appreciation;
    rent *= 1 + x.rentGrowth;
    const buy = value * (1 - x.sellingShare) - Math.max(0, balance);
    out.push({ year: y, buy, rent: invested });
    if (breakEven === null && buy >= invested) breakEven = y;
  }
  return { years: out, breakEven };
}
