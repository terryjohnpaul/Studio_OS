-- Seed Rate Card v7 data from mock-data.ts
-- Run this in Supabase SQL Editor to populate rate card tables

-- 1. Version
INSERT INTO rate_card_versions (id, version_label, fx_rate, is_active, notes, created_at)
VALUES ('45624e11-1abe-4ce2-b503-adab1dd104d9', 'v7', 83, true, 'FY 2026-27 rate card · imported from xlsx', '2026-05-12T18:38:35.011Z')
ON CONFLICT (id) DO NOTHING;

-- 2. Tiers
INSERT INTO rate_card_tiers (id, version_id, tier_key, name, region, tier_level, multiplier, currency, symbol, countries) VALUES
('bc18f251-ff1b-4777-9054-ddb5b5b7652f', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'india', 'India + Reliance', 'India', '—', 1, 'INR', '₹', '{IN}'),
('4bd7e270-2533-40b8-9a35-471c2863fcbd', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'mea_t1', 'MEA T1 · UAE + GCC', 'MEA', 'T1', 4, 'USD', '$', '{AE,QA,KW,BH,OM,IL}'),
('fe39a486-eaa4-4da8-94b1-b71628779a9f', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'mea_t2', 'MEA T2 · Saudi Arabia', 'MEA', 'T2', 3.5, 'USD', '$', '{SA}'),
('d7778ec7-b48d-4382-893d-04c1014ea633', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'mea_t3', 'MEA T3 · Africa + Levant', 'MEA', 'T3', 1.8, 'USD', '$', '{EG,MA,JO,ZA,NG,KE,TN,LB}'),
('63a317d8-e035-4933-b697-228c2a894617', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'sea_t1', 'SEA T1 · Singapore', 'SEA', 'T1', 4.5, 'USD', '$', '{SG}'),
('952b2786-1749-49b7-b1d1-3547d9267c88', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'sea_t2', 'SEA T2 · MY + TH', 'SEA', 'T2', 2.4, 'USD', '$', '{MY,TH,BN}'),
('2ef33b90-be5d-4e3b-895e-39f005dd7f5b', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'sea_t3', 'SEA T3 · ID + PH + VN', 'SEA', 'T3', 1.8, 'USD', '$', '{ID,PH,VN,KH,MM,LA}'),
('440dc8e8-e2f6-4071-b0f1-602a1e1d8552', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'row_t1', 'ROW T1 · US + CA + AU', 'ROW', 'T1', 6.5, 'USD', '$', '{US,CA,AU,NZ}'),
('124ae033-4741-4d97-8251-fd3df423c39d', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'row_t2', 'ROW T2 · UK + IE', 'ROW', 'T2', 5.5, 'USD', '$', '{GB,IE}'),
('54e54c2b-ec1a-4f58-9e85-9ca1ecd9fd70', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'row_t3', 'ROW T3 · Continental EU', 'ROW', 'T3', 5, 'USD', '$', '{DE,FR,NL,CH,SE,DK,NO,FI,BE,AT,ES,IT,PT}')
ON CONFLICT (id) DO NOTHING;

