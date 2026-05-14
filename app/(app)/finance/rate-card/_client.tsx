"use client";

import React, { useState, useCallback, useRef, useEffect, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Download, Clock, Plus, X, Pencil, Search, ChevronRight, Sparkles, Send, Loader2, BookOpen, ShieldCheck } from "lucide-react";
import type {
  RateCardVersion,
  RateCardTier,
  RateCardItem,
  RateCardDeliverable,
  RateCardChange,
  RateCardSection,
} from "@/lib/types/rate-card";
import { SECTION_LABELS } from "@/lib/types/rate-card";
import { computeAllTierPrices, roundPrice } from "@/lib/rate-card/compute";
import * as XLSX from "xlsx";
import { formatINR } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  updateItemField,
  revertChange,
  getChangeLog,
  getVersionData,
} from "./actions";

// ─── Props ─────────────────────────────────────────────────────────────────

type Props = {
  initialVersion: RateCardVersion | null;
  initialVersions: RateCardVersion[];
  initialTiers: RateCardTier[];
  initialItems: RateCardItem[];
  initialDeliverables: RateCardDeliverable[];
  initialChanges: RateCardChange[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatCurrency(value: number, symbol: string) {
  if (symbol === "₹") return formatINR(value);
  return `${symbol}${value.toLocaleString("en-US")}`;
}

function formatTimestamp(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const SECTIONS = Object.keys(SECTION_LABELS) as RateCardSection[];

const SECTION_GROUPS: { label: string; sections: RateCardSection[] }[] = [
  { label: "Gen Media", sections: ["alacarte", "volume_retainer", "pilot_sprint"] },
  { label: "Marketing", sections: ["brand_retainer", "per_campaign", "strategic"] },
];

// ─── Component ─────────────────────────────────────────────────────────────

export function RateCardClient({
  initialVersion,
  initialVersions,
  initialTiers,
  initialItems,
  initialDeliverables,
  initialChanges,
}: Props) {
  // State
  const [version, setVersion] = useState(initialVersion);
  const [versions] = useState(initialVersions);
  const [tiers, setTiers] = useState(initialTiers);
  const [items, setItems] = useState(initialItems);
  const [, setDeliverables] = useState(initialDeliverables);
  const [changes, setChanges] = useState(initialChanges);
  const [activeSection, setActiveSection] = useState<RateCardSection>("alacarte");
  const [changeLogOpen, setChangeLogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [guardrailsOpen, setGuardrailsOpen] = useState(false);

  // AI chat state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Inline edit state
  type EditableField = "base_inr" | "sla" | "name" | "length" | "notes";
  const [editingCell, setEditingCell] = useState<{
    itemId: string;
    field: EditableField;
    tierKey?: string;
    tierMultiplier?: number;
    isFloor?: boolean;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Reason dialog state
  const [reasonDialog, setReasonDialog] = useState<{
    itemId: string;
    field: EditableField;
    newValue: string;
    oldValue: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Revert confirmation
  const [revertDialog, setRevertDialog] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

  const storedFx = version?.fx_rate ?? 83;
  const [liveFxRate, setLiveFxRate] = useState<number | null>(null);
  const fxRate = liveFxRate ?? storedFx;

  useEffect(() => {
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((res) => res.json())
      .then((data) => {
        if (data?.rates?.INR) setLiveFxRate(data.rates.INR);
      })
      .catch(() => {});
  }, []);

  // Filter items by active section + search
  const sectionItems = items
    .filter((item) => {
      if (searchQuery) {
        return item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.notes ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      }
      return item.section === activeSection;
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  // Section counts for tab badges
  const sectionCounts = SECTIONS.reduce((acc, s) => {
    acc[s] = items.filter((i) => i.section === s).length;
    return acc;
  }, {} as Record<RateCardSection, number>);

  // Summary stats
  const sectionItemsForStats = searchQuery ? sectionItems : items.filter((i) => i.section === activeSection);
  const summaryMin = sectionItemsForStats.length > 0 ? Math.min(...sectionItemsForStats.map((i) => i.base_inr)) : 0;
  const summaryMax = sectionItemsForStats.length > 0 ? Math.max(...sectionItemsForStats.map((i) => i.base_inr)) : 0;
  const summaryAvg = sectionItemsForStats.length > 0 ? Math.round(sectionItemsForStats.reduce((s, i) => s + i.base_inr, 0) / sectionItemsForStats.length) : 0;

  // ── Version switch ────────────────────────────────────────────────────

  const handleVersionSwitch = useCallback(
    async (versionId: string) => {
      const v = versions.find((ver) => ver.id === versionId);
      if (!v) return;
      setVersion(v);
      try {
        const [data, log] = await Promise.all([
          getVersionData(versionId),
          getChangeLog(versionId),
        ]);
        setTiers(data.tiers);
        setItems(data.items);
        setDeliverables(data.deliverables);
        setChanges(log);
      } catch {
        toast.error("Failed to load version data");
      }
    },
    [versions]
  );

  // ── Inline editing ────────────────────────────────────────────────────

  const startEdit = useCallback(
    (itemId: string, field: EditableField, opts?: { tierKey?: string; tierMultiplier?: number; isFloor?: boolean }) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const value = field === "base_inr" ? String(item.base_inr) : String(item[field] ?? "");
      setEditingCell({ itemId, field, ...opts });
      setEditValue(value);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [items]
  );

  const startPriceEdit = useCallback(
    (itemId: string, displayValue: number, tierKey: string, multiplier: number, isFloor: boolean) => {
      setEditingCell({ itemId, field: "base_inr", tierKey, tierMultiplier: multiplier, isFloor });
      setEditValue(String(displayValue));
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    []
  );

  const commitEdit = useCallback(() => {
    if (!editingCell) return;
    const item = items.find((i) => i.id === editingCell.itemId);
    if (!item) {
      setEditingCell(null);
      return;
    }

    let finalField: EditableField = editingCell.field;
    let finalNewValue = editValue;
    let finalOldValue = editingCell.field === "base_inr" ? String(item.base_inr) : String(item[editingCell.field] ?? "");

    if (editingCell.tierKey && editingCell.tierMultiplier) {
      const enteredUsd = Number(editValue);
      if (isNaN(enteredUsd) || enteredUsd <= 0) { setEditingCell(null); return; }
      let backCalcInr: number;
      if (editingCell.isFloor) {
        backCalcInr = Math.round((enteredUsd * fxRate) / (editingCell.tierMultiplier * (item.floor_percent / 100)));
      } else {
        backCalcInr = Math.round((enteredUsd * fxRate) / editingCell.tierMultiplier);
      }
      finalField = "base_inr";
      finalNewValue = String(backCalcInr);
      finalOldValue = String(item.base_inr);
    }

    if (finalNewValue === finalOldValue || finalNewValue.trim() === "") {
      setEditingCell(null);
      return;
    }

    setReasonDialog({
      itemId: editingCell.itemId,
      field: finalField,
      newValue: finalNewValue,
      oldValue: finalOldValue,
    });
    setReason("");
    setEditingCell(null);
  }, [editingCell, editValue, items, fxRate]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleReasonSubmit = useCallback(async () => {
    if (!reasonDialog) return;
    setSaving(true);
    try {
      await updateItemField(
        reasonDialog.itemId,
        reasonDialog.field,
        reasonDialog.newValue,
        reason
      );
      // Optimistic update
      setItems((prev) =>
        prev.map((item) =>
          item.id === reasonDialog.itemId
            ? {
                ...item,
                [reasonDialog.field]:
                  reasonDialog.field === "base_inr"
                    ? Number(reasonDialog.newValue)
                    : reasonDialog.newValue,
              }
            : item
        )
      );
      // Refresh change log
      if (version) {
        const log = await getChangeLog(version.id);
        setChanges(log);
      }
      toast.success("Price updated");
      setChangeLogOpen(true);
    } catch {
      toast.error("Failed to update");
    } finally {
      setSaving(false);
      setReasonDialog(null);
    }
  }, [reasonDialog, reason, version]);

  // ── Revert ────────────────────────────────────────────────────────────

  const handleRevert = useCallback(async () => {
    if (!revertDialog) return;
    setReverting(true);
    try {
      await revertChange(revertDialog, "Reverted");
      // Refresh data
      if (version) {
        const [data, log] = await Promise.all([
          getVersionData(version.id),
          getChangeLog(version.id),
        ]);
        setItems(data.items);
        setChanges(log);
      }
      toast.success("Change reverted");
    } catch {
      toast.error("Failed to revert");
    } finally {
      setReverting(false);
      setRevertDialog(null);
    }
  }, [revertDialog, version]);

  // ── AI chat ───────────────────────────────────────────────────────────

  const handleAiSend = useCallback(async () => {
    const msg = aiInput.trim();
    if (!msg || aiLoading) return;
    setAiInput("");
    setAiHistory((prev) => [...prev, { role: "user", content: msg }]);
    setAiLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    try {
      const res = await fetch("/api/rate-card/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history: aiHistory }),
      });
      const data = await res.json();
      if (data.reply) {
        setAiHistory((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setAiHistory((prev) => [...prev, { role: "assistant", content: data.error || "Failed to get response." }]);
      }
    } catch {
      setAiHistory((prev) => [...prev, { role: "assistant", content: "Network error — could not reach the AI." }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [aiInput, aiLoading, aiHistory]);

  // ── Empty state ───────────────────────────────────────────────────────

  if (!version) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-muted-foreground text-sm">
          No rate card yet. Upload an xlsx or create a new version to get started.
        </p>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="mr-1.5 h-4 w-4" />
          New Version
        </Button>
      </div>
    );
  }

  // ── Download as Excel ─────────────────────────────────────────────────

  const handleDownload = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Header rows
    const headerRow1 = [`Fynd Studio · Rate Card FY 2026-27 · ${version?.version_label ?? "v7"}`];
    const headerRow2 = [`India base in INR. USD tiers derived as India × tier multiplier ÷ FX rate (₹${fxRate}) · floor = list × 0.75`];
    const emptyRow: string[] = [];
    const assumptionsLabel = ["Assumptions"];
    const assumptionsRow = ["FX (INR / USD)", ...tiers.filter(t => t.currency !== "INR").map(t => `${t.name.split("·")[0]?.trim()} ${t.multiplier}×`)];
    const assumptionsValues = [String(fxRate), ...tiers.filter(t => t.currency !== "INR").map(t => `${t.multiplier}×`)];

    SECTION_GROUPS.forEach((group) => {
      group.sections.forEach((sectionKey) => {
        const sectionLabel = `${group.label} — ${SECTION_LABELS[sectionKey]}`;
        const sectionData = items.filter(i => i.section === sectionKey).sort((a, b) => a.sort_order - b.sort_order);
        if (sectionData.length === 0) return;

        // Column headers
        const colHeaders = ["Format", "Length", "SLA"];
        tiers.forEach(t => { colHeaders.push(`${t.name.split("·")[0]?.trim()} List`); colHeaders.push(`${t.name.split("·")[0]?.trim()} Floor`); });
        colHeaders.push("Notes");

        // Data rows
        const rows: (string | number)[][] = [];
        sectionData.forEach(item => {
          const row: (string | number)[] = [item.name, item.length ?? "", item.sla ?? ""];
          if (item.item_key === "localisation" || item.base_inr === 0) {
            tiers.forEach(() => { row.push("+25% of base"); row.push("+18% of base"); });
          } else {
            const prices = computeAllTierPrices(item.base_inr, item.floor_percent, tiers, fxRate);
            prices.forEach(tp => { row.push(tp.list); row.push(tp.floor); });
          }
          row.push(item.notes ?? "");
          rows.push(row);
        });

        const sheetData = [[sectionLabel], emptyRow, colHeaders, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const sheetName = SECTION_LABELS[sectionKey].substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
    });

    XLSX.writeFile(wb, `Fynd_Studio_Rate_Card_${version?.version_label ?? "v7"}.xlsx`);
    toast.success("Rate card downloaded as Excel");
  }, [items, tiers, fxRate, version]);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-4">
          {/* FX rate chip */}
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase">FX</span>
            <span className="text-sm font-bold tabular-nums">₹{fxRate.toFixed(2)}</span>
            <span className="text-[10px] text-muted-foreground">/ $1</span>
            {liveFxRate && <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">LIVE</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Version selector */}
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rate Card</div>
            <Select value={version.id} onValueChange={handleVersionSwitch}>
              <SelectTrigger className="h-8 w-40 text-sm font-semibold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.version_label}
                    {v.is_active ? " (Active)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {version.is_active && (
              <Badge variant="outline" className="text-[10px] h-6 px-2 font-semibold text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-700">
                Active
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        {/* Search — left side */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search formats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-72 pl-8 text-sm focus-visible:ring-1 focus-visible:ring-border"
          />
          {searchQuery && (
            <button
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Actions — right side */}
        <div className="flex items-center gap-2">
          <Button
            variant={editMode ? "default" : "outline"}
            size="sm"
            className={cn("gap-1.5", editMode && "bg-primary text-primary-foreground")}
            onClick={() => { setEditMode(!editMode); setEditingCell(null); }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editMode ? "Editing" : "Edit"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", strategyOpen && "bg-primary/10 border-primary text-primary")}
            onClick={() => { setStrategyOpen(!strategyOpen); if (!strategyOpen) { setGuardrailsOpen(false); setChangeLogOpen(false); setAiOpen(false); } }}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Strategy
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", guardrailsOpen && "bg-primary/10 border-primary text-primary")}
            onClick={() => { setGuardrailsOpen(!guardrailsOpen); if (!guardrailsOpen) { setStrategyOpen(false); setChangeLogOpen(false); setAiOpen(false); } }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Guardrails
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", changeLogOpen && "bg-accent border-primary")}
            onClick={() => { setChangeLogOpen(!changeLogOpen); if (!changeLogOpen) { setAiOpen(false); setStrategyOpen(false); setGuardrailsOpen(false); } }}
          >
            <Clock className="h-3.5 w-3.5" />
            Change Log
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-1.5", aiOpen && "bg-primary/10 border-primary text-primary")}
            onClick={() => { setAiOpen(!aiOpen); if (!aiOpen) { setChangeLogOpen(false); setStrategyOpen(false); setGuardrailsOpen(false); } }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pricing AI
          </Button>
        </div>
      </div>

      {/* ── Section tabs (grouped: Gen Media §1-3, Marketing §4-6) ────────── */}
      <div className="flex items-center gap-0 border-b mb-4 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Rate card sections">
        {SECTION_GROUPS.map((group, gi) => (
          <Fragment key={group.label}>
            {gi > 0 && <div className="w-px h-6 bg-border mx-1 shrink-0" />}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 py-2.5 whitespace-nowrap shrink-0">
              {group.label}
            </span>
            {group.sections.map((section) => (
              <button
                key={section}
                role="tab"
                aria-selected={activeSection === section && !searchQuery}
                className={cn(
                  "px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap flex items-center gap-1.5",
                  activeSection === section && !searchQuery
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
                onClick={() => { setActiveSection(section); setSearchQuery(""); }}
              >
                {SECTION_LABELS[section]}
                <span className={cn(
                  "text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-semibold",
                  activeSection === section && !searchQuery
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
                )}>
                  {sectionCounts[section]}
                </span>
              </button>
            ))}
          </Fragment>
        ))}
        {searchQuery && (
          <div className="px-4 py-2.5 text-sm font-medium border-b-2 border-emerald-500 text-foreground -mb-px flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            Results
            <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
              {sectionItems.length}
            </span>
          </div>
        )}
      </div>

      {/* ── Instructional banner (dismissible) / Edit mode indicator ───── */}
      {editMode ? (
        <div className="bg-primary/10 border border-primary/30 rounded-md px-3 py-2 text-xs text-primary mb-3 flex items-center gap-2">
          <Pencil className="h-3 w-3 shrink-0" />
          <span className="flex-1">
            <strong>Edit mode</strong> — click any price cell to edit. Editing a USD value back-calculates the INR base and updates all tiers. Press Enter to save, Escape to cancel.
          </span>
          <button
            onClick={() => { setEditMode(false); setEditingCell(null); }}
            className="text-primary/60 hover:text-primary shrink-0"
            aria-label="Exit edit mode"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : !bannerDismissed && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300 mb-3 flex items-center gap-2">
          <Pencil className="h-3 w-3 shrink-0" />
          <span className="flex-1">
            Click any <strong>INR price</strong> or <strong>SLA</strong> cell to edit
            inline — all USD tiers auto-update.
          </span>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-emerald-500 hover:text-emerald-700 shrink-0"
            aria-label="Dismiss hint"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-card rounded-xl border shadow-sm overflow-x-auto scrollbar-hide">
        <table className="w-full text-[13px]" aria-label={`${SECTION_LABELS[activeSection]} rate card pricing`}>
          <thead>
            {/* Tier header row */}
            <tr className="bg-slate-50 dark:bg-slate-900 border-b">
              <th className="sticky left-0 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-300 min-w-[220px] z-20 text-xs uppercase tracking-wider">
                Format
              </th>
              <th className="px-3 py-3 text-center font-semibold text-slate-500 w-16 text-xs uppercase tracking-wider">
                Length
              </th>
              <th className="px-3 py-3 text-center font-semibold text-slate-500 w-20 text-xs uppercase tracking-wider">
                SLA
              </th>
              {tiers.map((tier, tidx) => (
                <th
                  key={tier.id}
                  colSpan={2}
                  className={cn(
                    "px-2 py-3 text-center font-semibold min-w-[130px] text-[11px] border-l-2 border-border",
                    tier.currency === "INR"
                      ? "text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
                      : tidx % 2 === 0
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/30"
                  )}
                >
                  <div className="font-bold text-xs">{tier.name.split("·")[0]?.trim()}</div>
                  <div className="text-[10px] font-medium opacity-60 mt-0.5">
                    {tier.currency === "INR" ? "₹ INR" : `$ USD · ${tier.multiplier}×`}
                  </div>
                </th>
              ))}
            </tr>
            {/* List / Floor sub-header */}
            <tr className="bg-white dark:bg-slate-950 border-b-2 border-slate-200 dark:border-slate-700">
              <th className="sticky left-0 bg-white dark:bg-slate-950 z-20" />
              <th />
              <th />
              {tiers.map((tier) => (
                <Fragment key={tier.id}>
                  <th className="px-2 py-1.5 text-[10px] text-right font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-l-2 border-border">
                    List
                  </th>
                  <th className="px-2 py-1.5 text-[10px] text-right font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider bg-muted/20">
                    Floor
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {sectionItems.length === 0 && (
              <tr>
                <td
                  colSpan={3 + tiers.length * 2}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  No items in this section yet.
                </td>
              </tr>
            )}
            {sectionItems.map((item, idx) => {
              const isPercentageRow = item.item_key === "localisation" || item.base_inr === 0;
              const isRangeRow = !!item.base_inr_max;
              const prices = computeAllTierPrices(
                item.base_inr,
                item.floor_percent,
                tiers,
                fxRate
              );
              const maxPrices = isRangeRow ? computeAllTierPrices(item.base_inr_max!, item.floor_percent, tiers, fxRate) : null;
              const stripe = idx % 2 === 1;

              return (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b border-slate-100 dark:border-slate-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10 transition-colors",
                    stripe && "bg-slate-50/50 dark:bg-slate-900/20"
                  )}
                >
                  {/* Item name — sticky */}
                  <td
                    className={cn(
                      "sticky left-0 z-10 px-4 py-3 font-semibold text-slate-900 dark:text-slate-100 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-4 after:bg-gradient-to-r after:from-black/[0.03] after:to-transparent after:pointer-events-none",
                      stripe ? "bg-slate-50 dark:bg-slate-900" : "bg-white dark:bg-slate-950"
                    )}
                  >
                    <div>{item.name}</div>
                    {item.notes && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal mt-0.5 max-w-[200px] truncate" title={item.notes}>
                        {item.notes}
                      </div>
                    )}
                  </td>

                  {/* Length */}
                  <td className="px-3 py-3 text-center text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                      {item.length ?? "—"}
                    </span>
                  </td>

                  {/* SLA — editable */}
                  <td
                    className={cn(
                      "px-3 py-3 text-center text-slate-500 dark:text-slate-400 group cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors rounded",
                      editingCell?.itemId === item.id &&
                        editingCell.field === "sla" &&
                        "p-1"
                    )}
                    onClick={() => {
                      if (
                        !(
                          editingCell?.itemId === item.id &&
                          editingCell.field === "sla"
                        )
                      ) {
                        startEdit(item.id, "sla");
                      }
                    }}
                  >
                    {editingCell?.itemId === item.id &&
                    editingCell.field === "sla" ? (
                      <Input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEdit();
                          }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={commitEdit}
                        className="h-8 text-xs text-center border-2 border-emerald-400 rounded-md focus:ring-2 focus:ring-emerald-200"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px]">
                        {item.sla ?? "—"}
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                      </span>
                    )}
                  </td>

                  {/* Tier price columns */}
                  {prices.map((tp, tidx) => {
                    if (isPercentageRow) {
                      return (
                        <Fragment key={tp.tier_key}>
                          <td className="px-2 py-3 text-right tabular-nums text-[12px] text-slate-600 dark:text-slate-400 border-l-2 border-border italic">
                            +25% of base
                          </td>
                          <td className="px-2 py-3 text-right tabular-nums text-[12px] text-slate-400 dark:text-slate-500 bg-muted/20 italic">
                            +18% of base
                          </td>
                        </Fragment>
                      );
                    }
                    if (isRangeRow && maxPrices) {
                      const maxTp = maxPrices[tidx];
                      return (
                        <Fragment key={tp.tier_key}>
                          <td className="px-2 py-3 text-right tabular-nums text-[11px] font-medium text-slate-700 dark:text-slate-300 border-l-2 border-border" colSpan={2}>
                            {formatCurrency(tp.list, tp.symbol)} - {formatCurrency(maxTp.list, maxTp.symbol)}
                          </td>
                        </Fragment>
                      );
                    }
                    const isINR = tp.currency === "INR";
                    const isEditing =
                      isINR &&
                      editingCell?.itemId === item.id &&
                      editingCell.field === "base_inr";

                    return (
                      <Fragment key={tp.tier_key}>
                        {/* List price */}
                        <td
                          className={cn(
                            "px-2 py-3 text-right tabular-nums border-l-2 border-border",
                            isINR
                              ? "font-bold text-emerald-700 dark:text-emerald-400 group cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                              : "font-medium text-slate-700 dark:text-slate-300",
                            isEditing && "p-1",
                            tidx > 0 && !isINR && tidx % 2 === 0 && "bg-blue-50/30 dark:bg-blue-950/10"
                          )}
                          onClick={
                            isINR && !isEditing
                              ? () => startEdit(item.id, "base_inr")
                              : undefined
                          }
                        >
                          {isEditing ? (
                            <Input
                              ref={inputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  commitEdit();
                                }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              onBlur={commitEdit}
                              className="h-8 text-xs text-right border-2 border-emerald-400 rounded-md w-28 focus:ring-2 focus:ring-emerald-200"
                            />
                          ) : isINR ? (
                            <span className={cn("inline-flex items-center gap-1 justify-end", editMode && "border-b border-dashed border-primary/30 pb-0.5")}>
                              {formatCurrency(tp.list, tp.symbol)}
                              <Pencil className={cn("h-3 w-3 transition-opacity shrink-0", editMode ? "opacity-40" : "opacity-0 group-hover:opacity-40")} />
                            </span>
                          ) : editMode && editingCell?.itemId === item.id && editingCell.tierKey === tp.tier_key && !editingCell.isFloor ? (
                            <Input
                              ref={inputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              onBlur={commitEdit}
                              className="h-8 text-xs text-right border-2 border-primary rounded-md w-24 focus:ring-2 focus:ring-primary/30"
                            />
                          ) : (
                            <span
                              className={cn("text-[12px]", editMode && "border-b border-dashed border-primary/20 pb-0.5 cursor-pointer")}
                              onClick={editMode ? () => startPriceEdit(item.id, tp.list, tp.tier_key, tp.currency === "INR" ? 1 : tiers.find(t => t.tier_key === tp.tier_key)!.multiplier, false) : undefined}
                            >
                              {formatCurrency(tp.list, tp.symbol)}
                            </span>
                          )}
                        </td>
                        {/* Floor price */}
                        <td
                          className={cn(
                            "px-2 py-3 text-right text-slate-400 dark:text-slate-500 tabular-nums text-[12px] bg-muted/20",
                            editMode && "cursor-pointer"
                          )}
                          onClick={editMode && !(editingCell?.itemId === item.id && editingCell.tierKey === tp.tier_key && editingCell.isFloor)
                            ? () => startPriceEdit(item.id, tp.floor, tp.tier_key, tp.currency === "INR" ? 1 : tiers.find(t => t.tier_key === tp.tier_key)!.multiplier, true)
                            : undefined
                          }
                        >
                          {editMode && editingCell?.itemId === item.id && editingCell.tierKey === tp.tier_key && editingCell.isFloor ? (
                            <Input
                              ref={inputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              onBlur={commitEdit}
                              className="h-8 text-xs text-right border-2 border-primary rounded-md w-24 focus:ring-2 focus:ring-primary/30"
                            />
                          ) : (
                            <span className={cn(editMode && "border-b border-dashed border-primary/15 pb-0.5")}>
                              {formatCurrency(tp.floor, tp.symbol)}
                            </span>
                          )}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Summary bar ──────────────────────────────────────────────────── */}
      {sectionItems.length > 0 && (
        <div className="flex items-center justify-between mt-3 px-1 text-xs text-muted-foreground">
          <span className="font-medium">
            {sectionItems.length} {sectionItems.length === 1 ? "item" : "items"}
            {searchQuery && <span className="ml-1">matching &ldquo;{searchQuery}&rdquo;</span>}
          </span>
          <div className="flex items-center gap-4">
            <span>Base range: <strong className="text-foreground tabular-nums">{formatINR(summaryMin)}</strong> — <strong className="text-foreground tabular-nums">{formatINR(summaryMax)}</strong></span>
            <span>Avg: <strong className="text-foreground tabular-nums">{formatINR(summaryAvg)}</strong></span>
          </div>
        </div>
      )}

      {/* ── Reason dialog ─────────────────────────────────────────────────── */}
      <Dialog
        open={!!reasonDialog}
        onOpenChange={(open) => {
          if (!open) setReasonDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reason for change</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm text-muted-foreground">
              {reasonDialog && (
                <>
                  Changing{" "}
                  <strong className="text-foreground">
                    {reasonDialog.field === "base_inr" ? "Base INR" : "SLA"}
                  </strong>{" "}
                  from{" "}
                  <span className="line-through text-red-500">
                    {reasonDialog.field === "base_inr"
                      ? formatINR(Number(reasonDialog.oldValue))
                      : reasonDialog.oldValue}
                  </span>{" "}
                  to{" "}
                  <span className="text-emerald-600 font-semibold">
                    {reasonDialog.field === "base_inr"
                      ? formatINR(Number(reasonDialog.newValue))
                      : reasonDialog.newValue}
                  </span>
                </>
              )}
            </div>
            <div>
              <Label htmlFor="change-reason" className="text-xs font-semibold">
                Reason
              </Label>
              <Textarea
                id="change-reason"
                placeholder="Why is this change needed?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReasonDialog(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={handleReasonSubmit}
            >
              {saving ? "Saving..." : "Save Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Revert confirmation dialog ────────────────────────────────────── */}
      <Dialog
        open={!!revertDialog}
        onOpenChange={(open) => {
          if (!open) setRevertDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revert this change?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will restore the previous value and mark the change as reverted
            in the audit trail.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevertDialog(null)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={reverting}
              onClick={handleRevert}
            >
              {reverting ? "Reverting..." : "Revert"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Log overlay ────────────────────────────────────────────── */}
      {changeLogOpen && (
        <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setChangeLogOpen(false)} />
        <div
          className="fixed right-0 top-0 bottom-0 w-[560px] z-50 bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          role="log"
          aria-label="Rate card audit trail"
        >
          {/* Header */}
          <div className="p-3 border-b flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-sm font-semibold">Audit Trail</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {version.version_label}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setChangeLogOpen(false)}
              aria-label="Close change log"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-0 border-b shrink-0">
            <div className="px-3 py-2 text-center border-r">
              <div className="text-lg font-bold">{changes.length}</div>
              <div className="text-[10px] text-muted-foreground font-medium">
                Total changes
              </div>
            </div>
            <div className="px-3 py-2 text-center border-r">
              <div className="text-lg font-bold text-amber-600">
                {changes.filter((c) => !c.reverted_at).length}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">
                Active
              </div>
            </div>
            <div className="px-3 py-2 text-center">
              <div className="text-lg font-bold text-red-600">
                {changes.filter((c) => c.reverted_at).length}
              </div>
              <div className="text-[10px] text-muted-foreground font-medium">
                Reverted
              </div>
            </div>
          </div>

          {/* Entries */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {changes.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No changes recorded yet.
                </p>
              )}
              {changes.map((change) => {
                const isReverted = !!change.reverted_at;
                const isCreation = change.field === "created" || !change.old_value;
                const isImport = change.entity_type === "version" && change.field === "created";
                const itemName =
                  items.find((i) => i.id === change.entity_id)?.name ??
                  (isImport ? `Rate Card ${change.new_value}` : change.entity_type);

                return (
                  <div
                    key={change.id}
                    className={cn(
                      "rounded-lg border overflow-hidden",
                      isReverted && "opacity-50"
                    )}
                  >
                    {/* Change header */}
                    <div className="bg-muted/50 px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                          isImport ? "bg-blue-500" : "bg-emerald-500"
                        )}>
                          {isImport ? "↑" : (change.changer_name ?? "U").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-[11px] font-semibold">
                            {change.changer_name ?? "System"}
                          </span>
                          <span className="text-[11px] text-muted-foreground ml-1">
                            {formatTimestamp(change.changed_at)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isImport && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 text-blue-600 border-blue-300">
                            Import
                          </Badge>
                        )}
                        {isReverted && (
                          <Badge
                            variant="destructive"
                            className="text-[10px] px-1.5 py-0.5"
                          >
                            Reverted
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Change body */}
                    <div className="px-3 py-2.5 border-t bg-card">
                      <div className="text-[11px] mb-1.5">
                        {isImport ? (
                          <>
                            Imported rate card{" "}
                            <span className="font-semibold text-foreground">{change.new_value}</span>
                            {" "}from xlsx
                          </>
                        ) : isCreation ? (
                          <>
                            Created{" "}
                            <span className="font-semibold text-foreground">{itemName}</span>
                          </>
                        ) : (
                          <>
                            Changed{" "}
                            <span className="font-semibold text-foreground">{itemName}</span>
                          </>
                        )}
                        {!isImport && !isCreation && (
                          <>{" "}{change.field === "base_inr" ? "base INR" : change.field}</>
                        )}
                      </div>

                      {/* Before / After — skip for imports */}
                      {!isImport && (
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {!isCreation && (
                            <>
                              <span className="text-[10px] text-muted-foreground font-semibold">Before:</span>
                              <span className="text-[11px] px-2 py-0.5 bg-red-50 dark:bg-red-950/30 text-red-600 rounded font-mono font-semibold line-through">
                                {change.old_value ?? "—"}
                              </span>
                              <span className="text-[11px] text-muted-foreground">→</span>
                            </>
                          )}
                          <span className="text-[10px] text-muted-foreground font-semibold">
                            {isCreation ? "Value:" : "After:"}
                          </span>
                          <span
                            className={cn(
                              "text-[11px] px-2 py-0.5 rounded font-mono font-semibold",
                              isReverted
                                ? "bg-red-50 dark:bg-red-950/30 text-red-400 line-through"
                                : "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600"
                            )}
                          >
                            {change.new_value ?? "—"}
                          </span>
                        </div>
                      )}

                      {/* Reason */}
                      {change.reason && (
                        <div className="bg-muted/50 rounded px-2.5 py-1.5 mb-2">
                          <div className="text-[10px] text-muted-foreground font-semibold uppercase mb-0.5">
                            Reason
                          </div>
                          <div className="text-[11px]">{change.reason}</div>
                        </div>
                      )}

                      {/* Revert button */}
                      {!isReverted && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[11px] text-red-600 hover:bg-red-50 hover:border-red-300"
                            onClick={() => setRevertDialog(change.id)}
                          >
                            Revert
                          </Button>
                        </div>
                      )}

                      {/* Reverted info */}
                      {isReverted && change.reverted_at && (
                        <div className="text-[11px] text-muted-foreground">
                          Reverted{" "}
                          {formatTimestamp(change.reverted_at)}
                          {change.reverter_name && ` by ${change.reverter_name}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>
        </>
      )}
      {/* ── AI Pricing Co-pilot panel ───────────────────────────────────── */}
      {aiOpen && (
        <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setAiOpen(false)} />
        <div
          className="fixed right-0 top-0 bottom-0 w-[560px] z-50 bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          role="complementary"
          aria-label="Pricing AI co-pilot"
        >
          {/* Header */}
          <div className="p-3 border-b flex items-center justify-between shrink-0 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center">
                <Sparkles className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Pricing AI</h3>
                <p className="text-[10px] text-muted-foreground">Rate Card v7 · Sales Playbook</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {aiHistory.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[10px] text-muted-foreground"
                  onClick={() => setAiHistory([])}
                >
                  Clear
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setAiOpen(false)}
                aria-label="Close pricing AI"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-4">
              {aiHistory.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="h-8 w-8 mx-auto mb-3 text-emerald-400" />
                  <p className="text-sm font-medium text-foreground mb-1">Ask me anything about pricing</p>
                  <p className="text-xs text-muted-foreground mb-4">I know the full rate card, sales playbook, and negotiation guardrails.</p>
                  <div className="space-y-2">
                    {[
                      "What should I quote a UAE client wanting 40 videos/month?",
                      "Compare Starter vs Professional retainer for India",
                      "Client wants 20% discount on Enterprise — is that safe?",
                      "Calculate total for Gen Media Pro + Marketing Starter bundle",
                    ].map((q) => (
                      <button
                        key={q}
                        onClick={() => { setAiInput(q); }}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-300 transition-colors text-muted-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {aiHistory.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex flex-col",
                    msg.role === "user" ? "ml-auto items-end max-w-[85%]" : "items-start max-w-[95%]"
                  )}
                >
                  {msg.role === "user" ? (
                    <div className="rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap leading-relaxed bg-emerald-600 text-white rounded-tr-sm">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="rounded-xl px-4 py-3 text-[13px] leading-relaxed bg-slate-100 dark:bg-slate-800 text-foreground rounded-tl-sm prose prose-sm prose-slate dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-headings:my-2.5 prose-headings:text-emerald-700 dark:prose-headings:text-emerald-400 prose-h3:text-sm prose-h3:font-bold prose-strong:text-emerald-700 dark:prose-strong:text-emerald-300 prose-table:text-[12px] prose-table:my-3 prose-table:border prose-table:border-slate-300 dark:prose-table:border-slate-600 prose-table:rounded-lg prose-table:overflow-hidden prose-th:px-3 prose-th:py-2 prose-th:bg-slate-200 dark:prose-th:bg-slate-700 prose-th:text-left prose-th:font-bold prose-th:text-slate-700 dark:prose-th:text-slate-200 prose-th:border-b prose-th:border-slate-300 dark:prose-th:border-slate-600 prose-td:px-3 prose-td:py-1.5 prose-td:border-t prose-td:border-slate-200 dark:prose-td:border-slate-700 prose-blockquote:border-l-emerald-500 prose-blockquote:bg-emerald-50 dark:prose-blockquote:bg-emerald-950/30 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-blockquote:my-3 prose-blockquote:text-foreground">
                      <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
                    </div>
                  )}
                </div>
              ))}

              {aiLoading && (
                <div className="flex items-start">
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input */}
          <div className="shrink-0 border-t p-3">
            <form
              onSubmit={(e) => { e.preventDefault(); handleAiSend(); }}
              className="flex gap-2"
            >
              <Input
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                placeholder="Ask about pricing, deals, strategy..."
                className="flex-1 text-sm"
                disabled={aiLoading}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!aiInput.trim() || aiLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                aria-label="Send message"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
            <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
              Powered by Fynd AI · Rate card v7 + sales playbook
            </p>
          </div>
        </div>
        </>
      )}

      {/* ── Pricing Strategy panel ───────────────────────────────────────── */}
      {strategyOpen && (
        <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setStrategyOpen(false)} />
        <div className="fixed right-0 top-0 bottom-0 w-[560px] z-50 bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm">Pricing Strategy</h3>
              <span className="text-[10px] text-muted-foreground">Sales Playbook · v7</span>
            </div>
            <button onClick={() => setStrategyOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-xs space-y-5">
            <p className="text-muted-foreground italic">How sales DRIs price, pitch, and defend value. Derived from v12 Business Plan §3.1, §3.2, §8.4 and the Kushan benchmark study. Read this sheet before quoting.</p>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.0 · What&apos;s in this card</h4>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Region</th><th className="px-2 py-1.5 text-left">Tier</th><th className="px-2 py-1.5 text-left">Country Group</th><th className="px-2 py-1.5 text-left">Currency</th><th className="px-2 py-1.5 text-left">Construct</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">India + Reliance</td><td className="px-2 py-1.5">—</td><td className="px-2 py-1.5">India · 4 Reliance entities (RRVL · RBL · RCPL · JPL)</td><td className="px-2 py-1.5">INR</td><td className="px-2 py-1.5">A la carte · Volume / Brand Retainer · Annual Master</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">MEA · §3</td><td className="px-2 py-1.5">T1</td><td className="px-2 py-1.5">UAE · Qatar · Kuwait · Bahrain · Oman · Israel</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">MEA · §3</td><td className="px-2 py-1.5">T2</td><td className="px-2 py-1.5">Saudi Arabia (KSA, standalone)</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">MEA · §3</td><td className="px-2 py-1.5">T3</td><td className="px-2 py-1.5">Egypt · Morocco · Jordan · South Africa · Nigeria · Kenya · Tunisia · Lebanon</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">SEA · §4</td><td className="px-2 py-1.5">T1</td><td className="px-2 py-1.5">Singapore (standalone)</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">SEA · §4</td><td className="px-2 py-1.5">T2</td><td className="px-2 py-1.5">Malaysia · Thailand · Brunei</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">SEA · §4</td><td className="px-2 py-1.5">T3</td><td className="px-2 py-1.5">Indonesia · Philippines · Vietnam · Cambodia · Myanmar · Laos</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">ROW · §5</td><td className="px-2 py-1.5">T1</td><td className="px-2 py-1.5">United States · Canada · Australia · New Zealand</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs · FY28 deferral</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">ROW · §5</td><td className="px-2 py-1.5">T2</td><td className="px-2 py-1.5">United Kingdom · Republic of Ireland</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs · Pod E anchor</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">ROW · §5</td><td className="px-2 py-1.5">T3</td><td className="px-2 py-1.5">Germany · France · Netherlands · Switzerland · Sweden · Denmark · Norway · Finland · Belgium · Austria · Spain · Italy · Portugal</td><td className="px-2 py-1.5">USD</td><td className="px-2 py-1.5">Same constructs</td></tr>
                </tbody>
              </table>
              <p className="text-muted-foreground mt-1.5 italic">Tier convention · T1 = highest PPP / list price · T3 = lowest. Same convention across MEA, SEA, ROW.</p>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.1 · The Three Forces We Sell</h4>
              <p className="text-muted-foreground mb-2">Open every conversation with these. Never with price.</p>
              <div className="space-y-2">
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <div className="font-semibold text-foreground">Speed at culture-rate</div>
                  <p className="text-muted-foreground mt-0.5"><strong>What it means:</strong> Finished, broadcast-grade campaigns in 48 hrs brief-to-live, contractually.</p>
                  <p className="text-muted-foreground mt-0.5"><strong>Why it wins:</strong> Trends have a 7-14 day lifespan; 48-hr response captures up to 4.6× the ROAS of 2-week response. Legacy agency cycle: 6 weeks.</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <div className="font-semibold text-foreground">Cost at AI-native economics</div>
                  <p className="text-muted-foreground mt-0.5"><strong>What it means:</strong> Blended COGS ≈ ₹420 per finished second of premium AI video.</p>
                  <p className="text-muted-foreground mt-0.5"><strong>Why it wins:</strong> Tier-1 Mumbai agency ₹6,000-12,000 / sec. We sell at 30-50% below agency rates and book ≥ 70% GM.</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 border">
                  <div className="font-semibold text-foreground">Personalisation at scale</div>
                  <p className="text-muted-foreground mt-0.5"><strong>What it means:</strong> StudioOS abstracts the model layer (Kling, Seedance, Runway, Veo, Sora, Imagen).</p>
                  <p className="text-muted-foreground mt-0.5"><strong>Why it wins:</strong> Per-shot routing to the best provider. Vibe panel trained on each brand&apos;s voice, visuals, products.</p>
                </div>
              </div>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.2 · The Outcome-Led Sales Motion</h4>
              <p className="text-muted-foreground mb-2">Customers buy ROAS, NPS, brand recall, time-to-market. Rate card is the second conversation.</p>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Stage</th><th className="px-2 py-1.5 text-left">Buyer Question</th><th className="px-2 py-1.5 text-left">What we lead with</th><th className="px-2 py-1.5 text-left">Rate-card surface</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">1 · Discovery</td><td className="px-2 py-1.5">What outcome do you want to move?</td><td className="px-2 py-1.5">Trend audit + ₹4L Pilot Sprint (60% retainer-conversion).</td><td className="px-2 py-1.5 text-muted-foreground">Pilot wedge — no list price yet.</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">2 · Anchor</td><td className="px-2 py-1.5">How fast and how much?</td><td className="px-2 py-1.5">Show one cinematic film + one trend response delivered live.</td><td className="px-2 py-1.5 text-muted-foreground">Anchor on Annual Master / Enterprise (highest).</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">3 · Drop-down</td><td className="px-2 py-1.5">What&apos;s right for me this quarter?</td><td className="px-2 py-1.5">Walk down to Professional / Volume Retainer based on monthly cadence + language footprint.</td><td className="px-2 py-1.5 text-muted-foreground">Land on a retainer; never lead with a la carte.</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">4 · Bundle</td><td className="px-2 py-1.5">What if I bundle?</td><td className="px-2 py-1.5">Marketing Brand Retainer + Gen Media Volume = 10% off the smaller line.</td><td className="px-2 py-1.5 text-muted-foreground">Bundle discount applied monthly.</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">5 · Renewal</td><td className="px-2 py-1.5">Did it work?</td><td className="px-2 py-1.5">Vibe panel shows ROAS, NPS, MTD outcomes by 8 AM next day.</td><td className="px-2 py-1.5 text-muted-foreground">Quarterly upfront → 5%; annual → 10%.</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.3 · Three Commercial Constructs</h4>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Construct</th><th className="px-2 py-1.5 text-left">Buyer</th><th className="px-2 py-1.5 text-left">Billing rhythm</th><th className="px-2 py-1.5 text-left">Use when</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">A la carte / per-asset</td><td className="px-2 py-1.5">Performance / digital lead</td><td className="px-2 py-1.5">50/50 PO + delivery · Net-30 default</td><td className="px-2 py-1.5 text-muted-foreground">Funding the relationship while we earn retainer trust.</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Volume Retainer (Gen Media) + Brand Retainer (Marketing)</td><td className="px-2 py-1.5">Pod buyer + CMO</td><td className="px-2 py-1.5">Monthly in advance on the 1st · Net-15 · 5% off quarterly upfront · 10% off annual upfront</td><td className="px-2 py-1.5 text-muted-foreground">Default. Two retainers can attach (bundle = 10% off smaller line).</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Annual Master</td><td className="px-2 py-1.5">Reliance grade — ≥ ₹2 Cr/yr Gen Media or ≥ ₹6 Cr/yr Marketing (or USD eq.)</td><td className="px-2 py-1.5">25 / 25 / 25 / 25 quarterly</td><td className="px-2 py-1.5 text-muted-foreground">Strategic partner-of-record · founder-governed · concierge desk.</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.4 · Anchor → Drop-down Ladder</h4>
              <p className="text-muted-foreground mb-2">Always quote the highest tier first. Every step down feels like a deal we built for them.</p>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Lead with</th><th className="px-2 py-1.5 text-left">If pushed, drop to</th><th className="px-2 py-1.5 text-left">Final fallback</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Annual Master / Custom</td><td className="px-2 py-1.5">Enterprise retainer</td><td className="px-2 py-1.5">Professional retainer</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Enterprise retainer</td><td className="px-2 py-1.5">Professional retainer</td><td className="px-2 py-1.5">Starter retainer</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Professional retainer</td><td className="px-2 py-1.5">Starter retainer</td><td className="px-2 py-1.5">14 Day Pilot Sprint</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Starter retainer</td><td className="px-2 py-1.5">14 Day Pilot Sprint</td><td className="px-2 py-1.5">A la carte (3-asset min.)</td></tr>
                </tbody>
              </table>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 mt-2 text-amber-700 dark:text-amber-300">
                <strong>Sales rule:</strong> Never quote a la carte first to a CMO. A la carte is the close-of-last-resort. Land 14 Day Pilot Sprint → upgrade to retainer within 60 days.
              </div>
            </section>
          </div>
        </div>
        </>
      )}

      {/* ── Guardrails panel ─────────────────────────────────────────────── */}
      {guardrailsOpen && (
        <>
        <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setGuardrailsOpen(false)} />
        <div className="fixed right-0 top-0 bottom-0 w-[560px] z-50 bg-card border-l shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-sm">Pricing Guardrails</h3>
              <span className="text-[10px] text-muted-foreground">Internal · v6</span>
            </div>
            <button onClick={() => setGuardrailsOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 text-xs space-y-5">
            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.5 · Discount Guardrails (v12 §8.4)</h4>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Discount Band</th><th className="px-2 py-1.5 text-left">Authority</th><th className="px-2 py-1.5 text-left">Must Consult</th></tr></thead>
                <tbody>
                  <tr className="border-t bg-emerald-50/50 dark:bg-emerald-950/10"><td className="px-2 py-1.5 font-medium text-emerald-700 dark:text-emerald-400">0 - 10% off list</td><td className="px-2 py-1.5">Pod DRI</td><td className="px-2 py-1.5">—</td></tr>
                  <tr className="border-t bg-amber-50/50 dark:bg-amber-950/10"><td className="px-2 py-1.5 font-medium text-amber-700 dark:text-amber-400">10 - 20% off list</td><td className="px-2 py-1.5">Debajit</td><td className="px-2 py-1.5">Pod DRI · Rahul (Finance)</td></tr>
                  <tr className="border-t bg-red-50/50 dark:bg-red-950/10"><td className="px-2 py-1.5 font-medium text-red-700 dark:text-red-400">&gt; 20% off list</td><td className="px-2 py-1.5">FA written approval</td><td className="px-2 py-1.5">Debajit · Rahul · Pod DRI</td></tr>
                  <tr className="border-t bg-red-50/50 dark:bg-red-950/10"><td className="px-2 py-1.5 font-medium text-red-700 dark:text-red-400">Below floor</td><td className="px-2 py-1.5">Founder sign-off only</td><td className="px-2 py-1.5">FA awareness</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.6 · Concentration & ICP Discipline</h4>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Rule</th><th className="px-2 py-1.5 text-left">Limit</th><th className="px-2 py-1.5 text-left">Action</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5">Single-brand cap</td><td className="px-2 py-1.5">No single brand &gt; 8% FY revenue</td><td className="px-2 py-1.5">Re-shape pipeline at 6%</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">Reliance cap</td><td className="px-2 py-1.5">30% of FY combined</td><td className="px-2 py-1.5">Founder + FA review at 25%</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">Off-ICP customer</td><td className="px-2 py-1.5">Outside ICP §5.3</td><td className="px-2 py-1.5">Debajit + FA approval</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">ACV escalation</td><td className="px-2 py-1.5">&gt; ₹5 Cr ACV</td><td className="px-2 py-1.5">Debajit + FA + Rahul co-sign</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.7 · Floor Pricing Rule</h4>
              <div className="space-y-2">
                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3"><span className="font-semibold text-emerald-700 dark:text-emerald-400">List</span><span className="text-muted-foreground ml-2">Published rate. The number opening every conversation. GM: 78-82%</span></div>
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3"><span className="font-semibold text-amber-700 dark:text-amber-400">Floor (75%)</span><span className="text-muted-foreground ml-2">Earned through bundling, upfront pay, or strategic value. Pod DRI sign-off. GM: 70-73%</span></div>
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3"><span className="font-semibold text-red-700 dark:text-red-400">Below floor</span><span className="text-muted-foreground ml-2">WALK-AWAY. Pivot to 14 Day Pilot Sprint (₹4L / USD eq.) — not a discount.</span></div>
              </div>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.8 · Pricing Surcharges</h4>
              <p className="text-muted-foreground mb-2">Apply on top of any list / retainer. Not discountable.</p>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Surcharge</th><th className="px-2 py-1.5 text-left">Trigger</th><th className="px-2 py-1.5 text-right">Amount</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5">Same-day rush</td><td className="px-2 py-1.5">&lt; 12 hr SLA</td><td className="px-2 py-1.5 text-right font-semibold text-red-600">+30%</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">Scope change after storyboard</td><td className="px-2 py-1.5">Brief change after approval</td><td className="px-2 py-1.5 text-right font-semibold text-red-600">+50%</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">Major brief change</td><td className="px-2 py-1.5">After delivery</td><td className="px-2 py-1.5 text-right font-semibold text-red-600">+100%</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">Talent / music license</td><td className="px-2 py-1.5">Cast / licensed music</td><td className="px-2 py-1.5 text-right font-semibold text-red-600">cost +15%</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5">New language pack</td><td className="px-2 py-1.5">Beyond included</td><td className="px-2 py-1.5 text-right font-semibold text-red-600">+25% / lang</td></tr>
                </tbody>
              </table>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.9 · Payment Terms</h4>
              <table className="w-full text-xs border border-border rounded overflow-hidden">
                <thead><tr className="bg-muted"><th className="px-2 py-1.5 text-left">Construct</th><th className="px-2 py-1.5 text-left">Terms</th></tr></thead>
                <tbody>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">A la carte</td><td className="px-2 py-1.5">50% on PO, 50% on delivery. Net-30; Net-15 for new customers first 90 days.</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Retainers</td><td className="px-2 py-1.5">Monthly advance on 1st. Net-15. Quarterly upfront → 5% off; annual → 10% off.</td></tr>
                  <tr className="border-t"><td className="px-2 py-1.5 font-medium">Annual Masters</td><td className="px-2 py-1.5">25% signing, 25% Q1 end, 25% H1 end, 25% Q3 end.</td></tr>
                </tbody>
              </table>
              <p className="text-muted-foreground mt-2 italic">Cash collection target: ≤ 60 days PO-to-bank. &gt; 90 days triggers leadership escalation.</p>
            </section>

            <section>
              <h4 className="font-bold text-foreground text-sm mb-2">§1.10 · Re-anchoring Cadence</h4>
              <p className="text-muted-foreground">Half-yearly review: 1-Apr and 1-Oct, re-anchored to prevailing COGS-per-finished-second. Sales DRIs notified 30 days before any change. Existing retainers honour signed rate until renewal.</p>
            </section>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
