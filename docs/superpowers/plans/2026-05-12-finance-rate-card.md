# Finance: Rate Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rate Card management tab to the Finance module — an editable, Supabase-backed version of the Excel rate card with inline editing, version history, xlsx import/export, and a full audit trail with revert.

**Architecture:** Data lives in 5 new Supabase tables (versions, tiers, items, deliverables, changes). USD prices are computed at read time from `base_inr × tier_multiplier ÷ fx_rate`. Server actions follow the existing pattern (server-prefetch page + client shell). Audit trail logs every change with before/after diff and supports single-change revert.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), React 19, Tailwind CSS, shadcn/ui, SheetJS (xlsx parsing/export)

**Spec:** `docs/specs/2026-05-12-finance-rate-card-sow-builder.md` §4

**Mockup:** `docs/specs/mockup-finance-rate-card-sow.html` (Rate Card tab)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/011_rate_card.sql` | Schema: 5 tables + seed data |
| Create | `lib/types/rate-card.ts` | TypeScript types for all rate card entities |
| Create | `lib/rate-card/compute.ts` | Price computation: INR → USD per tier, rounding, floor |
| Create | `lib/rate-card/xlsx-parser.ts` | Parse uploaded xlsx into rate card data structures |
| Create | `lib/rate-card/xlsx-export.ts` | Export current rate card to xlsx format |
| Create | `app/(app)/finance/rate-card/page.tsx` | Server component: fetch active version + items |
| Create | `app/(app)/finance/rate-card/_client.tsx` | Client component: table with inline editing |
| Create | `app/(app)/finance/rate-card/actions.ts` | Server actions: CRUD for rate card |
| Create | `app/(app)/finance/rate-card/loading.tsx` | Loading skeleton |
| Create | `__tests__/actions/rate-card-actions.test.ts` | Tests for rate card server actions |
| Modify | `app/(app)/finance/layout.tsx` | Add "Rate Card" tab |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/011_rate_card.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Rate Card Schema

-- Versions
CREATE TABLE IF NOT EXISTS rate_card_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_label text NOT NULL,
  fx_rate numeric NOT NULL DEFAULT 83.0,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES members(id),
  created_at timestamptz DEFAULT now()
);

-- Tiers
CREATE TABLE IF NOT EXISTS rate_card_tiers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES rate_card_versions(id) ON DELETE CASCADE,
  tier_key text NOT NULL,
  name text NOT NULL,
  region text NOT NULL,
  tier_level text NOT NULL DEFAULT '—',
  multiplier numeric NOT NULL DEFAULT 1.0,
  currency text NOT NULL DEFAULT 'INR',
  symbol text NOT NULL DEFAULT '₹',
  countries text[] DEFAULT '{}'
);

CREATE INDEX idx_rate_card_tiers_version ON rate_card_tiers(version_id);

-- Items
CREATE TABLE IF NOT EXISTS rate_card_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES rate_card_versions(id) ON DELETE CASCADE,
  section text NOT NULL,
  item_key text NOT NULL,
  name text NOT NULL,
  description text,
  length text,
  base_inr numeric NOT NULL DEFAULT 0,
  floor_percent numeric NOT NULL DEFAULT 75,
  sla text,
  per_second boolean DEFAULT false,
  seconds integer,
  unit text,
  sort_order integer NOT NULL DEFAULT 0,
  notes text
);

CREATE INDEX idx_rate_card_items_version ON rate_card_items(version_id);
CREATE INDEX idx_rate_card_items_section ON rate_card_items(version_id, section);

-- Retainer Deliverables
CREATE TABLE IF NOT EXISTS rate_card_retainer_deliverables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES rate_card_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  default_qty text NOT NULL DEFAULT '0',
  unit text DEFAULT '',
  editable boolean DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

-- Change Log
CREATE TABLE IF NOT EXISTS rate_card_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES rate_card_versions(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid REFERENCES members(id),
  changed_at timestamptz DEFAULT now(),
  reverted_at timestamptz,
  reverted_by uuid REFERENCES members(id)
);

CREATE INDEX idx_rate_card_changes_version ON rate_card_changes(version_id);
CREATE INDEX idx_rate_card_changes_entity ON rate_card_changes(entity_id);
```

