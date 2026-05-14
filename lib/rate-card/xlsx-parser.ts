import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Types returned by the parser
// ---------------------------------------------------------------------------
export type ParsedTier = {
  tier_key: string;
  name: string;
  region: string;
  tier_level: string;
  multiplier: number;
  currency: string;
  symbol: string;
  countries: string[];
};

export type ParsedItem = {
  section: string;
  item_key: string;
  name: string;
  length: string | null;
  base_inr: number;
  floor_percent: number;
  sla: string | null;
  per_second: boolean;
  seconds: number | null;
  unit: string | null;
  sort_order: number;
  notes: string | null;
};

export type ParsedDeliverable = {
  item_key: string;
  label: string;
  default_qty: string;
  unit: string;
  editable: boolean;
  sort_order: number;
};

export type ParsedRateCard = {
  fxRate: number;
  tiers: ParsedTier[];
  items: ParsedItem[];
  deliverables: ParsedDeliverable[];
};

// ---------------------------------------------------------------------------
// Seed data (mirrors SoW Builder HTML and the xlsx "Rate Card FY27" sheet)
// Used as fallback when xlsx parsing is too fragile, and also used to enrich
// parsed rows with metadata (item keys, SLAs, per-second flags, deliverables)
// that the spreadsheet doesn't encode in machine-readable columns.
// ---------------------------------------------------------------------------

const SEED_TIERS: ParsedTier[] = [
  { tier_key: "india", name: "India + Reliance", region: "India", tier_level: "—", multiplier: 1.0, currency: "INR", symbol: "₹", countries: ["IN"] },
  { tier_key: "mea_t1", name: "MEA T1 · UAE + GCC", region: "MEA", tier_level: "T1", multiplier: 4.0, currency: "USD", symbol: "$", countries: ["AE", "QA", "KW", "BH", "OM", "IL"] },
  { tier_key: "mea_t2", name: "MEA T2 · Saudi Arabia", region: "MEA", tier_level: "T2", multiplier: 3.5, currency: "USD", symbol: "$", countries: ["SA"] },
  { tier_key: "mea_t3", name: "MEA T3 · Africa + Levant", region: "MEA", tier_level: "T3", multiplier: 1.8, currency: "USD", symbol: "$", countries: ["EG", "MA", "JO", "ZA", "NG", "KE", "TN", "LB"] },
  { tier_key: "sea_t1", name: "SEA T1 · Singapore", region: "SEA", tier_level: "T1", multiplier: 4.5, currency: "USD", symbol: "$", countries: ["SG"] },
  { tier_key: "sea_t2", name: "SEA T2 · Malaysia + Thailand", region: "SEA", tier_level: "T2", multiplier: 2.4, currency: "USD", symbol: "$", countries: ["MY", "TH", "BN"] },
  { tier_key: "sea_t3", name: "SEA T3 · Indonesia + PH + VN", region: "SEA", tier_level: "T3", multiplier: 1.8, currency: "USD", symbol: "$", countries: ["ID", "PH", "VN", "KH", "MM", "LA"] },
  { tier_key: "row_t1", name: "ROW T1 · US + CA + AU + NZ", region: "ROW", tier_level: "T1", multiplier: 6.5, currency: "USD", symbol: "$", countries: ["US", "CA", "AU", "NZ"] },
  { tier_key: "row_t2", name: "ROW T2 · UK + Ireland", region: "ROW", tier_level: "T2", multiplier: 5.5, currency: "USD", symbol: "$", countries: ["GB", "IE"] },
  { tier_key: "row_t3", name: "ROW T3 · Continental Europe", region: "ROW", tier_level: "T3", multiplier: 5.0, currency: "USD", symbol: "$", countries: ["DE", "FR", "NL", "CH", "SE", "DK", "NO", "FI", "BE", "AT", "ES", "IT", "PT"] },
];

type SeedAlacarteItem = {
  id: string;
  name: string;
  length: string;
  baseINR: number;
  sla: string;
  persec: boolean;
  secs?: number;
};

