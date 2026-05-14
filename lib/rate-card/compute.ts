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

export function computeAllTierPrices(
  baseInr: number,
  floorPercent: number,
  tiers: RateCardTier[],
  fxRate: number
): TierPrice[] {
  return tiers.map((tier) => {
    const list = computeTierPrice(baseInr, tier.multiplier, fxRate);
    const floor = tier.multiplier === 1.0
      ? computeFloor(baseInr, floorPercent)
      : roundPrice((baseInr * tier.multiplier * (floorPercent / 100)) / fxRate);
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
