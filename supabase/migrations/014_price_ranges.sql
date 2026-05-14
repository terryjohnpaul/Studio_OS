-- Add base_inr_max column for price ranges (Per-Campaign section)
ALTER TABLE rate_card_items ADD COLUMN IF NOT EXISTS base_inr_max numeric;

-- Update Per-Campaign items with max values from Excel §5
UPDATE rate_card_items SET base_inr_max = 1200000 WHERE item_key = 'hero' AND section = 'per_campaign';
UPDATE rate_card_items SET base_inr_max = 2500000 WHERE item_key = 'i360' AND section = 'per_campaign';
UPDATE rate_card_items SET base_inr_max = 1800000 WHERE item_key = 'festive' AND section = 'per_campaign';
UPDATE rate_card_items SET base_inr_max = 4000000 WHERE item_key = 'launch' AND section = 'per_campaign';
UPDATE rate_card_items SET base_inr_max = 2500000 WHERE item_key = 'refresh' AND section = 'per_campaign';
UPDATE rate_card_items SET base_inr_max = 1200000 WHERE item_key = 'amb' AND section = 'per_campaign';
UPDATE rate_card_items SET base_inr_max = 1000000 WHERE item_key = 'aos' AND section = 'per_campaign';
