# Finance: Rate Card + SoW Builder — Design Spec

> **Status:** Approved
> **Date:** 2026-05-12
> **Scope:** Two new tabs in Finance — Rate Card management with audit/revert, and a full SoW Builder with lifecycle tracking

---

## 1. Problem

Fynd Studio's rate card lives in a Google Sheet / Excel file (`Fynd_Studio_Rate_Card_FY26-27_v7.xlsx`). The SoW Builder is a standalone HTML file (`Fynd_Studio_SoW_Builder.html`) with all pricing hardcoded in JavaScript. Neither tool integrates with the Command Centre — there's no audit trail for price changes, no link between proposals and clients, and no visibility into deal pipeline.

Management wants both tools brought into the Command Centre as first-class sections inside Finance.

## 2. Where It Lives

Two new tabs in the existing Finance tab bar:

```
Overview | Invoices | Expenses | Purchase Orders | Projects | Rate Card | SoW Builder
```

Route structure:
- `/finance/rate-card` — Rate card management
- `/finance/sow-builder` — SoW builder (list + create/edit)
- `/finance/sow-builder/[id]` — Individual SoW detail/edit

## 3. Access Control

| Role | Rate Card | SoW Builder |
|------|-----------|-------------|
| Owner | Full edit | Full access |
| Admin | Full edit | Full access |
| Manager | View only | View only |
| Member | View only | View only |
| Viewer | View only | View only |

## 4. Rate Card (`/finance/rate-card`)

### 4.1 Data Model

**`rate_card_versions`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| version_label | text | e.g., "v7", "v8" |
| fx_rate | numeric | INR per USD (e.g., 83.0) |
| is_active | boolean | Only one active at a time |
| notes | text | Optional version notes |
| created_by | uuid | FK → members |
| created_at | timestamptz | |

**`rate_card_tiers`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| version_id | uuid | FK → rate_card_versions |
| tier_key | text | e.g., "india", "mea_t1", "sea_t3" |
| name | text | e.g., "MEA T1 · UAE + GCC" |
| region | text | e.g., "MEA", "SEA", "ROW" |
| tier_level | text | "—", "T1", "T2", "T3" |
| multiplier | numeric | e.g., 4.0 for MEA T1 |
| currency | text | "INR" or "USD" |
| symbol | text | "₹", "$" |
| countries | text[] | e.g., {"AE","QA","KW","BH","OM","IL"} |

**`rate_card_items`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| version_id | uuid | FK → rate_card_versions |
| section | text | "alacarte", "volume_retainer", "pilot_sprint", "brand_retainer", "per_campaign", "strategic" |
| item_key | text | e.g., "image", "carousel", "vol_starter" |
| name | text | e.g., "Marketing image (single)" |
| description | text | Optional longer description |
| length | text | e.g., "static", "15s", "30s", "one-time" |
| base_inr | numeric | India base price in INR |
| floor_percent | numeric | Default 75 (floor = 75% of list) |
| sla | text | e.g., "24 hrs", "48 hrs", "7-10 days" |
| per_second | boolean | Whether pricing scales per second |
| seconds | integer | Duration in seconds (for per_second items) |
| unit | text | "/ mo", "/ yr", "/ qtr", "/ session" |
| sort_order | integer | Display ordering within section |
| notes | text | Additional notes |

Derived prices (USD per tier) are computed at read time: `base_inr × tier.multiplier ÷ fx_rate`, rounded. Floor = `list × floor_percent / 100`. No need to store every tier's USD price — compute from the three inputs.

**`rate_card_retainer_deliverables`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| item_id | uuid | FK → rate_card_items (the retainer tier) |
| label | text | e.g., "Short-form videos (≤15s)" |
| default_qty | text | e.g., "10", "Unlimited", "Dedicated" |
| unit | text | e.g., "/ mo", "lang" |
| editable | boolean | Whether SoW builder allows qty changes |
| sort_order | integer | |

**`rate_card_changes`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| version_id | uuid | FK → rate_card_versions |
| entity_type | text | "item", "tier", "version", "deliverable" |
| entity_id | uuid | FK to the changed record |
| field | text | e.g., "base_inr", "sla", "multiplier" |
| old_value | text | Previous value (stringified) |
| new_value | text | New value (stringified) |
| changed_by | uuid | FK → members |
| changed_at | timestamptz | |
| reverted_at | timestamptz | null unless reverted |
| reverted_by | uuid | null unless reverted |