const SEED_ALACARTE: SeedAlacarteItem[] = [
  { id: "image", name: "Marketing image (single)", length: "static", baseINR: 1000, sla: "24 hrs", persec: false },
  { id: "carousel", name: "Carousel pack (5 frames)", length: "static", baseINR: 4000, sla: "24 hrs", persec: false },
  { id: "banner", name: "Banner pack (5 IAB sizes)", length: "static", baseINR: 6000, sla: "24 hrs", persec: false },
  { id: "ugc", name: "UGC / creator-style cut", length: "15s", baseINR: 15000, sla: "48 hrs", persec: true, secs: 15 },
  { id: "hook", name: "Short-form hook", length: "6s", baseINR: 9000, sla: "48 hrs", persec: true, secs: 6 },
  { id: "social", name: "Social spot", length: "15s", baseINR: 22500, sla: "48 hrs", persec: true, secs: 15 },
  { id: "product", name: "Product feature film", length: "20s", baseINR: 25000, sla: "48-72 hrs", persec: true, secs: 20 },
  { id: "story", name: "Story-based ad", length: "20s", baseINR: 40000, sla: "3-5 days", persec: true, secs: 20 },
  { id: "brand30", name: "Brand film (digital)", length: "30s", baseINR: 71000, sla: "5 days", persec: true, secs: 30 },
  { id: "music", name: "Music video / lifestyle film", length: "20s", baseINR: 100000, sla: "7-10 days", persec: true, secs: 20 },
  { id: "cinematic", name: "Cinematic brand film", length: "60s", baseINR: 240000, sla: "10 days", persec: true, secs: 60 },
  { id: "cgi", name: "3D / character animation", length: "15s", baseINR: 60000, sla: "7 days", persec: true, secs: 15 },
  { id: "ip", name: "AI character IP build", length: "one-time", baseINR: 300000, sla: "14 days", persec: false },
];

type SeedRetainerItem = {
  id: string;
  name: string;
  baseINR: number;
  sla: string;
  unit: string;
  deliverables: Array<{ id: string; label: string; defaultQty: string | number; unit: string; editable: boolean }>;
};

const SEED_VOL_RETAINER: SeedRetainerItem[] = [
  {
    id: "vol_starter", name: "Starter", baseINR: 75000, sla: "72 hrs first delivery", unit: "/ mo",
    deliverables: [
      { id: "sf", label: "Short-form videos (≤15s)", defaultQty: 10, unit: "/ mo", editable: true },
      { id: "bf", label: "Brand film (30s)", defaultQty: 1, unit: "/ mo", editable: true },
      { id: "cp", label: "Carousel pack", defaultQty: 1, unit: "/ mo", editable: true },
      { id: "lang", label: "Localisation languages", defaultQty: 2, unit: "lang", editable: true },
      { id: "dri", label: "Pod DRI", defaultQty: "Shared", unit: "", editable: false },
    ],
  },
  {
    id: "vol_pro", name: "Professional", baseINR: 250000, sla: "48 hrs locked", unit: "/ mo",
    deliverables: [
      { id: "sf", label: "Short-form videos (≤15s)", defaultQty: 40, unit: "/ mo", editable: true },
      { id: "bf", label: "Brand films (30s)", defaultQty: 3, unit: "/ mo", editable: true },
      { id: "cin", label: "Cinematic hero", defaultQty: 1, unit: "/ mo", editable: true },
      { id: "cb", label: "Carousel / banner packs", defaultQty: "Unlimited", unit: "", editable: false },
      { id: "lang", label: "Localisation languages", defaultQty: 6, unit: "lang", editable: true },
      { id: "dri", label: "Pod DRI", defaultQty: "Dedicated", unit: "", editable: false },
    ],
  },
  {
    id: "vol_enterprise", name: "Enterprise", baseINR: 800000, sla: "24 hrs locked", unit: "/ mo",
    deliverables: [
      { id: "sf", label: "Short-form (FUP)", defaultQty: "Unlimited", unit: "", editable: false },
      { id: "bf", label: "Brand films", defaultQty: 8, unit: "/ mo", editable: true },
      { id: "cin", label: "Cinematic films", defaultQty: 2, unit: "/ mo", editable: true },
      { id: "lang", label: "Localisation languages", defaultQty: 12, unit: "lang", editable: true },
      { id: "pod", label: "Motion designer pod", defaultQty: "Dedicated", unit: "", editable: false },
      { id: "rev", label: "Weekly portfolio review", defaultQty: "Yes", unit: "", editable: false },
    ],
  },
  {
    id: "vol_master", name: "Annual Master", baseINR: 2000000, sla: "12-24 hrs · on-call", unit: "/ yr",
    deliverables: [
      { id: "catalog", label: "Catalog negotiated", defaultQty: "End-to-end", unit: "", editable: false },
      { id: "creative", label: "Creative + post + localisation", defaultQty: "Full", unit: "", editable: false },
      { id: "cd", label: "Creative Director", defaultQty: "Dedicated", unit: "", editable: false },
      { id: "concierge", label: "Concierge desk", defaultQty: "Yes", unit: "", editable: false },
      { id: "gov", label: "Founder governance", defaultQty: "Yes", unit: "", editable: false },
      { id: "sla_rg", label: "Reliance-grade SLAs", defaultQty: "Yes", unit: "", editable: false },
    ],
  },
];

