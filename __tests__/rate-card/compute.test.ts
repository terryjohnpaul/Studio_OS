import { describe, it, expect } from "vitest";
import { computeTierPrice, computeFloor, computeAllTierPrices, roundPrice } from "@/lib/rate-card/compute";

describe("rate-card/compute", () => {
  it("computes USD price from INR base", () => {
    expect(computeTierPrice(71000, 4.0, 83.0)).toBe(3422);
  });

  it("computes floor at 75%", () => {
    expect(computeFloor(3425, 75)).toBe(2569);
  });

  it("returns INR directly for India tier (multiplier 1.0)", () => {
    expect(computeTierPrice(71000, 1.0, 83.0)).toBe(71000);
  });

  it("rounds prices to nearest integer", () => {
    expect(roundPrice(48.19)).toBe(48);
    expect(roundPrice(3421.69)).toBe(3422);
    expect(roundPrice(19277.1)).toBe(19277);
  });

  it("computes all tier prices for an item", () => {
    const tiers = [
      { tier_key: "india", multiplier: 1.0, currency: "INR", symbol: "₹", name: "India", id: "t1", version_id: "v1", region: "India", tier_level: "—", countries: [] as string[] },
      { tier_key: "mea_t1", multiplier: 4.0, currency: "USD", symbol: "$", name: "MEA T1", id: "t2", version_id: "v1", region: "MEA", tier_level: "T1", countries: [] as string[] },
    ];
    const prices = computeAllTierPrices(71000, 75, tiers, 83.0);
    expect(prices).toHaveLength(2);
    expect(prices[0].tier_key).toBe("india");
    expect(prices[0].list).toBe(71000);
    expect(prices[0].floor).toBe(53250);
    expect(prices[1].tier_key).toBe("mea_t1");
    expect(prices[1].currency).toBe("USD");
  });
});