- [ ] **Step 2: Run the migration in Supabase**

Run: Apply via Supabase dashboard SQL editor or MCP tool. Verify all 5 tables created.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_rate_card.sql
git commit -m "feat: add rate card schema — 5 tables for versions, tiers, items, deliverables, changes"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `lib/types/rate-card.ts`

- [ ] **Step 1: Write the types**

```typescript
export type RateCardVersion = {
  id: string;
  version_label: string;
  fx_rate: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type RateCardTier = {
  id: string;
  version_id: string;
  tier_key: string;
  name: string;
  region: string;
  tier_level: string;
  multiplier: number;
  currency: string;
  symbol: string;
  countries: string[];
};

export type RateCardSection =
  | "alacarte"
  | "volume_retainer"
  | "pilot_sprint"
  | "brand_retainer"
  | "per_campaign"
  | "strategic";

export const SECTION_LABELS: Record<RateCardSection, string> = {
  alacarte: "A La Carte",
  volume_retainer: "Volume Retainer",
  pilot_sprint: "Pilot Sprint",
  brand_retainer: "Brand Retainer",
  per_campaign: "Per-Campaign",
  strategic: "Strategic Projects",
};

export type RateCardItem = {
  id: string;
  version_id: string;
  section: RateCardSection;
  item_key: string;
  name: string;
  description: string | null;
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

export type RateCardDeliverable = {
  id: string;
  item_id: string;
  label: string;
  default_qty: string;
  unit: string;
  editable: boolean;
  sort_order: number;
};

export type RateCardChange = {
  id: string;
  version_id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
  changer_name?: string;
  reverter_name?: string;
};

export type TierPrice = {
  tier_key: string;
  tier_name: string;
  currency: string;
  symbol: string;
  list: number;
  floor: number;
};

export type RateCardItemWithPrices = RateCardItem & {
  prices: TierPrice[];
  deliverables?: RateCardDeliverable[];
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/types/rate-card.ts
git commit -m "feat: add rate card TypeScript types"
```

---

### Task 3: Price Computation Utility

**Files:**
- Create: `lib/rate-card/compute.ts`
- Create: `__tests__/rate-card/compute.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { computeTierPrice, computeFloor, computeAllTierPrices, roundPrice } from "@/lib/rate-card/compute";

describe("rate-card/compute", () => {
  it("computes USD price from INR base", () => {
    // Brand film: ₹71,000 × 4.0 multiplier ÷ 83 FX = $3,421.69 → rounded $3,425
    expect(computeTierPrice(71000, 4.0, 83.0)).toBe(3422);
  });

  it("computes floor at 75%", () => {
    expect(computeFloor(3425, 75)).toBe(2569);
  });

  it("returns INR directly for India tier (multiplier 1.0)", () => {
    expect(computeTierPrice(71000, 1.0, 83.0)).toBe(71000);
  });

  it("rounds prices to nearest sensible unit", () => {
    expect(roundPrice(48.19)).toBe(48);
    expect(roundPrice(3421.69)).toBe(3422);
    expect(roundPrice(19277.1)).toBe(19277);
  });

  it("computes all tier prices for an item", () => {
    const tiers = [
      { tier_key: "india", multiplier: 1.0, currency: "INR", symbol: "₹", name: "India", id: "t1", version_id: "v1", region: "India", tier_level: "—", countries: [] },
      { tier_key: "mea_t1", multiplier: 4.0, currency: "USD", symbol: "$", name: "MEA T1", id: "t2", version_id: "v1", region: "MEA", tier_level: "T1", countries: [] },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/rate-card/compute.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
import type { RateCardTier, TierPrice } from "@/lib/types/rate-card";

export function roundPrice(value: number): number {
  return Math.round(value);
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
    return {
      tier_key: tier.tier_key,
      tier_name: tier.name,
      currency: tier.currency,
      symbol: tier.symbol,
      list,
      floor: computeFloor(list, floorPercent),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/rate-card/compute.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/rate-card/compute.ts __tests__/rate-card/compute.test.ts
git commit -m "feat: rate card price computation with tests"
```

---