-- 3. Items — A La Carte
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes) VALUES
('fee880c7-6111-4ed8-8f56-e57f75b0d980', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'image', 'Marketing image (single)', NULL, 'static', 1000, 75, '24 hrs', false, NULL, NULL, 0, '₹/image · bulk 50@10%, 100@20%, 500@30%'),
('fd0cb987-a2f5-4259-9ded-a82554d4b4e9', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'carousel', 'Carousel pack (5 frames)', NULL, 'static', 4000, 75, '24 hrs', false, NULL, NULL, 1, 'Single concept, 5 cohort variants'),
('1090034d-4b40-40eb-bb75-756fda84a5f2', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'banner', 'Banner pack (5 IAB sizes)', NULL, 'static', 6000, 75, '24 hrs', false, NULL, NULL, 2, 'Display retargeting kit'),
('3e06d22d-37a7-43a6-85c0-8da14e4163b4', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'ugc', 'UGC / creator-style cut', NULL, '15s', 15000, 75, '48 hrs', true, 15, NULL, 3, 'Raw social tone'),
('e622d498-11a5-4912-839d-9615461f4276', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'hook', 'Short-form hook', NULL, '6s', 9000, 75, '48 hrs', true, 6, NULL, 4, 'Pre-roll / Reels / Shorts'),
('10790f52-1e76-40cc-b391-975d47c6fdac', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'social', 'Social spot', NULL, '15s', 22500, 75, '48 hrs', true, 15, NULL, 5, 'Meta / YouTube short / X'),
('58140bb0-8e0d-4ded-aaab-f3564572d7b7', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'product', 'Product feature film', NULL, '20s', 25000, 75, '48-72 hrs', true, 20, NULL, 6, 'Demo / lifestyle / category'),
('393ecbce-2b58-4567-9c19-340a7f47b043', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'story', 'Story-based ad', NULL, '20s', 40000, 75, '3-5 days', true, 20, NULL, 7, 'Character-centric, narrative'),
('8355b892-c849-4a72-a6c3-170ba254d771', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'brand30', 'Brand film (digital)', NULL, '30s', 71000, 75, '5 days', true, 30, NULL, 8, 'Pre-roll / OTT mid-roll'),
('c2be3adf-1f90-476e-9335-b45de1ad5738', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'music', 'Music video / lifestyle film', NULL, '20s', 100000, 75, '7-10 days', true, 20, NULL, 9, 'Premium narrative, talent optional'),
('60999c4c-43c5-45b8-9985-e5593faa925f', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'cinematic', 'Cinematic brand film', NULL, '60s', 240000, 75, '10 days', true, 60, NULL, 10, 'TVC-grade · long-form premium'),
('e41c477a-653c-4c0e-8828-2d9a341d6683', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'cgi', '3D / character animation', NULL, '15s', 60000, 75, '7 days', true, 15, NULL, 11, 'Custom IP-friendly'),
('cc1ec2aa-188c-4023-8018-749a4b814b55', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'alacarte', 'ip', 'AI character IP build', NULL, 'one-time', 300000, 75, '14 days', false, NULL, NULL, 12, 'Brand owns forever')
ON CONFLICT (id) DO NOTHING;

-- Items — Volume Retainer
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes) VALUES
('8c590e56-62e9-493a-a62c-cfc70b30fc7f', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'volume_retainer', 'vol_starter', 'Starter', NULL, NULL, 75000, 75, '72 hrs first delivery', false, NULL, '/ mo', 0, '~10 short-form (≤15s) + 1 brand film (30s) + 1 carousel pack + 2-lang'),
('5c4a4c84-dc59-4fe2-a018-22ba8e3c67d3', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'volume_retainer', 'vol_pro', 'Professional', NULL, NULL, 250000, 75, '48 hrs locked', false, NULL, '/ mo', 1, '~40 short-form + 3 brand films + 1 cinematic + unlimited carousel/banner + 6-lang'),
('054029e4-e4e6-428a-8f0d-d54af3b5b26f', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'volume_retainer', 'vol_enterprise', 'Enterprise', NULL, NULL, 800000, 75, '24 hrs locked', false, NULL, '/ mo', 2, 'Unlimited short-form (FUP) + 8 brand films + 2 cinematic + 12-lang + dedicated motion pod'),
('80e3e7fb-d4fa-4081-8d46-a8df076e32ac', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'volume_retainer', 'vol_master', 'Annual Master', NULL, NULL, 20000000, 75, '12-24 hrs · on-call', false, NULL, '/ mo', 3, 'Catalog negotiated · full creative + post + localisation + dedicated CD · concierge')
ON CONFLICT (id) DO NOTHING;

-- Items — Pilot Sprint
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes) VALUES
('5bc85bda-ed87-4786-bd5d-d9e800f36844', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'pilot_sprint', 'pilot_14day', '14 Day Pilot Sprint', NULL, '14 days', 400000, 60, '14 days', false, NULL, NULL, 0, NULL)
ON CONFLICT (id) DO NOTHING;

-- Items — Brand Retainer
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes) VALUES
('2b731556-ba73-46f9-b3e6-5cb532293127', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'brand_retainer', 'br_starter', 'Starter', NULL, NULL, 200000, 75, '14-day creative cycle', false, NULL, '/ mo', 0, 'India D2C <₹50 Cr · brand-world training + named CD · 1 hero/qtr · 2 campaigns/qtr · 14-day cycle'),
('8a8e01d8-cf09-4cf2-ae6b-0bf61e9b51a1', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'brand_retainer', 'br_pro', 'Professional', NULL, NULL, 600000, 75, '14-day creative cycle', false, NULL, '/ mo', 1, 'Mid-market · multi-region · 6-lang · 2 hero/qtr · 6 campaigns/qtr · brand strategist embed'),
('91a28c6b-9dfc-48a2-a483-d3de3ae66b6f', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'brand_retainer', 'br_enterprise', 'Enterprise', NULL, NULL, 1500000, 75, '12-day cycle', false, NULL, '/ mo', 2, 'Large brand house · multi-BU · global · 12-lang · unlimited hero (FUP) · dedicated pod · quarterly audit'),
('d61062b3-7d65-423d-bcc3-575b423eb72c', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'brand_retainer', 'br_master', 'Annual Master (Reliance grade)', NULL, NULL, 60000000, 75, 'On-call · founder-governed', false, NULL, '/ mo', 3, 'Strategic partner-of-record across BUs · founder-governed · concierge desk')
ON CONFLICT (id) DO NOTHING;

