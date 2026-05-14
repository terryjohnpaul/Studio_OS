import { Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { getCurrentMember } from "@/lib/auth/getCurrentMember";

async function SidebarWithRole() {
  const member = await getCurrentMember();
  return <AppSidebar role={member?.role || "member"} isManager={member?.is_manager || member?.role === "owner"} />;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen overflow-hidden bg-background">
        <Suspense fallback={<div className="w-14 border-r bg-sidebar" />}>
          <SidebarWithRole />
        </Suspense>
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppTopbar />
          <main className="flex-1 overflow-hidden p-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
