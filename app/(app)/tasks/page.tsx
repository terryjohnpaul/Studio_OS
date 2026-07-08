import { connection } from "next/server";
import { KanbanShell } from "@/components/modules/tasks/kanban/KanbanShell";
import { BoardQuote } from "@/components/modules/tasks/kanban/BoardQuote";
import { getClients, getProjects, getProfiles } from "@/app/(app)/tasks/actions";

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await connection();
  const [clients, projects, profiles, params] = await Promise.all([
    getClients().catch(() => []),
    getProjects().catch(() => []),
    getProfiles().catch(() => []),
    searchParams,
  ]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <KanbanShell
          initialClients={clients ?? []}
          initialProjects={projects ?? []}
          initialProfiles={profiles ?? []}
          initialFilterParams={params}
        />
      </div>
      <div className="-mx-6 -mb-6 shrink-0 border-t bg-card px-6 pb-3 pt-2">
        <div className="flex min-h-9 items-center justify-center">
          <BoardQuote />
        </div>
      </div>
    </div>
  );
}
