"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClientAvatar } from "@/components/shared/client-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, X, FileText, ArrowLeft, Pencil, Copy, Printer, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Lightbulb, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { generateSowPdfHtml } from "@/lib/sow/generate-pdf-html";
import type { RateCardVersion, RateCardTier, RateCardItem } from "@/lib/types/rate-card";
import { SoWBuilderClient } from "./_client";
import { createSow, deleteSow, getSows, getNextSowRef, type SowRow } from "./actions";

type SoWDraft = {
  id: string;
  sowRef: string;
  clientName: string;
  brandName: string;
  buyerName: string;
  salesDri: string;
  selectedTierKey: string;
  tierName: string;
  gmEnabled: boolean;
  mkEnabled: boolean;
  gmPlanType: string;
  mkPlanType: string;
  selectedGmTier: string;
  selectedMkTier: string;
  discount: number;
  upfront: number;
  months: number;
  netMonthly: number;
  annualValue: number;
  currency: string;
  symbol: string;
  customerRequirements: string[] | null;
  listMonthly: number;
  bundleDiscount: number;
  alacarteAddons: { item_key: string; name: string; qty: number; unit_price: number; length?: string }[] | null;
  scopeSnapshot: {
    gmDeliverables?: { label: string; qty: string | number; unit: string }[];
    mkDeliverables?: { label: string; qty: string | number; unit: string }[];
    gmTierName?: string;
    mkTierName?: string;
    tierNotes?: string;
  } | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  createdAt: string;
  updatedAt: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
  sent: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
  accepted: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
  expired: "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300",
};

const STATUS_ICONS: Record<string, string> = {
  draft: "✎",
  sent: "↗",
  accepted: "✓",
  rejected: "✕",
  expired: "⏱",
};

function fmtPrice(amount: number, symbol: string): string {
  if (symbol === "$") return `$${amount.toLocaleString("en-US")}`;
  return `${symbol}${amount.toLocaleString("en-IN")}`;
}

