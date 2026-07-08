import type { RateCardTier, TierPrice } from "@/lib/types/rate-card";

export function roundPrice(value: number): number {
  if (value < 100) return Math.round(value);
  if (value < 1000) return Math.round(value / 5) * 5;
  if (value < 10000) return Math.round(value / 25) * 25;
  return Math.round(value / 50) * 50;
}

export function computeTierPrice(
  baseInr: number,
  multiplier: number,
  fxRate: number
): number {
  if (multiplier === 1.0) return baseInr;
  return roundPrice((baseInr * multiplier) / fxRate);
}

export function computeFloor(listPrice: number, floorPercent: number): number {
  return roundPrice(listPrice * (floorPercent / 100));
}

export type FormulaContext = {
  base: number;
  mult: number;
  fx: number;
  floor: number;
};

export function evaluateFormula(
  expr: string,
  ctx: FormulaContext
): number | null {
  try {
    const sanitized = expr
      .replace(/^=/, "")
      .replace(/\bbase\b/gi, String(ctx.base))
      .replace(/\bmult\b/gi, String(ctx.mult))
      .replace(/\bfx\b/gi, String(ctx.fx))
      .replace(/\bfloor\b/gi, String(ctx.floor));
    if (!/^[\d\s+\-*/.,()]+$/.test(sanitized)) return null;
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${sanitized})`)() as number;
    if (!Number.isFinite(result) || result < 0) return null;
    return roundPrice(result);
  } catch {
    return null;
  }
}

export function isFormula(value: string): boolean {
  return value.startsWith("=");
}

export function getFormulaTooltip(
  baseInr: number,
  multiplier: number,
  fxRate: number,
  computedPrice: number,
  symbol: string,
  hasOverride: boolean,
  overrideValue?: number
): string {
  const formula = `₹${baseInr.toLocaleString("en-IN")} × ${multiplier}× ÷ ${fxRate.toFixed(1)} = ${symbol}${computedPrice.toLocaleString("en-US")}`;
  if (hasOverride && overrideValue !== undefined) {
    return `Override: ${symbol}${overrideValue.toLocaleString("en-US")} (formula: ${formula})`;
  }
  return formula;
}

export function computeAllTierPrices(
  baseInr: number,
  floorPercent: number,
  tiers: RateCardTier[],
  fxRate: number,
  overrides?: Record<string, { list?: number; floor?: number }> | null
): TierPrice[] {
  return tiers.map((tier) => {
    const ov = overrides?.[tier.tier_key];
    const list = ov?.list ?? computeTierPrice(baseInr, tier.multiplier, fxRate);
    const floor = ov?.floor ?? (tier.multiplier === 1.0
      ? computeFloor(baseInr, floorPercent)
      : roundPrice((baseInr * tier.multiplier * (floorPercent / 100)) / fxRate));
    return {
      tier_key: tier.tier_key,
      tier_name: tier.name,
      currency: tier.currency,
      symbol: tier.symbol,
      list,
      floor,
    };
  });
}