const SEED_BRAND_RETAINER: SeedRetainerItem[] = [
  {
    id: "br_starter", name: "Starter", baseINR: 200000, sla: "14-day creative cycle", unit: "/ mo",
    deliverables: [
      { id: "bwt", label: "Brand-world training", defaultQty: "One-time", unit: "", editable: false },
      { id: "cd", label: "Creative Director", defaultQty: "Named", unit: "", editable: false },
      { id: "hero", label: "Hero film", defaultQty: 1, unit: "/ qtr", editable: true },
      { id: "camp", label: "Campaigns", defaultQty: 2, unit: "/ qtr", editable: true },
      { id: "panel", label: "StudioOS customer panel", defaultQty: "Included", unit: "", editable: false },
      { id: "rev", label: "Monthly review", defaultQty: "Yes", unit: "", editable: false },
    ],
  },
  {
    id: "br_pro", name: "Professional", baseINR: 600000, sla: "14-day creative cycle", unit: "/ mo",
    deliverables: [
      { id: "starter", label: "All Starter benefits", defaultQty: "Included", unit: "", editable: false },
      { id: "hero", label: "Hero films", defaultQty: 2, unit: "/ qtr", editable: true },
      { id: "camp", label: "Campaigns", defaultQty: 6, unit: "/ qtr", editable: true },
      { id: "strat", label: "Brand strategist embed", defaultQty: "Yes", unit: "", editable: false },
      { id: "ab", label: "Cohort A/B testing", defaultQty: "Yes", unit: "", editable: false },
      { id: "rev", label: "Quarterly creative review", defaultQty: "Yes", unit: "", editable: false },
      { id: "lang", label: "Localisation languages", defaultQty: 6, unit: "lang", editable: true },
    ],
  },
  {
    id: "br_enterprise", name: "Enterprise", baseINR: 1500000, sla: "12-day cycle", unit: "/ mo",
    deliverables: [
      { id: "pro", label: "All Professional benefits", defaultQty: "Included", unit: "", editable: false },
      { id: "hero", label: "Hero films", defaultQty: "Unlimited (FUP)", unit: "", editable: false },
      { id: "lang", label: "Localisation languages", defaultQty: 12, unit: "lang", editable: true },
      { id: "pod", label: "Dedicated pod (CD + strategist + AE + 2 designers)", defaultQty: "Yes", unit: "", editable: false },
      { id: "planner", label: "Embedded media planner", defaultQty: "Yes", unit: "", editable: false },
      { id: "audit", label: "Quarterly brand audit", defaultQty: "Yes", unit: "", editable: false },
    ],
  },
  {
    id: "br_master", name: "Annual Master (Reliance grade)", baseINR: 6000000, sla: "On-call · founder-governed", unit: "/ yr",
    deliverables: [
      { id: "creative_own", label: "Creative ownership across BUs", defaultQty: "Full", unit: "", editable: false },
      { id: "mv", label: "Multi-vertical coverage", defaultQty: "Yes", unit: "", editable: false },
      { id: "kill", label: "On-brand kill-switch", defaultQty: "Yes", unit: "", editable: false },
      { id: "gov", label: "Founder governance", defaultQty: "Yes", unit: "", editable: false },
      { id: "review", label: "Quarterly leadership review with Fynd C-suite", defaultQty: "Yes", unit: "", editable: false },
      { id: "partner", label: "Strategic partner-of-record", defaultQty: "Yes", unit: "", editable: false },
    ],
  },
];

