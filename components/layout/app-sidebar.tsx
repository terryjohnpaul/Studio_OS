"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  MessageSquareText,
  ListChecks,
  DollarSign,
  LayoutDashboard,
  Settings,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MemberRole } from "@/lib/types/members";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  minRole?: MemberRole[]; // roles that can see this item
  requireManager?: boolean; // only visible to managers
};

const navItems: NavItem[] = [
  { href: "/command-centre", label: "Command Centre", icon: LayoutDashboard },
  { href: "/tasks", label: "Task Management", icon: ListChecks },
  { href: "/finance", label: "Finance", icon: DollarSign, minRole: ["owner", "admin", "member"] },
  { href: "/comms", label: "Comms", icon: MessageSquareText, minRole: ["owner", "admin", "member"], requireManager: true },
  { href: "/clients", label: "Clients", icon: Users, minRole: ["owner", "admin", "member"] },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const handleMouseEnter = useCallback(() => {
    router.prefetch(href);
  }, [router, href]);

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          prefetch={true}
          onMouseEnter={handleMouseEnter}
          className={cn(
            "flex items-center rounded-lg text-sm transition-colors",
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
            active
              ? "bg-primary text-primary-foreground font-medium shadow-sm"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary-foreground")} />
          {!collapsed && <span className="truncate">{label}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className={collapsed ? "" : "lg:hidden"}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function AppSidebar({ role = "member", isManager = false }: { role?: MemberRole; isManager?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const visibleItems = navItems.filter(
    (item) =>
      (!item.minRole || item.minRole.includes(role)) &&
      (!item.requireManager || isManager)
  );

  return (
    <aside className={cn("flex h-full flex-col border-r border-r-primary/15 bg-sidebar transition-all duration-200", collapsed ? "w-14" : "w-56")}>
      {/* Brand header */}
      <div className={cn("flex h-14 items-center", collapsed ? "justify-center px-2" : "px-5")}>
        <Link
          href="/tasks"
          className="flex items-center gap-2 text-sm font-bold tracking-tight text-foreground"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-xs font-bold shrink-0">
            F
          </span>
          {!collapsed && <span>Fynd Studio</span>}
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn("flex flex-1 flex-col pt-2", collapsed ? "px-1.5" : "px-3")}>
        <div className="flex flex-col gap-1">
          {visibleItems.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}
        </div>

        {/* Bottom section */}
        <div className="mt-auto pb-3">
          <Separator className="mb-2" />
          <NavLink
            href="/settings"
            label="Settings"
            icon={Settings}
            active={pathname.startsWith("/settings")}
            collapsed={collapsed}
          />
          <button
            onClick={toggle}
            className={cn(
              "flex items-center rounded-lg text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors mt-1 w-full",
              collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span className="text-xs">Collapse</span>}
          </button>
        </div>
      </nav>
    </aside>
  );
}
