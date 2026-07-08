"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember, requireWriteAccess } from "@/lib/auth/getCurrentMember";
import { revalidatePath } from "next/cache";
import type { TaskPriority } from "@/lib/types/tasks";
import { getClientOptions, getActiveMembers, generateSignedUrls, isCompletionColumn } from "@/lib/data/shared-lookups";

// ─── Clients ─────────────────────────────────────────────────────────────────

export async function getClients() {
  return getClientOptions();
}

// createClientSimple REMOVED — client creation must go through /clients page or /api/v1/upsert-client.
// Client is the master entity. No silent creation from task flows.

// ─── Projects (Boards) ─────────────────────────────────────────────────────

export async function getProjects(clientId?: string, status?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("projects")
    .select("*, clients(name)")
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createProject(opts: {
  name: string;
  description?: string | null;
  client_id?: string | null;
  due_date?: string | null;
}) {
  const supabase = await createClient();

  if (!opts.name?.trim()) throw new Error("Board name is required");

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: opts.name.trim(),
      client_id: opts.client_id || null,
      description: opts.description?.trim() || null,
      status: "active",
      due_date: opts.due_date || null,
    })
    .select()
    .single();
  if (error) throw error;

  // Auto-create default columns for the new board
  const defaultColumns = [
    "Intake / Backlog",
    "Ready",
    "In Progress",
    "Internal Review",
    "Client Review",
    "Revisions",
    "Approved / Done",
  ];
  const columnInserts = defaultColumns.map((colName, i) => ({
    project_id: data.id,
    name: colName,
    position: i * 1000,
  }));
  await supabase.from("project_columns").insert(columnInserts);

  revalidatePath("/tasks");
  return data;
}

export async function renameProject(projectId: string, name: string) {
  const supabase = await createClient();
  if (!name?.trim()) throw new Error("Board name is required");
  const { error } = await supabase
    .from("projects")
    .update({ name: name.trim() })
    .eq("id", projectId);
  if (error) throw error;
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);
  if (error) throw error;
  revalidatePath("/tasks");
}

// ─── Columns ─────────────────────────────────────────────────────────────────

