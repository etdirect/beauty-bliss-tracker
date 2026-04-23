import { pgTable, text, varchar, integer, boolean, real, serial } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Counters (points of sale) — legacy, kept for backward compat
export const counters = pgTable("counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertCounterSchema = createInsertSchema(counters).omit({ id: true });
export type InsertCounter = z.infer<typeof insertCounterSchema>;
export type Counter = typeof counters.$inferSelect;

// Categories
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertCategorySchema = createInsertSchema(categories).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Brands
export const brands = pgTable("brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  category: text("category").notNull(), // "Skincare" | "Haircare" | "Body Care" | "Others"
  isActive: boolean("is_active").notNull().default(true),
});

export const insertBrandSchema = createInsertSchema(brands).omit({ id: true });
export type InsertBrand = z.infer<typeof insertBrandSchema>;
export type Brand = typeof brands.$inferSelect;

// Counter-Brand assignments — legacy
export const counterBrands = pgTable("counter_brands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  counterId: varchar("counter_id").notNull(),
  brandId: varchar("brand_id").notNull(),
});

export const insertCounterBrandSchema = createInsertSchema(counterBrands).omit({ id: true });
export type InsertCounterBrand = z.infer<typeof insertCounterBrandSchema>;
export type CounterBrand = typeof counterBrands.$inferSelect;

// === NEW: POS Locations ===
export const posLocations = pgTable("pos_locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  salesChannel: text("sales_channel").notNull(),
  storeCode: text("store_code").notNull(),      // Initials (e.g. KB, KH, TS)
  siteCode: text("site_code").notNull().default(""), // Site/store code
  storeName: text("store_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertPosLocationSchema = createInsertSchema(posLocations).omit({ id: true });
export type InsertPosLocation = z.infer<typeof insertPosLocationSchema>;
export type PosLocation = typeof posLocations.$inferSelect;

// === NEW: Users ===
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  pin: text("pin").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("ba"),
  isActive: boolean("is_active").notNull().default(true),
  canViewHistory: boolean("can_view_history").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// === NEW: User POS Assignments ===
export const userPosAssignments = pgTable("user_pos_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  posId: varchar("pos_id").notNull(),
});

export const insertUserPosAssignmentSchema = createInsertSchema(userPosAssignments).omit({ id: true });
export type InsertUserPosAssignment = z.infer<typeof insertUserPosAssignmentSchema>;
export type UserPosAssignment = typeof userPosAssignments.$inferSelect;

// === NEW: Brand POS Availability ===
export const brandPosAvailability = pgTable("brand_pos_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  brandId: varchar("brand_id").notNull(),
  posId: varchar("pos_id").notNull(),
});

export const insertBrandPosAvailabilitySchema = createInsertSchema(brandPosAvailability).omit({ id: true });
export type InsertBrandPosAvailability = z.infer<typeof insertBrandPosAvailabilitySchema>;
export type BrandPosAvailability = typeof brandPosAvailability.$inferSelect;

// === POS Daily Figures (POS system official sales vs BA-recorded) ===
export const posDailyFigures = pgTable("pos_daily_figures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  counterId: varchar("counter_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  posFigure: real("pos_figure").notNull().default(0), // 對數紙 figure from POS system
  submittedBy: varchar("submitted_by"), // userId of who entered this (null = imported)
});

export const insertPosDailyFigureSchema = createInsertSchema(posDailyFigures).omit({ id: true });
export type InsertPosDailyFigure = z.infer<typeof insertPosDailyFigureSchema>;
export type PosDailyFigure = typeof posDailyFigures.$inferSelect;

// Daily Sales Entries
export const salesEntries = pgTable("sales_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  counterId: varchar("counter_id").notNull(),
  brandId: varchar("brand_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  orders: integer("orders").notNull().default(0),
  units: integer("units").notNull().default(0),
  amount: real("amount").notNull().default(0),
  gwpCount: integer("gwp_count").notNull().default(0),
  submittedBy: varchar("submitted_by"), // userId of who submitted this entry (null = imported/legacy)
});

export const insertSalesEntrySchema = createInsertSchema(salesEntries).omit({ id: true });
export type InsertSalesEntry = z.infer<typeof insertSalesEntrySchema>;
export type SalesEntry = typeof salesEntries.$inferSelect;

