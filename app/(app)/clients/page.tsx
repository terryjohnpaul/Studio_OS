import { connection } from "next/server";
import { Users } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ClientsShell } from "@/components/modules/clients/ClientsShell";
import { getClientStats } from "@/app/(app)/clients/actions";

export default async function ClientsPage() {
  await connection();
  const initialClients = await getClientStats().catch(() => []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="size-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-balance">Clients</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Your client command centre. Every relationship, every detail, one place.
        </p>
      </div>
      <Separator className="mb-4 shrink-0" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <ClientsShell initialClients={initialClients} />
      </div>
    </div>
  );
}