export async function getColumns(projectId: string) {
  const supabase = await createClient();

  // Fetch columns and tasks in parallel (first wave)
  const [columnsRes, tasksRes, assigneesRes, membersRes] = await Promise.all([
    supabase
      .from("project_columns")
      .select("id, project_id, name, position, wip_limit, description, created_at")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("tasks")
      .select("id, project_id, column_id, client_id, work_stream_id, title, description, priority, due_date, cost, position, created_by, created_from_message_id, created_from_conversation_id, created_at, updated_at, manager_id, is_completed, completed_at, task_type")
      .eq("project_id", projectId)
      .order("position"),
    supabase
      .from("task_assignees")
      .select("task_id, user_id"),
    supabase
      .from("members")
      .select("id, full_name, avatar_url, clerk_id"),
  ]);
  if (columnsRes.error) throw columnsRes.error;
  if (tasksRes.error) throw tasksRes.error;

  // Build member lookup for assignee display
  const memberMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
  (membersRes.data || []).forEach((m) => {
    memberMap[m.id] = { full_name: m.full_name || "Unknown", avatar_url: m.avatar_url };
    if (m.clerk_id) memberMap[m.clerk_id] = { full_name: m.full_name || "Unknown", avatar_url: m.avatar_url };
  });

  // Group assignees by task
  const taskAssignees: Record<string, { task_id: string; user_id: string; profiles?: { full_name: string; avatar_url: string | null; avatar_color: string | null } }[]> = {};
  (assigneesRes.data || []).forEach((a) => {
    if (!taskAssignees[a.task_id]) taskAssignees[a.task_id] = [];
    const member = memberMap[a.user_id];
    taskAssignees[a.task_id].push({
      task_id: a.task_id,
      user_id: a.user_id,
      profiles: member ? { full_name: member.full_name, avatar_url: member.avatar_url, avatar_color: null } : undefined,
    });
  });

  const columns = columnsRes.data || [];
  const tasks = tasksRes.data || [];

  // Collect IDs needed for second wave
  const clientIds = [...new Set(tasks.map((t) => t.client_id).filter(Boolean) as string[])];
  const workStreamIds = [...new Set(tasks.map((t) => t.work_stream_id).filter(Boolean) as string[])];
  const taskIds = tasks.map((t) => t.id);

  // Second wave — clients, work streams + all counts in parallel
  const [clientsRes, workStreamsRes, commentsRes, attachmentsRes, linksRes, relationsRes, subtasksRes] = await Promise.all([
    clientIds.length > 0
      ? supabase.from("clients").select("id, name").in("id", clientIds)
      : { data: [] as { id: string; name: string }[] },
    workStreamIds.length > 0
      ? supabase.from("work_streams").select("id, name").in("id", workStreamIds)
      : { data: [] as { id: string; name: string }[] },
    taskIds.length > 0
      ? supabase.from("task_comments").select("task_id").in("task_id", taskIds)
      : { data: [] as { task_id: string }[] },
    taskIds.length > 0
      ? supabase.from("task_attachments").select("task_id").in("task_id", taskIds)
      : { data: [] as { task_id: string }[] },
    taskIds.length > 0
      ? supabase.from("task_links").select("task_id").in("task_id", taskIds)
      : { data: [] as { task_id: string }[] },
    taskIds.length > 0
      ? supabase.from("card_relations").select("from_card_id, to_card_id").or(`from_card_id.in.(${taskIds.join(",")}),to_card_id.in.(${taskIds.join(",")})`)
      : { data: [] as { from_card_id: string; to_card_id: string }[] },
    taskIds.length > 0
      ? supabase.from("subtasks").select("id, task_id, title, completed, position").in("task_id", taskIds).order("position")
      : { data: [] as { id: string; task_id: string; title: string; completed: boolean; position: number }[] },
  ]);

  const clientMap: Record<string, string> = {};
  ((clientsRes as { data: { id: string; name: string }[] }).data || []).forEach((c) => {
    clientMap[c.id] = c.name;
  });

  const workStreamMap: Record<string, string> = {};
  ((workStreamsRes as { data: { id: string; name: string }[] }).data || []).forEach((w) => {
    workStreamMap[w.id] = w.name;
  });

  const commentCounts: Record<string, number> = {};
  ((commentsRes as { data: { task_id: string }[] }).data || []).forEach((c) => {
    commentCounts[c.task_id] = (commentCounts[c.task_id] || 0) + 1;
  });

  const attachmentCounts: Record<string, number> = {};
  ((attachmentsRes as { data: { task_id: string }[] }).data || []).forEach((a) => {
    attachmentCounts[a.task_id] = (attachmentCounts[a.task_id] || 0) + 1;
  });

  const linkCounts: Record<string, number> = {};
  ((linksRes as { data: { task_id: string }[] }).data || []).forEach((l) => {
    linkCounts[l.task_id] = (linkCounts[l.task_id] || 0) + 1;
  });

  const relationCounts: Record<string, number> = {};
  ((relationsRes as { data: { from_card_id: string; to_card_id: string }[] }).data || []).forEach((r) => {
    relationCounts[r.from_card_id] = (relationCounts[r.from_card_id] || 0) + 1;
    relationCounts[r.to_card_id] = (relationCounts[r.to_card_id] || 0) + 1;
  });

  // Group subtasks by task
  const subtasksByTask: Record<string, { id: string; title: string; completed: boolean }[]> = {};
  ((subtasksRes as { data: { id: string; task_id: string; title: string; completed: boolean; position: number }[] }).data || []).forEach((s) => {
    if (!subtasksByTask[s.task_id]) subtasksByTask[s.task_id] = [];
    subtasksByTask[s.task_id].push({ id: s.id, title: s.title, completed: s.completed });
  });

  // Nest tasks under columns
  return columns.map((col) => ({
    ...col,
    tasks: tasks
      .filter((t) => t.column_id === col.id)
      .map((t) => ({
        ...t,
        assignees: taskAssignees[t.id] || [],
        client_name: t.client_id ? clientMap[t.client_id] ?? null : null,
        manager_name: t.manager_id ? memberMap[t.manager_id]?.full_name ?? null : null,
        work_stream_name: t.work_stream_id ? workStreamMap[t.work_stream_id] ?? null : null,
        comments_count: commentCounts[t.id] || 0,
        attachments_count: attachmentCounts[t.id] || 0,
        links_count: linkCounts[t.id] || 0,
        relations_count: relationCounts[t.id] || 0,
        subtasks: subtasksByTask[t.id] || [],
      })),
  }));
}

