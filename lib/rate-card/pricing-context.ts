import type { RateCardVersion, RateCardTier, RateCardItem } from "@/lib/types/rate-card";
import { SECTION_LABELS } from "@/lib/types/rate-card";
import { computeTierPrice, computeFloor } from "./compute";

export function buildPricingContext(
  version: RateCardVersion,
  tiers: RateCardTier[],
  items: RateCardItem[]
): string {
  const lines: string[] = [];

  lines.push(`# Fynd Studio Rate Card — ${version.version_label}`);
  lines.push(`FX Rate: 1 USD = ₹${version.fx_rate}`);
  lines.push(`Floor = 75% of list price (Pod DRI sign-off). Below floor = walk-away.`);
  lines.push("");

  lines.push("## Market Tiers");
  for (const t of tiers) {
    lines.push(`- ${t.name}: ${t.multiplier}× multiplier, ${t.currency} (${t.symbol}), countries: ${t.countries.join(", ")}`);
  }
  lines.push("");

  const sections = [...new Set(items.map((i) => i.section))];
  for (const section of sections) {
    const label = SECTION_LABELS[section as keyof typeof SECTION_LABELS] ?? section;
    lines.push(`## ${label}`);
    const sectionItems = items.filter((i) => i.section === section).sort((a, b) => a.sort_order - b.sort_order);

    for (const item of sectionItems) {
      const indiaTier = tiers.find((t) => t.multiplier === 1);
      const uaeTier = tiers.find((t) => t.tier_key === "mea_t1");
      const usTier = tiers.find((t) => t.tier_key === "row_t1");

      let priceStr = `₹${item.base_inr.toLocaleString("en-IN")}`;
      if (uaeTier) {
        const uaePrice = computeTierPrice(item.base_inr, uaeTier.multiplier, version.fx_rate);
        priceStr += ` | UAE: $${uaePrice.toLocaleString("en-US")}`;
      }
      if (usTier) {
        const usPrice = computeTierPrice(item.base_inr, usTier.multiplier, version.fx_rate);
        priceStr += ` | US: $${usPrice.toLocaleString("en-US")}`;
      }

      const floorStr = `Floor: ₹${computeFloor(item.base_inr, item.floor_percent).toLocaleString("en-IN")}`;

      lines.push(`- **${item.name}** (${item.length ?? item.unit ?? "—"}): ${priceStr} | ${floorStr}${item.sla ? ` | SLA: ${item.sla}` : ""}${item.notes ? ` | ${item.notes}` : ""}`);
    }
    lines.push("");
  }

  lines.push("## Sales Playbook Rules");
  lines.push("- NEVER quote à la carte first to a CMO. À la carte is close-of-last-resort.");
  lines.push("- Lead with Annual Master, drop to Enterprise, then Professional, then Starter, then Pilot Sprint.");
  lines.push("- 14 Day Pilot Sprint: ₹4L wedge. 60% convert to retainer within 60 days.");
  lines.push("- Bundle discount: Gen Media + Marketing retainers together = 10% off the smaller line.");
  lines.push("- Quarterly upfront: 5% off. Annual upfront: 10% off.");
  lines.push("- Surcharges (NOT discountable): Rush +30%, scope change after storyboard +50%, brief change after delivery +100%, talent/music at cost +15%, language pack +25%.");
  lines.push("");

  lines.push("## Negotiation Guardrails");
  lines.push("- 0-10% discount: List price band. Any DRI can approve.");
  lines.push("- 10-20% discount: Manager approval band. Pod DRI sign-off required.");
  lines.push("- 20-25% discount: Floor zone. Senior manager sign-off.");
  lines.push("- 25%+ discount: Below floor. Walk away — offer 14 Day Pilot Sprint instead.");
  lines.push("- Floor = 75% of list price. Never go below floor.");
  lines.push("");

  lines.push("## How to Calculate Total Deal Value");
  lines.push("1. Start with list price for the selected tier and market");
  lines.push("2. Apply negotiated discount %");
  lines.push("3. Apply upfront commitment discount (quarterly 5% / annual 10%)");
  lines.push("4. If bundle (both Gen Media + Marketing): apply 10% off the smaller line");
  lines.push("5. Multiply by months committed = total contract value");

  return lines.join("\n");
}
