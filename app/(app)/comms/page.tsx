import { connection } from "next/server";
import { MessageSquareText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { CommsShell } from "@/components/modules/comms/CommsShell";
import { getConversations } from "@/app/(app)/comms/actions";
import { getClients } from "@/app/(app)/tasks/actions";

export default async function CommsPage() {
  await connection();
  const [initialConversations, initialClients] = await Promise.all([
    getConversations().catch(() => []),
    getClients().catch(() => []),
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquareText className="size-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight text-balance">Comms</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          All client conversations in one place. Email, Slack, WhatsApp — unified.
        </p>
      </div>
      <Separator className="mb-4 shrink-0" />
      <div className="min-h-0 flex-1 overflow-hidden">
        <CommsShell initialConversations={initialConversations} initialClients={initialClients} />
      </div>
    </div>
  );
}
