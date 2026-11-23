// What a person pays of a year's medical bills under a health plan: all of the bills up to the deductible, then the
// coinsurance share of the rest, never more than the out-of-pocket maximum.
export function outOfPocket(bills: number, c: { deductible: number; coinsurance: number; oopMax: number }): number {
  const paid = Math.min(bills, c.deductible) + Math.max(0, bills - c.deductible) * Math.max(0, Math.min(1, c.coinsurance));
  return Math.min(paid, c.oopMax > 0 ? c.oopMax : Infinity);
}