export async function createColumn(projectId: string, name: string) {
  const supabase = await createClient();
  // Get max position
  const { data: existing } = await supabase
    .from("project_columns")
    .select("position")
    .eq("project_id", projectId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = existing && existing.length > 0 ? existing[0].position + 1000 : 0;

  const { data, error } = await supabase
    .from("project_columns")
    .insert({ project_id: projectId, name, position: nextPos })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateColumn(columnId: string, name: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_columns")
    .update({ name })
    .eq("id", columnId);
  if (error) throw error;
}

export async function deleteColumn(columnId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_columns")
    .delete()
    .eq("id", columnId);
  if (error) throw error;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function createTask(
  projectId: string,
  columnId: string,
  title: string,
  opts: { priority?: TaskPriority; due_date?: string | null; client_id: string; manager_id?: string | null }
) {
  const supabase = await createClient();

  // Get max position in column
  const { data: existing } = await supabase
    .from("tasks")
    .select("position")
    .eq("column_id", columnId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = existing && existing.length > 0 ? existing[0].position + 1000 : 0;

  const member = await getCurrentMember();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
      column_id: columnId,
      title,
      position: nextPos,
      created_by: member?.id ?? null,
      client_id: opts.client_id,
      manager_id: opts.manager_id || null,
      ...(opts.priority ? { priority: opts.priority } : {}),
      ...(opts.due_date ? { due_date: opts.due_date } : {}),
    })
    .select("*")
    .single();
  if (error) throw error;
  return { ...data, assignees: [], comments_count: 0, attachments_count: 0, links_count: 0 };
}

export async function updateTask(
  taskId: string,
  updates: {
    title?: string;
    description?: string | null;
    priority?: TaskPriority;
    due_date?: string | null;
    column_id?: string;
    cost?: number | null;
    client_id?: string | null;
    manager_id?: string | null;
    task_type?: "paid" | "free";
  }
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(taskId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

export async function moveTask(
  taskId: string,
  newColumnId: string,
  newPosition: number
) {
  const supabase = await createClient();

  const { data: col } = await supabase.from("project_columns").select("name").eq("id", newColumnId).single();
  const isDone = isCompletionColumn(col?.name || "");

  if (isDone) {
    const { count } = await supabase.from("task_links").select("id", { count: "exact", head: true }).eq("task_id", taskId);
    if (!count || count === 0) {
      throw new Error("Please add at least one Final Output link before marking this task as Done.");
    }
  }

  const { error } = await supabase.rpc("move_task", {
    p_task_id: taskId,
    p_new_column_id: newColumnId,
    p_new_position: newPosition,
  });
  if (error) throw error;

  await supabase.from("tasks").update({
    is_completed: isDone,
    completed_at: isDone ? new Date().toISOString() : null,
  }).eq("id", taskId);
}

// ─── Task Detail ─────────────────────────────────────────────────────────────

export async function getTaskDetail(taskId: string) {
  const supabase = await createClient();

  // Single wave — all 7 queries in parallel
  const [taskRes, assigneesRes, membersRes, commentsRes, attachmentsRes, linksRes, tagsRes, outputsRes] = await Promise.all([
    supabase.from("tasks").select("id, project_id, column_id, client_id, work_stream_id, title, description, priority, due_date, cost, position, created_by, created_from_message_id, created_from_conversation_id, created_at, updated_at, manager_id, is_completed, completed_at, task_type").eq("id", taskId).single(),
    supabase.from("task_assignees").select("task_id, user_id").eq("task_id", taskId),
    supabase.from("members").select("id, full_name, avatar_url, clerk_id"),
    supabase.from("task_comments").select("id, task_id, author_id, body, created_at").eq("task_id", taskId).order("created_at").limit(100),
    supabase.from("task_attachments").select("id, task_id, storage_path, file_name, created_at").eq("task_id", taskId).order("created_at").limit(50),
    supabase.from("task_links").select("id, task_id, url, label, created_at").eq("task_id", taskId).order("created_at").limit(50),
    supabase.from("task_tags").select("tag_id, tags(id, name, color)").eq("task_id", taskId),
    supabase.from("task_outputs").select("id, task_id, storage_path, file_name, created_at").eq("task_id", taskId).order("created_at").limit(50),
  ]);
  if (taskRes.error) throw taskRes.error;
  const task = taskRes.data;

  // Build member lookup
  const memberMap: Record<string, { full_name: string; avatar_url: string | null }> = {};
  (membersRes.data || []).forEach((m) => {
    memberMap[m.id] = { full_name: m.full_name || "Unknown", avatar_url: m.avatar_url };
    if (m.clerk_id) memberMap[m.clerk_id] = { full_name: m.full_name || "Unknown", avatar_url: m.avatar_url };
  });

  const assignees = (assigneesRes.data || []).map((a) => {
    const member = memberMap[a.user_id];
    return {
      task_id: a.task_id,
      user_id: a.user_id,
      profiles: member ? { full_name: member.full_name, avatar_url: member.avatar_url, avatar_color: null } : undefined,
    };
  });

  // Generate signed URLs for attachments in parallel
  const attachments = await Promise.all(
    (attachmentsRes.data || []).map(async (att) => {
      const { data: urlData } = await supabase.storage
        .from("task-attachments")
        .createSignedUrl(att.storage_path, 3600);
      return { ...att, url: urlData?.signedUrl || "" };
    })
  );

  // Enrich comments with author profile info
  const comments = (commentsRes.data || []).map((c) => {
    const author = c.author_id ? memberMap[c.author_id] : undefined;
    return {
      ...c,
      profiles: author
        ? { full_name: author.full_name, avatar_url: author.avatar_url, avatar_color: null as string | null }
        : undefined,
    };
  });

  // Extract tags
  const tags = (tagsRes.data || [])
    .map((tt: Record<string, unknown>) => tt.tags as { id: string; name: string; color: string } | null)
    .filter((t): t is { id: string; name: string; color: string } => t !== null);

  // Generate signed URLs for outputs
  const outputs = await Promise.all(
    (outputsRes.data || []).map(async (o) => {
      const { data: urlData } = await supabase.storage
        .from("task-attachments")
        .createSignedUrl(o.storage_path, 3600);
      return { ...o, url: urlData?.signedUrl || "" };
    })
  );

  return {
    ...task,
    assignees,
    manager_name: task.manager_id ? memberMap[task.manager_id]?.full_name ?? null : null,
    comments,
    attachments,
    links: linksRes.data || [],
    tags,
    outputs,
  };
}

// ─── Assignees ───────────────────────────────────────────────────────────────

export async function getProfiles() {
  return getActiveMembers();
}

export async function addAssignee(taskId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_assignees")
    .insert({ task_id: taskId, user_id: userId });
  if (error && error.code !== "23505") throw error; // ignore duplicate
}

export async function removeAssignee(taskId: string, userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userId);
  if (error) throw error;
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addComment(taskId: string, body: string) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data, error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_id: member?.id ?? null, body })
    .select("id, task_id, author_id, body, created_at")
    .single();
  if (error) throw error;

  return {
    ...data,
    profiles: member
      ? { full_name: member.full_name || "Unknown", avatar_url: member.avatar_url || null, avatar_color: null as string | null }
      : undefined,
  };
}

export async function deleteComment(commentId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_comments")
    .delete()
    .eq("id", commentId);
  if (error) throw error;
}

// ─── Attachments ─────────────────────────────────────────────────────────────

export async function uploadAttachment(taskId: string, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop();
  const path = `${taskId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("task_attachments")
    .insert({ task_id: taskId, storage_path: path, file_name: file.name })
    .select()
    .single();
  if (error) throw error;

  const { data: urlData } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(path, 3600);

  return { ...data, url: urlData?.signedUrl || "" };
}

export async function deleteAttachment(attachmentId: string) {
  const supabase = await createClient();
  // Get the path first
  const { data: att } = await supabase
    .from("task_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .single();
  if (att) {
    await supabase.storage.from("task-attachments").remove([att.storage_path]);
  }
  const { error } = await supabase
    .from("task_attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) throw error;
}

// ─── Outputs ──────────────────────────────────────────────────────────────────

export async function uploadOutput(taskId: string, formData: FormData) {
  const supabase = await createClient();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop();
  const path = `outputs/${taskId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("task-attachments")
    .upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("task_outputs")
    .insert({ task_id: taskId, storage_path: path, file_name: file.name })
    .select()
    .single();
  if (error) throw error;

  const { data: urlData } = await supabase.storage
    .from("task-attachments")
    .createSignedUrl(path, 3600);

  return { ...data, url: urlData?.signedUrl || "" };
}

export async function deleteOutput(outputId: string) {
  const supabase = await createClient();
  const { data: out } = await supabase
    .from("task_outputs")
    .select("storage_path")
    .eq("id", outputId)
    .single();
  if (out) {
    await supabase.storage.from("task-attachments").remove([out.storage_path]);
  }
  const { error } = await supabase
    .from("task_outputs")
    .delete()
    .eq("id", outputId);
  if (error) throw error;
}

export async function getOutputsByClient(clientId: string) {
  const supabase = await createClient();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title")
    .eq("client_id", clientId);
  if (!tasks || tasks.length === 0) return { links: [], uploads: [] };

  const taskIds = tasks.map((t) => t.id);
  const taskNameMap: Record<string, string> = {};
  tasks.forEach((t) => { taskNameMap[t.id] = t.title; });

  const [linksRes, outputsRes] = await Promise.all([
    supabase.from("task_links").select("id, task_id, url, label, created_at").in("task_id", taskIds).order("created_at", { ascending: false }).limit(100),
    supabase.from("task_outputs").select("id, task_id, storage_path, file_name, created_at").in("task_id", taskIds).order("created_at", { ascending: false }).limit(50),
  ]);

  const links = (linksRes.data || []).map((l) => ({
    ...l,
    task_name: taskNameMap[l.task_id] || "Unknown task",
    type: "link" as const,
  }));

  const uploads = await Promise.all(
    (outputsRes.data || []).map(async (o) => {
      const { data: urlData } = await supabase.storage.from("task-attachments").createSignedUrl(o.storage_path, 3600);
      return { ...o, url: urlData?.signedUrl || "", task_name: taskNameMap[o.task_id] || "Unknown task", type: "upload" as const };
    })
  );

  return { links, uploads };
}

// ─── Links ───────────────────────────────────────────────────────────────────

export async function addLink(taskId: string, url: string, label: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_links")
    .insert({ task_id: taskId, url, label: label || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLink(linkId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("task_links")
    .delete()
    .eq("id", linkId);
  if (error) throw error;
}

// ─── Subtasks ─────────────────────────────────────────────────────────────────

export async function getSubtasksByTaskIds(taskIds: string[]) {
  if (taskIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subtasks")
    .select("id, task_id, title, completed, position")
    .in("task_id", taskIds)
    .order("position");
  if (error) throw error;
  return data;
}

export async function createSubtask(taskId: string, title: string) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("subtasks")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1);
  const nextPos = existing && existing.length > 0 ? existing[0].position + 1000 : 0;

  const { data, error } = await supabase
    .from("subtasks")
    .insert({ task_id: taskId, title, position: nextPos })
    .select("id, task_id, title, completed, position")
    .single();
  if (error) throw error;
  return data;
}

export async function updateSubtaskAction(
  subtaskId: string,
  updates: { title?: string; completed?: boolean }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("subtasks")
    .update(updates)
    .eq("id", subtaskId);
  if (error) throw error;
}

export async function deleteSubtask(subtaskId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("subtasks")
    .delete()
    .eq("id", subtaskId);
  if (error) throw error;
}

export async function reorderSubtasks(orderedIds: string[]) {
  const supabase = await createClient();
  const updates = orderedIds.map((id, i) =>
    supabase.from("subtasks").update({ position: i * 1000 }).eq("id", id)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// ─── Column Swap ────────────────────────────────────────────────────────────

export async function swapColumnPositions(
  colAId: string,
  posA: number,
  colBId: string,
  posB: number
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("swap_column_positions", {
    p_col_a: colAId,
    p_pos_a: posA,
    p_col_b: colBId,
    p_pos_b: posB,
  });
  if (error) throw error;
}

// ─── Column Meta ────────────────────────────────────────────────────────────

export async function updateColumnMeta(
  columnId: string,
  updates: { wip_limit?: number | null; description?: string | null }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_columns")
    .update(updates)
    .eq("id", columnId);
  if (error) throw error;
}

export async function seedDefaultColumns(projectId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("project_columns")
    .select("*", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (count && count > 0) return;

  const defaults = [
    "Intake / Backlog",
    "Ready",
    "In Progress",
    "Internal Review",
    "Client Review",
    "Revisions",
    "Approved / Done",
  ];
  const inserts = defaults.map((name, i) => ({
    project_id: projectId,
    name,
    position: i * 1000,
  }));
  await supabase.from("project_columns").insert(inserts);
}
