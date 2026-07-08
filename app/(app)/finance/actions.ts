"use server";

import { createClient } from "@/lib/supabase/server";
import { requireWriteAccess } from "@/lib/auth/getCurrentMember";
import type {
  Vendor,
  PurchaseOrder,
  POLineItem,
  Expense,
  Invoice,
  InvoiceLineItem,
  FinanceKPIs,
  ProjectFinancial,
  PaymentMethod,
  ExpenseStatus,
  POStatus,
} from "@/lib/types/finance";

// ─── Vendors ────────────────────────────────────────────────────────────────

export async function getVendors() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select("id, name, gst_number, contact_person, email, phone, payment_terms")
    .order("name")
    .limit(200);
  if (error) throw error;
  return (data || []) as Vendor[];
}

export async function createVendor(vendor: {
  name: string;
  gst_number?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  payment_terms?: string;
}) {
  await requireWriteAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .insert(vendor)
    .select()
    .single();
  if (error) throw error;
  return data as Vendor;
}

export async function updateVendor(id: string, updates: Partial<Vendor>) {
  await requireWriteAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("vendors").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteVendor(id: string) {
  await requireWriteAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("vendors").delete().eq("id", id);
  if (error) throw error;
}

// ─── Purchase Orders ────────────────────────────────────────────────────────

export async function getPurchaseOrders(filters?: {
  status?: string;
  vendor_id?: string;
  project_id?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("purchase_orders")
    .select("id, po_number, vendor_id, project_id, status, total_amount, currency, delivery_date, created_at, vendors(name), tasks(title)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.vendor_id) query = query.eq("vendor_id", filters.vendor_id);
  if (filters?.project_id) query = query.eq("project_id", filters.project_id);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((po: Record<string, unknown>) => ({
    ...po,
    vendor_name: (po.vendors as { name: string } | null)?.name ?? null,
    project_title: (po.tasks as { title: string } | null)?.title ?? null,
  })) as PurchaseOrder[];
}

export async function getPurchaseOrderDetail(poId: string) {
  const supabase = await createClient();

  const [poRes, itemsRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("*, vendors(name), tasks(title)")
      .eq("id", poId)
      .single(),
    supabase
      .from("po_line_items")
      .select("id, po_id, description, quantity, unit_price, tax_percent, discount_percent, line_total")
      .eq("po_id", poId)
      .order("created_at"),
  ]);

  if (poRes.error) throw poRes.error;

  const po = poRes.data as Record<string, unknown>;
  return {
    ...po,
    vendor_name: (po.vendors as { name: string } | null)?.name ?? null,
    project_title: (po.tasks as { title: string } | null)?.title ?? null,
    line_items: (itemsRes.data || []) as POLineItem[],
  } as PurchaseOrder;
}

export async function createPurchaseOrder(po: {
  vendor_id: string;
  project_id?: string | null;
  payment_terms?: string;
  delivery_date?: string | null;
  shipping_address?: string | null;
  notes?: string | null;
  line_items: { description: string; quantity: number; unit_price: number; tax_percent?: number }[];
  status?: POStatus;
}) {
  await requireWriteAccess();
  const supabase = await createClient();
  const userId = null; // Clerk IDs are strings, DB expects UUIDs — use null for now

  // Generate PO number
  const { data: poNumData } = await supabase.rpc("generate_po_number");
  const poNumber = poNumData || `PO-${new Date().toISOString().slice(0, 7).replace("-", "")}-001`;

  // Calculate totals
  let subtotal = 0;
  let taxTotal = 0;
  const items = po.line_items.map((item) => {
    const taxPct = item.tax_percent ?? 18;
    const lineSubtotal = item.quantity * item.unit_price;
    const lineTax = lineSubtotal * (taxPct / 100);
    const lineTotal = lineSubtotal + lineTax;
    subtotal += lineSubtotal;
    taxTotal += lineTax;
    return { ...item, tax_percent: taxPct, discount_percent: 0, line_total: lineTotal };
  });

  const totalAmount = subtotal + taxTotal;

  // Auto-approve if under 10,000
  const autoApprove = totalAmount < 10000;
  const status = autoApprove ? "approved" : (po.status || "draft");

  const { data: poData, error: poError } = await supabase
    .from("purchase_orders")
    .insert({
      po_number: poNumber,
      vendor_id: po.vendor_id,
      project_id: po.project_id || null,
      created_by: userId || null,
      status,
      subtotal,
      tax_amount: taxTotal,
      total_amount: totalAmount,
      payment_terms: po.payment_terms || "Net 30",
      delivery_date: po.delivery_date || null,
      shipping_address: po.shipping_address || null,
      notes: po.notes || null,
      approved_at: autoApprove ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (poError) throw poError;

  // Insert line items
  if (items.length > 0) {
    const lineInserts = items.map((item) => ({
      po_id: poData.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tax_percent: item.tax_percent,
      discount_percent: item.discount_percent,
      line_total: item.line_total,
      project_id: po.project_id || null,
    }));
    await supabase.from("po_line_items").insert(lineInserts);
  }

  return poData as PurchaseOrder;
}

export async function updatePOStatus(poId: string, status: POStatus) {
  await requireWriteAccess();
  const supabase = await createClient();
  const updates: Record<string, unknown> = { status };
  if (status === "approved") updates.approved_at = new Date().toISOString();
  if (status === "sent") updates.sent_at = new Date().toISOString();

  const { error } = await supabase
    .from("purchase_orders")
    .update(updates)
    .eq("id", poId);
  if (error) throw error;
}

export async function deletePurchaseOrder(poId: string) {
  await requireWriteAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("purchase_orders").delete().eq("id", poId);
  if (error) throw error;
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export async function getExpenses(filters?: {
  category?: string;
  project_id?: string;
  status?: string;
  payment_method?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from("expenses")
    .select("id, date, amount, category, sub_category, vendor_payee, payment_method, project_id, description, status, created_at, tasks(title)")
    .order("date", { ascending: false })
    .limit(500);

  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.project_id) query = query.eq("project_id", filters.project_id);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.payment_method) query = query.eq("payment_method", filters.payment_method);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((e: Record<string, unknown>) => ({
    ...e,
    project_title: (e.tasks as { title: string } | null)?.title ?? null,
  })) as Expense[];
}

export async function createExpense(expense: {
  date: string;
  amount: number;
  category: string;
  sub_category?: string | null;
  vendor_payee?: string | null;
  payment_method?: PaymentMethod;
  project_id?: string | null;
  description?: string | null;
  receipt_url?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  status?: ExpenseStatus;
}) {
  await requireWriteAccess();
  const supabase = await createClient();
  const userId = null; // Clerk IDs are strings, DB expects UUIDs — use null for now

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      ...expense,
      created_by: userId || null,
      status: expense.status || "approved",
    })
    .select("*, tasks(title)")
    .single();
  if (error) throw error;

  return {
    ...data,
    project_title: (data.tasks as { title: string } | null)?.title ?? null,
  } as Expense;
}

export async function updateExpense(id: string, updates: Partial<Expense>) {
  await requireWriteAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").update(updates).eq("id", id);
  if (error) throw error;
}

export async function deleteExpense(id: string) {
  await requireWriteAccess();
  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadExpenseReceipt(formData: FormData): Promise<string> {
  await requireWriteAccess();
  const supabase = await createClient();
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop();
  const path = `receipts/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("expense-receipts")
    .upload(path, file);
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from("expense-receipts").getPublicUrl(path);
  return data.publicUrl;
}

// ─── Invoices ───────────────────────────────────────────────────────────────

export async function getInvoices(filters?: { type?: string; status?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("invoices")
    .select("id, invoice_number, type, client_vendor_name, project_id, status, subtotal, tax_amount, total_amount, due_date, created_at, tasks(title)")
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters?.type) query = query.eq("type", filters.type);
  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((inv: Record<string, unknown>) => ({
    ...inv,
    project_title: (inv.tasks as { title: string } | null)?.title ?? null,
  })) as Invoice[];
}

export async function createInvoice(invoice: {
  type: "receivable" | "payable";
  client_vendor_name: string;
  project_id?: string | null;
  line_items: InvoiceLineItem[];
  due_date?: string | null;
  notes?: string | null;
}) {
  await requireWriteAccess();
  const supabase = await createClient();

  const { data: invNum } = await supabase.rpc("generate_invoice_number");
  const invoiceNumber = invNum || `INV-${new Date().toISOString().slice(0, 7).replace("-", "")}-001`;

  const subtotal = invoice.line_items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const taxAmount = invoice.line_items.reduce(
    (sum, item) => sum + item.quantity * item.rate * (item.tax_percent / 100),
    0
  );

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      type: invoice.type,
      client_vendor_name: invoice.client_vendor_name,
      project_id: invoice.project_id || null,
      line_items: invoice.line_items,
      subtotal,
      tax_amount: taxAmount,
      total_amount: subtotal + taxAmount,
      due_date: invoice.due_date || null,
      notes: invoice.notes || null,
      status: "draft",
    })
    .select()
    .single();
  if (error) throw error;
  return data as Invoice;
}

export async function updateInvoiceStatus(id: string, status: string, paymentRef?: string) {
  await requireWriteAccess();
  const supabase = await createClient();
  const updates: Record<string, unknown> = { status };
  if (status === "paid") {
    updates.paid_date = new Date().toISOString().split("T")[0];
    if (paymentRef) updates.payment_reference = paymentRef;
  }
  const { error } = await supabase.from("invoices").update(updates).eq("id", id);
  if (error) throw error;
}

// ─── Finance Overview KPIs ──────────────────────────────────────────────────

export async function getFinanceKPIs(): Promise<FinanceKPIs> {
  const supabase = await createClient();

  const [revenueRes, expenseRes, receivableRes, payableRes, budgetRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("total_amount")
      .eq("type", "receivable")
      .eq("status", "paid"),
    supabase.from("expenses").select("amount, date"),
    supabase
      .from("invoices")
      .select("total_amount")
      .eq("type", "receivable")
      .not("status", "in", '("paid","cancelled","draft")'),
    supabase
      .from("purchase_orders")
      .select("total_amount")
      .not("status", "in", '("completed","cancelled","draft")'),
    // Pull total project budgets from Kanban tasks
    supabase
      .from("tasks")
      .select("cost")
      .not("cost", "is", null)
      .gt("cost", 0),
  ]);

  const totalRevenue = (revenueRes.data || []).reduce((s, r) => s + Number(r.total_amount), 0);
  const totalBudget = (budgetRes.data || []).reduce((s, t) => s + Number(t.cost), 0);
  const totalExpenses = (expenseRes.data || []).reduce((s, e) => s + Number(e.amount), 0);
  const outstandingReceivables = (receivableRes.data || []).reduce((s, r) => s + Number(r.total_amount), 0);
  const outstandingPayables = (payableRes.data || []).reduce((s, p) => s + Number(p.total_amount), 0);

  return {
    totalRevenue,
    totalExpenses,
    netProfit: totalRevenue - totalExpenses,
    outstandingReceivables,
    outstandingPayables,
    revenueChange: 0,
    expenseChange: 0,
    totalBudget,
    projectCount: (budgetRes.data || []).length,
  };
}

// ─── Project Financials ─────────────────────────────────────────────────────

export async function getProjectFinancials(): Promise<ProjectFinancial[]> {
  const supabase = await createClient();

  // Get all tasks with budgets
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, cost, column_id, client_id, clients(name), project_columns(name)")
    .not("cost", "is", null)
    .gt("cost", 0);

  if (tasksError) throw tasksError;
  if (!tasks || tasks.length === 0) return [];

  const taskIds = tasks.map((t) => t.id);

  // Get expenses and POs for these tasks
  const [expensesRes, posRes] = await Promise.all([
    supabase
      .from("expenses")
      .select("project_id, amount")
      .in("project_id", taskIds),
    supabase
      .from("purchase_orders")
      .select("project_id, total_amount")
      .in("project_id", taskIds)
      .not("status", "eq", "cancelled"),
  ]);

  // Aggregate spend per project
  const spendMap: Record<string, { expenses: number; poTotal: number; expCount: number; poCount: number }> = {};
  (expensesRes.data || []).forEach((e) => {
    if (!e.project_id) return;
    if (!spendMap[e.project_id]) spendMap[e.project_id] = { expenses: 0, poTotal: 0, expCount: 0, poCount: 0 };
    spendMap[e.project_id].expenses += Number(e.amount);
    spendMap[e.project_id].expCount++;
  });
  (posRes.data || []).forEach((p) => {
    if (!p.project_id) return;
    if (!spendMap[p.project_id]) spendMap[p.project_id] = { expenses: 0, poTotal: 0, expCount: 0, poCount: 0 };
    spendMap[p.project_id].poTotal += Number(p.total_amount);
    spendMap[p.project_id].poCount++;
  });

  return tasks.map((t: Record<string, unknown>) => {
    const budget = Number(t.cost) || 0;
    const spend = spendMap[t.id as string] || { expenses: 0, poTotal: 0, expCount: 0, poCount: 0 };
    const totalSpent = spend.expenses + spend.poTotal;
    const variance = budget - totalSpent;
    const margin = budget > 0 ? (variance / budget) * 100 : 0;

    return {
      project_id: t.id as string,
      project_title: t.title as string,
      client_name: (t.clients as { name: string } | null)?.name ?? null,
      budget,
      spent: totalSpent,
      variance,
      margin_percent: Math.round(margin * 10) / 10,
      status: (t.project_columns as { name: string } | null)?.name ?? "Unknown",
      po_count: spend.poCount,
      expense_count: spend.expCount,
    };
  });
}

// ─── Recent Activity ────────────────────────────────────────────────────────

export type ActivityItem = {
  id: string;
  type: "po" | "expense" | "invoice";
  description: string;
  amount: number;
  date: string;
};

export async function getRecentActivity(): Promise<ActivityItem[]> {
  const supabase = await createClient();

  const [posRes, expRes, invRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id, po_number, total_amount, created_at, vendors(name)")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("expenses")
      .select("id, description, vendor_payee, amount, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("invoices")
      .select("id, invoice_number, client_vendor_name, total_amount, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const items: ActivityItem[] = [];

  (posRes.data || []).forEach((po: Record<string, unknown>) => {
    items.push({
      id: po.id as string,
      type: "po",
      description: `PO ${po.po_number} created for ${(po.vendors as { name: string } | null)?.name ?? "vendor"}`,
      amount: Number(po.total_amount),
      date: po.created_at as string,
    });
  });

  (expRes.data || []).forEach((exp: Record<string, unknown>) => {
    items.push({
      id: exp.id as string,
      type: "expense",
      description: `Expense: ${exp.description || exp.vendor_payee || "Unnamed"}`,
      amount: Number(exp.amount),
      date: exp.created_at as string,
    });
  });

  (invRes.data || []).forEach((inv: Record<string, unknown>) => {
    items.push({
      id: inv.id as string,
      type: "invoice",
      description: `Invoice ${inv.invoice_number} — ${inv.client_vendor_name}${inv.status === "paid" ? " (Paid)" : ""}`,
      amount: Number(inv.total_amount),
      date: inv.created_at as string,
    });
  });

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return items.slice(0, 10);
}

// ─── Expense Summary ────────────────────────────────────────────────────────

export async function getExpenseSummary() {
  const supabase = await createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("expenses")
    .select("category, amount")
    .gte("date", monthStart);

  if (error) throw error;

  const byCategory: Record<string, number> = {};
  let total = 0;
  (data || []).forEach((e) => {
    byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
    total += Number(e.amount);
  });

  return { total, byCategory };
}

// ─── Get active projects (for dropdowns) ────────────────────────────────────

export async function getActiveProjects() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, cost, clients(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    title: t.title as string,
    cost: t.cost as number | null,
    client_name: (t.clients as { name: string } | null)?.name ?? null,
  }));
}
