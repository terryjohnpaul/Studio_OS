-- SoW (Statement of Work) table for the SoW Builder module
CREATE TABLE IF NOT EXISTS sows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sow_ref text UNIQUE NOT NULL,
  client_name text NOT NULL,
  brand_name text,
  buyer_name text,
  sales_dri text,
  selected_tier_key text NOT NULL DEFAULT 'india',
  tier_name text,
  gm_enabled boolean DEFAULT true,
  mk_enabled boolean DEFAULT false,
  gm_plan_type text DEFAULT 'volume',
  mk_plan_type text DEFAULT 'brand',
  selected_gm_tier text,
  selected_mk_tier text,
  discount numeric(5,2) DEFAULT 0,
  upfront numeric(5,2) DEFAULT 0,
  months integer DEFAULT 12,
  net_monthly numeric(12,2) DEFAULT 0,
  annual_value numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'INR',
  symbol text DEFAULT '₹',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','accepted','rejected','expired')),
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view all sows"
  ON sows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert sows"
  ON sows FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update sows"
  ON sows FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete sows"
  ON sows FOR DELETE TO authenticated USING (true);
