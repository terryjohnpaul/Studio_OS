"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SowRow = {
  id: string;
  sow_ref: string;
  client_name: string;
  brand_name: string | null;
  buyer_name: string | null;
  sales_dri: string | null;
  selected_tier_key: string;
  tier_name: string | null;
  gm_enabled: boolean;
  mk_enabled: boolean;
  gm_plan_type: string;
  mk_plan_type: string;
  selected_gm_tier: string | null;
  selected_mk_tier: string | null;
  discount: number;
  upfront: number;
  months: number;
  net_monthly: number;
  annual_value: number;
  currency: string;
  symbol: string;
  customer_requirements: string[] | null;
  list_monthly: number;
  bundle_discount: number;
  alacarte_addons: { item_key: string; name: string; qty: number; unit_price: number; length?: string }[] | null;
  scope_snapshot: {
    gmDeliverables?: { label: string; qty: string | number; unit: string }[];
    mkDeliverables?: { label: string; qty: string | number; unit: string }[];
    gmTierName?: string;
    mkTierName?: string;
    tierNotes?: string;
  } | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getSows(filters?: { status?: string }): Promise<SowRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("sows")
    .select("*")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SowRow[];
}

export async function createSow(
  sow: Omit<SowRow, "id" | "created_at" | "updated_at" | "created_by">
): Promise<SowRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sows")
    .insert(sow)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/finance/sow-builder");
  return data as SowRow;
}

export async function updateSow(
  id: string,
  updates: Partial<Omit<SowRow, "id" | "created_at" | "created_by">>
): Promise<SowRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sows")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/finance/sow-builder");
  return data as SowRow;
}

export async function deleteSow(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sows").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/finance/sow-builder");
}

export async function getNextSowRef(): Promise<string> {
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const { count, error } = await supabase
    .from("sows")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  const num = (count ?? 0) + 1;
  return `FS-SOW-${year}-${String(num).padStart(3, "0")}`;
}
