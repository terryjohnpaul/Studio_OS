"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { Check, X, Printer, FileDown, RotateCcw, Plus, ChevronDown } from "lucide-react";
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
import { createSow, updateSow, getNextSowRef, type SowRow } from "./actions";
import { generateSowPdfHtml } from "@/lib/sow/generate-pdf-html";
import { FYND_STUDIOS_LOGO } from "@/lib/sow/logo";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Props = {
  version: RateCardVersion;
  tiers: RateCardTier[];
  items: RateCardItem[];
  editingSow?: SowRow | null;
  onSaved?: () => void;
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
  { label: "Same-day rush", desc: "Delivery in under 12 hours", value: "+30%" },
  { label: "Scope change", desc: "After storyboard approval", value: "+50%" },
  { label: "Brief change", desc: "After final delivery", value: "+100%" },
  { label: "Talent / music", desc: "Licensed assets, pass-through", value: "cost +15%" },
  { label: "Language pack", desc: "Per language beyond included", value: "+25%" },
];

const COUNTRIES: Record<string, { name: string; local: string; perUSD: number; symbol: string }> = {
  IN: { name: "India", local: "INR", perUSD: 83.0, symbol: "₹" },
  AE: { name: "UAE", local: "AED", perUSD: 3.67, symbol: "AED" },
  QA: { name: "Qatar", local: "QAR", perUSD: 3.64, symbol: "QAR" },
  KW: { name: "Kuwait", local: "KWD", perUSD: 0.31, symbol: "KWD" },
  BH: { name: "Bahrain", local: "BHD", perUSD: 0.38, symbol: "BHD" },
  OM: { name: "Oman", local: "OMR", perUSD: 0.38, symbol: "OMR" },
  IL: { name: "Israel", local: "ILS", perUSD: 3.72, symbol: "₪" },
  SA: { name: "Saudi Arabia", local: "SAR", perUSD: 3.75, symbol: "SAR" },
  EG: { name: "Egypt", local: "EGP", perUSD: 48.5, symbol: "EGP" },
  MA: { name: "Morocco", local: "MAD", perUSD: 10.0, symbol: "MAD" },
  JO: { name: "Jordan", local: "JOD", perUSD: 0.71, symbol: "JOD" },
  ZA: { name: "South Africa", local: "ZAR", perUSD: 18.3, symbol: "ZAR" },
  NG: { name: "Nigeria", local: "NGN", perUSD: 1600, symbol: "NGN" },
  KE: { name: "Kenya", local: "KES", perUSD: 129, symbol: "KES" },
  TN: { name: "Tunisia", local: "TND", perUSD: 3.1, symbol: "TND" },
  LB: { name: "Lebanon", local: "LBP", perUSD: 89500, symbol: "LBP" },
  SG: { name: "Singapore", local: "SGD", perUSD: 1.35, symbol: "S$" },
  MY: { name: "Malaysia", local: "MYR", perUSD: 4.72, symbol: "MYR" },
  TH: { name: "Thailand", local: "THB", perUSD: 36.5, symbol: "฿" },
  BN: { name: "Brunei", local: "BND", perUSD: 1.35, symbol: "B$" },
  ID: { name: "Indonesia", local: "IDR", perUSD: 16000, symbol: "Rp" },
  PH: { name: "Philippines", local: "PHP", perUSD: 58, symbol: "₱" },
  VN: { name: "Vietnam", local: "VND", perUSD: 25000, symbol: "₫" },
  KH: { name: "Cambodia", local: "KHR", perUSD: 4100, symbol: "KHR" },
  MM: { name: "Myanmar", local: "MMK", perUSD: 2100, symbol: "MMK" },
  LA: { name: "Laos", local: "LAK", perUSD: 21500, symbol: "LAK" },
  GB: { name: "United Kingdom", local: "GBP", perUSD: 0.79, symbol: "£" },
  IE: { name: "Ireland", local: "EUR", perUSD: 0.92, symbol: "€" },
  DE: { name: "Germany", local: "EUR", perUSD: 0.92, symbol: "€" },
  FR: { name: "France", local: "EUR", perUSD: 0.92, symbol: "€" },
  NL: { name: "Netherlands", local: "EUR", perUSD: 0.92, symbol: "€" },
  CH: { name: "Switzerland", local: "CHF", perUSD: 0.88, symbol: "CHF" },
  SE: { name: "Sweden", local: "SEK", perUSD: 10.7, symbol: "SEK" },
  DK: { name: "Denmark", local: "DKK", perUSD: 6.9, symbol: "DKK" },
  NO: { name: "Norway", local: "NOK", perUSD: 10.8, symbol: "NOK" },
  FI: { name: "Finland", local: "EUR", perUSD: 0.92, symbol: "€" },
  BE: { name: "Belgium", local: "EUR", perUSD: 0.92, symbol: "€" },
  AT: { name: "Austria", local: "EUR", perUSD: 0.92, symbol: "€" },
  ES: { name: "Spain", local: "EUR", perUSD: 0.92, symbol: "€" },
  IT: { name: "Italy", local: "EUR", perUSD: 0.92, symbol: "€" },
  PT: { name: "Portugal", local: "EUR", perUSD: 0.92, symbol: "€" },
  US: { name: "United States", local: "USD", perUSD: 1.0, symbol: "$" },
  CA: { name: "Canada", local: "CAD", perUSD: 1.37, symbol: "C$" },
  AU: { name: "Australia", local: "AUD", perUSD: 1.51, symbol: "A$" },
  NZ: { name: "New Zealand", local: "NZD", perUSD: 1.65, symbol: "NZ$" },
};

const DEFAULT_CUSTOMER_REQUIREMENTS = [
  "Brand brief · positioning · tonality references",
  "Brand assets (logo files, product imagery, colour palette, fonts)",
  "Target audience definition · market(s) · language(s) required",
  "Reference creatives (3–5 examples preferred)",
  "Performance benchmarks (current ROAS / CTR / engagement metrics)",
  "Approver and feedback turnaround SLA (24–48 hrs ideal)",
  "Access to brand's social handles / ad accounts (for posting)",
];

type Deliverable = { id: string; label: string; defaultQty: string | number; unit: string; editable: boolean };

