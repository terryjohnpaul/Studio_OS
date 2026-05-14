-- Rate Card Schema

CREATE TABLE IF NOT EXISTS rate_card_versions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_label text NOT NULL,
  fx_rate numeric NOT NULL DEFAULT 83.0,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES members(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_card_tiers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES rate_card_versions(id) ON DELETE CASCADE,
  tier_key text NOT NULL,
  name text NOT NULL,
  region text NOT NULL,
  tier_level text NOT NULL DEFAULT '—',
  multiplier numeric NOT NULL DEFAULT 1.0,
  currency text NOT NULL DEFAULT 'INR',
  symbol text NOT NULL DEFAULT '₹',
  countries text[] DEFAULT '{}'
);
CREATE INDEX idx_rate_card_tiers_version ON rate_card_tiers(version_id);

CREATE TABLE IF NOT EXISTS rate_card_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES rate_card_versions(id) ON DELETE CASCADE,
  section text NOT NULL,
  item_key text NOT NULL,
  name text NOT NULL,
  description text,
  length text,
  base_inr numeric NOT NULL DEFAULT 0,
  floor_percent numeric NOT NULL DEFAULT 75,
  sla text,
  per_second boolean DEFAULT false,
  seconds integer,
  unit text,
  sort_order integer NOT NULL DEFAULT 0,
  notes text
);
CREATE INDEX idx_rate_card_items_version ON rate_card_items(version_id);
CREATE INDEX idx_rate_card_items_section ON rate_card_items(version_id, section);

CREATE TABLE IF NOT EXISTS rate_card_retainer_deliverables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES rate_card_items(id) ON DELETE CASCADE,
  label text NOT NULL,
  default_qty text NOT NULL DEFAULT '0',
  unit text DEFAULT '',
  editable boolean DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rate_card_changes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES rate_card_versions(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid REFERENCES members(id),
  changed_at timestamptz DEFAULT now(),
  reverted_at timestamptz,
  reverted_by uuid REFERENCES members(id)
);
CREATE INDEX idx_rate_card_changes_version ON rate_card_changes(version_id);
CREATE INDEX idx_rate_card_changes_entity ON rate_card_changes(entity_id);