### Task 4: Server Actions

**Files:**
- Create: `app/(app)/finance/rate-card/actions.ts`
- Create: `__tests__/actions/rate-card-actions.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => {
  const mockChain = () => {
    const chain: Record<string, any> = {};
    const methods = ["select", "insert", "update", "delete", "eq", "neq", "in", "is", "not", "or", "ilike", "order", "limit", "single", "then", "upsert"];
    for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn().mockImplementation((resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve));
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  };
  return {
    createClient: vi.fn().mockResolvedValue({
      from: vi.fn().mockReturnValue(mockChain()),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: vi.fn(), upload: vi.fn() }) },
    }),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "test-user" }),
  currentUser: vi.fn().mockResolvedValue({ fullName: "Test", emailAddresses: [{ emailAddress: "t@t.com" }], imageUrl: null }),
}));

describe("rate-card/actions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("exports all expected functions", async () => {
    const actions = await import("@/app/(app)/finance/rate-card/actions");
    const expected = [
      "getActiveVersion", "getVersions", "getVersionData",
      "updateItemField", "updateTierField", "updateVersionField",
      "createVersion", "cloneVersion",
      "getChangeLog", "revertChange",
    ];
    for (const name of expected) {
      expect(actions).toHaveProperty(name);
      expect(typeof (actions as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/actions/rate-card-actions.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the server actions**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/getCurrentMember";
import { revalidatePath } from "next/cache";
import type {
  RateCardVersion,
  RateCardTier,
  RateCardItem,
  RateCardDeliverable,
  RateCardChange,
  RateCardSection,
} from "@/lib/types/rate-card";

export async function getVersions(): Promise<RateCardVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_versions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RateCardVersion[];
}

export async function getActiveVersion(): Promise<RateCardVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_versions")
    .select("*")
    .eq("is_active", true)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as RateCardVersion) ?? null;
}

export async function getVersionData(versionId: string) {
  const supabase = await createClient();
  const [tiersRes, itemsRes, deliverablesRes] = await Promise.all([
    supabase
      .from("rate_card_tiers")
      .select("*")
      .eq("version_id", versionId)
      .order("multiplier"),
    supabase
      .from("rate_card_items")
      .select("*")
      .eq("version_id", versionId)
      .order("sort_order"),
    supabase
      .from("rate_card_retainer_deliverables")
      .select("*, rate_card_items!inner(version_id)")
      .eq("rate_card_items.version_id", versionId)
      .order("sort_order"),
  ]);
  if (tiersRes.error) throw tiersRes.error;
  if (itemsRes.error) throw itemsRes.error;

  return {
    tiers: (tiersRes.data ?? []) as RateCardTier[],
    items: (itemsRes.data ?? []) as RateCardItem[],
    deliverables: (deliverablesRes.data ?? []) as RateCardDeliverable[],
  };
}

export async function updateItemField(
  itemId: string,
  field: string,
  value: string | number,
  reason: string
) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: item } = await supabase
    .from("rate_card_items")
    .select("id, version_id, name, " + field)
    .eq("id", itemId)
    .single();
  if (!item) throw new Error("Item not found");

  const oldValue = String((item as Record<string, unknown>)[field] ?? "");

  await supabase
    .from("rate_card_items")
    .update({ [field]: value })
    .eq("id", itemId);

  await supabase.from("rate_card_changes").insert({
    version_id: item.version_id,
    entity_type: "item",
    entity_id: itemId,
    field,
    old_value: oldValue,
    new_value: String(value),
    reason: reason || null,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}

export async function updateTierField(
  tierId: string,
  field: string,
  value: string | number,
  reason: string
) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: tier } = await supabase
    .from("rate_card_tiers")
    .select("id, version_id, name, " + field)
    .eq("id", tierId)
    .single();
  if (!tier) throw new Error("Tier not found");

  const oldValue = String((tier as Record<string, unknown>)[field] ?? "");

  await supabase
    .from("rate_card_tiers")
    .update({ [field]: value })
    .eq("id", tierId);

  await supabase.from("rate_card_changes").insert({
    version_id: tier.version_id,
    entity_type: "tier",
    entity_id: tierId,
    field,
    old_value: oldValue,
    new_value: String(value),
    reason: reason || null,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}

export async function updateVersionField(
  versionId: string,
  field: string,
  value: string | number,
  reason: string
) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: version } = await supabase
    .from("rate_card_versions")
    .select("id, " + field)
    .eq("id", versionId)
    .single();
  if (!version) throw new Error("Version not found");

  const oldValue = String((version as Record<string, unknown>)[field] ?? "");

  await supabase
    .from("rate_card_versions")
    .update({ [field]: value })
    .eq("id", versionId);

  await supabase.from("rate_card_changes").insert({
    version_id: versionId,
    entity_type: "version",
    entity_id: versionId,
    field,
    old_value: oldValue,
    new_value: String(value),
    reason: reason || null,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}

export async function createVersion(
  label: string,
  fxRate: number,
  notes?: string
): Promise<RateCardVersion> {
  const supabase = await createClient();
  const member = await getCurrentMember();

  await supabase
    .from("rate_card_versions")
    .update({ is_active: false })
    .eq("is_active", true);

  const { data, error } = await supabase
    .from("rate_card_versions")
    .insert({
      version_label: label,
      fx_rate: fxRate,
      is_active: true,
      notes: notes || null,
      created_by: member?.id || null,
    })
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/finance/rate-card");
  return data as RateCardVersion;
}

export async function cloneVersion(sourceVersionId: string, newLabel: string) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: source } = await supabase
    .from("rate_card_versions")
    .select("*")
    .eq("id", sourceVersionId)
    .single();
  if (!source) throw new Error("Source version not found");

  const newVersion = await createVersion(
    newLabel,
    source.fx_rate,
    `Cloned from ${source.version_label}`
  );

  const sourceData = await getVersionData(sourceVersionId);

  const tierIdMap: Record<string, string> = {};
  if (sourceData.tiers.length > 0) {
    const tierInserts = sourceData.tiers.map((t) => ({
      version_id: newVersion.id,
      tier_key: t.tier_key,
      name: t.name,
      region: t.region,
      tier_level: t.tier_level,
      multiplier: t.multiplier,
      currency: t.currency,
      symbol: t.symbol,
      countries: t.countries,
    }));
    const { data: newTiers } = await supabase
      .from("rate_card_tiers")
      .insert(tierInserts)
      .select("id, tier_key");
    (newTiers ?? []).forEach((nt, i) => {
      tierIdMap[sourceData.tiers[i].id] = nt.id;
    });
  }

  const itemIdMap: Record<string, string> = {};
  if (sourceData.items.length > 0) {
    const itemInserts = sourceData.items.map((item) => ({
      version_id: newVersion.id,
      section: item.section,
      item_key: item.item_key,
      name: item.name,
      description: item.description,
      length: item.length,
      base_inr: item.base_inr,
      floor_percent: item.floor_percent,
      sla: item.sla,
      per_second: item.per_second,
      seconds: item.seconds,
      unit: item.unit,
      sort_order: item.sort_order,
      notes: item.notes,
    }));
    const { data: newItems } = await supabase
      .from("rate_card_items")
      .insert(itemInserts)
      .select("id, item_key");
    (newItems ?? []).forEach((ni, i) => {
      itemIdMap[sourceData.items[i].id] = ni.id;
    });
  }

  if (sourceData.deliverables.length > 0) {
    const delInserts = sourceData.deliverables.map((d) => ({
      item_id: itemIdMap[d.item_id] || d.item_id,
      label: d.label,
      default_qty: d.default_qty,
      unit: d.unit,
      editable: d.editable,
      sort_order: d.sort_order,
    }));
    await supabase.from("rate_card_retainer_deliverables").insert(delInserts);
  }

  await supabase.from("rate_card_changes").insert({
    version_id: newVersion.id,
    entity_type: "version",
    entity_id: newVersion.id,
    field: "created",
    old_value: null,
    new_value: newLabel,
    reason: `Cloned from ${source.version_label}`,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return newVersion;
}

export async function getChangeLog(
  versionId: string,
  limit = 50
): Promise<RateCardChange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_changes")
    .select("*, members!rate_card_changes_changed_by_fkey(full_name)")
    .eq("version_id", versionId)
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((c) => ({
    ...c,
    changer_name: (c.members as { full_name: string } | null)?.full_name || "Unknown",
  })) as RateCardChange[];
}

export async function revertChange(changeId: string, reason: string) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: change } = await supabase
    .from("rate_card_changes")
    .select("*")
    .eq("id", changeId)
    .single();
  if (!change) throw new Error("Change not found");
  if (change.reverted_at) throw new Error("Already reverted");

  const table =
    change.entity_type === "item"
      ? "rate_card_items"
      : change.entity_type === "tier"
        ? "rate_card_tiers"
        : "rate_card_versions";

  await supabase
    .from(table)
    .update({ [change.field]: change.old_value })
    .eq("id", change.entity_id);

  await supabase
    .from("rate_card_changes")
    .update({
      reverted_at: new Date().toISOString(),
      reverted_by: member?.id || null,
    })
    .eq("id", changeId);

  await supabase.from("rate_card_changes").insert({
    version_id: change.version_id,
    entity_type: change.entity_type,
    entity_id: change.entity_id,
    field: change.field,
    old_value: change.new_value,
    new_value: change.old_value,
    reason: reason || "Reverted",
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run __tests__/actions/rate-card-actions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/finance/rate-card/actions.ts __tests__/actions/rate-card-actions.test.ts
git commit -m "feat: rate card server actions — CRUD, change log, revert"
```