// Promotions (expanded with Microsoft List fields)
export const promotions = pgTable("promotions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promoNumber: serial("promo_number").notNull(), // human-friendly sequential # for BA comms
  name: text("name").notNull(),
  brandId: varchar("brand_id"), // nullable for cross-brand
  type: text("type").notNull(), // "GWP" | "PWP" | "Percentage Discount" | "Fixed Amount Discount" | "Bundle Deal" | "Multi-Buy" | "Spend & Get" | "Other"
  description: text("description").notNull(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date").notNull(), // YYYY-MM-DD
  isActive: boolean("is_active").notNull().default(true),
  // Microsoft List fields
  shopLocation: text("shop_location"),
  mechanics: text("mechanics"),
  promoAppliesTo: text("promo_applies_to"), // "Brand-wide" | "Specific SKUs"
  applicableProducts: text("applicable_products"),
  exclusions: text("exclusions"),
  discountPercentage: real("discount_percentage"),
  discountFixedAmount: real("discount_fixed_amount"),
  gwpItem: text("gwp_item"),
  gwpValue: real("gwp_value"),
  gwpQty: integer("gwp_qty"),
  pwpItem: text("pwp_item"),
  pwpPrice: real("pwp_price"),
  pwpDiscountPercentage: real("pwp_discount_percentage"),
  bundlePromoPrice: real("bundle_promo_price"),
  multiBuyBuyQty: integer("multi_buy_buy_qty"),
  multiBuyGetQty: integer("multi_buy_get_qty"),
  multiBuyGetType: text("multi_buy_get_type"),
  multiBuyFixedPrice: real("multi_buy_fixed_price"),
  spendGetSpendAmount: real("spend_get_spend_amount"),
  spendGetDiscountAmount: real("spend_get_discount_amount"),
  conditionMinimumSpend: real("condition_minimum_spend"),
  conditionMinimumQty: integer("condition_minimum_qty"),
  conditionRequiredItems: text("condition_required_items"),
  conditionOther: text("condition_other"),
  referenceOriginalPrice: real("reference_original_price"),
  referencePromoPrice: real("reference_promo_price"),
  remarks: text("remarks"),
  enteredBy: text("entered_by"),
  dateEntered: text("date_entered"),
  sourceListId: text("source_list_id"),
  lastSyncedAt: text("last_synced_at"),
  sourceApp: text("source_app"),           // "simulator" | "manual" | "mslist"
  sourceScenarioId: text("source_scenario_id"),  // ID from simulator for update tracking
  promotionLayer: text("promotion_layer"),       // "brand" | "counter" | "channel"
  trackable: boolean("trackable").notNull().default(false),  // true for GWP/PWP/Spend&Get(gift) — types where daily redemptions can be counted
  descriptionZh: text("description_zh"),   // Traditional Chinese description for BA view
  mechanicsZh: text("mechanics_zh"),       // Traditional Chinese mechanics for BA view
});

export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true });
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type Promotion = typeof promotions.$inferSelect;

// Promotion daily results per counter
export const promotionResults = pgTable("promotion_results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  promotionId: varchar("promotion_id").notNull(),
  counterId: varchar("counter_id").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  gwpGiven: integer("gwp_given").notNull().default(0),
  notes: text("notes"),
});

export const insertPromotionResultSchema = createInsertSchema(promotionResults).omit({ id: true });
export type InsertPromotionResult = z.infer<typeof insertPromotionResultSchema>;
export type PromotionResult = typeof promotionResults.$inferSelect;

// Batch submission schema for BA entry
export const batchSalesSubmissionSchema = z.object({
  counterId: z.string(),
  date: z.string(),
  entries: z.array(z.object({
    brandId: z.string(),
    orders: z.number().min(0).default(0),
    units: z.number().min(0),
    amount: z.number().min(0),
    gwpCount: z.number().min(0).default(0),
  })),
  promotionResults: z.array(z.object({
    promotionId: z.string(),
    gwpGiven: z.number().min(0),
    notes: z.string().optional(),
  })).optional(),
  posFigure: z.number().min(0).optional(), // POS system daily figure (對數紙)
});

