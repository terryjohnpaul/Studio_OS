-- Add extra fields to sows for rich PDF generation and customer requirements
ALTER TABLE sows
  ADD COLUMN IF NOT EXISTS customer_requirements text[] DEFAULT ARRAY[
    'Brand brief · positioning · tonality references',
    'Brand assets (logo files, product imagery, colour palette, fonts)',
    'Target audience definition · market(s) · language(s) required',
    'Reference creatives (3–5 examples preferred)',
    'Performance benchmarks (current ROAS / CTR / engagement metrics)',
    'Approver and feedback turnaround SLA (24–48 hrs ideal)',
    'Access to brand''s social handles / ad accounts (for posting)'
  ],
  ADD COLUMN IF NOT EXISTS list_monthly numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bundle_discount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS alacarte_addons jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scope_snapshot jsonb DEFAULT '{}'::jsonb;
