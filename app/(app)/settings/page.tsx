import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentMember } from "@/lib/auth/getCurrentMember";
import { Settings, User, Palette, Shield, Plug2, Cable } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import Link from "next/link";

async function SettingsContent() {
  await connection();
  const member = await getCurrentMember();
  const isOwner = member?.role === "owner";

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and workspace.
        </p>
      </div>
      <Separator className="mb-6" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/settings/profile" className="group">
          <Card className="transition-colors group-hover:border-primary/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Profile</CardTitle>
              </div>
              <CardDescription>
                Manage your name, avatar, and personal details.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Card className="opacity-50 cursor-not-allowed">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Preferences</CardTitle>
            </div>
            <CardDescription>
              Customize theme, notifications, and display options.
            </CardDescription>
          </CardHeader>
        </Card>

        <Link href="/settings/integrations" className="group">
          <Card className="transition-colors group-hover:border-primary/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Cable className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Integrations</CardTitle>
              </div>
              <CardDescription>
                Connect Gmail, Slack, and WhatsApp channels.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/settings/connectors" className="group">
          <Card className="transition-colors group-hover:border-primary/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Plug2 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">Connectors</CardTitle>
              </div>
              <CardDescription>
                Manage Open Claw and agent access.
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {isOwner && (
          <Link href="/settings/members" className="group">
            <Card className="transition-colors group-hover:border-primary/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-base">Admin Panel</CardTitle>
                </div>
                <CardDescription>
                  Manage members, roles, and workspace access.
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-full">
          <div className="mb-4 space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Separator className="mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
