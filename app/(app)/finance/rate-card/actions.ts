"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth/getCurrentMember";
import { revalidatePath } from "next/cache";
import type {
  RateCardVersion,
  RateCardTier,
  RateCardItem,
  RateCardDeliverable,
  RateCardChange,
  RateCardSection,
} from "@/lib/types/rate-card";

export async function getVersions(): Promise<RateCardVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_versions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RateCardVersion[];
}

export async function getActiveVersion(): Promise<RateCardVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_versions")
    .select("*")
    .eq("is_active", true)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return (data as RateCardVersion) ?? null;
}

export async function getVersionData(versionId: string) {
  const supabase = await createClient();
  const [tiersRes, itemsRes, deliverablesRes] = await Promise.all([
    supabase
      .from("rate_card_tiers")
      .select("*")
      .eq("version_id", versionId)
      .order("multiplier"),
    supabase
      .from("rate_card_items")
      .select("*")
      .eq("version_id", versionId)
      .order("sort_order"),
    supabase
      .from("rate_card_retainer_deliverables")
      .select("*, rate_card_items!inner(version_id)")
      .eq("rate_card_items.version_id", versionId)
      .order("sort_order"),
  ]);
  if (tiersRes.error) throw tiersRes.error;
  if (itemsRes.error) throw itemsRes.error;

  return {
    tiers: (tiersRes.data ?? []) as RateCardTier[],
    items: (itemsRes.data ?? []) as RateCardItem[],
    deliverables: (deliverablesRes.data ?? []) as RateCardDeliverable[],
  };
}