### 4.2 UI

**Layout:** Full-width table view, switchable by section.

**Section tabs:** A La Carte | Volume Retainer | Pilot Sprint | Brand Retainer | Per-Campaign | Strategic Projects

**Table structure:**
- Rows = formats/tiers (items within the selected section)
- Columns = Item name | Length/Unit | SLA | India (₹ List / Floor) | MEA T1 ($ List / Floor) | MEA T2 | MEA T3 | SEA T1 | SEA T2 | SEA T3 | ROW T1 | ROW T2 | ROW T3
- USD columns are computed (not editable) — editing `base_inr` or `multiplier` auto-updates all USD columns
- Click any INR price cell to edit inline
- Retainer sections show a nested deliverables list under each tier row

**Top bar:**
- Version selector dropdown (v7, v8, etc.)
- "New Version" button (clones current version with incremented label)
- "Upload xlsx" button (parses and imports, creating a new version)
- "Download xlsx" button (exports current version)
- "Change Log" button (opens side panel)

**Change Log panel (slide-over):**
- Chronological list of all changes for the active version
- Each entry shows: timestamp, user avatar + name, field changed, old → new value
- "Revert" button on each entry — reverts the single change (creates a new change entry so the revert is also audited)
- Filter by: user, field, date range

### 4.3 Sync Workflow

**Import (xlsx → Supabase):**
1. Admin uploads xlsx file
2. System parses all sheets, extracts pricing data
3. Creates a new `rate_card_versions` record
4. Inserts all tiers, items, and deliverables
5. Marks the new version as active
6. Logs the import as a change event
7. Previous version remains in history (not deleted)

**Export (Supabase → xlsx):**
1. Admin clicks "Download xlsx"
2. System generates xlsx matching the original sheet format
3. Downloads to browser

No live Google Sheet connection — manual upload/download only.

## 5. SoW Builder (`/finance/sow-builder`)

### 5.1 Data Model

**`sow_documents`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| sow_ref | text | Auto-generated: FS-SOW-YYYY-NNN |
| client_id | uuid | FK → clients (required) |
| rate_card_version_id | uuid | FK → rate_card_versions (locks pricing) |
| status | text | "draft", "sent", "accepted", "rejected", "expired" |
| tier_key | text | Selected market tier |
| country_code | text | Selected country |
| currency | text | Effective currency |
| services | jsonb | { genmedia: bool, marketing: bool } |
| gm_config | jsonb | Gen Media plan config (plan type, retainer tier, a la carte qtys, deliverable overrides) |
| mk_config | jsonb | Marketing plan config (plan type, retainer tier, campaign qtys, strategic qtys) |
| commercials | jsonb | { discount, upfront, months, targetPrice } |
| subtotal | numeric | Before discount |
| total_amount | numeric | After all discounts |
| monthly_amount | numeric | Total ÷ months |
| customer_name | text | Denormalized for display |
| brand_name | text | |
| buyer_name | text | |
| sales_dri | text | |
| sow_date | text | Effective date |
| sow_term | text | e.g., "12 months from effective date" |
| sow_notes | text | Additional notes/caveats |
| logo_url | text | Customer logo (optional) |
| created_by | uuid | FK → members |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| sent_at | timestamptz | |
| accepted_at | timestamptz | |
| expired_at | timestamptz | |

### 5.2 UI — List View (`/finance/sow-builder`)

**Layout:** Table of all SoWs with columns:
- SoW Ref | Client | Services | Total | Status | Created | Actions

**Filters:** Status (all/draft/sent/accepted/rejected/expired), client search, date range

**Actions:** View, Edit (draft only), Duplicate, Change Status, Print PDF

**"New SoW" button** → opens the builder flow.

### 5.3 UI — Builder Flow (`/finance/sow-builder/new` or `/finance/sow-builder/[id]`)

Same 5-step wizard as the HTML tool, rebuilt in React:

**Step 1 — Customer:**
- Client picker (search existing clients, or type new name → auto-create via `createClientFull`)
- Brand name, Buyer name, Sales DRI fields
- When existing client selected: auto-fill brand name from client record

