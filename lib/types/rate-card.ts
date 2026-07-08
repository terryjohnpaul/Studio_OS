export type RateCardVersion = {
  id: string;
  version_label: string;
  fx_rate: number;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type RateCardTier = {
  id: string;
  version_id: string;
  tier_key: string;
  name: string;
  region: string;
  tier_level: string;
  multiplier: number;
  currency: string;
  symbol: string;
  countries: string[];
};

export type RateCardSection =
  | "alacarte"
  | "volume_retainer"
  | "pilot_sprint"
  | "brand_retainer"
  | "per_campaign"
  | "strategic";

export const SECTION_LABELS: Record<RateCardSection, string> = {
  alacarte: "A La Carte",
  volume_retainer: "Volume Retainer",
  pilot_sprint: "Pilot Sprint",
  brand_retainer: "Brand Retainer",
  per_campaign: "Per-Campaign",
  strategic: "Strategic Projects",
};

export type RateCardItem = {
  id: string;
  version_id: string;
  section: RateCardSection;
  item_key: string;
  name: string;
  description: string | null;
  length: string | null;
  base_inr: number;
  floor_percent: number;
  sla: string | null;
  per_second: boolean;
  seconds: number | null;
  unit: string | null;
  sort_order: number;
  notes: string | null;
  base_inr_max?: number | null;
  price_overrides?: Record<string, { list?: number; floor?: number }> | null;
};

export type RateCardDeliverable = {
  id: string;
  item_id: string;
  label: string;
  default_qty: string;
  unit: string;
  editable: boolean;
  sort_order: number;
};

export type RateCardChange = {
  id: string;
  version_id: string;
  entity_type: string;
  entity_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  changed_by: string | null;
  changed_at: string;
  reverted_at: string | null;
  reverted_by: string | null;
  changer_name?: string;
  reverter_name?: string;
};

export type TierPrice = {
  tier_key: string;
  tier_name: string;
  currency: string;
  symbol: string;
  list: number;
  floor: number;
};

export type RateCardItemWithPrices = RateCardItem & {
  prices: TierPrice[];
  deliverables?: RateCardDeliverable[];
};