---

### Task 5: Add Rate Card Tab to Finance Layout

**Files:**
- Modify: `app/(app)/finance/layout.tsx:10-16`

- [ ] **Step 1: Add the Rate Card tab**

In `app/(app)/finance/layout.tsx`, add one entry to the `tabs` array:

```typescript
const tabs = [
  { href: "/finance", label: "Overview", exact: true },
  { href: "/finance/purchase-orders", label: "Purchase Orders" },
  { href: "/finance/expenses", label: "Expenses" },
  { href: "/finance/projects", label: "Project Financials" },
  { href: "/finance/invoices", label: "Invoices" },
  { href: "/finance/rate-card", label: "Rate Card" },
];
```

- [ ] **Step 2: Verify the tab appears**

Run: `npm run dev` and navigate to `/finance`. Verify "Rate Card" tab appears in the tab bar.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/finance/layout.tsx
git commit -m "feat: add Rate Card tab to finance navigation"
```

---

### Task 6: Server Page + Loading Skeleton

**Files:**
- Create: `app/(app)/finance/rate-card/page.tsx`
- Create: `app/(app)/finance/rate-card/loading.tsx`

- [ ] **Step 1: Write the loading skeleton**

```typescript
import { Skeleton } from "@/components/ui/skeleton";

export default function RateCardLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-md" />
        ))}
      </div>
      <div className="space-y-1">
        <Skeleton className="h-10 w-full" />
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the server page**

