-- Add price_overrides JSONB column for per-tier independent pricing
-- Format: { "mea_t3": { "list": 19, "floor": 14 }, ... }
ALTER TABLE rate_card_items ADD COLUMN IF NOT EXISTS price_overrides jsonb DEFAULT '{}';