export type BatchSalesSubmission = z.infer<typeof batchSalesSubmissionSchema>;

// === Monthly BA Incentive Schemes ===

export const incentiveCategories = [
  "product_units",    // units sold per product
  "product_amount",   // revenue per product
  "promo_achievement",// GWP/PWP tracking
  "brand_units",      // total units per brand
  "brand_amount",     // total revenue per brand
  "pos_volume",       // sales volume at POS (amount)
  "transaction_amount",// per-transaction amount threshold (e.g. EM $10 per transaction >$530)
] as const;
export type IncentiveCategory = (typeof incentiveCategories)[number];

export const incentiveRewardBases = ["per_unit", "per_amount", "fixed", "per_transaction"] as const;
export type IncentiveRewardBasis = (typeof incentiveRewardBases)[number];

export const incentiveSchemes = pgTable("incentive_schemes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  month: text("month").notNull(),              // "2026-04" (YYYY-MM)
  category: text("category").notNull(),         // IncentiveCategory
  targetId: varchar("target_id"),               // product/brand/promotion/POS ID
  targetName: text("target_name"),              // display name for the target
  metric: text("metric").notNull(),             // "units" | "amount" | "gwp_given" | "pwp_sold" | "transaction_amount"
  threshold: real("threshold").notNull(),        // minimum to qualify (global default)
  rewardBasis: text("reward_basis").notNull().default("fixed"),  // per_unit | per_amount | fixed | per_transaction
  rewardAmount: real("reward_amount").notNull(), // HK$ per unit/amount or flat bonus
  rewardPerAmountUnit: real("reward_per_amount_unit"), // e.g. per HK$1000 (when basis=per_amount)
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by"),
  posIds: text("pos_ids"),                      // comma-separated POS IDs (null = all POS)
  notes: text("notes"),
  // New fields for April 2026 incentive program
  rewardTiers: text("reward_tiers"),            // JSON: [{minQty, maxQty?, rewardAmount}] for tiered per-unit rates (TA/LA)
  storeThresholds: text("store_thresholds"),    // JSON: [{posId, posName, threshold}] per-store minimum targets (AD)
  incentiveOffset: real("incentive_offset"),     // start counting from Nth piece (PE: offset=2 means from 3rd piece)
  comboBonus: text("combo_bonus"),              // JSON: {description, amount, products?[]} combo/set bonus (TA device+serum $30)
  targetProducts: text("target_products"),       // JSON: [{sgCode, nameEng, nameChi?, volume?}] qualifying products for this incentive
});

// Reward tier type for tiered incentive rates
export type RewardTier = { minQty: number; maxQty?: number; rewardAmount: number };
export type StoreThreshold = { posId: string; posName: string; threshold: number };
export type ComboBonus = { description: string; amount: number; products?: string[] };
export type TargetProduct = { sgCode: string; nameEng: string; nameChi?: string; volume?: string };

export const insertIncentiveSchemeSchema = createInsertSchema(incentiveSchemes).omit({ id: true });
export type InsertIncentiveScheme = z.infer<typeof insertIncentiveSchemeSchema>;
export type IncentiveScheme = typeof incentiveSchemes.$inferSelect;

// Incentive daily entries (BA input per day per scheme)
export const incentiveEntries = pgTable("incentive_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  schemeId: varchar("scheme_id").notNull(),
  userId: varchar("user_id").notNull(),
  posId: varchar("pos_id"),
  date: text("date").notNull(), // YYYY-MM-DD
  value: real("value").notNull().default(0), // units or amount
});

export const insertIncentiveEntrySchema = createInsertSchema(incentiveEntries).omit({ id: true });
export type InsertIncentiveEntry = z.infer<typeof insertIncentiveEntrySchema>;
export type IncentiveEntry = typeof incentiveEntries.$inferSelect;

// Incentive category display labels
export const INCENTIVE_CATEGORY_LABELS: Record<IncentiveCategory, string> = {
  product_units: "Product Sales (Units)",
  product_amount: "Product Sales (Amount)",
  promo_achievement: "Promotion Achievement",
  brand_units: "Brand Sales (Units)",
  brand_amount: "Brand Sales (Amount)",
  pos_volume: "POS Sales Volume",
  transaction_amount: "Per-Transaction Amount",
};