export async function updateItemField(
  itemId: string,
  field: string,
  value: string | number,
  reason: string
) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: itemData } = await supabase
    .from("rate_card_items")
    .select("id, version_id, name, " + field)
    .eq("id", itemId)
    .single();
  if (!itemData) throw new Error("Item not found");

  const item = itemData as unknown as Record<string, unknown>;
  const oldValue = String(item[field] ?? "");

  await supabase
    .from("rate_card_items")
    .update({ [field]: value })
    .eq("id", itemId);

  await supabase.from("rate_card_changes").insert({
    version_id: item.version_id as string,
    entity_type: "item",
    entity_id: itemId,
    field,
    old_value: oldValue,
    new_value: String(value),
    reason: reason || null,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}

export async function updateTierField(
  tierId: string,
  field: string,
  value: string | number,
  reason: string
) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: tierData } = await supabase
    .from("rate_card_tiers")
    .select("id, version_id, name, " + field)
    .eq("id", tierId)
    .single();
  if (!tierData) throw new Error("Tier not found");

  const tier = tierData as unknown as Record<string, unknown>;
  const oldValue = String(tier[field] ?? "");

  await supabase
    .from("rate_card_tiers")
    .update({ [field]: value })
    .eq("id", tierId);

  await supabase.from("rate_card_changes").insert({
    version_id: tier.version_id as string,
    entity_type: "tier",
    entity_id: tierId,
    field,
    old_value: oldValue,
    new_value: String(value),
    reason: reason || null,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}

export async function updateVersionField(
  versionId: string,
  field: string,
  value: string | number,
  reason: string
) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: versionData } = await supabase
    .from("rate_card_versions")
    .select("id, " + field)
    .eq("id", versionId)
    .single();
  if (!versionData) throw new Error("Version not found");

  const versionRecord = versionData as unknown as Record<string, unknown>;
  const oldValue = String(versionRecord[field] ?? "");

  await supabase
    .from("rate_card_versions")
    .update({ [field]: value })
    .eq("id", versionId);

  await supabase.from("rate_card_changes").insert({
    version_id: versionId,
    entity_type: "version",
    entity_id: versionId,
    field,
    old_value: oldValue,
    new_value: String(value),
    reason: reason || null,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}

export async function createVersion(
  label: string,
  fxRate: number,
  notes?: string
): Promise<RateCardVersion> {
  const supabase = await createClient();
  const member = await getCurrentMember();

  await supabase
    .from("rate_card_versions")
    .update({ is_active: false })
    .eq("is_active", true);

  const { data, error } = await supabase
    .from("rate_card_versions")
    .insert({
      version_label: label,
      fx_rate: fxRate,
      is_active: true,
      notes: notes || null,
      created_by: member?.id || null,
    })
    .select()
    .single();
  if (error) throw error;

  revalidatePath("/finance/rate-card");
  return data as RateCardVersion;
}

export async function cloneVersion(sourceVersionId: string, newLabel: string) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: source } = await supabase
    .from("rate_card_versions")
    .select("*")
    .eq("id", sourceVersionId)
    .single();
  if (!source) throw new Error("Source version not found");

  const newVersion = await createVersion(
    newLabel,
    source.fx_rate,
    `Cloned from ${source.version_label}`
  );

  const sourceData = await getVersionData(sourceVersionId);

  const tierIdMap: Record<string, string> = {};
  if (sourceData.tiers.length > 0) {
    const tierInserts = sourceData.tiers.map((t) => ({
      version_id: newVersion.id,
      tier_key: t.tier_key,
      name: t.name,
      region: t.region,
      tier_level: t.tier_level,
      multiplier: t.multiplier,
      currency: t.currency,
      symbol: t.symbol,
      countries: t.countries,
    }));
    const { data: newTiers } = await supabase
      .from("rate_card_tiers")
      .insert(tierInserts)
      .select("id, tier_key");
    (newTiers ?? []).forEach((nt, i) => {
      tierIdMap[sourceData.tiers[i].id] = nt.id;
    });
  }

  const itemIdMap: Record<string, string> = {};
  if (sourceData.items.length > 0) {
    const itemInserts = sourceData.items.map((item) => ({
      version_id: newVersion.id,
      section: item.section,
      item_key: item.item_key,
      name: item.name,
      description: item.description,
      length: item.length,
      base_inr: item.base_inr,
      floor_percent: item.floor_percent,
      sla: item.sla,
      per_second: item.per_second,
      seconds: item.seconds,
      unit: item.unit,
      sort_order: item.sort_order,
      notes: item.notes,
    }));
    const { data: newItems } = await supabase
      .from("rate_card_items")
      .insert(itemInserts)
      .select("id, item_key");
    (newItems ?? []).forEach((ni, i) => {
      itemIdMap[sourceData.items[i].id] = ni.id;
    });
  }

  if (sourceData.deliverables.length > 0) {
    const delInserts = sourceData.deliverables.map((d) => ({
      item_id: itemIdMap[d.item_id] || d.item_id,
      label: d.label,
      default_qty: d.default_qty,
      unit: d.unit,
      editable: d.editable,
      sort_order: d.sort_order,
    }));
    await supabase.from("rate_card_retainer_deliverables").insert(delInserts);
  }

  await supabase.from("rate_card_changes").insert({
    version_id: newVersion.id,
    entity_type: "version",
    entity_id: newVersion.id,
    field: "created",
    old_value: null,
    new_value: newLabel,
    reason: `Cloned from ${source.version_label}`,
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return newVersion;
}

export async function getChangeLog(
  versionId: string,
  limit = 50
): Promise<RateCardChange[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_card_changes")
    .select("*, members!rate_card_changes_changed_by_fkey(full_name)")
    .eq("version_id", versionId)
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((c) => ({
    ...c,
    changer_name: (c.members as { full_name: string } | null)?.full_name || "Unknown",
  })) as RateCardChange[];
}

export async function revertChange(changeId: string, reason: string) {
  const supabase = await createClient();
  const member = await getCurrentMember();

  const { data: change } = await supabase
    .from("rate_card_changes")
    .select("*")
    .eq("id", changeId)
    .single();
  if (!change) throw new Error("Change not found");
  if (change.reverted_at) throw new Error("Already reverted");

  const table =
    change.entity_type === "item"
      ? "rate_card_items"
      : change.entity_type === "tier"
        ? "rate_card_tiers"
        : "rate_card_versions";

  await supabase
    .from(table)
    .update({ [change.field]: change.old_value })
    .eq("id", change.entity_id);

  await supabase
    .from("rate_card_changes")
    .update({
      reverted_at: new Date().toISOString(),
      reverted_by: member?.id || null,
    })
    .eq("id", changeId);

  await supabase.from("rate_card_changes").insert({
    version_id: change.version_id,
    entity_type: change.entity_type,
    entity_id: change.entity_id,
    field: change.field,
    old_value: change.new_value,
    new_value: change.old_value,
    reason: reason || "Reverted",
    changed_by: member?.id || null,
  });

  revalidatePath("/finance/rate-card");
  return { ok: true };
}