function rowToDraft(row: SowRow): SoWDraft {
  return {
    id: row.id,
    sowRef: row.sow_ref,
    clientName: row.client_name,
    brandName: row.brand_name ?? "",
    buyerName: row.buyer_name ?? "",
    salesDri: row.sales_dri ?? "",
    selectedTierKey: row.selected_tier_key,
    tierName: row.tier_name ?? "",
    gmEnabled: row.gm_enabled,
    mkEnabled: row.mk_enabled,
    gmPlanType: row.gm_plan_type,
    mkPlanType: row.mk_plan_type,
    selectedGmTier: row.selected_gm_tier ?? "",
    selectedMkTier: row.selected_mk_tier ?? "",
    discount: Number(row.discount),
    upfront: Number(row.upfront),
    months: row.months,
    netMonthly: Number(row.net_monthly),
    annualValue: Number(row.annual_value),
    currency: row.currency,
    symbol: row.symbol,
    customerRequirements: row.customer_requirements,
    listMonthly: Number(row.list_monthly),
    bundleDiscount: Number(row.bundle_discount),
    alacarteAddons: row.alacarte_addons,
    scopeSnapshot: row.scope_snapshot,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function draftToRow(draft: SoWDraft): Omit<SowRow, "id" | "created_at" | "updated_at" | "created_by"> {
  return {
    sow_ref: draft.sowRef,
    client_name: draft.clientName,
    brand_name: draft.brandName || null,
    buyer_name: draft.buyerName || null,
    sales_dri: draft.salesDri || null,
    selected_tier_key: draft.selectedTierKey,
    tier_name: draft.tierName || null,
    gm_enabled: draft.gmEnabled,
    mk_enabled: draft.mkEnabled,
    gm_plan_type: draft.gmPlanType,
    mk_plan_type: draft.mkPlanType,
    selected_gm_tier: draft.selectedGmTier || null,
    selected_mk_tier: draft.selectedMkTier || null,
    discount: draft.discount,
    upfront: draft.upfront,
    months: draft.months,
    net_monthly: draft.netMonthly,
    annual_value: draft.annualValue,
    currency: draft.currency,
    symbol: draft.symbol,
    customer_requirements: draft.customerRequirements,
    list_monthly: draft.listMonthly,
    bundle_discount: draft.bundleDiscount,
    alacarte_addons: draft.alacarteAddons,
    scope_snapshot: draft.scopeSnapshot,
    status: draft.status,
  };
}

type SortKey = "sowRef" | "clientName" | "tierName" | "netMonthly" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  draft: 0, sent: 1, accepted: 2, rejected: 3, expired: 4,
};

type Props = {
  initialSows: SowRow[];
  version: RateCardVersion;
  tiers: RateCardTier[];
  items: RateCardItem[];
};

export function SoWListClient({ initialSows, version, tiers, items }: Props) {
  const [view, setView] = useState<"list" | "builder">("list");
  const [editingSowId, setEditingSowId] = useState<string | null>(null);
  const [sows, setSows] = useState<SoWDraft[]>(() => initialSows.map(rowToDraft));
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "netMonthly" || key === "createdAt" ? "desc" : "asc");
    }
  }

  const [tipDismissed, setTipDismissed] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("sow_tip_dismissed") === "1";
    return false;
  });

  const filtered = sows.filter((s) => {
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    if (search && !s.clientName.toLowerCase().includes(search.toLowerCase()) && !s.sowRef.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "sowRef": return dir * a.sowRef.localeCompare(b.sowRef);
      case "clientName": return dir * a.clientName.localeCompare(b.clientName);
      case "tierName": return dir * a.tierName.localeCompare(b.tierName);
      case "netMonthly": return dir * (a.netMonthly - b.netMonthly);
      case "status": return dir * ((STATUS_ORDER[a.status] ?? 0) - (STATUS_ORDER[b.status] ?? 0));
      case "createdAt": return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      default: return 0;
    }
  });

  if (view === "builder") {
    const editingSow = editingSowId ? sows.find(s => s.id === editingSowId) : null;
    const editingSowRow = editingSow ? draftToRow(editingSow) as SowRow & { id: string; created_at: string; updated_at: string; created_by: string | null } : null;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => { setView("list"); setEditingSowId(null); }}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to SoW list
          </Button>
          {editingSow && <span className="text-xs text-muted-foreground">Editing {editingSow.sowRef} · {editingSow.clientName}</span>}
        </div>
        <SoWBuilderClient
          key={editingSowId ?? "new"}
          version={version}
          tiers={tiers}
          items={items}
          editingSow={editingSowRow ? { ...editingSowRow, id: editingSow!.id, created_at: editingSow!.createdAt, updated_at: editingSow!.updatedAt, created_by: null } : null}
          onSaved={async () => {
            const fresh = await getSows();
            setSows(fresh.map(rowToDraft));
          }}
        />
      </div>
    );
  }

  if (sows.length === 0) {
    return (
      <div className="max-w-[1400px] mx-auto">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">No Statements of Work yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            Create your first SoW to generate pricing proposals from your rate card. Each SoW tracks scope, commercials, and payment terms.
          </p>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={() => { setEditingSowId(null); setView("builder"); }}>
            <Plus className="h-4 w-4" />
            Create your first SoW
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Top controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40 text-sm">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search client or ref..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 w-72 text-sm"
            />
            {search && (
              <button className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground" onClick={() => setSearch("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={() => { setEditingSowId(null); setView("builder"); }}>
          <Plus className="h-3.5 w-3.5" />
          New SoW
        </Button>
      </div>

      {/* SoW Table */}
      <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted">
              <SortableHead active={sortKey === "sowRef"} dir={sortDir} onClick={() => toggleSort("sowRef")} className="px-4 py-3">SoW Ref</SortableHead>
              <SortableHead active={sortKey === "clientName"} dir={sortDir} onClick={() => toggleSort("clientName")} className="px-4 py-3">Client</SortableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-wider">Services</TableHead>
              <SortableHead active={sortKey === "tierName"} dir={sortDir} onClick={() => toggleSort("tierName")} className="px-4 py-3">Market</SortableHead>
              <SortableHead active={sortKey === "netMonthly"} dir={sortDir} onClick={() => toggleSort("netMonthly")} align="right" className="px-4 py-3">Total</SortableHead>
              <SortableHead active={sortKey === "status"} dir={sortDir} onClick={() => toggleSort("status")} align="center" className="px-4 py-3">Status</SortableHead>
              <SortableHead active={sortKey === "createdAt"} dir={sortDir} onClick={() => toggleSort("createdAt")} className="px-4 py-3">Created</SortableHead>
              <TableHead className="px-4 py-3 text-xs uppercase tracking-wider text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="px-4 py-12 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No SoWs found</p>
                  <p className="text-xs text-muted-foreground mt-1">Create a new Statement of Work to get started.</p>
                </TableCell>
              </TableRow>
            )}
            {sorted.map((sow) => (
              <TableRow
                key={sow.id}
                className="cursor-pointer"
                onClick={() => {
                  if (sow.status === "draft") {
                    setEditingSowId(sow.id);
                    setView("builder");
                  } else {
                    toast.info(`${sow.sowRef} — ${sow.clientName}`, {
                      description: `${fmtPrice(sow.netMonthly, sow.symbol)}/mo · ${sow.status.charAt(0).toUpperCase() + sow.status.slice(1)} · ${sow.tierName}`,
                    });
                  }
                }}
              >
                <TableCell className="px-4 py-3 font-medium text-foreground">{sow.sowRef}</TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <ClientAvatar name={sow.clientName} size="sm" />
                    <span className="text-foreground">{sow.clientName}</span>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex gap-1">
                    {sow.gmEnabled && <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">Gen Media</Badge>}
                    {sow.mkEnabled && <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700">Marketing</Badge>}
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground">{sow.tierName.split("·")[0]?.trim()}</TableCell>
                <TableCell className="px-4 py-3 text-right font-semibold text-foreground tabular-nums">
                  {fmtPrice(sow.netMonthly, sow.symbol)}/mo
                </TableCell>
                <TableCell className="px-4 py-3 text-center">
                  <span className={cn("text-xs px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1", STATUS_STYLES[sow.status])}>
                    <span>{STATUS_ICONS[sow.status]}</span>
                    {sow.status.charAt(0).toUpperCase() + sow.status.slice(1)}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                  {new Date(sow.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </TableCell>
                <TableCell className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      {sow.status === "draft" && (
                        <DropdownMenuItem onClick={() => { setEditingSowId(sow.id); setView("builder"); }} className="gap-2 text-xs">
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem className="gap-2 text-xs" onClick={async () => {
                        try {
                          const newRef = await getNextSowRef();
                          const rowData = draftToRow({ ...sow, sowRef: newRef, status: "draft" });
                          const created = await createSow(rowData);
                          setSows((prev) => [rowToDraft(created), ...prev]);
                          toast.success(`Duplicated as ${newRef}`);
                        } catch {
                          toast.error("Failed to duplicate SoW");
                        }
                      }}>
                        <Copy className="h-3.5 w-3.5" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem className="gap-2 text-xs" onClick={() => {
                        const printWindow = window.open("", "_blank");
                        if (!printWindow) { toast.error("Pop-up blocked"); return; }
                        const services = [sow.gmEnabled ? "Gen Media" : "", sow.mkEnabled ? "Marketing" : ""].filter(Boolean).join(" + ");
                        printWindow.document.write(generateSowPdfHtml({
                          sowRef: sow.sowRef,
                          clientName: sow.clientName,
                          brandName: sow.brandName,
                          buyerName: sow.buyerName,
                          salesDri: sow.salesDri,
                          tierName: sow.tierName,
                          currency: sow.currency,
                          symbol: sow.symbol,
                          services,
                          gmPlanType: sow.gmPlanType,
                          mkPlanType: sow.mkPlanType,
                          discount: sow.discount,
                          upfront: sow.upfront,
                          months: sow.months,
                          netMonthly: sow.netMonthly,
                          annualValue: sow.annualValue,
                          listMonthly: sow.listMonthly,
                          bundleDiscount: sow.bundleDiscount,
                          customerRequirements: sow.customerRequirements,
                          alacarteAddons: sow.alacarteAddons,
                          scopeSnapshot: sow.scopeSnapshot,
                          createdAt: sow.createdAt,
                        }));
                        printWindow.document.close();
                        setTimeout(() => printWindow.print(), 400);
                      }}>
                        <Printer className="h-3.5 w-3.5" /> Print
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="gap-2 text-xs text-destructive focus:text-destructive" onClick={async () => {
                        try {
                          await deleteSow(sow.id);
                          setSows((prev) => prev.filter((s) => s.id !== sow.id));
                          toast.success("SoW deleted");
                        } catch {
                          toast.error("Failed to delete SoW");
                        }
                      }}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between mt-3 px-1 text-xs text-muted-foreground">
        <span>{filtered.length} {filtered.length === 1 ? "SoW" : "SoWs"}</span>
        <div className="flex items-center gap-4">
          <span>Accepted: <strong className="text-emerald-600 dark:text-emerald-400">{sows.filter(s => s.status === "accepted").length}</strong></span>
          <span>Sent: <strong className="text-blue-600 dark:text-blue-400">{sows.filter(s => s.status === "sent").length}</strong></span>
          <span>Draft: <strong className="text-foreground">{sows.filter(s => s.status === "draft").length}</strong></span>
          <span>Rejected: <strong className="text-red-600 dark:text-red-400">{sows.filter(s => s.status === "rejected").length}</strong></span>
        </div>
      </div>

      {/* Tip card — fills empty space when few rows */}
      {filtered.length > 0 && filtered.length <= 5 && !tipDismissed && (
        <div className="mt-6 flex items-start gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3">
          <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground flex-1">
            <span className="font-semibold text-foreground">Tip:</span>{" "}
            Click any row to preview its details. Draft SoWs open directly in the builder for editing. Use column headers to sort the table.
          </div>
          <button onClick={() => { setTipDismissed(true); localStorage.setItem("sow_tip_dismissed", "1"); }} className="text-muted-foreground/50 hover:text-foreground shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function SortableHead({
  children,
  active,
  dir,
  onClick,
  align,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={cn("text-xs uppercase tracking-wider select-none", align === "right" && "text-right", align === "center" && "text-center", className)}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", active ? "text-foreground" : "text-muted-foreground")}
        onClick={onClick}
      >
        {children}
        <Icon className="h-3 w-3 shrink-0" />
      </button>
    </TableHead>
  );
}
