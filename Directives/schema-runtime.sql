-- Counter Sales Tracker — tables the server creates on startup.
-- Source: server/storage.ts PgStorage.init() plus later ALTER statements.
-- This is the runtime shape. shared/schema.ts is the TypeScript model and can drift.
-- No data, no secrets. PostgreSQL.

-- Login sessions (connect-pg-simple). Holds session JSON, not business data.
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Legacy counters. Sales today point at pos_locations.id, not this table.
CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Brand categories (Skincare, Haircare, and so on).
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Brands by display name. There is no brand-code column.
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Legacy which-brands-at-which-counter. Superseded by brand_pos_availability.
CREATE TABLE IF NOT EXISTS counter_brands (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  counter_id TEXT NOT NULL,
  brand_id TEXT NOT NULL
);

-- One row per counter (POS id) + brand + calendar day. Gross sales as entered.
CREATE TABLE IF NOT EXISTS sales_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  counter_id TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  date TEXT NOT NULL,              -- YYYY-MM-DD, not a timestamp
  orders INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,  -- HK$ gross, before promo deductions
  gwp_count INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT                -- user id of who saved the row; null if imported
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_entries_upsert
  ON sales_entries (counter_id, brand_id, date);

-- Promotion definitions, including Traditional Chinese text fields.
CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  promo_number SERIAL,
  simulator_promo_number INTEGER,
  name TEXT NOT NULL,
  brand_id TEXT,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  description_zh TEXT,
  mechanics_zh TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  shop_location TEXT,
  mechanics TEXT,
  promo_applies_to TEXT,
  applicable_products TEXT,
  exclusions TEXT,
  discount_percentage REAL,
  discount_fixed_amount REAL,
  gwp_item TEXT,
  gwp_value REAL,
  gwp_qty INTEGER,
  pwp_item TEXT,
  pwp_price REAL,
  pwp_discount_percentage REAL,
  bundle_promo_price REAL,
  multi_buy_buy_qty INTEGER,
  multi_buy_get_qty INTEGER,
  multi_buy_get_type TEXT,
  multi_buy_fixed_price REAL,
  spend_get_spend_amount REAL,
  spend_get_discount_amount REAL,
  spend_get_tiers TEXT,            -- JSON array
  condition_minimum_spend REAL,
  condition_minimum_qty INTEGER,
  condition_required_items TEXT,
  condition_other TEXT,
  reference_original_price REAL,
  reference_promo_price REAL,
  remarks TEXT,
  entered_by TEXT,
  date_entered TEXT,
  source_list_id TEXT,
  last_synced_at TEXT,
  source_app TEXT,
  source_scenario_id TEXT,
  promotion_layer TEXT,
  trackable BOOLEAN NOT NULL DEFAULT false
);

-- Gift counts per promotion per counter per day.
CREATE TABLE IF NOT EXISTS promotion_results (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  promotion_id TEXT NOT NULL,
  counter_id TEXT NOT NULL,
  date TEXT NOT NULL,
  gwp_given INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

-- Money-off redemptions per promotion per counter per day. Not folded into sales_entries.
CREATE TABLE IF NOT EXISTS promotion_deductions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  promotion_id TEXT NOT NULL,
  counter_id TEXT NOT NULL,
  date TEXT NOT NULL,
  redemption_count INTEGER NOT NULL DEFAULT 0,
  reward_per_redemption REAL NOT NULL DEFAULT 0,
  total_deduction REAL NOT NULL DEFAULT 0,
  tier_breakdown TEXT,             -- JSON array
  notes TEXT,
  submitted_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS promotion_deductions_unique
  ON promotion_deductions (promotion_id, counter_id, date);

-- One row per shop. Unique on channel + store code. This is the live "counter".
CREATE TABLE IF NOT EXISTS pos_locations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sales_channel TEXT NOT NULL,
  store_code TEXT NOT NULL,
  site_code TEXT NOT NULL DEFAULT '',
  store_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (sales_channel, store_code)
);

-- Login accounts. Role is free text: management, ba, or part_time. No salary.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,               -- bcrypt hash
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ba',
  is_active BOOLEAN NOT NULL DEFAULT true,
  can_view_history BOOLEAN NOT NULL DEFAULT false
);

-- Which shops a user may enter. A person can have more than one row.
CREATE TABLE IF NOT EXISTS user_pos_assignments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id),
  pos_id TEXT NOT NULL REFERENCES pos_locations(id),
  UNIQUE (user_id, pos_id)
);

-- Which brands are sold at which shop.
CREATE TABLE IF NOT EXISTS brand_pos_availability (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  pos_id TEXT NOT NULL REFERENCES pos_locations(id),
  UNIQUE (brand_id, pos_id)
);

-- Monthly product/promo bonus schemes. Not the new brand-sales commission.
CREATE TABLE IF NOT EXISTS incentive_schemes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  month TEXT NOT NULL,             -- YYYY-MM
  category TEXT NOT NULL,
  target_id TEXT,
  target_name TEXT,
  metric TEXT NOT NULL,
  threshold REAL NOT NULL,
  reward_basis TEXT NOT NULL DEFAULT 'fixed',
  reward_amount REAL NOT NULL,
  reward_per_amount_unit REAL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  pos_ids TEXT,
  notes TEXT,
  reward_tiers TEXT,               -- JSON
  tier_mode TEXT,                  -- flat | marginal
  store_thresholds TEXT,           -- JSON per-store minimums
  incentive_offset REAL,
  combo_bonus TEXT,                -- JSON
  target_products TEXT             -- JSON
);

-- BA's daily count toward an incentive scheme. Not attendance.
CREATE TABLE IF NOT EXISTS incentive_entries (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scheme_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pos_id TEXT,
  date TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  UNIQUE (scheme_id, user_id, date)
);

-- Official POS till total (對數紙) for one shop for one day. Not split by brand.
CREATE TABLE IF NOT EXISTS pos_daily_figures (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  counter_id TEXT NOT NULL,
  date TEXT NOT NULL,
  pos_figure REAL NOT NULL DEFAULT 0,
  submitted_by TEXT,
  UNIQUE (counter_id, date)
);
