-- Add Localisation pack row to A La Carte section
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes)
VALUES ('a1b2c3d4-5678-9abc-def0-localisation1', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'localisation', 'Localisation pack (per language)', NULL, 'any', 0, 72, NULL, false, NULL, NULL, 13, 'Up to 12 languages, brand-consistent')
ON CONFLICT (id) DO NOTHING;