const TIER_DELIVERABLES: Record<string, Deliverable[]> = {
  vol_starter: [
    { id: "sf", label: "Short-form videos (≤15s)", defaultQty: 10, unit: "/ mo", editable: true },
    { id: "bf", label: "Brand film (30s)", defaultQty: 1, unit: "/ mo", editable: true },
    { id: "cp", label: "Carousel pack", defaultQty: 1, unit: "/ mo", editable: true },
    { id: "lang", label: "Localisation languages", defaultQty: 2, unit: "lang", editable: true },
    { id: "dri", label: "Pod DRI", defaultQty: "Shared", unit: "", editable: false },
  ],
  vol_pro: [
    { id: "sf", label: "Short-form videos (≤15s)", defaultQty: 40, unit: "/ mo", editable: true },
    { id: "bf", label: "Brand films (30s)", defaultQty: 3, unit: "/ mo", editable: true },
    { id: "cin", label: "Cinematic hero", defaultQty: 1, unit: "/ mo", editable: true },
    { id: "cb", label: "Carousel / banner packs", defaultQty: "Unlimited", unit: "", editable: false },
    { id: "lang", label: "Localisation languages", defaultQty: 6, unit: "lang", editable: true },
    { id: "dri", label: "Pod DRI", defaultQty: "Dedicated", unit: "", editable: false },
  ],
  vol_enterprise: [
    { id: "sf", label: "Short-form (FUP)", defaultQty: "Unlimited", unit: "", editable: false },
    { id: "bf", label: "Brand films", defaultQty: 8, unit: "/ mo", editable: true },
    { id: "cin", label: "Cinematic films", defaultQty: 2, unit: "/ mo", editable: true },
    { id: "lang", label: "Localisation languages", defaultQty: 12, unit: "lang", editable: true },
    { id: "pod", label: "Motion designer pod", defaultQty: "Dedicated", unit: "", editable: false },
    { id: "rev", label: "Weekly portfolio review", defaultQty: "Yes", unit: "", editable: false },
  ],
  vol_master: [
    { id: "catalog", label: "Catalog negotiated", defaultQty: "End-to-end", unit: "", editable: false },
    { id: "creative", label: "Creative + post + localisation", defaultQty: "Full", unit: "", editable: false },
    { id: "cd", label: "Creative Director", defaultQty: "Dedicated", unit: "", editable: false },
    { id: "concierge", label: "Concierge desk", defaultQty: "Yes", unit: "", editable: false },
    { id: "gov", label: "Founder governance", defaultQty: "Yes", unit: "", editable: false },
    { id: "sla_rg", label: "Reliance-grade SLAs", defaultQty: "Yes", unit: "", editable: false },
  ],
  br_starter: [
    { id: "bwt", label: "Brand-world training", defaultQty: "One-time", unit: "", editable: false },
    { id: "cd", label: "Creative Director", defaultQty: "Named", unit: "", editable: false },
    { id: "hero", label: "Hero film", defaultQty: 1, unit: "/ qtr", editable: true },
    { id: "camp", label: "Campaigns", defaultQty: 2, unit: "/ qtr", editable: true },
    { id: "panel", label: "StudioOS customer panel", defaultQty: "Included", unit: "", editable: false },
    { id: "rev", label: "Monthly review", defaultQty: "Yes", unit: "", editable: false },
  ],
  br_pro: [
    { id: "starter", label: "All Starter benefits", defaultQty: "Included", unit: "", editable: false },
    { id: "hero", label: "Hero films", defaultQty: 2, unit: "/ qtr", editable: true },
    { id: "camp", label: "Campaigns", defaultQty: 6, unit: "/ qtr", editable: true },
    { id: "strat", label: "Brand strategist embed", defaultQty: "Yes", unit: "", editable: false },
    { id: "ab", label: "Cohort A/B testing", defaultQty: "Yes", unit: "", editable: false },
    { id: "rev", label: "Quarterly creative review", defaultQty: "Yes", unit: "", editable: false },
    { id: "lang", label: "Localisation languages", defaultQty: 6, unit: "lang", editable: true },
  ],
  br_enterprise: [
    { id: "pro", label: "All Professional benefits", defaultQty: "Included", unit: "", editable: false },
    { id: "hero", label: "Hero films", defaultQty: "Unlimited (FUP)", unit: "", editable: false },
    { id: "lang", label: "Localisation languages", defaultQty: 12, unit: "lang", editable: true },
    { id: "pod", label: "Dedicated pod (CD + strategist + AE + 2 designers)", defaultQty: "Yes", unit: "", editable: false },
    { id: "planner", label: "Embedded media planner", defaultQty: "Yes", unit: "", editable: false },
    { id: "audit", label: "Quarterly brand audit", defaultQty: "Yes", unit: "", editable: false },
  ],
  br_master: [
    { id: "creative_own", label: "Creative ownership across BUs", defaultQty: "Full", unit: "", editable: false },
    { id: "mv", label: "Multi-vertical coverage", defaultQty: "Yes", unit: "", editable: false },
    { id: "kill", label: "On-brand kill-switch", defaultQty: "Yes", unit: "", editable: false },
    { id: "gov", label: "Founder governance", defaultQty: "Yes", unit: "", editable: false },
    { id: "review", label: "Quarterly leadership review with Fynd C-suite", defaultQty: "Yes", unit: "", editable: false },
    { id: "partner", label: "Strategic partner-of-record", defaultQty: "Yes", unit: "", editable: false },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtPrice(amount: number, symbol: string): string {
  if (symbol === "$") return `$${amount.toLocaleString("en-US")}`;
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

function formatLocal(amount: number, currency: string, countryCode: string): string | null {
  if (currency === "INR") return null;
  const c = COUNTRIES[countryCode];
  if (!c || c.local === "USD") return null;
  const local = amount * c.perUSD;
  const rounded = local > 10000 ? Math.round(local / 100) * 100
    : local > 100 ? Math.round(local)
    : Math.round(local * 100) / 100;
  return `≈ ${c.symbol} ${rounded.toLocaleString("en-US")}`;
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
export function SoWBuilderClient({ version, tiers, items, editingSow, onSaved }: Props) {
  const [sowId, setSowId] = useState<string | null>(editingSow?.id ?? null);
  const [saving, setSaving] = useState(false);
  // Live FX rates
  const [liveFxRate, setLiveFxRate] = useState<number | null>(null);
  const [liveRates, setLiveRates] = useState<Record<string, number>>({});
  const fxRate = liveFxRate ?? version.fx_rate;

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => res.json())
      .then((data) => {
        if (data?.rates?.INR) setLiveFxRate(data.rates.INR);
        if (data?.rates) setLiveRates(data.rates);
      })
      .catch(() => {});
  }, []);

  // Step 1: Customer
  const [clientName, setClientName] = useState(editingSow?.client_name ?? "");
  const [brandName, setBrandName] = useState(editingSow?.brand_name ?? "");
  const [buyerName, setBuyerName] = useState(editingSow?.buyer_name ?? "");
  const [salesDri, setSalesDri] = useState(editingSow?.sales_dri ?? "");

  // Step 2: Market
  const [selectedTierKey, setSelectedTierKey] = useState(editingSow?.selected_tier_key ?? "india");
  const [selectedCountry, setSelectedCountry] = useState(() => {
    if (editingSow) {
      const tier = tiers.find(t => t.tier_key === editingSow.selected_tier_key);
      return tier?.countries?.[0] ?? "IN";
    }
    return "IN";
  });

  // Step 3: Services
  const [gmEnabled, setGmEnabled] = useState(editingSow?.gm_enabled ?? true);
  const [mkEnabled, setMkEnabled] = useState(editingSow?.mk_enabled ?? false);

  // Step 4: Configure
  const [activeService, setActiveService] = useState<"gm" | "mk">(editingSow?.gm_enabled ? "gm" : "mk");
  const [gmPlanType, setGmPlanType] = useState<GmPlanType>((editingSow?.gm_plan_type as GmPlanType) ?? "volume");
  const [mkPlanType, setMkPlanType] = useState<MkPlanType>((editingSow?.mk_plan_type as MkPlanType) ?? "brand");
  const [selectedGmTier, setSelectedGmTier] = useState(editingSow?.selected_gm_tier ?? "vol_pro");
  const [selectedMkTier, setSelectedMkTier] = useState(editingSow?.selected_mk_tier ?? "br_starter");
  const [alacarteQtys, setAlacarteQtys] = useState<Record<string, number>>({});
  const [campaignQtys, setCampaignQtys] = useState<Record<string, number>>({});
  const [strategicQtys, setStrategicQtys] = useState<Record<string, number>>(
    {},
  );
  const [showGmAddons, setShowGmAddons] = useState(false);

  // Editable deliverables per tier
  const [customDeliverables, setCustomDeliverables] = useState<Record<string, { id: string; label: string; qty: string | number; unit: string; editable: boolean }[]>>({});

  // SoW modal
  const [sowModalOpen, setSowModalOpen] = useState(false);
  const [sowRef, setSowRef] = useState("");
  const [sowDate, setSowDate] = useState("");
  const [sowTerm, setSowTerm] = useState("12 months from effective date");
  const [sowNotes, setSowNotes] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  // Customer requirements
  const [customerRequirements, setCustomerRequirements] = useState<string[]>(
    editingSow?.customer_requirements ?? [...DEFAULT_CUSTOMER_REQUIREMENTS]
  );
  const [newRequirement, setNewRequirement] = useState("");

  // Step 5: Commercials
  const [discount, setDiscount] = useState(editingSow?.discount ?? 10);
  const [upfront, setUpfront] = useState(editingSow?.upfront ?? 5);
  const [months, setMonths] = useState(editingSow?.months ?? 12);
  const [targetPrice, setTargetPrice] = useState(0);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  function getDeliverables(tierKey: string) {
    if (customDeliverables[tierKey]) return customDeliverables[tierKey];
    const defs = TIER_DELIVERABLES[tierKey];
    if (!defs) return [];
    return defs.map(d => ({ id: d.id, label: d.label, qty: d.defaultQty, unit: d.unit, editable: d.editable }));
  }

  function updateDeliverableQty(tierKey: string, delivId: string, qty: number) {
    const list = getDeliverables(tierKey);
    setCustomDeliverables(prev => ({
      ...prev,
      [tierKey]: list.map(d => d.id === delivId ? { ...d, qty } : d),
    }));
  }

  function removeDeliverable(tierKey: string, delivId: string) {
    const list = getDeliverables(tierKey);
    setCustomDeliverables(prev => ({
      ...prev,
      [tierKey]: list.filter(d => d.id !== delivId),
    }));
  }

  function buildSaveData(sowRefValue: string) {
    const alacarteAddonsData = alacarteItems
      .filter(i => (alacarteQtys[i.item_key] ?? 0) > 0)
      .map(i => ({ item_key: i.item_key, name: i.name, qty: alacarteQtys[i.item_key], unit_price: price(i.base_inr), length: i.length ?? undefined }));
    const gmDelivs = gmEnabled && gmPlanType === "volume" && selectedGmTier ? getDeliverables(selectedGmTier) : [];
    const mkDelivs = mkEnabled && mkPlanType === "brand" && selectedMkTier ? getDeliverables(selectedMkTier) : [];
    const gmTierItem = gmEnabled && gmPlanType === "volume" ? items.find(i => i.item_key === selectedGmTier) : null;
    const mkTierItem = mkEnabled && mkPlanType === "brand" ? items.find(i => i.item_key === selectedMkTier) : null;
    const tierNotes = [gmTierItem?.notes, mkTierItem?.notes].filter(Boolean).join(" | ") || undefined;
    return {
      sow_ref: sowRefValue,
      client_name: clientName,
      brand_name: brandName || null,
      buyer_name: buyerName || null,
      sales_dri: salesDri || null,
      selected_tier_key: selectedTierKey,
      tier_name: selectedTier?.name ?? "",
      gm_enabled: gmEnabled,
      mk_enabled: mkEnabled,
      gm_plan_type: gmPlanType,
      mk_plan_type: mkPlanType,
      selected_gm_tier: selectedGmTier || null,
      selected_mk_tier: selectedMkTier || null,
      discount,
      upfront,
      months,
      net_monthly: Math.round(netMonthly),
      annual_value: Math.round(annualValue),
      currency,
      symbol,
      customer_requirements: customerRequirements,
      list_monthly: Math.round(listMonthly),
      bundle_discount: Math.round(bundleDiscount),
      alacarte_addons: alacarteAddonsData,
      scope_snapshot: {
        gmDeliverables: gmDelivs.length > 0 ? gmDelivs : undefined,
        mkDeliverables: mkDelivs.length > 0 ? mkDelivs : undefined,
        gmTierName: gmTierItem?.name,
        mkTierName: mkTierItem?.name,
        tierNotes,
      },
      status: "draft" as const,
    };
  }

  function resetDeliverables(tierKey: string) {
    setCustomDeliverables(prev => {
      const next = { ...prev };
      delete next[tierKey];
      return next;
    });
  }

  function handleResetAll() {
    setClientName(""); setBrandName(""); setBuyerName(""); setSalesDri("");
    setSelectedTierKey("india"); setSelectedCountry("IN");
    setGmEnabled(true); setMkEnabled(false);
    setGmPlanType("volume"); setMkPlanType("brand");
    setSelectedGmTier(""); setSelectedMkTier("");
    setAlacarteQtys({}); setCampaignQtys({}); setStrategicQtys({});
    setDiscount(10); setUpfront(5); setMonths(12); setTargetPrice(0);
    setCustomDeliverables({});
    setShowGmAddons(false);
    setCustomerRequirements([...DEFAULT_CUSTOMER_REQUIREMENTS]); setNewRequirement("");
    setSowId(null); setLastSaved(null);
    setLogoDataUrl(null);
    localStorage.removeItem("sow_autosave");
    toast.success("Form reset");
  }

  // Auto-select country when tier changes
  useEffect(() => {
    const tier = tiers.find(t => t.tier_key === selectedTierKey);
    if (tier && tier.countries.length > 0 && !tier.countries.includes(selectedCountry)) {
      setSelectedCountry(tier.countries[0]);
    }
  }, [selectedTierKey, tiers, selectedCountry]);

  // Autosave every 30s — only for new SOWs, not when editing existing ones
  useEffect(() => {
    if (editingSow) return;
    const timer = setInterval(() => {
      if (clientName.trim()) {
        const draft = { clientName, brandName, buyerName, salesDri, selectedTierKey, gmEnabled, mkEnabled, discount, upfront, months };
        localStorage.setItem("sow_autosave", JSON.stringify(draft));
        setLastSaved(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [clientName, brandName, buyerName, salesDri, selectedTierKey, gmEnabled, mkEnabled, discount, upfront, months, editingSow]);

  // Warn on page close with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (clientName.trim()) { e.preventDefault(); }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [clientName]);

  // Restore autosave on mount — skip when editing an existing SOW
  useEffect(() => {
    if (editingSow) return;
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
  const alacarteAddonTotal = useMemo(() => {
    return alacarteItems.reduce((sum, item) => {
      const qty = alacarteQtys[item.item_key] ?? 0;
      return sum + qty * price(item.base_inr);
    }, 0);
  }, [alacarteQtys, alacarteItems, multiplier]);

  const gmMonthly = useMemo(() => {
    if (!gmEnabled) return 0;
    if (gmPlanType === "volume") {
      const item = items.find((i) => i.item_key === selectedGmTier);
      const tierBase = item ? price(item.base_inr) : 0;
      return tierBase + alacarteAddonTotal;
    }
    if (gmPlanType === "alacarte") {
      return alacarteAddonTotal;
    }
    if (gmPlanType === "pilot") {
      return pilotItem ? price(pilotItem.base_inr) : 0;
    }
    return 0;
  }, [
    gmEnabled,
    gmPlanType,
    selectedGmTier,
    alacarteAddonTotal,
    items,
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
    ? `Gen Media · ${GM_PLAN_LABELS[gmPlanType]}${gmPlanType === "volume" && selectedGmTier ? ` · ${items.find((i) => i.item_key === selectedGmTier)?.name ?? ""}` : ""}`
    : "";
  const mkScopeLabel = mkEnabled
    ? `Marketing · ${MK_PLAN_LABELS[mkPlanType]}${mkPlanType === "brand" && selectedMkTier ? ` · ${items.find((i) => i.item_key === selectedMkTier)?.name ?? ""}` : ""}`
    : "";

  // ---- Render ----
  return (
    <div className="flex-1 flex overflow-hidden relative max-w-[1400px] mx-auto w-full gap-5 h-full min-h-0">
      {/* ========== LEFT: CONFIG ========== */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="p-5 pl-0 space-y-4">
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
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <FieldLabel htmlFor="sow-country">
                  Country (local currency)
                </FieldLabel>
                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                  <SelectTrigger className="mt-1 h-9 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedTier?.countries.map((code) => {
                      const c = COUNTRIES[code];
                      return c ? (
                        <SelectItem key={code} value={code}>
                          {c.name} ({c.local})
                        </SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="bg-primary/10 border border-primary/30 px-3 py-2 rounded-md flex items-center gap-4 text-sm flex-wrap">
              <span className="text-muted-foreground font-semibold">Currency:</span>
              <span className="font-bold text-primary">
                {currency} ({symbol})
              </span>
              <span className="text-muted-foreground/50">&middot;</span>
              <span className="text-muted-foreground">Local:</span>
              <span className="font-bold text-primary">
                {(() => {
                  if (currency === "INR") return "INR (₹)";
                  const c = COUNTRIES[selectedCountry];
                  if (!c || c.local === "USD") return "USD ($)";
                  const liveLocal = liveRates[c.local];
                  if (liveLocal) return `1 USD ≈ ${liveLocal.toFixed(2)} ${c.local}`;
                  return `1 USD ≈ ${c.perUSD} ${c.local}`;
                })()}
              </span>
              {(() => {
                const c = COUNTRIES[selectedCountry];
                return c && c.local !== "USD" && currency !== "INR" && liveRates[c.local] ? (
                  <span className="text-[9px] text-primary font-medium">LIVE</span>
                ) : null;
              })()}
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
                <div className="p-4 space-y-4">
                  <p className="text-[11px] text-muted-foreground">Pick a monthly tier. Quantities are editable for micro-adjustment within the tier scope — price stays at tier rate.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {volumeItems.filter(i => i.item_key !== "vol_master").map((item) => (
                      <TierCard
                        key={item.item_key}
                        name={item.name}
                        price={fmtPrice(price(item.base_inr), symbol)}
                        localPrice={formatLocal(price(item.base_inr), currency, selectedCountry)}
                        unit={item.unit ?? "/mo"}
                        sla={item.sla ?? ""}
                        active={selectedGmTier === item.item_key}
                        onClick={() => setSelectedGmTier(selectedGmTier === item.item_key ? "" : item.item_key)}
                        deliverables={getDeliverables(item.item_key)}
                        onDelivQtyChange={(id, qty) => updateDeliverableQty(item.item_key, id, qty)}
                        onDelivRemove={(id) => removeDeliverable(item.item_key, id)}
                        onReset={() => resetDeliverables(item.item_key)}
                        hasCustom={!!customDeliverables[item.item_key]}
                      />
                    ))}
                  </div>
                  {(() => {
                    const master = volumeItems.find(i => i.item_key === "vol_master");
                    if (!master) return null;
                    return (
                      <>
                        <p className="text-[11px] text-muted-foreground mt-2">Annual Master · Reliance-grade · founder-governed</p>
                        <AnnualMasterCard
                          item={master}
                          price={fmtPrice(price(master.base_inr), symbol)}
                          localPrice={formatLocal(price(master.base_inr), currency, selectedCountry)}
                          active={selectedGmTier === master.item_key}
                          onClick={() => setSelectedGmTier(selectedGmTier === master.item_key ? "" : master.item_key)}
                          deliverables={getDeliverables(master.item_key)}
                        />
                      </>
                    );
                  })()}
                  {/* À la carte add-ons within volume plan */}
                  <div className="border rounded-lg overflow-hidden mt-1">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted/50 transition-colors"
                      onClick={() => setShowGmAddons(!showGmAddons)}
                    >
                      <span className="flex items-center gap-1.5">
                        <Plus className="size-3" />
                        Add-ons from À La Carte
                        {Object.values(alacarteQtys).filter(q => q > 0).length > 0 && (
                          <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                            {Object.values(alacarteQtys).filter(q => q > 0).length}
                          </Badge>
                        )}
                      </span>
                      <ChevronDown className={cn("size-3.5 transition-transform", showGmAddons && "rotate-180")} />
                    </button>
                    {showGmAddons && (
                      <div className="border-t px-3 py-3">
                        <AlacarteTable
                          items={alacarteItems}
                          qtys={alacarteQtys}
                          setQtys={setAlacarteQtys}
                          symbol={symbol}
                          priceFn={price}
                        />
                      </div>
                    )}
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
                <div className="p-4 space-y-4">
                  <p className="text-[11px] text-muted-foreground">Pick a monthly tier. Quantities are editable for micro-adjustment within the tier scope — price stays at tier rate.</p>
                  <div className="grid grid-cols-3 gap-3">
                    {brandRetainerItems.filter(i => i.item_key !== "br_master").map((item) => (
                      <TierCard
                        key={item.item_key}
                        name={item.name}
                        price={fmtPrice(price(item.base_inr), symbol)}
                        localPrice={formatLocal(price(item.base_inr), currency, selectedCountry)}
                        unit={item.unit ?? "/mo"}
                        sla={item.sla ?? ""}
                        notes={item.notes ?? undefined}
                        active={selectedMkTier === item.item_key}
                        onClick={() => setSelectedMkTier(selectedMkTier === item.item_key ? "" : item.item_key)}
                        deliverables={getDeliverables(item.item_key)}
                        onDelivQtyChange={(id, qty) => updateDeliverableQty(item.item_key, id, qty)}
                        onDelivRemove={(id) => removeDeliverable(item.item_key, id)}
                        onReset={() => resetDeliverables(item.item_key)}
                        hasCustom={!!customDeliverables[item.item_key]}
                      />
                    ))}
                  </div>
                  {(() => {
                    const master = brandRetainerItems.find(i => i.item_key === "br_master");
                    if (!master) return null;
                    return (
                      <>
                        <p className="text-[11px] text-muted-foreground mt-2">Annual Master · Reliance-grade · founder-governed</p>
                        <AnnualMasterCard
                          item={master}
                          price={fmtPrice(price(master.base_inr), symbol)}
                          localPrice={formatLocal(price(master.base_inr), currency, selectedCountry)}
                          active={selectedMkTier === master.item_key}
                          onClick={() => setSelectedMkTier(selectedMkTier === master.item_key ? "" : master.item_key)}
                          deliverables={getDeliverables(master.item_key)}
                        />
                      </>
                    );
                  })()}
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
                  value={discount || ""}
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { setDiscount(0); return; }
                    setDiscount(Math.min(50, Math.max(0, Number(v))));
                  }}
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
                  value={months || ""}
                  placeholder="12"
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") { setMonths(0); return; }
                    setMonths(Math.min(36, Math.max(1, Number(v))));
                  }}
                  onBlur={() => { if (!months) setMonths(12); }}
                />
              </div>
            </div>

            {/* Reverse lookup */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
              <div>
                <FieldLabel htmlFor="sow-target">Customer&apos;s target price (optional)</FieldLabel>
                <Input
                  id="sow-target"
                  type="number"
                  min={0}
                  step={100}
                  placeholder="enter what customer wants to pay"
                  className="mt-1"
                  value={targetPrice || ""}
                  onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value)))}
                />
              </div>
              <div>
                <FieldLabel>Implied discount</FieldLabel>
                <div className="mt-1 h-9 flex items-center px-3 bg-muted/50 border rounded-md text-sm font-bold text-primary">
                  {targetPrice > 0 && listMonthly > 0
                    ? `${(((listMonthly - targetPrice) / listMonthly) * 100).toFixed(1)}%`
                    : "—"}
                </div>
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
                Surcharges · applied on list price · not discountable
              </div>
              <div className="space-y-1.5">
                {SURCHARGES.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2"
                  >
                    <div>
                      <div className="text-xs font-medium text-foreground">{s.label}</div>
                      <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                    </div>
                    <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 ml-4">
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Step 6: Customer Requirements */}
        <section className="bg-card rounded-lg border overflow-hidden">
          <StepHeader label="6 · Customer Requirements" meta="Editable — included in SoW PDF" />
          <div className="p-4 space-y-2">
            <p className="text-[11px] text-muted-foreground mb-2">
              Items the customer must provide before delivery begins. Add, edit, or remove as needed.
            </p>
            {customerRequirements.map((req, idx) => (
              <div key={idx} className="flex items-center gap-2 group">
                <span className="text-primary font-bold text-xs">•</span>
                <input
                  type="text"
                  value={req}
                  onChange={(e) => {
                    const updated = [...customerRequirements];
                    updated[idx] = e.target.value;
                    setCustomerRequirements(updated);
                  }}
                  className="flex-1 text-xs bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none py-1 transition-colors"
                />
                <button
                  className="w-5 h-5 text-muted-foreground/30 hover:text-red-500 hover:bg-red-50 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setCustomerRequirements(customerRequirements.filter((_, i) => i !== idx))}
                  title="Remove"
                >×</button>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-3">
              <Plus className="size-3 text-muted-foreground" />
              <input
                type="text"
                placeholder="Add a requirement…"
                value={newRequirement}
                onChange={(e) => setNewRequirement(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newRequirement.trim()) {
                    setCustomerRequirements([...customerRequirements, newRequirement.trim()]);
                    setNewRequirement("");
                  }
                }}
                className="flex-1 text-xs bg-transparent border-b border-dashed border-muted-foreground/30 focus:border-primary focus:outline-none py-1 placeholder:text-muted-foreground/40"
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] h-6 px-2"
                disabled={!newRequirement.trim()}
                onClick={() => {
                  if (newRequirement.trim()) {
                    setCustomerRequirements([...customerRequirements, newRequirement.trim()]);
                    setNewRequirement("");
                  }
                }}
              >Add</Button>
            </div>
            {customerRequirements.length !== DEFAULT_CUSTOMER_REQUIREMENTS.length ||
              customerRequirements.some((r, i) => r !== DEFAULT_CUSTOMER_REQUIREMENTS[i]) ? (
              <button
                className="text-[10px] text-primary font-semibold hover:underline mt-1"
                onClick={() => setCustomerRequirements([...DEFAULT_CUSTOMER_REQUIREMENTS])}
              >↻ Reset to defaults</button>
            ) : null}
          </div>
        </section>

        <div className="h-24 shrink-0" />
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-card/95 backdrop-blur-sm border-t px-6 py-3 flex items-center justify-between z-30">
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
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={handleResetAll}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={saving || !clientName.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                const rowData = buildSaveData(sowId ? undefined! : await getNextSowRef());

                if (sowId) {
                  const { sow_ref: _, ...updates } = rowData;
                  await updateSow(sowId, updates);
                } else {
                  const created = await createSow(rowData as Parameters<typeof createSow>[0]);
                  setSowId(created.id);
                }
                setLastSaved(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
                toast.success("Draft saved");
                onSaved?.();
              } catch {
                toast.error("Failed to save draft");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Save Draft"}
          </Button>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={!clientName.trim() || !buyerName.trim() || !salesDri.trim() || (gmEnabled && gmPlanType === "volume" && !selectedGmTier) || (mkEnabled && mkPlanType === "brand" && !selectedMkTier)}
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
      <div className="w-[380px] shrink-0 flex flex-col overflow-hidden mt-5 mb-16 mr-0 bg-card border rounded-xl shadow-sm">
        <div className="px-4 py-3 text-xs font-bold flex items-center justify-between shrink-0 border-b">
          <span className="text-foreground">Live preview</span>
          <span className="font-normal text-muted-foreground text-[11px]">
            {selectedTier.name} &middot; {currency} &middot; {multiplier}&times;
          </span>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-3 bg-muted/30">
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
              selectedGmTier ? (
                <div className="bg-muted/50 rounded-lg border p-3 text-[11px] text-muted-foreground space-y-1">
                  <div className="font-semibold text-foreground text-xs mb-1">
                    {items.find((i) => i.item_key === selectedGmTier)?.name} plan
                    deliverables
                  </div>
                  <p className="text-muted-foreground italic">
                    {items.find((i) => i.item_key === selectedGmTier)?.notes}
                  </p>
                </div>
              ) : (
                <div className="bg-muted/50 rounded-lg border p-3 text-[11px] text-muted-foreground italic text-center py-6">
                  Select a Gen Media retainer plan
                </div>
              )
            )}
            {gmEnabled && gmPlanType === "volume" && alacarteItems.filter(i => (alacarteQtys[i.item_key] ?? 0) > 0).length > 0 && (
              <div className="bg-muted/50 rounded-lg border overflow-hidden mt-2">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/30">À la carte add-ons</div>
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
                    <div className="text-right">
                      <span className="text-primary">
                        {fmtPrice(Math.round(netMonthly), symbol)}
                      </span>
                      {formatLocal(Math.round(netMonthly), currency, selectedCountry) && (
                        <div className="text-[10px] font-normal text-muted-foreground">{formatLocal(Math.round(netMonthly), currency, selectedCountry)}</div>
                      )}
                    </div>
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

      </div>

      {/* ========== SOW DOCUMENT MODAL ========== */}
      {sowModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 no-print">
          <div className="bg-card rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto scrollbar-hide shadow-2xl">
            {/* Modal header */}
            <div className="sticky top-0 bg-card border-b px-6 py-3 flex items-center justify-between z-10 sow-modal-header">
              <div className="text-sm font-bold text-foreground">SoW Document Preview</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={async () => {
                  if (!sowId) {
                    try {
                      const rowData = buildSaveData(await getNextSowRef());
                      const created = await createSow(rowData as Parameters<typeof createSow>[0]);
                      setSowId(created.id);
                      onSaved?.();
                    } catch {}
                  }
                  const services = [gmEnabled ? gmScopeLabel : "", mkEnabled ? mkScopeLabel : ""].filter(Boolean).join(" + ");
                  const printWindow = window.open("", "_blank");
                  if (!printWindow) { toast.error("Pop-up blocked — allow pop-ups to print"); return; }
                  const alacarteAddonsForPdf = alacarteItems
                    .filter(i => (alacarteQtys[i.item_key] ?? 0) > 0)
                    .map(i => ({ item_key: i.item_key, name: i.name, qty: alacarteQtys[i.item_key], unit_price: price(i.base_inr), length: i.length ?? undefined }));
                  const gmDelivsForPdf = gmEnabled && gmPlanType === "volume" && selectedGmTier ? getDeliverables(selectedGmTier) : [];
                  const mkDelivsForPdf = mkEnabled && mkPlanType === "brand" && selectedMkTier ? getDeliverables(selectedMkTier) : [];
                  const gmTierNotes = gmEnabled && gmPlanType === "volume" ? items.find(i => i.item_key === selectedGmTier)?.notes : null;
                  const mkTierNotes = mkEnabled && mkPlanType === "brand" ? items.find(i => i.item_key === selectedMkTier)?.notes : null;
                  const gmTierNameForPdf = items.find(i => i.item_key === selectedGmTier)?.name;
                  const mkTierNameForPdf = items.find(i => i.item_key === selectedMkTier)?.name;
                  printWindow.document.write(generateSowPdfHtml({
                    sowRef,
                    clientName,
                    brandName,
                    buyerName,
                    salesDri,
                    tierName: selectedTier?.name ?? "",
                    currency,
                    symbol,
                    services,
                    gmPlanType,
                    mkPlanType,
                    discount,
                    upfront,
                    months,
                    netMonthly: Math.round(netMonthly),
                    annualValue: Math.round(annualValue),
                    listMonthly: Math.round(listMonthly),
                    bundleDiscount: Math.round(bundleDiscount),
                    customerRequirements,
                    alacarteAddons: alacarteAddonsForPdf,
                    scopeSnapshot: {
                      gmDeliverables: gmDelivsForPdf.length > 0 ? gmDelivsForPdf : undefined,
                      mkDeliverables: mkDelivsForPdf.length > 0 ? mkDelivsForPdf : undefined,
                      gmTierName: gmTierNameForPdf,
                      mkTierName: mkTierNameForPdf,
                      tierNotes: [gmTierNotes, mkTierNotes].filter(Boolean).join(" | ") || undefined,
                    },
                  }));
                  printWindow.document.close();
                  setTimeout(() => printWindow.print(), 400);
                }}>
                  <Printer className="h-3.5 w-3.5" />
                  Print / Save PDF
                </Button>
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const rowData = buildSaveData(sowId ? undefined! : await getNextSowRef());

                      if (sowId) {
                        const { sow_ref: _, ...updates } = rowData;
                        await updateSow(sowId, updates);
                      } else {
                        const created = await createSow(rowData as Parameters<typeof createSow>[0]);
                        setSowId(created.id);
                      }
                      toast.success("SoW saved as draft");
                      setSowModalOpen(false);
                      onSaved?.();
                    } catch {
                      toast.error("Failed to save draft");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? "Saving..." : "Save as Draft"}
                </Button>
                <button onClick={() => setSowModalOpen(false)} className="text-muted-foreground hover:text-foreground ml-2" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Logo upload bar */}
            <div className="px-6 py-3 border-b flex items-center gap-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase">Customer logo</label>
              <input
                type="file"
                accept="image/*"
                className="text-xs"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => setLogoDataUrl(reader.result as string);
                  reader.readAsDataURL(file);
                }}
              />
              {logoDataUrl && (
                <button className="text-xs text-destructive hover:underline" onClick={() => setLogoDataUrl(null)}>Remove</button>
              )}
            </div>

            {/* SoW Document */}
            <div className="p-8 print-area" id="sow-print-content">
              {/* Header */}
              <div className="flex items-start justify-between border-b-2 border-foreground pb-4 mb-6">
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={FYND_STUDIOS_LOGO} alt="Fynd Studios" className="h-8" />
                  <div className="text-xs text-muted-foreground mt-1">AI-native creative · Mumbai · Bangalore · Dubai</div>
                </div>
                <div className="text-right">
                  {logoDataUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoDataUrl} alt="Customer logo" className="max-h-16 max-w-[200px] mb-2 ml-auto" />
                  )}
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
              <table className="w-full mb-3 text-sm border border-border">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="py-2 px-3 text-left border border-border font-semibold">Deliverable</th>
                    <th className="py-2 px-3 text-center border border-border font-semibold w-20">Unit</th>
                    <th className="py-2 px-3 text-center border border-border font-semibold w-16">Qty</th>
                    <th className="py-2 px-3 text-right border border-border font-semibold w-28">Unit price</th>
                    <th className="py-2 px-3 text-right border border-border font-semibold w-28">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {gmEnabled && gmPlanType === "volume" && (() => {
                    const tier = items.find(i => i.item_key === selectedGmTier);
                    if (!tier) return null;
                    return (
                      <tr>
                        <td className="py-1.5 px-3 border border-border">{tier.name} — Volume Retainer</td>
                        <td className="py-1.5 px-3 text-center border border-border">/ mo</td>
                        <td className="py-1.5 px-3 text-center border border-border">1</td>
                        <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(tier.base_inr), symbol)}</td>
                        <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(price(tier.base_inr), symbol)}</td>
                      </tr>
                    );
                  })()}
                  {gmEnabled && gmPlanType === "volume" && alacarteItems.filter(i => (alacarteQtys[i.item_key] ?? 0) > 0).map(item => {
                    const qty = alacarteQtys[item.item_key] ?? 0;
                    return (
                      <tr key={item.item_key}>
                        <td className="py-1.5 px-3 border border-border text-muted-foreground">{item.name} (add-on)</td>
                        <td className="py-1.5 px-3 text-center border border-border">{item.length ?? "—"}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{qty}</td>
                        <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(item.base_inr), symbol)}</td>
                        <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(qty * price(item.base_inr), symbol)}</td>
                      </tr>
                    );
                  })}
                  {gmEnabled && gmPlanType === "alacarte" && alacarteItems.filter(i => (alacarteQtys[i.item_key] ?? 0) > 0).map(item => {
                    const qty = alacarteQtys[item.item_key] ?? 0;
                    return (
                      <tr key={item.item_key}>
                        <td className="py-1.5 px-3 border border-border">{item.name}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{item.length ?? "—"}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{qty}</td>
                        <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(item.base_inr), symbol)}</td>
                        <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(qty * price(item.base_inr), symbol)}</td>
                      </tr>
                    );
                  })}
                  {gmEnabled && gmPlanType === "pilot" && pilotItem && (
                    <tr>
                      <td className="py-1.5 px-3 border border-border">14 Day Pilot Sprint</td>
                      <td className="py-1.5 px-3 text-center border border-border">14 days</td>
                      <td className="py-1.5 px-3 text-center border border-border">1</td>
                      <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(pilotItem.base_inr), symbol)}</td>
                      <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(price(pilotItem.base_inr), symbol)}</td>
                    </tr>
                  )}
                  {mkEnabled && mkPlanType === "brand" && (() => {
                    const tier = items.find(i => i.item_key === selectedMkTier);
                    if (!tier) return null;
                    return (
                      <tr>
                        <td className="py-1.5 px-3 border border-border">{tier.name} — Brand Retainer</td>
                        <td className="py-1.5 px-3 text-center border border-border">/ mo</td>
                        <td className="py-1.5 px-3 text-center border border-border">1</td>
                        <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(tier.base_inr), symbol)}</td>
                        <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(price(tier.base_inr), symbol)}</td>
                      </tr>
                    );
                  })()}
                  {mkEnabled && mkPlanType === "campaign" && campaignItems.filter(i => (campaignQtys[i.item_key] ?? 0) > 0).map(item => {
                    const qty = campaignQtys[item.item_key] ?? 0;
                    return (
                      <tr key={item.item_key}>
                        <td className="py-1.5 px-3 border border-border">{item.name}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{item.length ?? "—"}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{qty}</td>
                        <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(item.base_inr), symbol)}</td>
                        <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(qty * price(item.base_inr), symbol)}</td>
                      </tr>
                    );
                  })}
                  {mkEnabled && mkPlanType === "strategic" && strategicItems.filter(i => (strategicQtys[i.item_key] ?? 0) > 0).map(item => {
                    const qty = strategicQtys[item.item_key] ?? 0;
                    return (
                      <tr key={item.item_key}>
                        <td className="py-1.5 px-3 border border-border">{item.name}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{item.length ?? "—"}</td>
                        <td className="py-1.5 px-3 text-center border border-border">{qty}</td>
                        <td className="py-1.5 px-3 text-right border border-border">{fmtPrice(price(item.base_inr), symbol)}</td>
                        <td className="py-1.5 px-3 text-right border border-border font-semibold">{fmtPrice(qty * price(item.base_inr), symbol)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {gmEnabled && gmPlanType === "volume" && (() => {
                const tier = items.find(i => i.item_key === selectedGmTier);
                return tier?.notes ? <div className="bg-muted/30 border rounded px-3 py-2 text-xs text-muted-foreground mb-3"><strong>Scope:</strong> {tier.notes}</div> : null;
              })()}
              {mkEnabled && mkPlanType === "brand" && (() => {
                const tier = items.find(i => i.item_key === selectedMkTier);
                return tier?.notes ? <div className="bg-muted/30 border rounded px-3 py-2 text-xs text-muted-foreground mb-3"><strong>Scope:</strong> {tier.notes}</div> : null;
              })()}
              {/* Consolidated deliverables — grouped by service */}
              {(() => {
                const gmDelivs = gmEnabled && gmPlanType === "volume" && selectedGmTier ? getDeliverables(selectedGmTier) : [];
                const mkDelivs = mkEnabled && mkPlanType === "brand" && selectedMkTier ? getDeliverables(selectedMkTier) : [];
                if (gmDelivs.length === 0 && mkDelivs.length === 0) return null;
                const gmTierName = items.find(i => i.item_key === selectedGmTier)?.name;
                const mkTierName = items.find(i => i.item_key === selectedMkTier)?.name;
                return (
                  <div className="text-sm mb-6">
                    <strong>Deliverables included:</strong>
                    {gmDelivs.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-primary mb-1">Gen Media — {gmTierName}</div>
                        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                          {gmDelivs.map((d, i) => (
                            <li key={i}>{d.label}: <strong className="text-foreground">{d.qty}{d.unit ? ` ${d.unit}` : ""}</strong></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {mkDelivs.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-semibold text-primary mb-1">Marketing — {mkTierName}</div>
                        <ul className="list-disc pl-5 space-y-0.5 text-muted-foreground">
                          {mkDelivs.map((d, i) => (
                            <li key={i}>{d.label}: <strong className="text-foreground">{d.qty}{d.unit ? ` ${d.unit}` : ""}</strong></li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Commercials */}
              <h3 className="text-lg font-bold text-foreground mb-3">2 · Commercials</h3>
              <table className="w-full mb-3 text-sm border border-border">
                <tbody>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">List price</td><td className="py-1.5 px-3 border border-border text-right font-semibold">{fmtPrice(listMonthly, symbol)} /mo</td></tr>
                  {bundleDiscount > 0 && <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Bundle discount (10%)</td><td className="py-1.5 px-3 border border-border text-right text-red-600">−{fmtPrice(bundleDiscount, symbol)}</td></tr>}
                  {discount > 0 && <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Negotiated discount ({discount}%)</td><td className="py-1.5 px-3 border border-border text-right text-red-600">−{fmtPrice(Math.round((listMonthly - bundleDiscount) * discount / 100), symbol)}</td></tr>}
                  {upfront > 0 && <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Upfront commitment ({upfront}% off)</td><td className="py-1.5 px-3 border border-border text-right text-red-600">−{fmtPrice(Math.round(netMonthly * upfront / (100 - upfront)), symbol)}</td></tr>}
                  <tr className="bg-primary/10"><td className="py-2 px-3 border border-border font-bold text-primary">Net monthly retainer</td><td className="py-2 px-3 border border-border text-right font-bold text-primary text-lg">{fmtPrice(netMonthly, symbol)}{formatLocal(Math.round(netMonthly), currency, selectedCountry) && <div className="text-xs font-normal text-muted-foreground">{formatLocal(Math.round(netMonthly), currency, selectedCountry)}</div>}</td></tr>
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
              <p className="text-sm text-foreground mb-6">
                <strong>Payment schedule:</strong>{" "}
                Monthly in advance on the 1st · Net-15.
                {upfront === 5 && " Upfront commitment: quarterly."}
                {upfront === 10 && " Upfront commitment: annual."}
              </p>

              {/* SLAs */}
              <h3 className="text-lg font-bold text-foreground mb-3">3 · Service Level Agreements</h3>
              <table className="w-full mb-3 text-sm border border-border">
                <tbody>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">First delivery</td><td className="py-1.5 px-3 border border-border font-semibold">48 hours from brief lock</td></tr>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Revision turnaround</td><td className="py-1.5 px-3 border border-border font-semibold">24 hours</td></tr>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Monthly review</td><td className="py-1.5 px-3 border border-border font-semibold">Included — Pod DRI + account lead</td></tr>
                  <tr><td className="py-1.5 px-3 border border-border text-muted-foreground">Escalation</td><td className="py-1.5 px-3 border border-border font-semibold">Account lead within 4 hours</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mb-6">First-delivery SLA measured from receipt of complete customer inputs and signed PO.</p>

              {/* Customer Inputs */}
              <h3 className="text-lg font-bold text-foreground mb-3">4 · Customer Inputs</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-foreground mb-3">
                {customerRequirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mb-6">Delays in customer inputs may extend delivery SLA proportionally.</p>

              {/* Surcharges */}
              <h3 className="text-lg font-bold text-foreground mb-3">5 · Surcharges & Standard Terms</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-foreground mb-6">
                <li>Same-day rush (&lt;12 hr SLA): <strong>+30%</strong> on list. Not discountable.</li>
                <li>Scope change after storyboard approval: up to <strong>+50%</strong> of asset cost.</li>
                <li>Major brief change after delivery: up to <strong>+100%</strong> of asset cost.</li>
                <li>Talent / branded music licensing: pass-through at <strong>cost +15%</strong> admin.</li>
                <li>Additional language packs: <strong>+25%</strong> of base per language beyond included.</li>
                <li>Payment: Net-15 retainers · Net-30 à la carte · 5% off quarterly upfront · 10% off annual upfront.</li>
                <li>Collection target: <strong>&le; 60 days</strong> PO-to-bank.</li>
              </ul>

              {/* Notes */}
              {sowNotes && (
                <div className="mb-6">
                  <h3 className="text-lg font-bold text-foreground mb-2">6 · Additional Notes</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sowNotes}</p>
                </div>
              )}

              {/* Signatures */}
              <h3 className="text-lg font-bold text-foreground mb-4">{sowNotes ? "7" : "6"} · Signatures</h3>
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
  localPrice,
  unit,
  sla,
  notes,
  active,
  onClick,
  deliverables,
  onDelivQtyChange,
  onDelivRemove,
  onReset,
  hasCustom,
}: {
  name: string;
  price: string;
  localPrice?: string | null;
  unit: string;
  sla: string;
  notes?: string;
  active: boolean;
  onClick: () => void;
  deliverables?: { id: string; label: string; qty: string | number; unit: string; editable: boolean }[];
  onDelivQtyChange?: (id: string, qty: number) => void;
  onDelivRemove?: (id: string) => void;
  onReset?: () => void;
  hasCustom?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative border-2 rounded-lg p-4 text-left transition-all cursor-pointer flex flex-col",
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
      {localPrice && <div className="text-[11px] text-muted-foreground">{localPrice} {unit}</div>}
      {deliverables && deliverables.length > 0 && (
        <ul className="mt-2 space-y-1 flex-1" onClick={(e) => e.stopPropagation()}>
          {deliverables.map((d) => (
            <li key={d.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="text-primary font-bold">•</span>
              <span className="flex-1">{d.label}</span>
              {d.editable && typeof d.qty === "number" ? (
                <input
                  type="number"
                  min={0}
                  className="w-12 h-5 px-1 text-[11px] text-center border rounded bg-card text-primary font-bold"
                  value={d.qty}
                  onChange={(e) => onDelivQtyChange?.(d.id, Math.max(0, Number(e.target.value)))}
                />
              ) : (
                <span className="text-primary font-semibold text-[11px]">{d.qty}</span>
              )}
              {d.unit && <span className="text-[10px]">{d.unit}</span>}
              <button
                className="w-4 h-4 text-muted-foreground/40 hover:text-red-500 hover:bg-red-50 rounded text-xs leading-none"
                onClick={() => onDelivRemove?.(d.id)}
                title="Remove"
              >×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="text-[11px] text-muted-foreground italic mt-2">{sla}</div>
      {hasCustom && onReset && (
        <button
          className="mt-1 text-[10px] text-primary font-semibold hover:underline self-start"
          onClick={(e) => { e.stopPropagation(); onReset(); }}
        >↻ Reset to defaults</button>
      )}
    </div>
  );
}

function AnnualMasterCard({
  item,
  price: priceStr,
  localPrice,
  active,
  onClick,
  deliverables,
}: {
  item: RateCardItem;
  price: string;
  localPrice?: string | null;
  active: boolean;
  onClick: () => void;
  deliverables: { id: string; label: string; qty: string | number; unit: string; editable: boolean }[];
}) {
  return (
    <div
      className={cn(
        "border-2 rounded-xl p-4 cursor-pointer transition-all grid grid-cols-[1fr_1.2fr] gap-4",
        "bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20",
        active
          ? "border-primary shadow-md"
          : "border-border hover:border-primary",
      )}
      onClick={onClick}
      role="radio"
      aria-checked={active}
    >
      <div className="flex flex-col justify-between">
        <div>
          <div className="text-base font-bold text-foreground">{item.name}</div>
          <div className="text-xl font-extrabold text-primary mt-1">{priceStr} <span className="text-[11px] font-normal text-muted-foreground">{item.unit ?? "/ mo"}</span></div>
          {localPrice && <div className="text-[11px] text-muted-foreground">{localPrice}</div>}
          {item.notes && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{item.notes}</p>}
        </div>
        <div className="text-[11px] text-muted-foreground italic mt-2">SLA: {item.sla}</div>
      </div>
      <div className="bg-card border rounded-lg p-3 shadow-sm">
        <div className="text-[11px] font-bold text-primary uppercase tracking-wider mb-2 pb-1.5 border-b">Included deliverables</div>
        <ul className="space-y-1">
          {deliverables.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>• {d.label}</span>
              <span className="text-primary font-semibold ml-2 shrink-0">{d.qty}{d.unit ? ` ${d.unit}` : ""}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
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
                  value={qty || ""}
                  placeholder="0"
                  onFocus={(e) => e.target.select()}
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
              value={qty || ""}
              placeholder="0"
              onFocus={(e) => e.target.select()}
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
