"use client";

import { useState, useEffect } from "react";
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
import { Plus, Search, X, FileText, ArrowLeft, Pencil, Copy, Printer, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { RateCardVersion, RateCardTier, RateCardItem } from "@/lib/types/rate-card";
import { SoWBuilderClient } from "./_client";

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

// Demo SoWs for initial display
const DEMO_SOWS: SoWDraft[] = [
  {
    id: "demo-1", sowRef: "FS-SOW-2026-001", clientName: "GreenLeaf Organics", brandName: "GreenLeaf", buyerName: "Priya Sharma, CMO", salesDri: "Deepak N.", selectedTierKey: "india", tierName: "India + Reliance", gmEnabled: true, mkEnabled: true, gmPlanType: "volume", mkPlanType: "brand", selectedGmTier: "vol_pro", selectedMkTier: "br_starter", discount: 10, upfront: 5, months: 12, netMonthly: 413750, annualValue: 4965000, currency: "INR", symbol: "₹", status: "accepted", createdAt: "2026-05-08T10:00:00Z", updatedAt: "2026-05-09T14:00:00Z",
  },
  {
    id: "demo-2", sowRef: "FS-SOW-2026-002", clientName: "BlueWave Tech", brandName: "BlueWave", buyerName: "Arun K., VP Marketing", salesDri: "Neha M.", selectedTierKey: "mea_t1", tierName: "MEA T1 · UAE + GCC", gmEnabled: true, mkEnabled: false, gmPlanType: "volume", mkPlanType: "brand", selectedGmTier: "vol_pro", selectedMkTier: "br_starter", discount: 5, upfront: 0, months: 12, netMonthly: 11446, annualValue: 137352, currency: "USD", symbol: "$", status: "sent", createdAt: "2026-05-10T09:00:00Z", updatedAt: "2026-05-10T09:00:00Z",
  },
  {
    id: "demo-3", sowRef: "FS-SOW-2026-003", clientName: "Spice Junction", brandName: "Spice Junction", buyerName: "Rahul P.", salesDri: "Deepak N.", selectedTierKey: "india", tierName: "India + Reliance", gmEnabled: true, mkEnabled: false, gmPlanType: "volume", mkPlanType: "brand", selectedGmTier: "vol_pro", selectedMkTier: "br_starter", discount: 10, upfront: 5, months: 12, netMonthly: 213750, annualValue: 2565000, currency: "INR", symbol: "₹", status: "draft", createdAt: "2026-05-12T11:00:00Z", updatedAt: "2026-05-12T11:00:00Z",
  },
  {
    id: "demo-4", sowRef: "FS-SOW-2026-004", clientName: "FreshBrew", brandName: "FreshBrew Tea", buyerName: "Meera S.", salesDri: "Sandeep N.", selectedTierKey: "sea_t1", tierName: "SEA T1 · Singapore", gmEnabled: false, mkEnabled: true, gmPlanType: "volume", mkPlanType: "brand", selectedGmTier: "vol_starter", selectedMkTier: "br_pro", discount: 15, upfront: 10, months: 6, netMonthly: 25094, annualValue: 150563, currency: "USD", symbol: "$", status: "rejected", createdAt: "2026-05-05T08:00:00Z", updatedAt: "2026-05-07T16:00:00Z",
  },
];

type SortKey = "sowRef" | "clientName" | "tierName" | "netMonthly" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const STATUS_ORDER: Record<string, number> = {
  draft: 0, sent: 1, accepted: 2, rejected: 3, expired: 4,
};

type Props = {
  version: RateCardVersion;
  tiers: RateCardTier[];
  items: RateCardItem[];
};

export function SoWListClient({ version, tiers, items }: Props) {
  const [view, setView] = useState<"list" | "builder">("list");
  const [sows, setSows] = useState<SoWDraft[]>(DEMO_SOWS);
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

  // Load saved drafts from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sow_drafts");
      if (saved) {
        const parsed = JSON.parse(saved) as SoWDraft[];
        setSows([...parsed, ...DEMO_SOWS]);
      }
    } catch {}
  }, []);

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
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 mb-3 shrink-0">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setView("list")}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to SoW list
          </Button>
        </div>
        <SoWBuilderClient version={version} tiers={tiers} items={items} />
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
        <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5" onClick={() => setView("builder")}>
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
                  <div className="flex items-center gap-1 justify-end">
                    {sow.status === "draft" && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-primary gap-1" onClick={() => setView("builder")}>
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-foreground/70 hover:text-foreground gap-1" onClick={() => {
                      const newId = `dup-${Date.now()}`;
                      const newRef = `FS-SOW-${new Date().getFullYear()}-${String(sows.length + 1).padStart(3, "0")}`;
                      const duplicate: SoWDraft = {
                        ...sow,
                        id: newId,
                        sowRef: newRef,
                        status: "draft",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                      };
                      setSows((prev) => [duplicate, ...prev]);
                      toast.success(`Duplicated as ${newRef}`);
                    }}>
                      <Copy className="h-3 w-3" />
                      Duplicate
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-foreground/70 hover:text-foreground gap-1" onClick={() => {
                      const printWindow = window.open("", "_blank");
                      if (!printWindow) { toast.error("Pop-up blocked"); return; }
                      const services = [sow.gmEnabled ? "Gen Media" : "", sow.mkEnabled ? "Marketing" : ""].filter(Boolean).join(" + ");
                      printWindow.document.write(`
                        <html><head><title>${sow.sowRef}</title>
                        <style>body{font-family:system-ui,sans-serif;padding:40px;color:#1a1a1a}
                        h1{font-size:24px;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:16px 0}
                        td,th{border:1px solid #ddd;padding:8px 12px;text-align:left;font-size:13px}
                        th{background:#f5f5f5;font-weight:600}.amt{font-size:20px;font-weight:800;color:#059669}
                        .meta{color:#666;font-size:12px}</style></head><body>
                        <h1>FYND STUDIO</h1><p class="meta">Statement of Work</p><hr/>
                        <table><tr><th>Ref</th><td>${sow.sowRef}</td></tr>
                        <tr><th>Client</th><td>${sow.clientName}</td></tr>
                        <tr><th>Brand</th><td>${sow.brandName}</td></tr>
                        <tr><th>Buyer</th><td>${sow.buyerName}</td></tr>
                        <tr><th>Sales DRI</th><td>${sow.salesDri}</td></tr>
                        <tr><th>Market / Tier</th><td>${sow.tierName}</td></tr>
                        <tr><th>Services</th><td>${services}</td></tr>
                        <tr><th>Status</th><td>${sow.status.charAt(0).toUpperCase() + sow.status.slice(1)}</td></tr>
                        <tr><th>Created</th><td>${new Date(sow.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</td></tr></table>
                        <h2>Commercials</h2>
                        <table><tr><th>Net Monthly</th><td class="amt">${fmtPrice(sow.netMonthly, sow.symbol)}/mo</td></tr>
                        <tr><th>Annual Value</th><td class="amt">${fmtPrice(sow.annualValue, sow.symbol)}</td></tr>
                        <tr><th>Discount</th><td>${sow.discount}%</td></tr>
                        <tr><th>Upfront</th><td>${sow.upfront}%</td></tr>
                        <tr><th>Term</th><td>${sow.months} months</td></tr>
                        <tr><th>Currency</th><td>${sow.currency} (${sow.symbol})</td></tr></table>
                        <p class="meta" style="margin-top:32px">Generated by Fynd Studio · ${new Date().toLocaleDateString()}</p>
                        </body></html>`);
                      printWindow.document.close();
                      setTimeout(() => printWindow.print(), 300);
                    }}>
                      <Printer className="h-3 w-3" />
                      PDF
                    </Button>
                  </div>
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