-- Items — Per-Campaign
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes) VALUES
('03751ade-8dde-4270-8bd3-f5503e3e01b3', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'hero', 'Hero Film', 'Cinematic 60-90s, character-centric, multi-cut', NULL, 400000, 75, '+25% language · 10-14 days', false, NULL, NULL, 0, NULL),
('5e719869-7038-4148-b5e7-3d64b49cb627', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'i360', 'Integrated 360° Campaign', 'Big idea + film + digital + OOH + retail + social', NULL, 800000, 75, '+20% language · 14-21 days · 4-8 wk run', false, NULL, NULL, 1, NULL),
('441e130b-3d87-4581-b181-72e103f8ddf4', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'festive', 'Festive / Seasonal', 'Diwali / Valentine / IPL / EOFY multi-asset, 12-lang ready', NULL, 600000, 75, '+25% language · 14-21 days', false, NULL, NULL, 2, NULL),
('cc7a512a-88d9-4a38-9712-95b8684629e7', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'launch', 'Brand Launch', 'Identity + film + first 3-mo content kit + go-live runway', NULL, 1500000, 75, '+25% language · 21-30 days', false, NULL, NULL, 3, NULL),
('d1199d53-85e5-476c-8ceb-9820587c5f65', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'refresh', 'Brand Refresh / Re-brand', 'Identity refresh + manifesto film + cross-channel rollout', NULL, 800000, 75, '+25% language · 14-21 days', false, NULL, NULL, 4, NULL),
('fa86d37e-1004-4d21-b7f0-f498cff38e38', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'amb', 'Ambassador / Talent Activation', 'Talent + cohort tests; talent fee at cost +15%', NULL, 300000, 75, '+20% language · 7-14 days', false, NULL, NULL, 5, NULL),
('4a0a8bac-c188-4f41-8f8a-8f7122f0639a', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'per_campaign', 'aos', 'Always-on Social Calendar', '12-week plan: weekly assets + community hooks + reactive moments', NULL, 400000, 75, '+20% language · continuous · /qtr', false, NULL, NULL, 6, NULL)
ON CONFLICT (id) DO NOTHING;

-- Items — Strategic Projects
INSERT INTO rate_card_items (id, version_id, section, item_key, name, description, length, base_inr, floor_percent, sla, per_second, seconds, unit, sort_order, notes) VALUES
('93607a3c-5282-4d1a-8cc7-2260d3535c7c', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'strategic', 'bwt', 'Brand World Training', 'Train StudioOS on the brand: corpus, voice, visual world', NULL, 300000, 100, NULL, false, NULL, NULL, 0, '7-14 days · free for retainer customers'),
('cb18f192-50f1-4c33-a8a8-dadb7a837042', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'strategic', 'bss', 'Brand Strategy Sprint', '4-week sprint: positioning, message house, creative platform', NULL, 800000, 100, NULL, false, NULL, NULL, 1, '4 weeks'),
('5b24f452-93c5-4c2d-a268-6464f79f0512', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'strategic', 'abp', 'Annual Brand Plan', 'Full FY plan: calendar, budgets, KPIs, hero ideas, channel mix', NULL, 1200000, 100, NULL, false, NULL, NULL, 2, '6 weeks'),
('324e51c4-1750-4a35-a034-99757e30c994', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'strategic', 'aic1', 'AI × Creative · 1-Hour Masterclass', 'Executive session on AI reshaping creative + marketing workflows', NULL, 400000, 100, NULL, false, NULL, NULL, 3, '1 hour'),
('f267a7d0-623e-42e9-81e3-29ea07b55902', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'strategic', 'aic4', 'AI × Creative · 4-Hour Deep Dive', 'Hands-on session: AI workflows, adoption, brand-safe systems', NULL, 800000, 100, NULL, false, NULL, NULL, 4, '4 hours'),
('07ca55bf-0dfb-4560-9d08-7de4f5135949', '45624e11-1abe-4ce2-b503-adab1dd104d9', 'strategic', 'aitc', 'AI Training for Creative Teams', 'Custom multi-day workshop, tailored to brand and team', NULL, 800000, 100, NULL, false, NULL, NULL, 5, 'Flexible · / session')
ON CONFLICT (id) DO NOTHING;