```typescript
import { connection } from "next/server";
import { getActiveVersion, getVersions, getVersionData, getChangeLog } from "./actions";
import { RateCardClient } from "./_client";

export default async function RateCardPage() {
  await connection();

  const [activeVersion, versions] = await Promise.all([
    getActiveVersion().catch(() => null),
    getVersions().catch(() => []),
  ]);

  let tiers: Awaited<ReturnType<typeof getVersionData>>["tiers"] = [];
  let items: Awaited<ReturnType<typeof getVersionData>>["items"] = [];
  let deliverables: Awaited<ReturnType<typeof getVersionData>>["deliverables"] = [];
  let changes: Awaited<ReturnType<typeof getChangeLog>> = [];

  if (activeVersion) {
    const [data, log] = await Promise.all([
      getVersionData(activeVersion.id).catch(() => ({ tiers: [], items: [], deliverables: [] })),
      getChangeLog(activeVersion.id).catch(() => []),
    ]);
    tiers = data.tiers;
    items = data.items;
    deliverables = data.deliverables;
    changes = log;
  }

  return (
    <RateCardClient
      initialVersion={activeVersion}
      initialVersions={versions}
      initialTiers={tiers}
      initialItems={items}
      initialDeliverables={deliverables}
      initialChanges={changes}
    />
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/finance/rate-card/page.tsx app/\(app\)/finance/rate-card/loading.tsx
git commit -m "feat: rate card server page with loading skeleton"
```

