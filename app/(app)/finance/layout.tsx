"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { DollarSign } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const tabs = [
  { href: "/finance", label: "Overview", exact: true },
  { href: "/finance/purchase-orders", label: "Purchase Orders" },
  { href: "/finance/expenses", label: "Expenses" },
  { href: "/finance/projects", label: "Project Financials" },
  { href: "/finance/invoices", label: "Invoices" },
  { href: "/finance/rate-card", label: "Rate Card" },
  { href: "/finance/sow-builder", label: "SoW Builder" },
];

function TabFallback() {
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-200">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-8 w-[140px] rounded-lg" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="h-5 w-5" />
        <h1 className="text-xl font-bold tracking-tight">Finance</h1>
      </div>

      {/* Tab Navigation */}
      <nav className="flex items-center gap-1 border-b mb-4 -mx-1 px-1">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={true}
              className={cn(
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <Suspense fallback={<TabFallback />}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}
