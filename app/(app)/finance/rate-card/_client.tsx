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
import { Upload, Download, Clock, Plus, X, Pencil, Search, ChevronRight, Sparkles, Send, Loader2, BookOpen, ShieldCheck, GripVertical, Trash2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  RateCardVersion,
  RateCardTier,
  RateCardItem,
  RateCardDeliverable,
  RateCardChange,
  RateCardSection,
} from "@/lib/types/rate-card";
import { SECTION_LABELS } from "@/lib/types/rate-card";
import { computeAllTierPrices, computeTierPrice, roundPrice, evaluateFormula, isFormula, getFormulaTooltip } from "@/lib/rate-card/compute";
import * as XLSX from "xlsx";
import { formatINR } from "@/lib/utils/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  updateItemField,
  updateTierField,
  revertChange,
  getChangeLog,
  getVersionData,
  createItem,
  deleteItem,
  reorderItems,
  createTier,
  deleteTier,
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

function SortableRow({ id, editMode, children, className }: { id: string; editMode: boolean; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = editMode ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 50 : undefined,
  } : undefined;

  return (
    <tr ref={setNodeRef} style={style} className={className} {...(editMode ? attributes : {})}>
      {editMode && (
        <td className="px-1 py-3 text-center w-8">
          <button {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
            <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
          </button>
        </td>
      )}
      {children}
    </tr>
  );
}

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

  // Add row state
  const [addRowOpen, setAddRowOpen] = useState(false);
  const [newRowName, setNewRowName] = useState("");
  const [newRowLength, setNewRowLength] = useState("");
  const [newRowSla, setNewRowSla] = useState("");
  const [newRowBaseInr, setNewRowBaseInr] = useState("");
  const [newRowFloor, setNewRowFloor] = useState("75");
  const [newRowTierPrices, setNewRowTierPrices] = useState<Record<string, { list: string; floor: string }>>({});
  const [addingRow, setAddingRow] = useState(false);

  // Add tier state
  const [addTierOpen, setAddTierOpen] = useState(false);
  const [newTierName, setNewTierName] = useState("");
  const [newTierRegion, setNewTierRegion] = useState("");
  const [newTierLevel, setNewTierLevel] = useState("");
  const [newTierMultiplier, setNewTierMultiplier] = useState("1.0");
  const [newTierCurrency, setNewTierCurrency] = useState("USD");
  const [newTierSymbol, setNewTierSymbol] = useState("$");
  const [newTierItemPrices, setNewTierItemPrices] = useState<Record<string, { list: string; floor: string }>>({});
  const [addingTier, setAddingTier] = useState(false);
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
  type EditableField = "base_inr" | "sla" | "name" | "length" | "notes" | "price_overrides";
  const [editingCell, setEditingCell] = useState<{
    itemId: string;
    field: EditableField;
    tierKey?: string;
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

  // FX rate (must be above navigateCell)
  const storedFx = version?.fx_rate ?? 83;
  const [liveFxRate, setLiveFxRate] = useState<number | null>(null);
  const fxRate = liveFxRate ?? storedFx;

  // Formula bar — selected cell tracking + keyboard navigation
  const [selectedCell, setSelectedCell] = useState<{ itemId: string; tierKey: string; isFloor: boolean } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const navigateCell = useCallback((direction: "up" | "down" | "left" | "right" | "tab" | "shiftTab") => {
    if (!selectedCell) return;
    const visibleItems = items
      .filter(i => searchQuery
        ? i.name.toLowerCase().includes(searchQuery.toLowerCase()) || (i.notes ?? "").toLowerCase().includes(searchQuery.toLowerCase())
        : i.section === activeSection)
      .sort((a, b) => a.sort_order - b.sort_order);
    const rowIdx = visibleItems.findIndex(i => i.id === selectedCell.itemId);
    if (rowIdx === -1) return;

    const cols: { tierKey: string; isFloor: boolean }[] = [];
    tiers.forEach(t => {
      cols.push({ tierKey: t.tier_key, isFloor: false });
      cols.push({ tierKey: t.tier_key, isFloor: true });
    });
    const colIdx = cols.findIndex(c => c.tierKey === selectedCell.tierKey && c.isFloor === selectedCell.isFloor);
    if (colIdx === -1) return;

    let newRow = rowIdx;
    let newCol = colIdx;

    if (direction === "up") newRow = Math.max(0, rowIdx - 1);
    else if (direction === "down") newRow = Math.min(visibleItems.length - 1, rowIdx + 1);
    else if (direction === "left" || direction === "shiftTab") {
      newCol = colIdx - 1;
      if (newCol < 0) { newCol = cols.length - 1; newRow = Math.max(0, rowIdx - 1); }
    }
    else if (direction === "right" || direction === "tab") {
      newCol = colIdx + 1;
      if (newCol >= cols.length) { newCol = 0; newRow = Math.min(visibleItems.length - 1, rowIdx + 1); }
    }

    const newItem = visibleItems[newRow];
    const newColData = cols[newCol];
    if (newItem && newColData) {
      setSelectedCell({ itemId: newItem.id, tierKey: newColData.tierKey, isFloor: newColData.isFloor });
    }
  }, [selectedCell, items, activeSection, searchQuery, tiers]);

  const keyNavRef = useRef<{ navigate: typeof navigateCell; selectedCell: typeof selectedCell }>({ navigate: navigateCell, selectedCell });
  keyNavRef.current = { navigate: navigateCell, selectedCell };

  // Tier multiplier inline edit
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierMultiplier, setEditTierMultiplier] = useState("");
  const tierMultiplierRef = useRef<HTMLInputElement>(null);

  const saveTierMultiplier = useCallback(async (tierId: string) => {
    const newVal = Number(editTierMultiplier);
    if (!newVal || newVal <= 0 || newVal > 20) {
      setEditingTierId(null);
      return;
    }
    const tier = tiers.find(t => t.id === tierId);
    if (!tier || tier.multiplier === newVal) {
      setEditingTierId(null);
      return;
    }
    try {
      await updateTierField(tierId, "multiplier", newVal, `Multiplier changed from ${tier.multiplier}× to ${newVal}×`);
      setTiers(prev => prev.map(t => t.id === tierId ? { ...t, multiplier: newVal } : t));
      if (version) {
        const log = await getChangeLog(version.id);
        setChanges(log);
      }
      toast.success(`Multiplier updated to ${newVal}×`);
      setChangeLogOpen(true);
    } catch {
      toast.error("Failed to update multiplier");
    }
    setEditingTierId(null);
  }, [editTierMultiplier, tiers, version]);

  // Revert confirmation
  const [revertDialog, setRevertDialog] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);

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

  const startTierOverrideEdit = useCallback(
    (itemId: string, tierKey: string, displayValue: number, isFloor: boolean) => {
      setEditingCell({ itemId, field: "price_overrides" as EditableField, tierKey, isFloor });
      setEditValue(String(displayValue));
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    []
  );

  // Keyboard navigation for cells (arrow keys, Tab, Enter)
  useEffect(() => {
    if (!editMode || editingCell) return;
    const handler = (e: KeyboardEvent) => {
      const { navigate, selectedCell: sc } = keyNavRef.current;
      if (!sc) return;
      if (e.key === "ArrowUp") { e.preventDefault(); navigate("up"); }
      else if (e.key === "ArrowDown") { e.preventDefault(); navigate("down"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); navigate("left"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); navigate("right"); }
      else if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); navigate("tab"); }
      else if (e.key === "Tab" && e.shiftKey) { e.preventDefault(); navigate("shiftTab"); }
      else if (e.key === "Enter") {
        e.preventDefault();
        const item = items.find(i => i.id === sc.itemId);
        const tier = tiers.find(t => t.tier_key === sc.tierKey);
        if (!item || !tier) return;
        if (tier.currency === "INR") {
          startEdit(item.id, "base_inr");
        } else {
          const prices = computeAllTierPrices(item.base_inr, item.floor_percent, tiers, fxRate, item.price_overrides);
          const tp = prices.find(p => p.tier_key === sc.tierKey);
          if (tp) startTierOverrideEdit(item.id, sc.tierKey, sc.isFloor ? tp.floor : tp.list, sc.isFloor);
        }
      }
      else if (e.key === "Escape") {
        setSelectedCell(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, editingCell, items, tiers, fxRate, startEdit, startTierOverrideEdit]);

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

    if (editingCell.field === "price_overrides" && editingCell.tierKey) {
      let entered: number;
      const tier = tiers.find(t => t.tier_key === editingCell.tierKey);
      if (isFormula(editValue)) {
        const ctx = { base: item.base_inr, mult: tier?.multiplier ?? 1, fx: fxRate, floor: item.floor_percent };
        const result = evaluateFormula(editValue, ctx);
        if (result === null) { toast.error("Invalid formula. Use: base, mult, fx, floor"); setEditingCell(null); return; }
        entered = result;
      } else {
        entered = Number(editValue);
        if (isNaN(entered) || entered <= 0) { setEditingCell(null); return; }
      }
      const existing = item.price_overrides ?? {};
      const tierOv = existing[editingCell.tierKey] ?? {};
      const priceField = editingCell.isFloor ? "floor" : "list";
      const oldPrice = tierOv[priceField];
      const computedPrices = computeAllTierPrices(item.base_inr, item.floor_percent, tiers, fxRate, existing);
      const computedTier = computedPrices.find(p => p.tier_key === editingCell.tierKey);
      const previousValue = oldPrice ?? (editingCell.isFloor ? computedTier?.floor : computedTier?.list) ?? 0;
      if (entered === previousValue) {
        setEditingCell(null);
        return;
      }
      const updatedOverrides = {
        ...existing,
        [editingCell.tierKey]: {
          ...tierOv,
          [priceField]: entered,
        },
      };
      finalField = "price_overrides" as EditableField;
      finalNewValue = JSON.stringify(updatedOverrides);
      finalOldValue = String(previousValue);
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
                    : reasonDialog.field === "price_overrides"
                    ? JSON.parse(reasonDialog.newValue)
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

  // ── DnD reorder ──────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sectionItems.findIndex((i) => i.id === active.id);
    const newIndex = sectionItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sectionItems, oldIndex, newIndex);
    const updates = reordered.map((item, idx) => ({ id: item.id, sort_order: idx }));

    setItems((prev) => {
      const otherItems = prev.filter((i) => !reordered.some((r) => r.id === i.id));
      return [...otherItems, ...reordered.map((item, idx) => ({ ...item, sort_order: idx }))].sort((a, b) => a.sort_order - b.sort_order);
    });

    try {
      await reorderItems(updates);
    } catch {
      toast.error("Failed to save order");
    }
  }, [sectionItems]);

  // ── Add row handler ─────────────────────────────────────────────────

  const handleAddRow = useCallback(async () => {
    if (!version || !newRowName.trim() || !newRowBaseInr) return;
    setAddingRow(true);
    try {
      const overrides: Record<string, { list?: number; floor?: number }> = {};
      for (const [tierKey, vals] of Object.entries(newRowTierPrices)) {
        const list = vals.list ? Number(vals.list) : undefined;
        const floor = vals.floor ? Number(vals.floor) : undefined;
        if (list || floor) overrides[tierKey] = { ...(list ? { list } : {}), ...(floor ? { floor } : {}) };
      }
      const created = await createItem(version.id, activeSection, {
        name: newRowName.trim(),
        length: newRowLength || undefined,
        sla: newRowSla || undefined,
        base_inr: Number(newRowBaseInr),
        floor_percent: Number(newRowFloor) || 75,
      });
      if (Object.keys(overrides).length > 0) {
        await updateItemField(created.id, "price_overrides", JSON.stringify(overrides), "Initial tier prices");
        created.price_overrides = overrides;
      }
      setItems((prev) => [...prev, created]);
      setAddRowOpen(false);
      setNewRowName(""); setNewRowLength(""); setNewRowSla(""); setNewRowBaseInr(""); setNewRowFloor("75"); setNewRowTierPrices({});
      toast.success("Row added");
    } catch {
      toast.error("Failed to add row");
    } finally {
      setAddingRow(false);
    }
  }, [version, activeSection, newRowName, newRowLength, newRowSla, newRowBaseInr, newRowFloor, newRowTierPrices]);

  // ── Add tier handler ────────────────────────────────────────────────

  const handleAddTier = useCallback(async () => {
    if (!version || !newTierName.trim()) return;
    setAddingTier(true);
    try {
      const tierKey = newTierName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const created = await createTier(version.id, {
        name: newTierName.trim(),
        region: newTierRegion || "Other",
        tier_level: newTierLevel || "—",
        multiplier: Number(newTierMultiplier) || 1.0,
        currency: newTierCurrency,
        symbol: newTierSymbol,
        tier_key: tierKey,
      });
      for (const [itemId, vals] of Object.entries(newTierItemPrices)) {
        const list = vals.list ? Number(vals.list) : undefined;
        const floor = vals.floor ? Number(vals.floor) : undefined;
        if (list || floor) {
          const item = items.find((i) => i.id === itemId);
          const existing = item?.price_overrides ?? {};
          const updated = { ...existing, [created.tier_key]: { ...(list ? { list } : {}), ...(floor ? { floor } : {}) } };
          await updateItemField(itemId, "price_overrides", JSON.stringify(updated), "Prices set for new tier");
        }
      }
      // Refresh items to pick up overrides
      if (version) {
        const data = await getVersionData(version.id);
        setItems(data.items);
      }
      setTiers((prev) => [...prev, created]);
      setAddTierOpen(false);
      setNewTierName(""); setNewTierRegion(""); setNewTierLevel(""); setNewTierMultiplier("1.0"); setNewTierCurrency("USD"); setNewTierSymbol("$"); setNewTierItemPrices({});
      toast.success("Column added");
    } catch {
      toast.error("Failed to add column");
    } finally {
      setAddingTier(false);
    }
  }, [version, newTierName, newTierRegion, newTierLevel, newTierMultiplier, newTierCurrency, newTierSymbol, newTierItemPrices, items]);

  // ── Delete handlers ─────────────────────────────────────────────────

  const handleDeleteRow = useCallback(async (itemId: string) => {
    try {
      await deleteItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      toast.success("Row deleted");
    } catch {
      toast.error("Failed to delete row");
    }
  }, []);

  const handleDeleteTier = useCallback(async (tierId: string) => {
    try {
      await deleteTier(tierId);
      setTiers((prev) => prev.filter((t) => t.id !== tierId));
      toast.success("Column deleted");
    } catch {
      toast.error("Failed to delete column");
    }
  }, []);

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
    const usdTiers = tiers.filter(t => t.currency !== "INR");
    const lastCol = 2 + tiers.length * 2; // 0-indexed: Format, Length/Desc, then tier pairs, Notes

    const rcData: (string | number)[][] = [];
    const merges: XLSX.Range[] = [];

    // Row 0: Title
    rcData.push([`Fynd Studio · Rate Card FY 2026-27 · ${version?.version_label ?? "v7"}`]);
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: lastCol } });

    // Row 1: Subtitle
    rcData.push([`India base in INR (v12 §3). USD tiers derived as India × tier multiplier ÷ FX rate (₹${fxRate.toFixed(0)}) · floor = list × 0.75`]);
    merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: lastCol } });

    // Row 2: blank
    rcData.push([]);

    // Row 3: Assumptions label
    rcData.push(["Assumptions (edit these to refresh all USD prices)"]);
    merges.push({ s: { r: 3, c: 0 }, e: { r: 3, c: lastCol } });

    // Row 4: Assumption labels
    rcData.push(["FX (INR / USD)", ...usdTiers.map(t => t.name.split("·")[0]?.trim())]);

    // Row 5: Assumption values
    rcData.push([fxRate, ...usdTiers.map(t => t.multiplier)]);

    // Row 6: blank
    rcData.push([]);

    let row = 7;

    const SECTION_NUMS: Record<string, string> = {
      alacarte: "§1", volume_retainer: "§2", pilot_sprint: "§3",
      brand_retainer: "§4", per_campaign: "§5", strategic: "§6",
    };
    const COL1_LABELS: Record<string, string> = {
      alacarte: "Format", volume_retainer: "Tier", pilot_sprint: "Construct",
      brand_retainer: "Tier", per_campaign: "Campaign", strategic: "Service",
    };
    const COL2_LABELS: Record<string, string> = {
      alacarte: "Length", volume_retainer: "Unit", pilot_sprint: "Window",
      brand_retainer: "Unit", per_campaign: "Description", strategic: "Description",
    };

    SECTION_GROUPS.forEach((group) => {
      group.sections.forEach((sectionKey) => {
        const sectionData = items.filter(i => i.section === sectionKey).sort((a, b) => a.sort_order - b.sort_order);
        if (sectionData.length === 0) return;

        const isRange = sectionKey === "per_campaign";
        const isStrategic = sectionKey === "strategic";

        // Section header (full-width merge)
        rcData.push([`${SECTION_NUMS[sectionKey]} · ${group.label} — ${SECTION_LABELS[sectionKey]}`]);
        merges.push({ s: { r: row, c: 0 }, e: { r: row, c: lastCol } });
        row++;

        // Tier header row
        const tierRow: string[] = [COL1_LABELS[sectionKey] ?? "Format", COL2_LABELS[sectionKey] ?? "Length"];
        tiers.forEach(t => { tierRow.push(`${t.name} (${t.currency === "INR" ? "₹" : "USD"})`); tierRow.push(""); });
        tierRow.push("Notes");
        rcData.push(tierRow);

        // Merge: col1 spans 2 rows, col2 spans 2 rows, each tier pair merges, Notes spans 2 rows
        merges.push({ s: { r: row, c: 0 }, e: { r: row + 1, c: 0 } });
        merges.push({ s: { r: row, c: 1 }, e: { r: row + 1, c: 1 } });
        for (let t = 0; t < tiers.length; t++) {
          merges.push({ s: { r: row, c: 2 + t * 2 }, e: { r: row, c: 3 + t * 2 } });
        }
        merges.push({ s: { r: row, c: lastCol }, e: { r: row + 1, c: lastCol } });
        row++;

        // Sub-header row (List / Floor)
        const subRow: string[] = ["", ""];
        tiers.forEach(() => { subRow.push("List"); subRow.push("Floor"); });
        subRow.push("");
        rcData.push(subRow);
        row++;

        // Data rows
        sectionData.forEach(item => {
          const dataRow: (string | number)[] = [item.name, item.length ?? item.description ?? ""];

          if (item.item_key === "localisation" || item.base_inr === 0) {
            tiers.forEach(() => { dataRow.push("+25% of base"); dataRow.push("+18% of base"); });
          } else if (isRange && item.base_inr_max) {
            tiers.forEach(t => {
              const lo = computeTierPrice(item.base_inr, t.multiplier, fxRate);
              const hi = computeTierPrice(item.base_inr_max!, t.multiplier, fxRate);
              const sym = t.currency === "INR" ? "₹" : "$";
              dataRow.push(`${sym}${lo.toLocaleString("en-US")} - ${sym}${hi.toLocaleString("en-US")}`);
              dataRow.push("");
            });
          } else if (isStrategic) {
            tiers.forEach(t => {
              dataRow.push(computeTierPrice(item.base_inr, t.multiplier, fxRate));
              dataRow.push("");
            });
          } else if (item.item_key?.includes("master")) {
            const inrTier = tiers.find(t => t.currency === "INR");
            if (inrTier) { dataRow.push(item.base_inr); dataRow.push("—"); }
            usdTiers.forEach(t => {
              const val = computeTierPrice(item.base_inr, t.multiplier, fxRate);
              dataRow.push(`from $${val.toLocaleString("en-US")}`);
              dataRow.push("—");
            });
          } else {
            const prices = computeAllTierPrices(item.base_inr, item.floor_percent, tiers, fxRate, item.price_overrides);
            prices.forEach(tp => { dataRow.push(tp.list); dataRow.push(tp.floor); });
          }

          dataRow.push(item.notes ?? "");
          rcData.push(dataRow);
          row++;
        });

        // Blank row between sections
        rcData.push([]);
        row++;
      });
    });

    // Footer
    rcData.push(["INTERNAL ONLY — Confidential · Fynd Studio · Shopsense Retail Technologies Ltd."]);
    merges.push({ s: { r: row, c: 0 }, e: { r: row, c: lastCol } });

    const ws = XLSX.utils.aoa_to_sheet(rcData);
    ws["!merges"] = merges;
    ws["!cols"] = [
      { wch: 28 }, { wch: 22 },
      ...Array(tiers.length * 2).fill({ wch: 14 }),
      { wch: 30 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Rate Card FY27");

    // ── Sheet 2: Pricing Strategy ──
    const stratData: (string | number)[][] = [
      ["Fynd Studio · Pricing Strategy"],
      ["How sales DRIs price, pitch, and close — internal reference"],
      [],
      ["§1.0 · Market Tiers"],
      ["Region", "Tier", "Country group", "Currency", "Construct"],
    ];
    tiers.forEach(t => {
      stratData.push([t.name, t.tier_level, (t.countries || []).join(", "), t.currency, `${t.multiplier}× · À la carte · Volume / Brand Retainer · Pilot`]);
    });
    const stratWs = XLSX.utils.aoa_to_sheet(stratData);
    stratWs["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    ];
    stratWs["!cols"] = [{ wch: 25 }, { wch: 6 }, { wch: 45 }, { wch: 10 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, stratWs, "Pricing Strategy");

    // ── Sheet 3: Guardrails ──
    const guardData: (string | number)[][] = [
      ["Fynd Studio · Pricing Guardrails"],
      ["Discount authority, concentration limits, floor rules — internal reference"],
      [],
      ["§1.5 · Discount Guardrails"],
      ["Discount band", "Authority", "Must consult", "Notes"],
      ["0 – 10% off list", "Pod DRI", "—", "Bundles · quarterly upfront · strategic logo"],
      ["10 – 20% off list", "Debajit", "Pod DRI · Rahul (Finance)", "Strategic logo · multi-line deal"],
      ["> 20% off list", "FA written approval", "Debajit · Rahul · pod DRI", "Lighthouse logo only · documented business case"],
      ["Below floor or below Volume Starter", "Founder sign-off only", "FA awareness", "Off-grid pricing · logged as exception"],
      ["14 Day Pilot Sprint ≠ ₹4L", "Founder sign-off", "FA", "₹4L pilot is the standard price"],
      [],
      ["§1.6 · Concentration & ICP guardrails"],
      ["Rule", "Limit / threshold", "Trigger / action"],
      ["Single-brand cap", "No single brand > 8% of FY revenue", "Pod DRI re-shapes pipeline if trending above"],
      ["Reliance ecosystem cap", "30% of FY revenue across all Reliance entities", "Founder + FA review at 25%"],
    ];
    const guardWs = XLSX.utils.aoa_to_sheet(guardData);
    guardWs["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
      { s: { r: 11, c: 0 }, e: { r: 11, c: 3 } },
    ];
    guardWs["!cols"] = [{ wch: 30 }, { wch: 30 }, { wch: 30 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, guardWs, "Guardrails");

    XLSX.writeFile(wb, `Fynd_Studio_Rate_Card_${version?.version_label ?? "v7"}.xlsx`);
    toast.success("Rate card downloaded as Excel");
  }, [items, tiers, fxRate, version]);

  const xlsxInputRef = useRef<HTMLInputElement>(null);

  const handleXlsxUpload = useCallback(async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      let updated = 0;

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        if (!sheet?.["!ref"]) continue;
        const range = XLSX.utils.decode_range(sheet["!ref"]);

        for (let r = 0; r <= range.e.r; r++) {
          const nameCell = sheet[XLSX.utils.encode_cell({ r, c: 0 })];
          if (!nameCell?.v) continue;
          const name = String(nameCell.v).trim();

          const item = items.find(i => i.name === name);
          if (!item) continue;

          const inrCell = sheet[XLSX.utils.encode_cell({ r, c: 3 })];
          if (inrCell && typeof inrCell.v === "number" && inrCell.v > 0 && inrCell.v !== item.base_inr) {
            try {
              await updateItemField(item.id, "base_inr", inrCell.v, `XLSX import: ${file.name}`);
              setItems(prev => prev.map(i => i.id === item.id ? { ...i, base_inr: inrCell.v as number } : i));
              updated++;
            } catch {}
          }
        }
      }

      if (updated > 0) {
        toast.success(`Updated ${updated} price${updated > 1 ? "s" : ""} from ${file.name}`);
      } else {
        toast.info("No price changes found in the uploaded file");
      }
    } catch {
      toast.error("Failed to parse xlsx file");
    }
  }, [items]);

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
            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">{liveFxRate ? "LIVE" : "STORED"}</span>
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
            onClick={() => {
              const next = !editMode;
              setEditMode(next);
              setEditingCell(null);
              if (next && sectionItems.length > 0 && tiers.length > 0) {
                setSelectedCell({ itemId: sectionItems[0].id, tierKey: tiers[0].tier_key, isFloor: false });
              } else {
                setSelectedCell(null);
              }
            }}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editMode ? "Editing" : "Edit"}
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={handleDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => xlsxInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Button>
          <input
            ref={xlsxInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleXlsxUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            className={cn(
              "gap-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white border-0 shadow-sm",
              aiOpen && "from-violet-700 to-indigo-700 shadow-md"
            )}
            onClick={() => { setAiOpen(!aiOpen); setChangeLogOpen(false); setStrategyOpen(false); setGuardrailsOpen(false); }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pricing AI
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={cn("gap-1.5", (strategyOpen || guardrailsOpen || changeLogOpen) && "bg-primary/10 border-primary text-primary")}>
                <MoreHorizontal className="h-3.5 w-3.5" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => { setStrategyOpen(!strategyOpen); setGuardrailsOpen(false); setChangeLogOpen(false); setAiOpen(false); }}>
                <BookOpen className="h-3.5 w-3.5" /> Strategy
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => { setGuardrailsOpen(!guardrailsOpen); setStrategyOpen(false); setChangeLogOpen(false); setAiOpen(false); }}>
                <ShieldCheck className="h-3.5 w-3.5" /> Guardrails
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs" onClick={() => { setChangeLogOpen(!changeLogOpen); setAiOpen(false); setStrategyOpen(false); setGuardrailsOpen(false); }}>
                <Clock className="h-3.5 w-3.5" /> Change Log
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Section tabs (grouped: Gen Media §1-3, Marketing §4-6) ────────── */}
      <div className="flex items-center gap-0 border-b mb-4 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Rate card sections">
        {SECTION_GROUPS.map((group, gi) => (
          <Fragment key={group.label}>
            {gi > 0 && <div className="w-px h-6 bg-border mx-1 shrink-0" />}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50 font-medium px-3 py-2.5 whitespace-nowrap shrink-0">
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
      {/* ── Formula bar (combines edit mode help + cell editor) ────────── */}
      {editMode && (
        <div className="bg-slate-50 dark:bg-slate-900 border rounded-lg mb-2 text-xs">
          {selectedCell && (() => {
            const item = items.find(i => i.id === selectedCell.itemId);
            const tier = tiers.find(t => t.tier_key === selectedCell.tierKey);
            if (!item || !tier) return null;
            const ov = item.price_overrides?.[selectedCell.tierKey];
            const hasOverride = selectedCell.isFloor ? !!ov?.floor : !!ov?.list;
            const overrideVal = selectedCell.isFloor ? ov?.floor : ov?.list;
            const computed = computeTierPrice(item.base_inr, tier.multiplier, fxRate);
            const computedFloor = roundPrice(computed * (item.floor_percent / 100));
            const displayVal = selectedCell.isFloor
              ? (overrideVal ?? computedFloor)
              : (overrideVal ?? computed);
            return (
              <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="font-bold text-primary shrink-0 truncate max-w-[220px]">
                  {item.name} × {tier.name.split("·")[0]?.trim()} · {selectedCell.isFloor ? "Floor" : "List"}
                </span>
                <span className="text-muted-foreground/40">│</span>
                <span className="text-muted-foreground shrink-0">
                  ₹{item.base_inr.toLocaleString("en-IN")} × {tier.multiplier}× ÷ {fxRate.toFixed(1)} = {formatCurrency(computed, tier.symbol)}
                </span>
                <span className="text-muted-foreground/40">│</span>
                <span className="text-[10px] text-muted-foreground/50 shrink-0">fx</span>
                <input
                  type="text"
                  className="flex-1 h-7 px-2 text-xs font-mono bg-white dark:bg-slate-800 border rounded focus:outline-none focus:ring-2 focus:ring-primary/40 min-w-[100px]"
                  placeholder={`${displayVal} or =base*mult/fx`}
                  defaultValue={hasOverride ? String(overrideVal) : ""}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (!val) return;
                      setEditValue(val);
                      setEditingCell({ itemId: selectedCell.itemId, field: "price_overrides" as EditableField, tierKey: selectedCell.tierKey, isFloor: selectedCell.isFloor });
                      setTimeout(() => commitEdit(), 0);
                    }
                    if (e.key === "Escape") setSelectedCell(null);
                  }}
                />
                {hasOverride && (
                  <button
                    className="text-[10px] text-red-500 hover:text-red-700 font-semibold shrink-0"
                    onClick={() => {
                      const existing = item.price_overrides ?? {};
                      const tierOv = { ...(existing[selectedCell.tierKey] ?? {}) };
                      if (selectedCell.isFloor) delete tierOv.floor; else delete tierOv.list;
                      const updated = { ...existing, [selectedCell.tierKey]: tierOv };
                      if (!tierOv.list && !tierOv.floor) delete updated[selectedCell.tierKey];
                      setReasonDialog({
                        itemId: selectedCell.itemId,
                        field: "price_overrides" as EditableField,
                        newValue: JSON.stringify(updated),
                        oldValue: String(overrideVal),
                      });
                      setReason("Removed price override");
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            );
          })()}
          {!selectedCell && (
            <div className="flex items-center gap-2 px-3 py-2">
              <Pencil className="h-3 w-3 text-primary shrink-0" />
              <span className="text-primary/80">Click any cell to edit</span>
              <span className="text-muted-foreground/40 mx-1">·</span>
              <span className="text-muted-foreground/60"><strong className="text-muted-foreground">₹ cells</strong> = base price</span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/60"><strong className="text-muted-foreground">$ cells</strong> = override or <code className="bg-muted px-1 rounded">=formula</code></span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground/60"><strong className="text-muted-foreground">1.8×</strong> = edit multiplier</span>
              <button
                onClick={() => { setEditMode(false); setEditingCell(null); setSelectedCell(null); }}
                className="text-muted-foreground/40 hover:text-foreground shrink-0 ml-auto"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sectionItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
      <div className="bg-card rounded-xl border shadow-sm overflow-x-auto scrollbar-hide">
        <table className="w-full text-[13px]" aria-label={`${SECTION_LABELS[activeSection]} rate card pricing`}>
          <thead>
            {/* Tier header row */}
            <tr className="bg-slate-50 dark:bg-slate-900 border-b">
              {editMode && <th className="w-8 bg-slate-50 dark:bg-slate-900" />}
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
                    "px-2 py-3 text-center font-semibold min-w-[130px] text-[11px] border-l-2 border-border relative",
                    tier.currency === "INR"
                      ? "text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20"
                      : tidx % 2 === 0
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-slate-600 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/30"
                  )}
                >
                  <div className="font-bold text-xs">{tier.name.split("·")[0]?.trim()}</div>
                  <div className="text-[10px] font-medium opacity-60 mt-0.5">
                    {tier.currency === "INR" ? "₹ INR" : (
                      <>
                        $ USD ·{" "}
                        {editMode && editingTierId === tier.id ? (
                          <input
                            ref={tierMultiplierRef}
                            type="text"
                            inputMode="decimal"
                            className="w-10 h-4 px-1 text-[10px] text-center border rounded bg-white dark:bg-slate-800 text-primary font-bold inline"
                            value={editTierMultiplier}
                            onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) setEditTierMultiplier(e.target.value); }}
                            onBlur={() => saveTierMultiplier(tier.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveTierMultiplier(tier.id);
                              if (e.key === "Escape") setEditingTierId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          <button
                            className={cn("font-bold", editMode && "hover:text-primary cursor-pointer underline decoration-dashed underline-offset-2")}
                            onClick={(e) => {
                              if (!editMode) return;
                              e.stopPropagation();
                              setEditingTierId(tier.id);
                              setEditTierMultiplier(String(tier.multiplier));
                              setTimeout(() => tierMultiplierRef.current?.focus(), 0);
                            }}
                            title={editMode ? "Click to edit multiplier" : undefined}
                          >
                            {tier.multiplier}×
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {editMode && tiers.length > 1 && (
                    <button onClick={() => { if (confirm(`Delete "${tier.name}" column?`)) handleDeleteTier(tier.id); }}
                      className="absolute top-1 right-1 text-red-400 hover:text-red-600 transition-colors" title="Delete column">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </th>
              ))}
              {editMode && (
                <th className="px-2 py-3 border-l-2 border-border w-10">
                  <button onClick={() => setAddTierOpen(true)} className="text-primary hover:text-primary/80" title="Add column">
                    <Plus className="h-4 w-4" />
                  </button>
                </th>
              )}
            </tr>
            {/* List / Floor sub-header */}
            <tr className="bg-white dark:bg-slate-950 border-b-2 border-slate-200 dark:border-slate-700">
              {editMode && <th className="w-8" />}
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
              {editMode && <th />}
              {editMode && <th className="w-8" />}
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
                fxRate,
                item.price_overrides
              );
              const maxPrices = isRangeRow ? computeAllTierPrices(item.base_inr_max!, item.floor_percent, tiers, fxRate, item.price_overrides) : null;
              const stripe = idx % 2 === 1;

              return (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  editMode={editMode}
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

                  {/* Length — editable */}
                  <td
                    className={cn(
                      "px-3 py-3 text-center text-slate-500 dark:text-slate-400 group cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors rounded",
                      editingCell?.itemId === item.id && editingCell.field === "length" && "p-1"
                    )}
                    onClick={() => {
                      if (!(editingCell?.itemId === item.id && editingCell.field === "length")) {
                        startEdit(item.id, "length");
                      }
                    }}
                  >
                    {editingCell?.itemId === item.id && editingCell.field === "length" ? (
                      <Input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                          if (e.key === "Escape") cancelEdit();
                        }}
                        onBlur={commitEdit}
                        className="h-8 text-xs text-center border border-slate-300 dark:border-slate-600 rounded-md focus:ring-1 focus:ring-slate-400 bg-white dark:bg-slate-900"
                      />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 justify-center px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium">
                        {item.length ?? "—"}
                      </span>
                    )}
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
                        className="h-8 text-xs text-center border border-slate-300 dark:border-slate-600 rounded-md focus:ring-1 focus:ring-slate-400 bg-white dark:bg-slate-900"
                      />
                    ) : (
                      <span className="text-[11px]">
                        {item.sla ?? "—"}
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
                    const tier = tiers[tidx];
                    const computedList = isINR ? item.base_inr : computeTierPrice(item.base_inr, tier.multiplier, fxRate);
                    const hasListOverride = !isINR && !!item.price_overrides?.[tp.tier_key]?.list;
                    const listTooltip = isINR ? undefined : getFormulaTooltip(item.base_inr, tier.multiplier, fxRate, computedList, tp.symbol, hasListOverride, item.price_overrides?.[tp.tier_key]?.list);
                    const hasFloorOverride = !isINR && !!item.price_overrides?.[tp.tier_key]?.floor;
                    const computedFloor = isINR ? roundPrice(item.base_inr * (item.floor_percent / 100)) : roundPrice(computedList * (item.floor_percent / 100));
                    const floorTooltip = isINR ? undefined : getFormulaTooltip(item.base_inr, tier.multiplier, fxRate, computedFloor, tp.symbol, hasFloorOverride, item.price_overrides?.[tp.tier_key]?.floor);
                    const isSelected = selectedCell?.itemId === item.id && selectedCell.tierKey === tp.tier_key;

                    return (
                      <Fragment key={tp.tier_key}>
                        {/* List price */}
                        <td
                          className={cn(
                            "px-2 py-3 text-right tabular-nums border-l-2 border-border relative",
                            isINR
                              ? "font-bold text-emerald-700 dark:text-emerald-400 group cursor-pointer hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition-colors"
                              : "font-medium text-slate-700 dark:text-slate-300 cursor-pointer",
                            isEditing && "p-1",
                            tidx > 0 && !isINR && tidx % 2 === 0 && "bg-blue-50/30 dark:bg-blue-950/10",
                            isSelected && !selectedCell.isFloor && "rc-selected-cell"
                          )}
                          title={listTooltip}
                          onClick={() => {
                            if (isINR && !isEditing) { startEdit(item.id, "base_inr"); return; }
                            if (!isINR) setSelectedCell({ itemId: item.id, tierKey: tp.tier_key, isFloor: false });
                          }}
                        >
                          {hasListOverride && (
                            <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-t-blue-500 border-l-[8px] border-l-transparent" />
                          )}
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
                            <span>{formatCurrency(tp.list, tp.symbol)}</span>
                          ) : editingCell?.itemId === item.id && editingCell.field === "price_overrides" && editingCell.tierKey === tp.tier_key && !editingCell.isFloor ? (
                            <Input
                              ref={inputRef}
                              type="text"
                              placeholder="=base*1.1"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              onBlur={commitEdit}
                              className="h-8 text-xs text-right border border-slate-300 dark:border-slate-600 rounded-md w-24 focus:ring-1 focus:ring-slate-400 bg-white dark:bg-slate-900"
                            />
                          ) : (
                            <span
                              className="text-[12px] cursor-pointer"
                              onClick={() => {
                                setSelectedCell({ itemId: item.id, tierKey: tp.tier_key, isFloor: false });
                                startTierOverrideEdit(item.id, tp.tier_key, tp.list, false);
                              }}
                            >
                              {formatCurrency(tp.list, tp.symbol)}
                            </span>
                          )}
                        </td>
                        {/* Floor price */}
                        <td
                          className={cn(
                            "px-2 py-3 text-right text-slate-400 dark:text-slate-500 tabular-nums text-[12px] bg-muted/20 cursor-pointer relative",
                            isSelected && selectedCell.isFloor && "rc-selected-cell"
                          )}
                          title={floorTooltip}
                          onClick={!(editingCell?.itemId === item.id && editingCell.field === "price_overrides" && editingCell.tierKey === tp.tier_key && editingCell.isFloor)
                            ? () => {
                              setSelectedCell({ itemId: item.id, tierKey: tp.tier_key, isFloor: true });
                              startTierOverrideEdit(item.id, tp.tier_key, tp.floor, true);
                            }
                            : undefined
                          }
                        >
                          {hasFloorOverride && (
                            <div className="absolute top-0 right-0 w-0 h-0 border-t-[8px] border-t-blue-500 border-l-[8px] border-l-transparent" />
                          )}
                          {editingCell?.itemId === item.id && editingCell.field === "price_overrides" && editingCell.tierKey === tp.tier_key && editingCell.isFloor ? (
                            <Input
                              ref={inputRef}
                              type="text"
                              placeholder="=base*0.75"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                                if (e.key === "Escape") cancelEdit();
                              }}
                              onBlur={commitEdit}
                              className="h-8 text-xs text-right border border-slate-300 dark:border-slate-600 rounded-md w-24 focus:ring-1 focus:ring-slate-400 bg-white dark:bg-slate-900"
                            />
                          ) : (
                            <span>{formatCurrency(tp.floor, tp.symbol)}</span>
                          )}
                        </td>
                      </Fragment>
                    );
                  })}
                  {editMode && <td />}
                  {editMode && (
                    <td className="px-1 py-3 text-center w-8">
                      <button onClick={() => { if (confirm(`Delete "${item.name}"?`)) handleDeleteRow(item.id); }}
                        className="text-red-300 hover:text-red-500 transition-colors" title="Delete row">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </SortableRow>
              );
            })}
          </tbody>
        </table>
        {editMode && (
          <div className="border-t px-4 py-2">
            <button onClick={() => setAddRowOpen(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 py-1">
              <Plus className="h-3.5 w-3.5" /> Add Row
            </button>
          </div>
        )}
      </div>
      </SortableContext>
      </DndContext>

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
                    {reasonDialog.field === "base_inr" ? "Base INR" : reasonDialog.field === "price_overrides" ? "Tier Price" : reasonDialog.field.toUpperCase()}
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
                      : reasonDialog.field === "price_overrides"
                      ? (() => { try { const ov = JSON.parse(reasonDialog.newValue); const keys = Object.keys(ov); const lastKey = keys[keys.length - 1]; const vals = ov[lastKey]; return String(vals?.list ?? vals?.floor ?? ""); } catch { return reasonDialog.newValue; } })()
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

      {/* ── Add Row dialog ─────────────────────────────────────────────── */}
      <Dialog open={addRowOpen} onOpenChange={setAddRowOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Row — {SECTION_LABELS[activeSection]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Format Name *</Label>
              <Input value={newRowName} onChange={(e) => setNewRowName(e.target.value)} placeholder="e.g. Marketing image (single)" className="h-8 text-sm" autoFocus />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Length</Label>
                <Input value={newRowLength} onChange={(e) => setNewRowLength(e.target.value)} placeholder="e.g. 15s" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">SLA</Label>
                <Input value={newRowSla} onChange={(e) => setNewRowSla(e.target.value)} placeholder="e.g. 24 hrs" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Floor %</Label>
                <Input type="text" inputMode="decimal" value={newRowFloor} onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) setNewRowFloor(e.target.value); }} placeholder="75" className="h-8 text-sm" />
              </div>
            </div>
            <div className="border-t pt-3">
              <Label className="text-xs font-semibold mb-2 block">Tier Pricing</Label>
              <div className="space-y-2">
                {tiers.map((tier) => (
                  <div key={tier.id} className="grid grid-cols-[1fr_100px_100px] gap-2 items-center">
                    <span className="text-xs font-medium truncate">{tier.name}</span>
                    <div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={tier.currency === "INR" ? "Base INR" : "List"}
                        className="h-7 text-xs"
                        value={tier.currency === "INR" ? newRowBaseInr : (newRowTierPrices[tier.tier_key]?.list ?? "")}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!/^\d*\.?\d*$/.test(v)) return;
                          if (tier.currency === "INR") {
                            setNewRowBaseInr(v);
                          } else {
                            setNewRowTierPrices((prev) => ({
                              ...prev,
                              [tier.tier_key]: { ...prev[tier.tier_key], list: v },
                            }));
                          }
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Floor"
                        className="h-7 text-xs"
                        value={newRowTierPrices[tier.tier_key]?.floor ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!/^\d*\.?\d*$/.test(v)) return;
                          setNewRowTierPrices((prev) => ({
                            ...prev,
                            [tier.tier_key]: { ...prev[tier.tier_key], floor: v },
                          }));
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Leave blank to auto-calculate from Base INR × multiplier.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddRowOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={addingRow || !newRowName.trim() || !newRowBaseInr} onClick={handleAddRow}>
              {addingRow ? "Adding..." : "Add Row"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Tier dialog ────────────────────────────────────────────── */}
      <Dialog open={addTierOpen} onOpenChange={setAddTierOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Tier Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-semibold">Tier Name *</Label>
              <Input value={newTierName} onChange={(e) => setNewTierName(e.target.value)} placeholder="e.g. LATAM T1 · Brazil" className="h-8 text-sm" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Region</Label>
                <Input value={newTierRegion} onChange={(e) => setNewTierRegion(e.target.value)} placeholder="e.g. Latin America" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Tier Level</Label>
                <Input value={newTierLevel} onChange={(e) => setNewTierLevel(e.target.value)} placeholder="e.g. T1" className="h-8 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Multiplier *</Label>
                <Input type="text" inputMode="decimal" value={newTierMultiplier} onChange={(e) => { if (/^\d*\.?\d*$/.test(e.target.value)) setNewTierMultiplier(e.target.value); }} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Currency</Label>
                <Input value={newTierCurrency} onChange={(e) => setNewTierCurrency(e.target.value)} placeholder="USD" className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Symbol</Label>
                <Input value={newTierSymbol} onChange={(e) => setNewTierSymbol(e.target.value)} placeholder="$" className="h-8 text-sm" />
              </div>
            </div>
            {items.length > 0 && (
              <div className="border-t pt-3">
                <Label className="text-xs font-semibold mb-2 block">Row Pricing</Label>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {items.filter((i) => i.section === activeSection).sort((a, b) => a.sort_order - b.sort_order).map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_100px_100px] gap-2 items-center">
                      <span className="text-xs font-medium truncate" title={item.name}>{item.name}</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="List"
                        className="h-7 text-xs"
                        value={newTierItemPrices[item.id]?.list ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!/^\d*\.?\d*$/.test(v)) return;
                          setNewTierItemPrices((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], list: v },
                          }));
                        }}
                      />
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Floor"
                        className="h-7 text-xs"
                        value={newTierItemPrices[item.id]?.floor ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!/^\d*\.?\d*$/.test(v)) return;
                          setNewTierItemPrices((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], floor: v },
                          }));
                        }}
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">Leave blank to auto-calculate from Base INR × multiplier.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddTierOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={addingTier || !newTierName.trim()} onClick={handleAddTier}>
              {addingTier ? "Adding..." : "Add Column"}
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