---

### Task 7: Client Component (Rate Card Table)

**Files:**
- Create: `app/(app)/finance/rate-card/_client.tsx`

This is the largest task. The client component renders:
- Top bar: version selector, FX rate display, upload/download/change-log/new-version buttons
- Section tabs (6 sections)
- Rate card table with inline editing
- Change log slide-over panel

- [ ] **Step 1: Write the client component**

This file should follow the pattern in the mockup (`docs/specs/mockup-finance-rate-card-sow.html`, Rate Card tab). Key behaviors:

1. **Section tabs** — switch between alacarte, volume_retainer, pilot_sprint, brand_retainer, per_campaign, strategic
2. **Table** — rows = items filtered by section, columns = name, length, SLA, then 2 columns (list/floor) per tier
3. **Inline editing** — click any INR price cell → input field appears → Enter saves → calls `updateItemField` → all USD columns auto-recompute via `computeAllTierPrices`
4. **Change log** — fixed overlay panel on right, shows changes with before/after, reason, revert button
5. **Version selector** — dropdown to switch versions, calls `getVersionData` on change
6. **Reason dialog** — when editing, a small input appears asking "Why?" before saving

The component receives all data as props (server-prefetched) and uses `useState` for local state + server actions for mutations.

Use existing components: `Select`, `Input`, `Button`, `Badge`, `ScrollArea`, `Dialog`, `Sheet` from `@/components/ui/`.

Use `computeAllTierPrices` from `@/lib/rate-card/compute` for USD column computation.

Use `formatINR` from `@/lib/utils/format` for INR formatting.

Import types from `@/lib/types/rate-card`.

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`, navigate to `/finance/rate-card`.
Expected: Empty state (no version data yet). The page renders without errors, section tabs are visible, version selector shows empty.

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/finance/rate-card/_client.tsx
git commit -m "feat: rate card client component — table, inline editing, change log"
```

---

### Task 8: XLSX Parser (Import)

**Files:**
- Create: `lib/rate-card/xlsx-parser.ts`

- [ ] **Step 1: Install SheetJS**

Run: `npm install xlsx`

- [ ] **Step 2: Write the parser**

The parser reads the xlsx file (same format as `Fynd_Studio_Rate_Card_FY26-27_v7.xlsx`), extracts:
- FX rate from the "Assumptions" row
- Tier multipliers from the same row
- All items from §1-§6 sections with base INR prices
- Retainer deliverables from §2 and §4

It returns structured data matching the types in `lib/types/rate-card.ts`.

Reference the actual xlsx structure from `docs/specs/2026-05-12-finance-rate-card-sow-builder.md` §4.3 (Import workflow).

The parser exports: `parseRateCardXlsx(buffer: ArrayBuffer): { fxRate: number, tiers: {...}[], items: {...}[], deliverables: {...}[] }`

- [ ] **Step 3: Commit**

```bash
git add lib/rate-card/xlsx-parser.ts package.json package-lock.json
git commit -m "feat: xlsx parser for rate card import"
```

---

### Task 9: XLSX Export

**Files:**
- Create: `lib/rate-card/xlsx-export.ts`

- [ ] **Step 1: Write the export function**

Generates an xlsx file matching the original rate card format. Takes the current version data (tiers, items) and produces a downloadable file.

Exports: `exportRateCardXlsx(version: RateCardVersion, tiers: RateCardTier[], items: RateCardItem[]): ArrayBuffer`

- [ ] **Step 2: Commit**

```bash
git add lib/rate-card/xlsx-export.ts
git commit -m "feat: xlsx export for rate card download"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing 22 + new rate card tests)

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: Zero errors

- [ ] **Step 3: Visual smoke test**

Navigate to `/finance/rate-card` in the browser:
- [ ] Section tabs render and switch
- [ ] Table shows items with tier columns
- [ ] Inline editing works (click INR cell → type → Enter)
- [ ] Change log opens and shows edit history
- [ ] Revert button works
- [ ] Version selector works

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete rate card management in Finance module"
```
