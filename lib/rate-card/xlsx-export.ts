import * as XLSX from "xlsx";
import type {
  RateCardVersion,
  RateCardTier,
  RateCardItem,
  RateCardSection,
} from "@/lib/types/rate-card";
import { computeTierPrice, computeFloor } from "./compute";

const SECTION_ORDER: RateCardSection[] = [
  "alacarte",
  "volume_retainer",
  "pilot_sprint",
  "brand_retainer",
  "per_campaign",
  "strategic",
];

const SECTION_HEADERS: Record<RateCardSection, string> = {
  alacarte: "§1 · Gen Media — A la carte (per finished asset)",
  volume_retainer: "§2 · Gen Media — Volume Retainer brackets (monthly commit)",
  pilot_sprint: "§3 · Gen Media — 14 Day Pilot Sprint",
  brand_retainer: "§4 · Marketing — Brand Retainer tiers (monthly retainer)",
  per_campaign: "§5 · Marketing — Per-campaign top-ups",
  strategic: "§6 · Marketing — Strategic project services (one-offs)",
};

/**
 * Export rate card data to an xlsx ArrayBuffer.
 *
 * Generates a workbook with a single "Rate Card" sheet containing:
 * - Header with version info
 * - Assumptions row (FX rate + tier multipliers)
 * - Items grouped by section, with computed list/floor prices per tier
 */
export function exportRateCardXlsx(
  version: RateCardVersion,
  tiers: RateCardTier[],
  items: RateCardItem[]
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const rows: (string | number | null)[][] = [];

  // Sort tiers: India first, then by region/tier
  const sortedTiers = [...tiers].sort((a, b) => {
    if (a.tier_key === "india") return -1;
    if (b.tier_key === "india") return 1;
    return a.tier_key.localeCompare(b.tier_key);
  });

  const indiaTier = sortedTiers.find((t) => t.tier_key === "india");
  const usdTiers = sortedTiers.filter((t) => t.tier_key !== "india");

  // ---- Row 0: Title ----
  rows.push([
    `Fynd Studio · Rate Card · ${version.version_label}`,
  ]);

  // ---- Row 1: Subtitle ----
  rows.push([
    `Exported from Command Centre · FX Rate: ${version.fx_rate} INR/USD`,
  ]);

  // ---- Row 2: Blank ----
  rows.push([]);

  // ---- Row 3: Assumptions header ----
  rows.push(["Assumptions (edit these to re-price all USD tiers)"]);

  // ---- Row 4: Tier labels for assumptions ----
  const assumptionLabels: (string | null)[] = ["FX (INR / USD)"];
  for (const t of usdTiers) {
    assumptionLabels.push(t.name.split("·")[0]?.trim() ?? t.tier_key);
  }
  rows.push(assumptionLabels);

  // ---- Row 5: Assumption values ----
  const assumptionValues: (number | null)[] = [version.fx_rate];
  for (const t of usdTiers) {
    assumptionValues.push(t.multiplier);
  }
  rows.push(assumptionValues);

  // ---- Row 6: Blank ----
  rows.push([]);

  // ---- Sections ----
  for (const section of SECTION_ORDER) {
    const sectionItems = items
      .filter((it) => it.section === section)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (sectionItems.length === 0) continue;

    // Section header row
    rows.push([SECTION_HEADERS[section]]);

    // Column headers
    const colHeaders: (string | null)[] = buildColumnHeaders(
      section,
      indiaTier,
      usdTiers
    );
    rows.push(colHeaders);

    // Sub-header (List / Floor)
    const subHeaders: (string | null)[] = buildSubHeaders(usdTiers);
    rows.push(subHeaders);

    // Item rows
    for (const item of sectionItems) {
      const row = buildItemRow(item, version.fx_rate, indiaTier, usdTiers);
      rows.push(row);
    }

    // Blank row after section
    rows.push([]);
  }

  // Build worksheet from rows
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set reasonable column widths
  const colWidths: XLSX.ColInfo[] = [
    { wch: 35 }, // A: Format/Name
    { wch: 12 }, // B: Length/Unit
  ];
  // India List + Floor = 2 cols
  colWidths.push({ wch: 14 }); // India List
  colWidths.push({ wch: 14 }); // India Floor
  // Each USD tier = 2 cols (List + Floor)
  for (let i = 0; i < usdTiers.length; i++) {
    colWidths.push({ wch: 14 });
    colWidths.push({ wch: 14 });
  }
  colWidths.push({ wch: 40 }); // Notes
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Rate Card");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return out as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildColumnHeaders(
  section: RateCardSection,
  indiaTier: RateCardTier | undefined,
  usdTiers: RateCardTier[]
): (string | null)[] {
  const firstCol =
    section === "alacarte"
      ? "Format"
      : section === "per_campaign"
        ? "Campaign"
        : section === "strategic"
          ? "Service"
          : section === "pilot_sprint"
            ? "Construct"
            : "Tier";

  const secondCol =
    section === "alacarte"
      ? "Length"
      : section === "per_campaign" || section === "strategic"
        ? "Description"
        : "Unit";

  const headers: (string | null)[] = [firstCol, secondCol];

  // India columns (List + Floor)
  const indiaLabel = indiaTier
    ? `${indiaTier.name} (${indiaTier.symbol})`
    : "India (₹)";
  headers.push(indiaLabel, null);

  // USD tier columns (List + Floor each)
  for (const t of usdTiers) {
    headers.push(`${t.name.split("·")[0]?.trim()} (${t.symbol})`, null);
  }

  headers.push("Notes");
  return headers;
}

function buildSubHeaders(usdTiers: RateCardTier[]): (string | null)[] {
  const sub: (string | null)[] = [null, null]; // Format, Length columns
  sub.push("List", "Floor"); // India
  for (let i = 0; i < usdTiers.length; i++) {
    sub.push("List", "Floor");
  }
  sub.push(null); // Notes
  return sub;
}

function buildItemRow(
  item: RateCardItem,
  fxRate: number,
  indiaTier: RateCardTier | undefined,
  usdTiers: RateCardTier[]
): (string | number | null)[] {
  const row: (string | number | null)[] = [];

  // Column A: Name
  row.push(item.name);

  // Column B: Length/Unit/Description
  row.push(item.length ?? item.unit ?? null);

  // India columns
  if (indiaTier) {
    const indiaList = computeTierPrice(
      item.base_inr,
      indiaTier.multiplier,
      fxRate
    );
    const indiaFloor = computeFloor(indiaList, item.floor_percent);
    row.push(indiaList);
    row.push(item.floor_percent < 100 ? indiaFloor : null);
  } else {
    row.push(item.base_inr);
    row.push(
      item.floor_percent < 100
        ? computeFloor(item.base_inr, item.floor_percent)
        : null
    );
  }

  // USD tier columns
  for (const t of usdTiers) {
    const list = computeTierPrice(item.base_inr, t.multiplier, fxRate);
    const floor = computeFloor(list, item.floor_percent);
    row.push(list);
    row.push(item.floor_percent < 100 ? floor : null);
  }

  // Notes
  row.push(item.notes);

  return row;
}