type SeedPerCampaign = {
  id: string;
  name: string;
  desc: string;
  loINR: number;
  hiINR: number;
  sla: string;
};

const SEED_PER_CAMPAIGN: SeedPerCampaign[] = [
  { id: "hero", name: "Hero Film", desc: "Cinematic 60-90s · character-centric · multi-cut", loINR: 400000, hiINR: 1200000, sla: "10-14 days" },
  { id: "i360", name: "Integrated 360° Campaign", desc: "Big idea + film + digital + OOH + retail + social (4-8 wk)", loINR: 800000, hiINR: 2500000, sla: "14-21 days" },
  { id: "festive", name: "Festive / Seasonal", desc: "Diwali / Valentine / IPL / EOFY · multi-asset bundle, 12-lang ready", loINR: 600000, hiINR: 1800000, sla: "14-21 days" },
  { id: "launch", name: "Brand Launch", desc: "Identity + film + first 3-mo content kit + go-live runway", loINR: 1500000, hiINR: 4000000, sla: "21-30 days" },
  { id: "refresh", name: "Brand Refresh / Re-brand", desc: "Identity refresh + manifesto film + cross-channel rollout", loINR: 800000, hiINR: 2500000, sla: "14-21 days" },
  { id: "amb", name: "Ambassador / Talent Activation", desc: "Talent + cohort tests · talent fee at cost +15%", loINR: 300000, hiINR: 1200000, sla: "7-14 days" },
  { id: "aos", name: "Always-on Social Calendar", desc: "12-week plan: weekly assets + community hooks + reactive moments", loINR: 400000, hiINR: 1000000, sla: "Continuous" },
];

type SeedStrategic = {
  id: string;
  name: string;
  desc: string;
  priceINR: number;
  duration: string;
  notes?: string;
  perSession?: boolean;
};

