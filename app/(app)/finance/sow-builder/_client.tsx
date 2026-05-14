"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { Check, X, Printer, FileDown } from "lucide-react";
import { toast } from "sonner";

import type {
  RateCardVersion,
  RateCardTier,
  RateCardItem,
} from "@/lib/types/rate-card";
import { computeTierPrice, computeFloor } from "@/lib/rate-card/compute";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Props = {
  version: RateCardVersion;
  tiers: RateCardTier[];
  items: RateCardItem[];
};

type GmPlanType = "volume" | "alacarte" | "pilot";
type MkPlanType = "brand" | "campaign" | "strategic";

const GM_PLAN_LABELS: Record<GmPlanType, string> = {
  volume: "Volume Retainer",
  alacarte: "A La Carte",
  pilot: "14 Day Pilot",
};
const MK_PLAN_LABELS: Record<MkPlanType, string> = {
  brand: "Brand Retainer",
  campaign: "Per-Campaign",
  strategic: "Strategic Projects",
};

const UPFRONT_OPTIONS = [
  { label: "Monthly (Net-15)", value: 0 },
  { label: "Quarterly upfront (5% off)", value: 5 },
  { label: "Annual upfront (10% off)", value: 10 },
] as const;

const SURCHARGES = [
  { label: "Same-day rush (<12 hr)", value: "+30%" },
  { label: "Scope change after storyboard", value: "+50%" },
  { label: "Brief change after delivery", value: "+100%" },
  { label: "Talent / music licensing", value: "cost +15%" },
  { label: "Language pack (per lang beyond included)", value: "+25%" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtPrice(amount: number, symbol: string): string {
  if (symbol === "$") return `$${amount.toLocaleString("en-US")}`;
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

function StepHeader({
  label,
  meta,
}: {
  label: string;
  meta?: string;
}) {
  return (
    <div className="bg-muted text-foreground px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b">
      <span>{label}</span>
      {meta && (
        <span className="text-[11px] font-normal text-muted-foreground">{meta}</span>
      )}
    </div>
  );
}

function FieldLabel({
  children,
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
    >
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SoWBuilderClient({ version, tiers, items }: Props) {
  // Live FX rate
  const [liveFxRate, setLiveFxRate] = useState<number | null>(null);
  const fxRate = liveFxRate ?? version.fx_rate;

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => res.json())
      .then((data) => {
        if (data?.rates?.INR) setLiveFxRate(data.rates.INR);
      })
      .catch(() => {});
  }, []);

  // Step 1: Customer
  const [clientName, setClientName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [salesDri, setSalesDri] = useState("");

  // Step 2: Market
  const [selectedTierKey, setSelectedTierKey] = useState("india");

  // Step 3: Services
  const [gmEnabled, setGmEnabled] = useState(true);
  const [mkEnabled, setMkEnabled] = useState(false);

  // Step 4: Configure
  const [activeService, setActiveService] = useState<"gm" | "mk">("gm");
  const [gmPlanType, setGmPlanType] = useState<GmPlanType>("volume");
  const [mkPlanType, setMkPlanType] = useState<MkPlanType>("brand");
  const [selectedGmTier, setSelectedGmTier] = useState("vol_pro");
  const [selectedMkTier, setSelectedMkTier] = useState("br_starter");
  const [alacarteQtys, setAlacarteQtys] = useState<Record<string, number>>({});
  const [campaignQtys, setCampaignQtys] = useState<Record<string, number>>({});
  const [strategicQtys, setStrategicQtys] = useState<Record<string, number>>(
    {},
  );

  // SoW modal
  const [sowModalOpen, setSowModalOpen] = useState(false);
  const [sowRef, setSowRef] = useState("");
  const [sowDate, setSowDate] = useState("");
  const [sowTerm, setSowTerm] = useState("12 months from effective date");
  const [sowNotes, setSowNotes] = useState("");

  // Step 5: Commercials
  const [discount, setDiscount] = useState(10);
  const [upfront, setUpfront] = useState(5);
  const [months, setMonths] = useState(12);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Autosave every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      if (clientName.trim()) {
        const draft = { clientName, brandName, buyerName, salesDri, selectedTierKey, gmEnabled, mkEnabled, discount, upfront, months };
        localStorage.setItem("sow_autosave", JSON.stringify(draft));
        setLastSaved(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [clientName, brandName, buyerName, salesDri, selectedTierKey, gmEnabled, mkEnabled, discount, upfront, months]);

  // Warn on page close with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (clientName.trim()) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [clientName]);

  // Restore autosave on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sow_autosave");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.clientName) {
          setClientName(d.clientName);
          setBrandName(d.brandName || "");
          setBuyerName(d.buyerName || "");
          setSalesDri(d.salesDri || "");
          if (d.selectedTierKey) setSelectedTierKey(d.selectedTierKey);
          if (d.gmEnabled !== undefined) setGmEnabled(d.gmEnabled);
          if (d.mkEnabled !== undefined) setMkEnabled(d.mkEnabled);
          if (d.discount !== undefined) setDiscount(d.discount);
          if (d.upfront !== undefined) setUpfront(d.upfront);
          if (d.months !== undefined) setMonths(d.months);
          toast.info("Restored your previous draft");
        }
      }
    } catch {}
  }, []);

  // Derived
  const selectedTier = tiers.find((t) => t.tier_key === selectedTierKey)!;
  const { symbol, currency, multiplier } = selectedTier;

  function price(baseInr: number) {
    return computeTierPrice(baseInr, multiplier, fxRate);
  }

  const volumeItems = useMemo(
    () =>
      items
        .filter((i) => i.section === "volume_retainer")
        .sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const alacarteItems = useMemo(
    () =>
      items
        .filter((i) => i.section === "alacarte")
        .sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const pilotItem = useMemo(
    () => items.find((i) => i.section === "pilot_sprint"),
    [items],
  );
  const brandRetainerItems = useMemo(
    () =>
      items
        .filter((i) => i.section === "brand_retainer")
        .sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const campaignItems = useMemo(
    () =>
      items
        .filter((i) => i.section === "per_campaign")
        .sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const strategicItems = useMemo(
    () =>
      items
        .filter((i) => i.section === "strategic")
        .sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );

  // ---- Price computation ----
  const gmMonthly = useMemo(() => {
    if (!gmEnabled) return 0;
    if (gmPlanType === "volume") {
      const item = items.find((i) => i.item_key === selectedGmTier);
      return item ? price(item.base_inr) : 0;
    }
    if (gmPlanType === "alacarte") {
      return alacarteItems.reduce((sum, item) => {
        const qty = alacarteQtys[item.item_key] ?? 0;
        return sum + qty * price(item.base_inr);
      }, 0);
    }
    if (gmPlanType === "pilot") {
      return pilotItem ? price(pilotItem.base_inr) : 0;
    }
    return 0;
  }, [
    gmEnabled,
    gmPlanType,
    selectedGmTier,
    alacarteQtys,
    items,
    alacarteItems,
    pilotItem,
    multiplier,
  ]);

  const mkMonthly = useMemo(() => {
    if (!mkEnabled) return 0;
    if (mkPlanType === "brand") {
      const item = items.find((i) => i.item_key === selectedMkTier);
      return item ? price(item.base_inr) : 0;
    }
    if (mkPlanType === "campaign") {
      return campaignItems.reduce((sum, item) => {
        const qty = campaignQtys[item.item_key] ?? 0;
        return sum + qty * price(item.base_inr);
      }, 0);
    }
    if (mkPlanType === "strategic") {
      return strategicItems.reduce((sum, item) => {
        const qty = strategicQtys[item.item_key] ?? 0;
        return sum + qty * price(item.base_inr);
      }, 0);
    }
    return 0;
  }, [
    mkEnabled,
    mkPlanType,
    selectedMkTier,
    campaignQtys,
    strategicQtys,
    items,
    campaignItems,
    strategicItems,
    multiplier,
  ]);

  // Bundle discount: 10% off the smaller line when both enabled
  const bundleDiscount = useMemo(() => {
    if (!gmEnabled || !mkEnabled) return 0;
    return Math.min(gmMonthly, mkMonthly) * 0.1;
  }, [gmEnabled, mkEnabled, gmMonthly, mkMonthly]);

  const listMonthly = gmMonthly + mkMonthly;
  const afterBundle = listMonthly - bundleDiscount;
  const discountAmt = afterBundle * (discount / 100);
  const afterDiscount = afterBundle - discountAmt;
  const upfrontAmt = afterDiscount * (upfront / 100);
  const netMonthly = afterDiscount - upfrontAmt;
  const totalDiscount = listMonthly > 0
    ? ((listMonthly - netMonthly) / listMonthly) * 100
    : 0;
  const annualValue = netMonthly * months;
  const quarterly = netMonthly * 3;
  const savings = (listMonthly - netMonthly) * months;

  // Guardrail position: 0% discount = 100% (right), 50% = 0% (left)
  const guardrailPos = Math.max(0, Math.min(100, 100 - totalDiscount * 2));

  function guardrailStatus(): {
    label: string;
    color: string;
    bg: string;
  } {
    if (totalDiscount <= 10)
      return {
        label: "List price band. Any DRI can approve.",
        color: "text-primary",
        bg: "bg-primary/10 border-primary/30",
      };
    if (totalDiscount <= 20)
      return {
        label: "Manager approval band. Pod DRI sign-off required.",
        color: "text-primary",
        bg: "bg-primary/10 border-primary/30",
      };
    if (totalDiscount <= 30)
      return {
        label: "Floor zone. Senior manager sign-off required.",
        color: "text-amber-700",
        bg: "bg-amber-50 dark:bg-amber-950/20 border-amber-200",
      };
    return {
      label: "Below floor. Walk away or offer 14 Day Pilot Sprint.",
      color: "text-red-700",
      bg: "bg-red-50 border-red-200",
    };
  }

  const status = guardrailStatus();

  // ---- Scope label ----
  const gmScopeLabel = gmEnabled
    ? `Gen Media · ${GM_PLAN_LABELS[gmPlanType]}${gmPlanType === "volume" ? ` · ${items.find((i) => i.item_key === selectedGmTier)?.name ?? ""}` : ""}`
    : "";
  const mkScopeLabel = mkEnabled
    ? `Marketing · ${MK_PLAN_LABELS[mkPlanType]}${mkPlanType === "brand" ? ` · ${items.find((i) => i.item_key === selectedMkTier)?.name ?? ""}` : ""}`
    : "";

  // ---- Render ----
  return (
    <div className="flex-1 flex overflow-hidden relative max-w-[1400px] mx-auto w-full">
      {/* ========== LEFT: CONFIG ========== */}
      <div className="flex-1 overflow-y-auto scrollbar-hide border-r">
        <div className="p-5 space-y-4">
        {/* Step 1: Customer */}
        <section className="bg-card rounded-lg border overflow-hidden">
          <StepHeader label="1 · Customer" meta="Linked to Clients module" />
          <div className="p-4 grid grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="sow-client" required>
                Client
              </FieldLabel>
              <Input
                id="sow-client"
                className="mt-1"
                placeholder="Client company name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="sow-brand">Brand name</FieldLabel>
              <Input
                id="sow-brand"
                className="mt-1"
                placeholder="Brand name"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="sow-buyer" required>
                Buyer (CMO / Performance lead)
              </FieldLabel>
              <Input
                id="sow-buyer"
                className="mt-1"
                placeholder="Buyer name and title"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="sow-dri" required>
                Sales DRI (Fynd)
              </FieldLabel>
              <Input
                id="sow-dri"
                className="mt-1"
                placeholder="Sales DRI name"
                value={salesDri}
                onChange={(e) => setSalesDri(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Step 2: Market */}
        <section className="bg-card rounded-lg border overflow-hidden">
          <StepHeader label="2 · Market" />
          <div className="p-4 space-y-3">
            <div>
              <FieldLabel htmlFor="sow-tier" required>
                Region / Tier
              </FieldLabel>
              <Select value={selectedTierKey} onValueChange={setSelectedTierKey}>
                <SelectTrigger className="mt-1 h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((t) => (
                    <SelectItem key={t.tier_key} value={t.tier_key}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-primary/10 border border-primary/30 px-3 py-2 rounded-md flex items-center gap-4 text-sm">
              <span className="text-muted-foreground font-semibold">Currency:</span>
              <span className="font-bold text-primary">
                {currency} ({symbol})
              </span>
              <span className="text-muted-foreground/50">&middot;</span>
              <span className="text-muted-foreground">Multiplier:</span>
              <span className="font-bold text-primary">
                {multiplier}&times;
              </span>
              <span className="text-muted-foreground/50">&middot;</span>
              <span className="text-muted-foreground">FX:</span>
              <span className="font-bold text-primary">
                {symbol === "$"
                  ? `$1 = ₹${fxRate.toFixed(2)}`
                  : `₹${fxRate.toFixed(2)} / $1`}
              </span>
              {liveFxRate && <span className="text-[9px] text-primary font-medium">LIVE</span>}
            </div>
          </div>
        </section>

        {/* Step 3: Services */}
        <section className="bg-card rounded-lg border overflow-hidden">
          <StepHeader label="3 · Services" />
          <div className="p-4">
            <p className="text-[11px] text-muted-foreground mb-3">
              Pick one or both. When both are selected, 10% bundle discount is
              auto-applied on the smaller line.
            </p>
            <div className="flex gap-3">
              <ServiceChip
                active={gmEnabled}
                onToggle={() => {
                  setGmEnabled(!gmEnabled);
                  if (!gmEnabled) setActiveService("gm");
                }}
                title="Gen Media"
                subtitle="AI-native production · per-asset / retainer / pilot"
              />
              <ServiceChip
                active={mkEnabled}
                onToggle={() => {
                  setMkEnabled(!mkEnabled);
                  if (!mkEnabled) setActiveService("mk");
                }}
                title="Marketing"
                subtitle="Brand + performance · retainer / per-campaign"
              />
            </div>
            {gmEnabled && mkEnabled && (
              <div className="mt-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 px-3 py-2 rounded text-[11px] text-amber-700 dark:text-amber-300">
                <strong>Bundle active:</strong> 10% discount auto-applied on the
                smaller of Gen Media or Marketing line.
              </div>
            )}
          </div>
        </section>

        {/* Step 4: Configure Plan */}
        <section className="bg-card rounded-lg border overflow-hidden">
          <StepHeader
            label="4 · Configure plan"
            meta={[gmScopeLabel, mkScopeLabel].filter(Boolean).join(" + ")}
          />

          {/* Service tab switcher */}
          {gmEnabled && mkEnabled && (
            <div className="flex bg-card border-b">
              <button
                className={cn(
                  "flex-1 py-2.5 text-[13px] font-bold text-center border-b-[3px] -mb-px transition-all",
                  activeService === "gm"
                    ? "text-primary border-primary bg-primary/10"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30",
                )}
                onClick={() => setActiveService("gm")}
              >
                Gen Media
              </button>
              <button
                className={cn(
                  "flex-1 py-2.5 text-[13px] font-bold text-center border-b-[3px] -mb-px transition-all",
                  activeService === "mk"
                    ? "text-primary border-primary bg-primary/10"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30",
                )}
                onClick={() => setActiveService("mk")}
              >
                Marketing
              </button>
            </div>
          )}

          {/* GM Config */}
          {gmEnabled && (activeService === "gm" || !mkEnabled) && (
            <>
              <PlanTabs
                tabs={Object.entries(GM_PLAN_LABELS).map(([k, v]) => ({
                  key: k,
                  label: v,
                }))}
                active={gmPlanType}
                onSelect={(k) => setGmPlanType(k as GmPlanType)}
              />
              {gmPlanType === "volume" && (
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-3">
                    {volumeItems.slice(0, 3).map((item) => (
                      <TierCard
                        key={item.item_key}
                        name={item.name}
                        price={fmtPrice(price(item.base_inr), symbol)}
                        unit={item.unit ?? "/mo"}
                        sla={item.sla ?? ""}
                        active={selectedGmTier === item.item_key}
                        onClick={() => setSelectedGmTier(item.item_key)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {gmPlanType === "alacarte" && (
                <div className="p-4">
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Select formats and quantities. Prices from active rate card{" "}
                    {version.version_label}.
                  </p>
                  <AlacarteTable
                    items={alacarteItems}
                    qtys={alacarteQtys}
                    setQtys={setAlacarteQtys}
                    symbol={symbol}
                    priceFn={price}
                  />
                </div>
              )}
              {gmPlanType === "pilot" && pilotItem && (
                <div className="p-4">
                  <div className="border-2 border-primary bg-primary/10 rounded-lg p-4">
                    <div className="text-sm font-bold text-foreground">
                      14 Day Pilot Sprint
                    </div>
                    <div className="text-xl font-extrabold text-primary mt-1">
                      {fmtPrice(price(pilotItem.base_inr), symbol)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Floor:{" "}
                      {fmtPrice(
                        computeFloor(
                          price(pilotItem.base_inr),
                          pilotItem.floor_percent,
                        ),
                        symbol,
                      )}{" "}
                      &middot; If pilot misses customer baseline, customer pays
                      ~{symbol}50K direct cost only
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      <li>&bull; 1 short-form campaign vs customer baseline</li>
                      <li>&bull; 14 day window, brief-to-delivery</li>
                      <li>&bull; 60% retainer-conversion target</li>
                      <li>
                        &bull; Full production quality &mdash; not a
                        &ldquo;test&rdquo;
                      </li>
                    </ul>
                    <div className="mt-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded px-3 py-2 text-[11px] text-amber-700">
                      <strong>Sales playbook:</strong> Use as a wedge when
                      customer won&apos;t commit to retainer. 60% convert to
                      Professional or higher within 60 days.
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* MK Config */}
          {mkEnabled && (activeService === "mk" || !gmEnabled) && (
            <>
              <PlanTabs
                tabs={Object.entries(MK_PLAN_LABELS).map(([k, v]) => ({
                  key: k,
                  label: v,
                }))}
                active={mkPlanType}
                onSelect={(k) => setMkPlanType(k as MkPlanType)}
              />
              {mkPlanType === "brand" && (
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-3">
                    {brandRetainerItems.slice(0, 3).map((item) => (
                      <TierCard
                        key={item.item_key}
                        name={item.name}
                        price={fmtPrice(price(item.base_inr), symbol)}
                        unit={item.unit ?? "/mo"}
                        sla={item.sla ?? ""}
                        notes={item.notes ?? undefined}
                        active={selectedMkTier === item.item_key}
                        onClick={() => setSelectedMkTier(item.item_key)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {mkPlanType === "campaign" && (
                <div className="p-4">
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Add campaigns on top of retainer or standalone. Price ranges
                    &mdash; final scoped per brief.
                  </p>
                  <QtyItemList
                    items={campaignItems}
                    qtys={campaignQtys}
                    setQtys={setCampaignQtys}
                    symbol={symbol}
                    priceFn={price}
                  />
                </div>
              )}
              {mkPlanType === "strategic" && (
                <div className="p-4">
                  <p className="text-[11px] text-muted-foreground mb-3">
                    One-off strategic projects. Fixed pricing.
                  </p>
                  <QtyItemList
                    items={strategicItems}
                    qtys={strategicQtys}
                    setQtys={setStrategicQtys}
                    symbol={symbol}
                    priceFn={price}
                  />
                </div>
              )}
            </>
          )}

          {!gmEnabled && !mkEnabled && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Enable at least one service in Step 3 to configure a plan.
            </div>
          )}
        </section>

        {/* Step 5: Commercials */}
        <section className="bg-card rounded-lg border overflow-hidden">
          <StepHeader label="5 · Commercials & Negotiation guardrails" />
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel htmlFor="sow-discount" required>
                  Discount %
                </FieldLabel>
                <Input
                  id="sow-discount"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  className="mt-1"
                  value={discount}
                  onChange={(e) =>
                    setDiscount(
                      Math.min(50, Math.max(0, Number(e.target.value))),
                    )
                  }
                />
                {discount > 30 && (
                  <p className="text-[10px] text-amber-600 mt-1">
                    Warning: Discount exceeds 30%. Requires VP approval.
                  </p>
                )}
              </div>
              <div>
                <FieldLabel htmlFor="sow-upfront">
                  Upfront commitment
                </FieldLabel>
                <Select value={String(upfront)} onValueChange={(v) => setUpfront(Number(v))}>
                  <SelectTrigger className="mt-1 h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UPFRONT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="sow-months" required>
                  Months committed
                </FieldLabel>
                <Input
                  id="sow-months"
                  type="number"
                  min={1}
                  max={36}
                  className="mt-1"
                  value={months}
                  onChange={(e) =>
                    setMonths(
                      Math.min(36, Math.max(1, Number(e.target.value))),
                    )
                  }
                />
              </div>
            </div>

            {/* Guardrail bar */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted-foreground font-semibold">
                  Negotiation position
                </span>
                <span className="font-bold text-primary">
                  {totalDiscount.toFixed(1)}% total
                </span>
              </div>
              <div className="h-9 rounded-lg relative flex overflow-hidden bg-gradient-to-r from-red-600 via-amber-500 via-50% via-lime-500 to-green-700">
                <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-white/90">
                  Walk-away
                </div>
                <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-white/90">
                  Floor
                </div>
                <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-white/90">
                  Manager
                </div>
                <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-white/90">
                  List
                </div>
                <div
                  className="absolute top-[-6px] bottom-[-6px] w-1 bg-foreground rounded"
                  style={{
                    left: `${guardrailPos}%`,
                    boxShadow: "0 0 0 2px white",
                  }}
                />
              </div>
              <div className="flex text-[11px] text-muted-foreground font-semibold mt-1">
                <div className="flex-1 text-center">
                  Below floor
                  <br />
                  <span className="text-muted-foreground/60">walk-away</span>
                </div>
                <div className="flex-1 text-center">
                  Floor
                  <br />
                  <span className="text-muted-foreground/60">25-30%</span>
                </div>
                <div className="flex-1 text-center">
                  Manager band
                  <br />
                  <span className="text-muted-foreground/60">10-20%</span>
                </div>
                <div className="flex-1 text-center">
                  List
                  <br />
                  <span className="text-muted-foreground/60">0-10%</span>
                </div>
              </div>
            </div>

            {/* Authority status */}
            <div
              className={cn(
                "border rounded-md px-3 py-2 text-xs",
                status.bg,
                status.color,
              )}
            >
              <strong>
                {totalDiscount <= 10
                  ? "List price band."
                  : totalDiscount <= 20
                    ? "Manager approval band."
                    : totalDiscount <= 30
                      ? "Floor zone."
                      : "Below floor."}
              </strong>{" "}
              {status.label}
            </div>

            {/* Surcharges */}
            <div className="border-t pt-3">
              <div className="text-[11px] font-bold text-muted-foreground uppercase mb-2">
                Surcharges (not discountable)
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                {SURCHARGES.map((s) => (
                  <div
                    key={s.label}
                    className="flex justify-between bg-muted/50 rounded px-2 py-1.5"
                  >
                    <span>{s.label}</span>
                    <span className="font-semibold text-red-600">
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="h-24 shrink-0" />
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="absolute bottom-0 left-0 right-[400px] bg-card/95 backdrop-blur-sm border-t px-6 py-3 flex items-center justify-between z-30">
        <div className="text-xs">
          {clientName ? (
            <span className="text-muted-foreground">{clientName} · {selectedTier?.name ?? "India"} · {gmEnabled ? "Gen Media" : ""}{gmEnabled && mkEnabled ? " + " : ""}{mkEnabled ? "Marketing" : ""}</span>
          ) : (
            <span className="text-destructive font-medium">Client name required</span>
          )}
          {lastSaved && <span className="text-muted-foreground/50 ml-2">· saved {lastSaved}</span>}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const draft = { clientName, brandName, buyerName, salesDri, selectedTierKey, gmEnabled, mkEnabled, gmPlanType, mkPlanType, selectedGmTier, selectedMkTier, alacarteQtys, campaignQtys, strategicQtys, discount, upfront, months };
              localStorage.setItem("sow_draft", JSON.stringify(draft));
              toast.success("Draft saved locally");
            }}
          >
            Save Draft
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={!clientName.trim() || !buyerName.trim() || !salesDri.trim()}
            onClick={() => {
              const now = new Date();
              setSowRef(`FS-SOW-${now.getFullYear()}-${String(Math.floor(Math.random()*999)+1).padStart(3,"0")}`);
              setSowDate(now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
              setSowModalOpen(true);
            }}
          >
            Generate SoW →
          </Button>
        </div>
      </div>

      {/* ========== RIGHT: LIVE PREVIEW ========== */}
      <div className="w-[400px] shrink-0 flex flex-col overflow-hidden border-l bg-muted/20">
        <div className="px-4 py-3 text-xs font-bold flex items-center justify-between shrink-0 border-b bg-card">
          <span className="text-foreground">Live preview</span>
          <span className="font-normal text-muted-foreground text-[11px]">
            {selectedTier.name} &middot; {currency} &middot; {multiplier}&times;
          </span>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
          {!clientName.trim() && !buyerName.trim() ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mb-3">
                <FileDown className="h-5 w-5 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Fill in customer details to see the live preview</p>
              <p className="text-[11px] text-muted-foreground/50 mt-1">Start with Step 1 on the left</p>
            </div>
          ) : (
          <>
          {/* Customer */}
          <div className="bg-card rounded-lg border p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Customer
            </div>
            <div className="text-sm font-semibold text-foreground">
              {clientName || "—"}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {[buyerName, salesDri].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>

          {/* Scope */}
          <div className="bg-card rounded-lg border p-3">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Scope &middot;{" "}
              {[gmScopeLabel, mkScopeLabel].filter(Boolean).join(" + ") ||
                "No services selected"}
            </div>
            {gmEnabled && gmPlanType === "volume" && (
              <div className="bg-muted/50 rounded-lg border p-3 text-[11px] text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground text-xs mb-1">
                  {items.find((i) => i.item_key === selectedGmTier)?.name} plan
                  deliverables
                </div>
                <p className="text-muted-foreground italic">
                  {items.find((i) => i.item_key === selectedGmTier)?.notes}
                </p>
              </div>
            )}
            {gmEnabled && gmPlanType === "alacarte" && (
              <div className="bg-muted/50 rounded-lg border overflow-hidden">
                {alacarteItems
                  .filter((item) => (alacarteQtys[item.item_key] ?? 0) > 0)
                  .map((item) => {
                    const qty = alacarteQtys[item.item_key] ?? 0;
                    const total = qty * price(item.base_inr);
                    return (
                      <div
                        key={item.item_key}
                        className="flex justify-between px-3 py-1.5 border-b last:border-0 text-[11px]"
                      >
                        <span className="text-foreground">{item.name}</span>
                        <span className="font-semibold">
                          {qty} &times; {fmtPrice(price(item.base_inr), symbol)}{" "}
                          = {fmtPrice(total, symbol)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Commercials */}
          {listMonthly > 0 && (
            <div className="bg-card rounded-lg border p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Commercials
              </div>
              <div className="space-y-1.5">
                <PreviewLine
                  label="List price"
                  value={`${fmtPrice(listMonthly, symbol)} /mo`}
                />
                {bundleDiscount > 0 && (
                  <PreviewLine
                    label="Bundle discount (10%)"
                    value={`-${fmtPrice(Math.round(bundleDiscount), symbol)}`}
                    negative
                  />
                )}
                {discount > 0 && (
                  <PreviewLine
                    label={`Discount (${discount}%)`}
                    value={`-${fmtPrice(Math.round(discountAmt), symbol)}`}
                    negative
                  />
                )}
                {upfront > 0 && (
                  <PreviewLine
                    label={`${UPFRONT_OPTIONS.find((o) => o.value === upfront)?.label ?? ""} (${upfront}%)`}
                    value={`-${fmtPrice(Math.round(upfrontAmt), symbol)}`}
                    negative
                  />
                )}
                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-foreground">Net monthly</span>
                    <span className="text-primary">
                      {fmtPrice(Math.round(netMonthly), symbol)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Payment schedule */}
          {listMonthly > 0 && (
            <div className="bg-card rounded-lg border p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Payment schedule &middot; {months} months &middot;{" "}
                {UPFRONT_OPTIONS.find((o) => o.value === upfront)?.label}
              </div>
              {upfront === 5 && months >= 3 ? (() => {
                const qCount = Math.min(4, Math.ceil(months / 3));
                const gridCls = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[qCount]!;
                return (
                <div className="bg-muted/50 rounded-lg border overflow-hidden">
                  <div className={cn("grid text-center text-[11px] font-semibold text-muted-foreground bg-muted py-1.5", gridCls)}>
                    {Array.from({ length: qCount }, (_, i) => (
                      <div key={i}>Q{i + 1}</div>
                    ))}
                  </div>
                  <div className={cn("grid text-center text-xs font-bold text-foreground py-2", gridCls)}>
                    {Array.from({ length: qCount }, (_, i) => (
                      <div key={i}>
                        {fmtPrice(Math.round(quarterly), symbol)}
                      </div>
                    ))}
                  </div>
                </div>
                );
              })() : (
                <div className="bg-muted/50 rounded-lg border p-3 text-xs text-foreground">
                  {fmtPrice(Math.round(netMonthly), symbol)} &times; {months}{" "}
                  months
                </div>
              )}
            </div>
          )}

          {/* Total summary */}
          {listMonthly > 0 && (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-primary font-semibold">
                    {months >= 12
                      ? "Annual contract value"
                      : `${months}-month value`}
                  </div>
                  <div className="text-xl font-extrabold text-primary">
                    {fmtPrice(Math.round(annualValue), symbol)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-primary font-semibold">
                    Effective monthly
                  </div>
                  <div className="text-xl font-extrabold text-primary">
                    {fmtPrice(Math.round(netMonthly), symbol)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary/30 text-[11px] text-primary">
                <span>
                  <strong>Total discount:</strong> {totalDiscount.toFixed(1)}%
                  off list
                </span>
                <span>&middot;</span>
                <span>
                  <strong>Savings:</strong>{" "}
                  {fmtPrice(Math.round(savings), symbol)} /{months >= 12 ? "yr" : `${months}mo`}
                </span>
              </div>
            </div>
          )}

          {/* SLA summary */}
          {gmEnabled && gmPlanType === "volume" && (
            <div className="bg-card rounded-lg border p-3">
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                SLA summary
              </div>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>First delivery</span>
                  <span className="font-semibold">
                    {items.find((i) => i.item_key === selectedGmTier)?.sla ??
                      "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Revision turnaround</span>
                  <span className="font-semibold">24 hrs</span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly review call</span>
                  <span className="font-semibold">Included</span>
                </div>
                <div className="flex justify-between">
                  <span>Pod DRI response</span>
                  <span className="font-semibold">Same business day</span>
                </div>
              </div>
            </div>
          )}
          </>
          )}
        </div>

        {/* Preview footer */}
        <div className="border-t px-4 py-2.5 bg-card shrink-0">
          <div className="text-[10px] text-muted-foreground text-center">
            Rate card {version.version_label} · {currency} · {selectedTier?.name}
          </div>
        </div>
      </div>

      {/* ========== SOW DOCUMENT MODAL ========== */}
      {sowModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 no-print">
          <div className="bg-card rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto scrollbar-hide shadow-2xl">
            {/* Modal header */}
            <div className="sticky top-0 bg-card border-b px-6 py-3 flex items-center justify-between z-10 sow-modal-header">
              <div className="text-sm font-bold text-foreground">SoW Document Preview</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                  <Printer className="h-3.5 w-3.5" />
                  Print / Save PDF
                </Button>
                <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={() => { toast.success("SoW saved as draft"); setSowModalOpen(false); }}>
                  Save as Draft
                </Button>
                <button onClick={() => setSowModalOpen(false)} className="text-muted-foreground hover:text-foreground ml-2" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* SoW Document */}
            <div className="p-8 print-area" id="sow-print-content">
              {/* Header */}
              <div className="flex items-start justify-between border-b-2 border-foreground pb-4 mb-6">
                <div>
                  <div className="text-3xl font-black text-foreground">FYND STUDIO</div>
                  <div className="text-xs text-muted-foreground mt-1">AI-native creative · Mumbai · Bangalore · Dubai</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-primary">{clientName || "Client"}</div>
                  <div className="text-xs text-muted-foreground">{brandName}</div>
                </div>
              </div>

              <div className="mb-6">
                <div className="text-2xl font-bold text-foreground">Statement of Work</div>
                <div className="text-sm text-muted-foreground mt-1">Ref: {sowRef} · Effective: {sowDate} · Term: {sowTerm}</div>
              </div>

              {/* Parties table */}
              <table className="w-full mb-6 text-sm border border-border">
                <tbody>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 w-1/4 border border-border">Service Provider</td><td className="py-2 px-3 border border-border">Fynd Studio · a division of Shopsense Retail Technologies Ltd.</td></tr>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 border border-border">Customer</td><td className="py-2 px-3 border border-border">{clientName}</td></tr>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 border border-border">Buyer</td><td className="py-2 px-3 border border-border">{buyerName}</td></tr>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 border border-border">Sales DRI (Fynd)</td><td className="py-2 px-3 border border-border">{salesDri}</td></tr>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 border border-border">Market / Tier</td><td className="py-2 px-3 border border-border">{selectedTier?.name} · {currency}</td></tr>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 border border-border">Services</td><td className="py-2 px-3 border border-border">{gmScopeLabel}{gmScopeLabel && mkScopeLabel ? " + " : ""}{mkScopeLabel}</td></tr>
                  <tr><td className="bg-muted/50 font-semibold py-2 px-3 border border-border">Term</td><td className="py-2 px-3 border border-border">{sowTerm}</td></tr>
                </tbody>
              </table>

              {/* Scope */}
              <h3 className="text-lg font-bold text-foreground mb-3">1 · Scope & Deliverables</h3>
              <table className="w-full mb-6 text-sm border border-border">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="py-2 px-3 text-left border border-border font-semibold">Deliverable</th>
                    <th className="py-2 px-3 text-center border border-border font-semibold w-20">Qty</th>
                    <th className="py-2 px-3 text-center border border-border font-semibold w-20">Unit</th>
                    <th className="py-2 px-3 text-right border border-border font-semibold w-24">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {gmEnabled && gmPlanType === "volume" && (() => {
                    const tier = items.find(i => i.item_key === selectedGmTier);
                    if (!tier) return null;
                    const deliverables = [
                      { name: `${tier.name} — Volume Retainer`, qty: "1", unit: "/ mo", sla: tier.sla || "—" },
                    ];
                    return deliverables.map((d, i) => (
                      <tr key={i}><td className="py-1.5 px-3 border border-border">{d.name}</td><td className="py-1.5 px-3 text-center border border-border">{d.qty}</td><td className="py-1.5 px-3 text-center border border-border">{d.unit}</td><td className="py-1.5 px-3 text-right border border-border">{d.sla}</td></tr>
                    ));
                  })()}
                  {gmEnabled && gmPlanType === "alacarte" && alacarteItems.filter(i => (alacarteQtys[i.item_key] ?? 0) > 0).map(item => (
                    <tr key={item.item_key}><td className="py-1.5 px-3 border border-border">{item.name}</td><td className="py-1.5 px-3 text-center border border-border">{alacarteQtys[item.item_key]}</td><td className="py-1.5 px-3 text-center border border-border">{item.length ?? "—"}</td><td className="py-1.5 px-3 text-right border border-border">{item.sla ?? "—"}</td></tr>
                  ))}
                  {gmEnabled && gmPlanType === "pilot" && pilotItem && (
                    <tr><td className="py-1.5 px-3 border border-border">14 Day Pilot Sprint</td><td className="py-1.5 px-3 text-center border border-border">1</td><td className="py-1.5 px-3 text-center border border-border">14 days</td><td className="py-1.5 px-3 text-right border border-border">14 days</td></tr>
                  )}
                  {mkEnabled && mkPlanType === "brand" && (() => {
                    const tier = items.find(i => i.item_key === selectedMkTier);
                    if (!tier) return null;
                    return <tr><td className="py-1.5 px-3 border border-border">{tier.name} — Brand Retainer</td><td className="py-1.5 px-3 text-center border border-border">1</td><td className="py-1.5 px-3 text-center border border-border">/ mo</td><td className="py-1.5 px-3 text-right border border-border">{tier.sla ?? "—"}</td></tr>;
                  })()}
                </tbody>
              </table>

              {/* Commercials */}
              <h3 className="text-lg font-bold text-foreground mb-3">2 · Commercials</h3>
              <table className="w-full mb-3 text-sm border border-border">
                <tbody>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">List price</td><td className="py-1.5 px-3 border border-border text-right font-semibold">{fmtPrice(listMonthly, symbol)} /mo</td></tr>
                  {bundleDiscount > 0 && <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Bundle discount (10%)</td><td className="py-1.5 px-3 border border-border text-right text-red-600">−{fmtPrice(bundleDiscount, symbol)}</td></tr>}
                  {discount > 0 && <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Negotiated discount ({discount}%)</td><td className="py-1.5 px-3 border border-border text-right text-red-600">−{fmtPrice(Math.round((listMonthly - bundleDiscount) * discount / 100), symbol)}</td></tr>}
                  {upfront > 0 && <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Upfront commitment ({upfront}% off)</td><td className="py-1.5 px-3 border border-border text-right text-red-600">−{fmtPrice(Math.round(netMonthly * upfront / (100 - upfront)), symbol)}</td></tr>}
                  <tr className="bg-primary/10"><td className="py-2 px-3 border border-border font-bold text-primary">Net monthly retainer</td><td className="py-2 px-3 border border-border text-right font-bold text-primary text-lg">{fmtPrice(netMonthly, symbol)}</td></tr>
                </tbody>
              </table>
              <table className="w-full mb-6 text-sm border border-border">
                <thead>
                  <tr className="bg-muted/50">
                    {upfront >= 5 ? (
                      <><th className="py-2 px-3 text-center border border-border font-semibold">Q1</th><th className="py-2 px-3 text-center border border-border font-semibold">Q2</th><th className="py-2 px-3 text-center border border-border font-semibold">Q3</th><th className="py-2 px-3 text-center border border-border font-semibold">Q4</th><th className="py-2 px-3 text-center border border-border font-semibold text-primary bg-primary/10">Annual</th></>
                    ) : (
                      <><th className="py-2 px-3 text-center border border-border font-semibold">Monthly</th><th className="py-2 px-3 text-center border border-border font-semibold text-primary bg-primary/10">Annual</th></>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {upfront >= 5 ? (
                      <>{[1,2,3,4].map(q => <td key={q} className="py-2 px-3 text-center border border-border font-semibold">{fmtPrice(Math.round(netMonthly * 3), symbol)}</td>)}<td className="py-2 px-3 text-center border border-border font-bold text-primary bg-primary/10 text-lg">{fmtPrice(annualValue, symbol)}</td></>
                    ) : (
                      <><td className="py-2 px-3 text-center border border-border font-semibold">{fmtPrice(netMonthly, symbol)}</td><td className="py-2 px-3 text-center border border-border font-bold text-primary bg-primary/10 text-lg">{fmtPrice(annualValue, symbol)}</td></>
                    )}
                  </tr>
                </tbody>
              </table>

              {/* SLAs */}
              <h3 className="text-lg font-bold text-foreground mb-3">3 · Service Level Agreements</h3>
              <table className="w-full mb-6 text-sm border border-border">
                <tbody>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">First delivery</td><td className="py-1.5 px-3 border border-border font-semibold">48 hours from brief lock</td></tr>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Revision turnaround</td><td className="py-1.5 px-3 border border-border font-semibold">24 hours</td></tr>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Monthly review</td><td className="py-1.5 px-3 border border-border font-semibold">Included — Pod DRI + account lead</td></tr>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Escalation</td><td className="py-1.5 px-3 border border-border font-semibold">Account lead within 4 hours</td></tr>
                </tbody>
              </table>

              {/* Surcharges */}
              <h3 className="text-lg font-bold text-foreground mb-3">4 · Surcharges & Standard Terms</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-foreground mb-6">
                <li>Same-day rush (&lt;12 hr SLA): <strong>+30%</strong> on list. Not discountable.</li>
                <li>Scope change after storyboard approval: up to <strong>+50%</strong> of asset cost.</li>
                <li>Major brief change after delivery: up to <strong>+100%</strong> of asset cost.</li>
                <li>Talent / branded music licensing: pass-through at <strong>cost +15%</strong> admin.</li>
                <li>Additional language packs: <strong>+25%</strong> of base per language beyond included.</li>
                <li>Payment: Net-15 retainers · Net-30 à la carte · 5% off quarterly · 10% off annual.</li>
              </ul>

              {/* Notes */}
              {sowNotes && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-foreground mb-2">5 · Additional Notes</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sowNotes}</p>
                </div>
              )}

              {/* Signatures */}
              <h3 className="text-lg font-bold text-foreground mb-4">{sowNotes ? "6" : "5"} · Signatures</h3>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="border-b-2 border-muted-foreground h-16 mb-2" />
                  <div className="font-semibold text-sm">Fynd Studio</div>
                  <div className="text-xs text-muted-foreground">Debajit Sardar · Founder</div>
                </div>
                <div>
                  <div className="border-b-2 border-muted-foreground h-16 mb-2" />
                  <div className="font-semibold text-sm">{clientName || "Customer"}</div>
                  <div className="text-xs text-muted-foreground">Authorised representative</div>
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground mt-8 pt-4 border-t border-border">
                Internal reference · This SoW is governed by the Fynd Studio Master Services Agreement.
                Pricing derived from Rate Card FY 2026-27 ({version.version_label}) · SoW Builder. Floor / walk-away logic per v12 Business Plan §8.4.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ServiceChip({
  active,
  onToggle,
  title,
  subtitle,
}: {
  active: boolean;
  onToggle: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex-1 px-4 py-3 border-2 rounded-lg flex items-center gap-3 text-left transition-all",
        active
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border hover:border-primary hover:bg-muted/30",
      )}
      onClick={onToggle}
      role="checkbox"
      aria-checked={active}
    >
      <div
        className={cn(
          "w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/30",
        )}
      >
        {active && <Check className="size-3" />}
      </div>
      <div>
        <div className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">
          Line of business
        </div>
        <div className="text-sm font-bold text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle}</div>
      </div>
    </button>
  );
}

function PlanTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="px-3 pt-3 flex gap-0 border-b" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          className={cn(
            "px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
            active === t.key
              ? "text-primary border-primary"
              : "text-muted-foreground border-transparent hover:text-foreground hover:border-border",
          )}
          onClick={() => onSelect(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TierCard({
  name,
  price: priceStr,
  unit,
  sla,
  notes,
  active,
  onClick,
}: {
  name: string;
  price: string;
  unit: string;
  sla: string;
  notes?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative border-2 rounded-lg p-4 text-left transition-all",
        active
          ? "border-primary bg-primary/10 shadow-md"
          : "border-border hover:border-primary hover:bg-muted/30 hover:shadow-sm",
      )}
      onClick={onClick}
      role="radio"
      aria-checked={active}
    >
      {active && (
        <div className="absolute top-2 right-2 w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-sm">
          <Check className="size-3" />
        </div>
      )}
      <div className="text-xs font-bold text-foreground">{name}</div>
      <div className="text-lg font-extrabold text-primary mt-1">
        {priceStr}
        <span className="text-[11px] font-normal text-muted-foreground ml-1">
          {unit}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground italic mt-1">{sla}</div>
      {notes && (
        <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{notes}</p>
      )}
    </button>
  );
}

function AlacarteTable({
  items: alacarteItems,
  qtys,
  setQtys,
  symbol,
  priceFn,
}: {
  items: RateCardItem[];
  qtys: Record<string, number>;
  setQtys: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  symbol: string;
  priceFn: (baseInr: number) => number;
}) {
  const total = alacarteItems.reduce((sum, item) => {
    const qty = qtys[item.item_key] ?? 0;
    return sum + qty * priceFn(item.base_inr);
  }, 0);

  return (
    <>
      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="grid grid-cols-[2fr_0.6fr_0.8fr_80px_1fr] gap-2 bg-muted/50 px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase">
          <div>Format</div>
          <div className="text-center">Length</div>
          <div className="text-right">Unit price</div>
          <div className="text-center">Qty</div>
          <div className="text-right">Line total</div>
        </div>
        {alacarteItems.map((item) => {
          const qty = qtys[item.item_key] ?? 0;
          const lineTotal = qty * priceFn(item.base_inr);
          return (
            <div
              key={item.item_key}
              className="grid grid-cols-[2fr_0.6fr_0.8fr_80px_1fr] gap-2 items-center px-3 py-2 border-t text-xs hover:bg-muted/50/50"
            >
              <div>
                <div className="font-medium text-foreground">{item.name}</div>
                {item.sla && (
                  <div className="text-[11px] text-muted-foreground">
                    {item.sla} SLA
                  </div>
                )}
              </div>
              <div className="text-center text-muted-foreground">
                {item.length ?? "—"}
              </div>
              <div className="text-right font-semibold text-primary">
                {fmtPrice(priceFn(item.base_inr), symbol)}
              </div>
              <div className="text-center">
                <input
                  type="number"
                  min={0}
                  className="w-14 h-7 px-1.5 text-xs text-center border rounded bg-card text-primary font-bold focus:outline-emerald-500"
                  value={qty}
                  onChange={(e) =>
                    setQtys((prev) => ({
                      ...prev,
                      [item.item_key]: Math.max(0, Number(e.target.value)),
                    }))
                  }
                />
              </div>
              <div className="text-right font-bold text-foreground">
                {qty > 0 ? fmtPrice(lineTotal, symbol) : "—"}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">Subtotal</div>
          <div className="text-lg font-extrabold text-foreground">
            {fmtPrice(Math.round(total), symbol)}
          </div>
        </div>
      </div>
    </>
  );
}

function QtyItemList({
  items: listItems,
  qtys,
  setQtys,
  symbol,
  priceFn,
}: {
  items: RateCardItem[];
  qtys: Record<string, number>;
  setQtys: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  symbol: string;
  priceFn: (baseInr: number) => number;
}) {
  return (
    <div className="space-y-2">
      {listItems.map((item) => {
        const qty = qtys[item.item_key] ?? 0;
        return (
          <div
            key={item.item_key}
            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
          >
            <div className="flex-1">
              <div className="text-xs font-semibold text-foreground">
                {item.name}
              </div>
              {item.description && (
                <div className="text-[11px] text-muted-foreground">
                  {item.description}
                </div>
              )}
              {item.sla && (
                <div className="text-[11px] text-muted-foreground">{item.sla}</div>
              )}
              {item.notes && (
                <div className="text-[11px] text-primary font-medium">
                  {item.notes}
                </div>
              )}
            </div>
            <div className="text-xs font-bold text-primary">
              {fmtPrice(priceFn(item.base_inr), symbol)}
            </div>
            <input
              type="number"
              min={0}
              className="w-14 h-7 px-1.5 text-xs text-center border rounded bg-card text-primary font-bold focus:outline-emerald-500"
              value={qty}
              onChange={(e) =>
                setQtys((prev) => ({
                  ...prev,
                  [item.item_key]: Math.max(0, Number(e.target.value)),
                }))
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function PreviewLine({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", negative ? "text-red-600" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}