**Step 2 — Market:**
- Region/Tier dropdown (populated from `rate_card_tiers`)
- Country dropdown (filtered by selected tier)
- Currency display (auto-set from tier/country)

**Step 3 — Services:**
- Toggle chips: Gen Media / Marketing (one or both)
- Bundle note shown when both selected (10% off smaller line)

**Step 4 — Configure Plan:**
- Service tab switcher (when both selected)
- Gen Media: plan type tabs (Volume Retainer / A La Carte / 14 Day Pilot)
  - Volume Retainer: tier cards (Starter/Professional/Enterprise/Annual Master) with editable deliverable lists
  - A La Carte: line item table with format, length, unit price (from rate card), qty, line total
  - Pilot: single fixed-price card
- Marketing: plan type tabs (Brand Retainer / Per-Campaign / Strategic Projects)
  - Brand Retainer: tier cards with deliverable lists
  - Per-Campaign: price range cards with qty
  - Strategic: flat-price service cards with qty
- All prices pulled live from active `rate_card_versions`

**Step 5 — Commercials:**
- Discount % input
- Upfront commitment (monthly/quarterly/annual)
- Months committed
- Negotiation guardrail bar (same visual as HTML tool — red/amber/green/dark green)
- Authority callout (floor, manager band, list, below floor)
- Reverse lookup: customer's target price → implied discount

**Live Preview (right panel):**
- Same as HTML tool — shows scope breakdown, pricing, totals in real time
- Updates as user configures

**Generate SoW:**
- Opens final details modal (SoW ref, effective date, term, logo upload, notes)
- Saves to `sow_documents` with status "draft"
- "Print SoW" generates the same printable layout as the HTML tool

### 5.4 SoW Status Lifecycle

```
draft → sent → accepted
                → rejected
         → expired
```

Status changes are logged in `audit_log_events` (existing table).

### 5.5 Client Integration

- SoW links to `clients` table via `client_id`
- On client profile (`/clients/[id]`), a future "SoWs" tab can show all proposals for that client
- When SoW status changes to "accepted", the total amount can inform the Finance overview KPIs

## 6. Database Migration

One migration file: `supabase/migrations/011_rate_card_sow.sql`

Creates:
- `rate_card_versions`
- `rate_card_tiers`
- `rate_card_items`
- `rate_card_retainer_deliverables`
- `rate_card_changes`
- `sow_documents`
- `generate_sow_ref()` function (auto SoW reference: FS-SOW-YYYY-NNN)

## 7. File Structure

```
app/(app)/finance/
  rate-card/
    page.tsx              Server component: fetch active version + items
    _client.tsx           Client component: table with inline editing
    actions.ts            Server actions: CRUD for rate card
  sow-builder/
    page.tsx              Server component: fetch SoW list
    _client.tsx           Client component: SoW list table
    actions.ts            Server actions: CRUD for SoWs
    [id]/
      page.tsx            Server component: fetch SoW detail
      _client.tsx         Client component: builder wizard
  layout.tsx              Updated: add Rate Card + SoW Builder tabs

lib/
  types/
    rate-card.ts          Types for rate card entities
    sow.ts                Types for SoW entities
  rate-card/
    compute.ts            Price computation: base_inr × multiplier ÷ fx, rounding, floor
    xlsx-parser.ts        Parse uploaded xlsx into rate card data
    xlsx-export.ts        Export rate card to xlsx format
```

## 8. Verification

- [ ] Rate Card tab loads with all 6 sections and 10 tier columns
- [ ] Inline price editing saves to Supabase and logs a change
- [ ] Change log shows before/after diff with user attribution
- [ ] Revert button restores previous value and creates audit entry
- [ ] xlsx upload creates new version with correct data
- [ ] xlsx download produces a file matching the original format
- [ ] SoW Builder wizard: all 5 steps render, prices match rate card
- [ ] Client picker links SoW to existing client or creates new one
- [ ] SoW saved as draft, status transitions work
- [ ] Print/PDF output matches the HTML tool's layout
- [ ] Negotiation guardrail bar renders correctly
- [ ] Owner/Admin can edit, Manager/Member see read-only
- [ ] All 22 existing tests still pass
