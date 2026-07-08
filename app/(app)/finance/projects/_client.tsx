"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, BarChart3, AlertTriangle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ProjectFinancial } from "@/lib/types/finance";
import { formatINR } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

function getMarginColor(margin: number) {
  if (margin > 20) return "bg-emerald-50 dark:bg-emerald-950/20";
  if (margin >= 0) return "bg-amber-50 dark:bg-amber-950/20";
  return "bg-red-50 dark:bg-red-950/20";
}

function getMarginBarColor(margin: number) {
  if (margin > 20) return "#059669";
  if (margin >= 0) return "#f59e0b";
  return "#ef4444";
}

export function ProjectFinancialsClient({ initialData }: { initialData: ProjectFinancial[] }) {
  const [projects, setProjects] = useState<ProjectFinancial[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterProfit, setFilterProfit] = useState("all");

  const filtered = projects.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.project_title.toLowerCase().includes(q) && !(p.client_name ?? "").toLowerCase().includes(q))
        return false;
    }
    if (filterProfit === "profitable" && p.margin_percent <= 0) return false;
    if (filterProfit === "at_risk" && (p.margin_percent <= 0 || p.margin_percent > 20)) return false;
    if (filterProfit === "loss" && p.margin_percent >= 0) return false;
    return true;
  });

  // Budget utilization chart data
  const chartData = projects.slice(0, 10).map((p) => ({
    name: p.project_title.length > 18 ? p.project_title.slice(0, 17) + "…" : p.project_title,
    budget: p.budget,
    spent: p.spent,
    fill: getMarginBarColor(p.margin_percent),
  }));

  // Summary stats
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spent, 0);
  const avgMargin = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.margin_percent, 0) / projects.length * 10) / 10
    : 0;
  const atRiskCount = projects.filter((p) => p.margin_percent < 20 && p.margin_percent >= 0).length;

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground font-medium">Total Budget</p>
            <p className="text-lg font-bold">{formatINR(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground font-medium">Total Spent</p>
            <p className="text-lg font-bold">{formatINR(totalSpent)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground font-medium">Avg Margin</p>
            <p className={cn("text-lg font-bold", avgMargin >= 0 ? "text-emerald-600" : "text-red-600")}>
              {avgMargin}%
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <div>
              <p className="text-[10px] text-muted-foreground font-medium">At Risk</p>
              <p className="text-lg font-bold">{atRiskCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Utilization Chart */}
      {chartData.length > 0 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget Utilization</CardTitle>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 10, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <RechartsTooltip contentStyle={{ fontSize: 12 }}
                  formatter={(v) => [formatINR(Number(v)), ""]} />
                <Bar dataKey="budget" fill="#e5e7eb" radius={[0, 4, 4, 0]} name="Budget" />
                <Bar dataKey="spent" radius={[0, 4, 4, 0]} name="Spent">
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..." className="h-8 pl-8 text-sm" />
        </div>
        <Select value={filterProfit} onValueChange={setFilterProfit}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Profitability" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            <SelectItem value="profitable">Profitable (&gt;20%)</SelectItem>
            <SelectItem value="at_risk">At Risk (0-20%)</SelectItem>
            <SelectItem value="loss">Loss-making</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Profitability Table */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border py-16 text-center text-muted-foreground">
          <BarChart3 className="h-10 w-10 mx-auto mb-3" />
          <p className="text-sm font-medium">No projects with budgets</p>
          <p className="text-xs mt-1">Set a budget (₹) on your Kanban task cards to track project financials</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Spent</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead>Margin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>POs</TableHead>
                <TableHead>Expenses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.project_id} className={getMarginColor(p.margin_percent)}>
                  <TableCell className="font-medium text-sm max-w-[180px] truncate">{p.project_title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.client_name || "—"}</TableCell>
                  <TableCell className="text-sm">{formatINR(p.budget)}</TableCell>
                  <TableCell className="text-sm">{formatINR(p.spent)}</TableCell>
                  <TableCell className={cn("text-sm font-medium", p.variance >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {p.variance >= 0 ? "+" : ""}{formatINR(p.variance)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn("text-[10px]",
                      p.margin_percent > 20 ? "bg-emerald-100 text-emerald-700" :
                      p.margin_percent >= 0 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    )}>
                      {p.margin_percent}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-center">{p.po_count}</TableCell>
                  <TableCell className="text-xs text-center">{p.expense_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