const SEED_STRATEGIC: SeedStrategic[] = [
  { id: "bwt", name: "Brand World Training", desc: "Train StudioOS on the brand: corpus, voice, visual world", priceINR: 300000, duration: "7-14 days", notes: "Free for retainer customers" },
  { id: "bss", name: "Brand Strategy Sprint", desc: "4-week sprint: positioning, message house, creative platform", priceINR: 800000, duration: "4 weeks" },
  { id: "abp", name: "Annual Brand Plan", desc: "Full FY plan: calendar, budgets, KPIs, hero ideas, channel mix", priceINR: 1200000, duration: "6 weeks" },
  { id: "aic1", name: "AI × Creative · 1-Hour Masterclass", desc: "Executive session on AI reshaping creative + marketing workflows", priceINR: 400000, duration: "1 hour" },
  { id: "aic4", name: "AI × Creative · 4-Hour Deep Dive", desc: "Hands-on session: AI workflows, adoption, brand-safe systems", priceINR: 800000, duration: "4 hours" },
  { id: "aitc", name: "AI Training for Creative Teams", desc: "Custom multi-day workshop, tailored to brand and team", priceINR: 800000, duration: "Flexible", perSession: true },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a numeric value from a cell, stripping currency symbols and commas. */
function numericCellValue(ws: XLSX.WorkSheet, r: number, c: number): number | null {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (!cell) return null;
  if (typeof cell.v === "number") return cell.v;
  const str = String(cell.v).replace(/[₹$,\s]/g, "");
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function stringCellValue(ws: XLSX.WorkSheet, r: number, c: number): string | null {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (!cell) return null;
  return String(cell.v).trim();
}

/** Compute floor_percent from list and floor values. */
function floorPercent(list: number, floor: number | null): number {
  if (floor === null || floor === 0 || list === 0) return 100;
  return Math.round((floor / list) * 100);
}

/**
 * Find the row index where a cell in column A starts with the given prefix.
 * Returns -1 if not found.
 */
function findSectionRow(ws: XLSX.WorkSheet, prefix: string, maxRow: number): number {
  for (let r = 0; r <= maxRow; r++) {
    const val = stringCellValue(ws, r, 0);
    if (val && val.startsWith(prefix)) return r;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Fynd Studio Rate Card xlsx buffer and extract structured data.
 *
 * Attempts to read the "Rate Card FY27" sheet. If the sheet is missing or
 * unparseable, falls back to the hardcoded seed data from the SoW builder.
 */
export function parseRateCardXlsx(buffer: ArrayBuffer): ParsedRateCard {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer);
  } catch {
    return buildFromSeed(83);
  }

  const ws = wb.Sheets["Rate Card FY27"];
  if (!ws) {
    return buildFromSeed(83);
  }

  const ref = ws["!ref"];
  if (!ref) return buildFromSeed(83);
  const range = XLSX.utils.decode_range(ref);
  const maxRow = range.e.r;

  // --- FX rate & tier multipliers (row 5 in the known layout) ---
  const assumptionsRow = findSectionRow(ws, "Assumptions", maxRow);
  // The data row is two rows after the "Assumptions" header (header, labels, values)
  const dataRow = assumptionsRow >= 0 ? assumptionsRow + 2 : 5;
  const fxRate = numericCellValue(ws, dataRow, 0) ?? 83;

  // Read multipliers for the 9 USD tiers (columns 1-9)
  const tierMultipliers: number[] = [];
  for (let c = 1; c <= 9; c++) {
    tierMultipliers.push(numericCellValue(ws, dataRow, c) ?? SEED_TIERS[c].multiplier);
  }

  // Build tiers - update multipliers from xlsx
  const tiers: ParsedTier[] = SEED_TIERS.map((t, i) => {
    if (i === 0) return { ...t }; // India is always 1.0
    return { ...t, multiplier: tierMultipliers[i - 1] ?? t.multiplier };
  });

  // --- Parse items from each section ---
  const items: ParsedItem[] = [];
  const deliverables: ParsedDeliverable[] = [];
  let sortOrder = 0;

  // §1 - A La Carte
  const s1Row = findSectionRow(ws, "§1", maxRow);
  if (s1Row >= 0) {
    // Items start 3 rows after the section header (header, column labels, list/floor sub-header, then data)
    const firstItemRow = s1Row + 3;
    for (let i = 0; i < SEED_ALACARTE.length; i++) {
      const r = firstItemRow + i;
      const name = stringCellValue(ws, r, 0);
      if (!name) break;

      const seed = SEED_ALACARTE[i];
      const listINR = numericCellValue(ws, r, 2) ?? seed.baseINR;
      const floorINR = numericCellValue(ws, r, 3);
      const length = stringCellValue(ws, r, 1) ?? seed.length;
      const notes = stringCellValue(ws, r, 22);

      items.push({
        section: "alacarte",
        item_key: seed.id,
        name,
        length,
        base_inr: listINR,
        floor_percent: floorPercent(listINR, floorINR),
        sla: seed.sla,
        per_second: seed.persec,
        seconds: seed.secs ?? null,
        unit: null,
        sort_order: sortOrder++,
        notes,
      });
    }
  } else {
    // Fallback: seed a la carte items
    for (const seed of SEED_ALACARTE) {
      items.push({
        section: "alacarte",
        item_key: seed.id,
        name: seed.name,
        length: seed.length,
        base_inr: seed.baseINR,
        floor_percent: 75,
        sla: seed.sla,
        per_second: seed.persec,
        seconds: seed.secs ?? null,
        unit: null,
        sort_order: sortOrder++,
        notes: null,
      });
    }
  }

  // §2 - Volume Retainer
  const s2Row = findSectionRow(ws, "§2", maxRow);
  if (s2Row >= 0) {
    const firstItemRow = s2Row + 3;
    for (let i = 0; i < SEED_VOL_RETAINER.length; i++) {
      const r = firstItemRow + i;
      const name = stringCellValue(ws, r, 0);
      if (!name) break;

      const seed = SEED_VOL_RETAINER[i];
      const listINR = numericCellValue(ws, r, 2) ?? seed.baseINR;
      const floorINR = numericCellValue(ws, r, 3);
      const notes = stringCellValue(ws, r, 22);

      items.push({
        section: "volume_retainer",
        item_key: seed.id,
        name,
        length: null,
        base_inr: listINR,
        floor_percent: floorINR !== null ? floorPercent(listINR, floorINR) : 75,
        sla: seed.sla,
        per_second: false,
        seconds: null,
        unit: seed.unit,
        sort_order: sortOrder++,
        notes,
      });

      // Add deliverables
      for (let d = 0; d < seed.deliverables.length; d++) {
        const del = seed.deliverables[d];
        deliverables.push({
          item_key: seed.id,
          label: del.label,
          default_qty: String(del.defaultQty),
          unit: del.unit,
          editable: del.editable,
          sort_order: d,
        });
      }
    }
  } else {
    for (const seed of SEED_VOL_RETAINER) {
      items.push({
        section: "volume_retainer",
        item_key: seed.id,
        name: seed.name,
        length: null,
        base_inr: seed.baseINR,
        floor_percent: 75,
        sla: seed.sla,
        per_second: false,
        seconds: null,
        unit: seed.unit,
        sort_order: sortOrder++,
        notes: null,
      });
      for (let d = 0; d < seed.deliverables.length; d++) {
        const del = seed.deliverables[d];
        deliverables.push({
          item_key: seed.id,
          label: del.label,
          default_qty: String(del.defaultQty),
          unit: del.unit,
          editable: del.editable,
          sort_order: d,
        });
      }
    }
  }

  // §3 - Pilot Sprint
  const s3Row = findSectionRow(ws, "§3", maxRow);
  if (s3Row >= 0) {
    const r = s3Row + 3; // header + col labels + list/floor sub-header
    const name = stringCellValue(ws, r, 0) ?? "14 Day Pilot Sprint";
    const listINR = numericCellValue(ws, r, 2) ?? 400000;
    const floorINR = numericCellValue(ws, r, 3);
    const notes = stringCellValue(ws, r, 22);

    items.push({
      section: "pilot_sprint",
      item_key: "pilot_sprint",
      name,
      length: "14 days",
      base_inr: listINR,
      floor_percent: floorINR !== null ? floorPercent(listINR, floorINR) : 60,
      sla: "14 days",
      per_second: false,
      seconds: null,
      unit: null,
      sort_order: sortOrder++,
      notes,
    });
  } else {
    items.push({
      section: "pilot_sprint",
      item_key: "pilot_sprint",
      name: "14 Day Pilot Sprint",
      length: "14 days",
      base_inr: 400000,
      floor_percent: 60,
      sla: "14 days",
      per_second: false,
      seconds: null,
      unit: null,
      sort_order: sortOrder++,
      notes: "1 short-form campaign vs customer baseline · 60% retainer-convertible",
    });
  }

  // §4 - Brand Retainer
  const s4Row = findSectionRow(ws, "§4", maxRow);
  if (s4Row >= 0) {
    const firstItemRow = s4Row + 3;
    for (let i = 0; i < SEED_BRAND_RETAINER.length; i++) {
      const r = firstItemRow + i;
      const name = stringCellValue(ws, r, 0);
      if (!name) break;

      const seed = SEED_BRAND_RETAINER[i];
      const listINR = numericCellValue(ws, r, 2) ?? seed.baseINR;
      const floorINR = numericCellValue(ws, r, 3);
      const notes = stringCellValue(ws, r, 22);

      items.push({
        section: "brand_retainer",
        item_key: seed.id,
        name,
        length: null,
        base_inr: listINR,
        floor_percent: floorINR !== null ? floorPercent(listINR, floorINR) : 75,
        sla: seed.sla,
        per_second: false,
        seconds: null,
        unit: seed.unit,
        sort_order: sortOrder++,
        notes,
      });

      for (let d = 0; d < seed.deliverables.length; d++) {
        const del = seed.deliverables[d];
        deliverables.push({
          item_key: seed.id,
          label: del.label,
          default_qty: String(del.defaultQty),
          unit: del.unit,
          editable: del.editable,
          sort_order: d,
        });
      }
    }
  } else {
    for (const seed of SEED_BRAND_RETAINER) {
      items.push({
        section: "brand_retainer",
        item_key: seed.id,
        name: seed.name,
        length: null,
        base_inr: seed.baseINR,
        floor_percent: 75,
        sla: seed.sla,
        per_second: false,
        seconds: null,
        unit: seed.unit,
        sort_order: sortOrder++,
        notes: null,
      });
      for (let d = 0; d < seed.deliverables.length; d++) {
        const del = seed.deliverables[d];
        deliverables.push({
          item_key: seed.id,
          label: del.label,
          default_qty: String(del.defaultQty),
          unit: del.unit,
          editable: del.editable,
          sort_order: d,
        });
      }
    }
  }

  // §5 - Per-Campaign
  const s5Row = findSectionRow(ws, "§5", maxRow);
  if (s5Row >= 0) {
    const firstItemRow = s5Row + 3;
    for (let i = 0; i < SEED_PER_CAMPAIGN.length; i++) {
      const r = firstItemRow + i;
      const name = stringCellValue(ws, r, 0);
      if (!name) break;

      const seed = SEED_PER_CAMPAIGN[i];
      // Per-campaign items have price ranges in the xlsx (e.g. "₹400,000 - ₹1,200,000")
      // We extract the low end as base_inr. The xlsx col 2 might be a formatted string.
      let baseINR = seed.loINR;
      const rawVal = stringCellValue(ws, r, 2);
      if (rawVal) {
        // Try to extract the first number from the range string
        const match = rawVal.replace(/[₹$,\s]/g, "").match(/^(\d+)/);
        if (match) {
          baseINR = parseInt(match[1], 10);
        }
      }
      const notes = stringCellValue(ws, r, 22);

      items.push({
        section: "per_campaign",
        item_key: seed.id,
        name,
        length: null,
        base_inr: baseINR,
        floor_percent: 75,
        sla: seed.sla,
        per_second: false,
        seconds: null,
        unit: null,
        sort_order: sortOrder++,
        notes,
      });
    }
  } else {
    for (const seed of SEED_PER_CAMPAIGN) {
      items.push({
        section: "per_campaign",
        item_key: seed.id,
        name: seed.name,
        length: null,
        base_inr: seed.loINR,
        floor_percent: 75,
        sla: seed.sla,
        per_second: false,
        seconds: null,
        unit: null,
        sort_order: sortOrder++,
        notes: null,
      });
    }
  }

  // §6 - Strategic
  const s6Row = findSectionRow(ws, "§6", maxRow);
  if (s6Row >= 0) {
    const firstItemRow = s6Row + 3;
    for (let i = 0; i < SEED_STRATEGIC.length; i++) {
      const r = firstItemRow + i;
      const name = stringCellValue(ws, r, 0);
      if (!name) break;

      const seed = SEED_STRATEGIC[i];
      const listINR = numericCellValue(ws, r, 2) ?? seed.priceINR;
      const notes = stringCellValue(ws, r, 22);

      items.push({
        section: "strategic",
        item_key: seed.id,
        name,
        length: seed.duration,
        base_inr: listINR,
        floor_percent: 100, // No floor for strategic items
        sla: seed.duration,
        per_second: false,
        seconds: null,
        unit: seed.perSession ? "/ session" : null,
        sort_order: sortOrder++,
        notes: notes ?? seed.notes ?? null,
      });
    }
  } else {
    for (const seed of SEED_STRATEGIC) {
      items.push({
        section: "strategic",
        item_key: seed.id,
        name: seed.name,
        length: seed.duration,
        base_inr: seed.priceINR,
        floor_percent: 100,
        sla: seed.duration,
        per_second: false,
        seconds: null,
        unit: seed.perSession ? "/ session" : null,
        sort_order: sortOrder++,
        notes: seed.notes ?? null,
      });
    }
  }

  return { fxRate, tiers, items, deliverables };
}

// ---------------------------------------------------------------------------
// Fallback builder from seed data
// ---------------------------------------------------------------------------

function buildFromSeed(fxRate: number): ParsedRateCard {
  const tiers = SEED_TIERS.map((t) => ({ ...t }));
  const items: ParsedItem[] = [];
  const deliverables: ParsedDeliverable[] = [];
  let sortOrder = 0;

  // A La Carte
  for (const s of SEED_ALACARTE) {
    items.push({
      section: "alacarte",
      item_key: s.id,
      name: s.name,
      length: s.length,
      base_inr: s.baseINR,
      floor_percent: 75,
      sla: s.sla,
      per_second: s.persec,
      seconds: s.secs ?? null,
      unit: null,
      sort_order: sortOrder++,
      notes: null,
    });
  }

  // Volume Retainer
  for (const s of SEED_VOL_RETAINER) {
    items.push({
      section: "volume_retainer",
      item_key: s.id,
      name: s.name,
      length: null,
      base_inr: s.baseINR,
      floor_percent: 75,
      sla: s.sla,
      per_second: false,
      seconds: null,
      unit: s.unit,
      sort_order: sortOrder++,
      notes: null,
    });
    for (let d = 0; d < s.deliverables.length; d++) {
      const del = s.deliverables[d];
      deliverables.push({
        item_key: s.id,
        label: del.label,
        default_qty: String(del.defaultQty),
        unit: del.unit,
        editable: del.editable,
        sort_order: d,
      });
    }
  }

  // Pilot Sprint
  items.push({
    section: "pilot_sprint",
    item_key: "pilot_sprint",
    name: "14 Day Pilot Sprint",
    length: "14 days",
    base_inr: 400000,
    floor_percent: 60,
    sla: "14 days",
    per_second: false,
    seconds: null,
    unit: null,
    sort_order: sortOrder++,
    notes: "1 short-form campaign vs customer baseline · 60% retainer-convertible",
  });

  // Brand Retainer
  for (const s of SEED_BRAND_RETAINER) {
    items.push({
      section: "brand_retainer",
      item_key: s.id,
      name: s.name,
      length: null,
      base_inr: s.baseINR,
      floor_percent: 75,
      sla: s.sla,
      per_second: false,
      seconds: null,
      unit: s.unit,
      sort_order: sortOrder++,
      notes: null,
    });
    for (let d = 0; d < s.deliverables.length; d++) {
      const del = s.deliverables[d];
      deliverables.push({
        item_key: s.id,
        label: del.label,
        default_qty: String(del.defaultQty),
        unit: del.unit,
        editable: del.editable,
        sort_order: d,
      });
    }
  }

  // Per-Campaign
  for (const s of SEED_PER_CAMPAIGN) {
    items.push({
      section: "per_campaign",
      item_key: s.id,
      name: s.name,
      length: null,
      base_inr: s.loINR,
      floor_percent: 75,
      sla: s.sla,
      per_second: false,
      seconds: null,
      unit: null,
      sort_order: sortOrder++,
      notes: null,
    });
  }

  // Strategic
  for (const s of SEED_STRATEGIC) {
    items.push({
      section: "strategic",
      item_key: s.id,
      name: s.name,
      length: s.duration,
      base_inr: s.priceINR,
      floor_percent: 100,
      sla: s.duration,
      per_second: false,
      seconds: null,
      unit: s.perSession ? "/ session" : null,
      sort_order: sortOrder++,
      notes: s.notes ?? null,
    });
  }

  return { fxRate, tiers, items, deliverables };
}
