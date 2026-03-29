import {
  type Counter, type InsertCounter,
  type Brand, type InsertBrand,
  type CounterBrand, type InsertCounterBrand,
  type SalesEntry, type InsertSalesEntry,
  type Promotion, type InsertPromotion,
  type PromotionResult, type InsertPromotionResult,
  type BatchSalesSubmission,
  type PosLocation, type InsertPosLocation,
  type User, type InsertUser,
  type UserPosAssignment,
  type BrandPosAvailability,
  type Category, type InsertCategory,
} from "@shared/schema";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

export interface IStorage {
  init(): Promise<void>;
  // Counters (legacy)
  getCounters(): Promise<Counter[]>;
  getCounter(id: string): Promise<Counter | undefined>;
  createCounter(counter: InsertCounter): Promise<Counter>;
  updateCounter(id: string, data: Partial<InsertCounter>): Promise<Counter | undefined>;

  // Categories
  getCategories(): Promise<Category[]>;
  createCategory(cat: InsertCategory): Promise<Category>;
  updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string): Promise<void>;

  // Brands
  getBrands(): Promise<Brand[]>;
  getBrand(id: string): Promise<Brand | undefined>;
  createBrand(brand: InsertBrand): Promise<Brand>;
  updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined>;

  // Counter-Brand assignments (legacy)
  getCounterBrands(): Promise<CounterBrand[]>;
  getCounterBrandsByCounter(counterId: string): Promise<CounterBrand[]>;
  setCounterBrand(counterId: string, brandId: string, enabled: boolean): Promise<void>;

  // Sales entries
  getSalesEntries(filters?: { counterId?: string; brandId?: string; startDate?: string; endDate?: string; date?: string }): Promise<SalesEntry[]>;
  createSalesEntry(entry: InsertSalesEntry): Promise<SalesEntry>;
  upsertSalesEntry(entry: InsertSalesEntry): Promise<SalesEntry>;
  submitBatchSales(submission: BatchSalesSubmission, submittedBy?: string): Promise<void>;
  deleteSalesEntry(id: string): Promise<void>;
  bulkUpsertSalesEntries(entries: InsertSalesEntry[]): Promise<number>;

  // Promotions
  getPromotions(): Promise<Promotion[]>;
  getPromotion(id: string): Promise<Promotion | undefined>;
  getActivePromotions(date: string): Promise<Promotion[]>;
  createPromotion(promo: InsertPromotion): Promise<Promotion>;
  updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined>;
  syncPromotionsFromImport(promotions: InsertPromotion[]): Promise<{ created: number; updated: number; total: number }>;

  // Promotion results
  getPromotionResults(filters?: { promotionId?: string; counterId?: string; date?: string }): Promise<PromotionResult[]>;
  createPromotionResult(result: InsertPromotionResult): Promise<PromotionResult>;
  upsertPromotionResult(result: InsertPromotionResult): Promise<PromotionResult>;

  // POS Locations
  getPosLocations(): Promise<PosLocation[]>;
  getPosLocation(id: string): Promise<PosLocation | undefined>;
  createPosLocation(data: InsertPosLocation): Promise<PosLocation>;
  updatePosLocation(id: string, data: Partial<InsertPosLocation>): Promise<PosLocation | undefined>;

  // Users
  getUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(data: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

  // User-POS Assignments
  getUserPosAssignments(userId?: string): Promise<UserPosAssignment[]>;
  setUserPosAssignment(userId: string, posId: string, enabled: boolean): Promise<void>;

  // Brand-POS Availability
  getBrandPosAvailability(posId?: string): Promise<BrandPosAvailability[]>;
  setBrandPosAvailability(brandId: string, posId: string, enabled: boolean): Promise<void>;
}

function makePromotion(id: string, data: InsertPromotion): Promotion {
  return {
    id,
    name: data.name,
    brandId: data.brandId ?? null,
    type: data.type,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    isActive: data.isActive ?? true,
    shopLocation: data.shopLocation ?? null,
    mechanics: data.mechanics ?? null,
    promoAppliesTo: data.promoAppliesTo ?? null,
    applicableProducts: data.applicableProducts ?? null,
    exclusions: data.exclusions ?? null,
    discountPercentage: data.discountPercentage ?? null,
    discountFixedAmount: data.discountFixedAmount ?? null,
    gwpItem: data.gwpItem ?? null,
    gwpValue: data.gwpValue ?? null,
    gwpQty: data.gwpQty ?? null,
    pwpItem: data.pwpItem ?? null,
    pwpPrice: data.pwpPrice ?? null,
    pwpDiscountPercentage: data.pwpDiscountPercentage ?? null,
    bundlePromoPrice: data.bundlePromoPrice ?? null,
    multiBuyBuyQty: data.multiBuyBuyQty ?? null,
    multiBuyGetQty: data.multiBuyGetQty ?? null,
    multiBuyGetType: data.multiBuyGetType ?? null,
    multiBuyFixedPrice: data.multiBuyFixedPrice ?? null,
    spendGetSpendAmount: data.spendGetSpendAmount ?? null,
    spendGetDiscountAmount: data.spendGetDiscountAmount ?? null,
    conditionMinimumSpend: data.conditionMinimumSpend ?? null,
    conditionMinimumQty: data.conditionMinimumQty ?? null,
    conditionRequiredItems: data.conditionRequiredItems ?? null,
    conditionOther: data.conditionOther ?? null,
    referenceOriginalPrice: data.referenceOriginalPrice ?? null,
    referencePromoPrice: data.referencePromoPrice ?? null,
    remarks: data.remarks ?? null,
    enteredBy: data.enteredBy ?? null,
    dateEntered: data.dateEntered ?? null,
    sourceListId: data.sourceListId ?? null,
    lastSyncedAt: data.lastSyncedAt ?? null,
    sourceApp: data.sourceApp ?? null,
    sourceScenarioId: data.sourceScenarioId ?? null,
    promotionLayer: data.promotionLayer ?? null,
    trackable: data.trackable ?? false,
  };
}

// ─── PostgreSQL Storage ─────────────────────────────────────────
export class PgStorage implements IStorage {
  private pool: pg.Pool;

  constructor(databaseUrl: string) {
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    });
  }

  private async q(text: string, params?: any[]): Promise<pg.QueryResult> {
    return this.pool.query(text, params);
  }

  async init(): Promise<void> {
    await this.q(`
      CREATE TABLE IF NOT EXISTS counters (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS brands (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS counter_brands (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        counter_id TEXT NOT NULL,
        brand_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sales_entries (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        counter_id TEXT NOT NULL,
        brand_id TEXT NOT NULL,
        date TEXT NOT NULL,
        orders INTEGER NOT NULL DEFAULT 0,
        units INTEGER NOT NULL DEFAULT 0,
        amount REAL NOT NULL DEFAULT 0,
        gwp_count INTEGER NOT NULL DEFAULT 0
      );
      ALTER TABLE sales_entries ADD COLUMN IF NOT EXISTS orders INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE sales_entries ADD COLUMN IF NOT EXISTS submitted_by TEXT;
      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL,
        brand_id TEXT,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
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
      CREATE TABLE IF NOT EXISTS promotion_results (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        promotion_id TEXT NOT NULL,
        counter_id TEXT NOT NULL,
        date TEXT NOT NULL,
        gwp_given INTEGER NOT NULL DEFAULT 0,
        notes TEXT
      );
    `);
    // Migration: add new columns if table already existed
    await this.q(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS source_app TEXT`);
    await this.q(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS source_scenario_id TEXT`);
    await this.q(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS promotion_layer TEXT`);
    await this.q(`ALTER TABLE promotions ADD COLUMN IF NOT EXISTS trackable BOOLEAN NOT NULL DEFAULT false`);

    // NEW tables for auth + POS restructure
    await this.q(`
      CREATE TABLE IF NOT EXISTS pos_locations (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        sales_channel TEXT NOT NULL,
        store_code TEXT NOT NULL,
        store_name TEXT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        UNIQUE(sales_channel, store_code)
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        username TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'ba',
        is_active BOOLEAN NOT NULL DEFAULT true
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_history BOOLEAN NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS user_pos_assignments (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        pos_id TEXT NOT NULL REFERENCES pos_locations(id),
        UNIQUE(user_id, pos_id)
      );
      CREATE TABLE IF NOT EXISTS brand_pos_availability (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        brand_id TEXT NOT NULL REFERENCES brands(id),
        pos_id TEXT NOT NULL REFERENCES pos_locations(id),
        UNIQUE(brand_id, pos_id)
      );
    `);
    console.log("[pg] Tables ensured");

    // Ensure unique index on sales_entries for bulk upserts
    try {
      // Remove duplicates first (keep the latest inserted row for each counter+brand+date)
      await this.q(`
        DELETE FROM sales_entries a USING sales_entries b
        WHERE a.counter_id = b.counter_id AND a.brand_id = b.brand_id AND a.date = b.date
          AND a.id < b.id
      `);
      await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_entries_upsert ON sales_entries (counter_id, brand_id, date)`);
      console.log("[pg] Unique index on sales_entries ensured");
    } catch (err) {
      console.error("[pg] Failed to create unique index on sales_entries:", err);
    }

    // Seed default categories if empty
    const { rows: existingCats } = await this.q("SELECT id FROM categories LIMIT 1");
    if (existingCats.length === 0) {
      console.log("[pg] Seeding default categories...");
      const defaultCats = [
        "Skincare", "Haircare", "Babycare", "Makeup", "Fragrance",
        "Personal Care", "Health Supplements", "Small Electronic Devices",
        "Snacks", "Beauty Accessories", "Body Care", "Others",
      ];
      for (let i = 0; i < defaultCats.length; i++) {
        await this.q(
          "INSERT INTO categories (id, name, sort_order) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
          [randomUUID(), defaultCats[i], i + 1]
        );
      }
    }

    // Seed default management user if users table is empty
    const { rows: existingUsers } = await this.q("SELECT id FROM users LIMIT 1");
    if (existingUsers.length === 0) {
      console.log("[pg] Seeding default admin user...");
      const adminId = randomUUID();
      const adminPin = bcrypt.hashSync("1234", 10);
      await this.q(
        "INSERT INTO users (id, username, pin, name, role, is_active) VALUES ($1,$2,$3,$4,$5,$6)",
        [adminId, "admin", adminPin, "Admin", "management", true]
      );

      // Seed default BA user
      const baId = randomUUID();
      const baPin = bcrypt.hashSync("1111", 10);
      await this.q(
        "INSERT INTO users (id, username, pin, name, role, is_active) VALUES ($1,$2,$3,$4,$5,$6)",
        [baId, "ba1", baPin, "BA Demo", "ba", true]
      );

      // Seed POS locations if empty
      const { rows: existingPos } = await this.q("SELECT id FROM pos_locations LIMIT 1");
      if (existingPos.length === 0) {
        console.log("[pg] Seeding default POS locations...");
        const posData = [
          { channel: "FACESSS", code: "AD", name: "FACESSS Admiralty" },
          { channel: "LOGON", code: "CWB", name: "LOG-ON Causeway Bay" },
          { channel: "LOGON", code: "TS", name: "LOG-ON TST Harbour City" },
          { channel: "LOGON", code: "MK", name: "LOG-ON Mong Kok" },
          { channel: "LOGON", code: "KT", name: "LOG-ON Kowloon Tong" },
          { channel: "LOGON", code: "ST", name: "LOG-ON Sha Tin" },
          { channel: "SOGO", code: "KT", name: "SOGO Kai Tak" },
        ];
        const posIds: string[] = [];
        for (const p of posData) {
          const pid = randomUUID();
          posIds.push(pid);
          await this.q(
            "INSERT INTO pos_locations (id, sales_channel, store_code, store_name, is_active) VALUES ($1,$2,$3,$4,$5)",
            [pid, p.channel, p.code, p.name, true]
          );
        }
        // Assign BA to first LOGON/TS
        const tsPos = posIds[2]; // LOGON/TS
        if (tsPos) {
          await this.q(
            "INSERT INTO user_pos_assignments (id, user_id, pos_id) VALUES ($1,$2,$3)",
            [randomUUID(), baId, tsPos]
          );
        }

        // Seed brand-POS availability: all brands to all POS
        const { rows: brands } = await this.q("SELECT id FROM brands");
        for (const brand of brands) {
          for (const pid of posIds) {
            await this.q(
              "INSERT INTO brand_pos_availability (id, brand_id, pos_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
              [randomUUID(), brand.id, pid]
            );
          }
        }
        console.log("[pg] Seed data created: 2 users, 7 POS locations, brand-POS availability");
      }
    }

    // Always ensure all standard brands exist (idempotent)
    const allBrands: { name: string; category: string }[] = [
      { name: "Embryolisse", category: "Skincare" },
      { name: "PHYTO", category: "Haircare" },
      { name: "Novexpert", category: "Skincare" },
      { name: "TALIKA", category: "Skincare" },
      { name: "SAMPAR", category: "Skincare" },
      { name: "Klorane", category: "Haircare" },
      { name: "LADOR", category: "Haircare" },
      { name: "PESTLO", category: "Skincare" },
      { name: "Neutraderm", category: "Skincare" },
      { name: "GESKE", category: "Others" },
      { name: "ASDceuticals", category: "Skincare" },
      { name: "elvis+elvin", category: "Skincare" },
      { name: "Adopt", category: "Body Care" },
      { name: "XPOSOME", category: "Skincare" },
      { name: "Addmino18", category: "Haircare" },
      { name: "Colorgram", category: "Makeup" },
      { name: "Wakemake", category: "Makeup" },
      { name: "Pyunkang Yul", category: "Skincare" },
    ];
    const { rows: existingBrands } = await this.q("SELECT name FROM brands");
    const existingNames = new Set(existingBrands.map((r: any) => r.name.toLowerCase()));
    let brandsAdded = 0;
    for (const b of allBrands) {
      if (!existingNames.has(b.name.toLowerCase())) {
        await this.q("INSERT INTO brands (id, name, category, is_active) VALUES ($1,$2,$3,$4)", [randomUUID(), b.name, b.category, true]);
        brandsAdded++;
      }
    }
    if (brandsAdded > 0) console.log(`[pg] Added ${brandsAdded} missing brands`);
  }

  // ── Row mappers ──
  private mapCounter(r: any): Counter {
    return { id: r.id, name: r.name, isActive: r.is_active };
  }
  private mapBrand(r: any): Brand {
    return { id: r.id, name: r.name, category: r.category, isActive: r.is_active };
  }
  private mapCounterBrand(r: any): CounterBrand {
    return { id: r.id, counterId: r.counter_id, brandId: r.brand_id };
  }
  private mapSalesEntry(r: any): SalesEntry {
    return { id: r.id, counterId: r.counter_id, brandId: r.brand_id, date: r.date, orders: Number(r.orders ?? 0), units: Number(r.units), amount: Number(r.amount), gwpCount: Number(r.gwp_count), submittedBy: r.submitted_by ?? null };
  }
  private mapPromotion(r: any): Promotion {
    return {
      id: r.id, name: r.name, brandId: r.brand_id, type: r.type, description: r.description,
      startDate: r.start_date, endDate: r.end_date, isActive: r.is_active,
      shopLocation: r.shop_location, mechanics: r.mechanics, promoAppliesTo: r.promo_applies_to,
      applicableProducts: r.applicable_products, exclusions: r.exclusions,
      discountPercentage: r.discount_percentage != null ? Number(r.discount_percentage) : null,
      discountFixedAmount: r.discount_fixed_amount != null ? Number(r.discount_fixed_amount) : null,
      gwpItem: r.gwp_item, gwpValue: r.gwp_value != null ? Number(r.gwp_value) : null,
      gwpQty: r.gwp_qty != null ? Number(r.gwp_qty) : null,
      pwpItem: r.pwp_item, pwpPrice: r.pwp_price != null ? Number(r.pwp_price) : null,
      pwpDiscountPercentage: r.pwp_discount_percentage != null ? Number(r.pwp_discount_percentage) : null,
      bundlePromoPrice: r.bundle_promo_price != null ? Number(r.bundle_promo_price) : null,
      multiBuyBuyQty: r.multi_buy_buy_qty != null ? Number(r.multi_buy_buy_qty) : null,
      multiBuyGetQty: r.multi_buy_get_qty != null ? Number(r.multi_buy_get_qty) : null,
      multiBuyGetType: r.multi_buy_get_type, multiBuyFixedPrice: r.multi_buy_fixed_price != null ? Number(r.multi_buy_fixed_price) : null,
      spendGetSpendAmount: r.spend_get_spend_amount != null ? Number(r.spend_get_spend_amount) : null,
      spendGetDiscountAmount: r.spend_get_discount_amount != null ? Number(r.spend_get_discount_amount) : null,
      conditionMinimumSpend: r.condition_minimum_spend != null ? Number(r.condition_minimum_spend) : null,
      conditionMinimumQty: r.condition_minimum_qty != null ? Number(r.condition_minimum_qty) : null,
      conditionRequiredItems: r.condition_required_items, conditionOther: r.condition_other,
      referenceOriginalPrice: r.reference_original_price != null ? Number(r.reference_original_price) : null,
      referencePromoPrice: r.reference_promo_price != null ? Number(r.reference_promo_price) : null,
      remarks: r.remarks, enteredBy: r.entered_by, dateEntered: r.date_entered,
      sourceListId: r.source_list_id, lastSyncedAt: r.last_synced_at,
      sourceApp: r.source_app, sourceScenarioId: r.source_scenario_id,
      promotionLayer: r.promotion_layer, trackable: r.trackable ?? false,
    };
  }
  private mapPromotionResult(r: any): PromotionResult {
    return { id: r.id, promotionId: r.promotion_id, counterId: r.counter_id, date: r.date, gwpGiven: Number(r.gwp_given), notes: r.notes };
  }
  private mapPosLocation(r: any): PosLocation {
    return { id: r.id, salesChannel: r.sales_channel, storeCode: r.store_code, storeName: r.store_name, isActive: r.is_active };
  }
  private mapUser(r: any): User {
    return { id: r.id, username: r.username, pin: r.pin, name: r.name, role: r.role, isActive: r.is_active, canViewHistory: r.can_view_history ?? false };
  }
  private mapUserPosAssignment(r: any): UserPosAssignment {
    return { id: r.id, userId: r.user_id, posId: r.pos_id };
  }
  private mapBrandPosAvailability(r: any): BrandPosAvailability {
    return { id: r.id, brandId: r.brand_id, posId: r.pos_id };
  }

  // ── Counters ──
  async getCounters(): Promise<Counter[]> {
    const { rows } = await this.q("SELECT * FROM counters ORDER BY name");
    return rows.map((r: any) => this.mapCounter(r));
  }
  async getCounter(id: string): Promise<Counter | undefined> {
    const { rows } = await this.q("SELECT * FROM counters WHERE id=$1", [id]);
    return rows[0] ? this.mapCounter(rows[0]) : undefined;
  }
  async createCounter(data: InsertCounter): Promise<Counter> {
    const id = randomUUID();
    await this.q("INSERT INTO counters (id, name, is_active) VALUES ($1,$2,$3)", [id, data.name, data.isActive ?? true]);
    return { id, name: data.name, isActive: data.isActive ?? true };
  }
  async updateCounter(id: string, data: Partial<InsertCounter>): Promise<Counter | undefined> {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (data.name !== undefined) { sets.push(`name=$${i++}`); vals.push(data.name); }
    if (data.isActive !== undefined) { sets.push(`is_active=$${i++}`); vals.push(data.isActive); }
    if (sets.length === 0) return this.getCounter(id);
    vals.push(id);
    const { rows } = await this.q(`UPDATE counters SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? this.mapCounter(rows[0]) : undefined;
  }

  // ── Categories ──
  private mapCategory(r: any): Category {
    return { id: r.id, name: r.name, sortOrder: r.sort_order ?? 0 };
  }
  async getCategories(): Promise<Category[]> {
    const { rows } = await this.q("SELECT * FROM categories ORDER BY sort_order, name");
    return rows.map((r: any) => this.mapCategory(r));
  }
  async createCategory(data: InsertCategory): Promise<Category> {
    const id = randomUUID();
    const { rows } = await this.q(
      "INSERT INTO categories (id, name, sort_order) VALUES ($1, $2, $3) RETURNING *",
      [id, data.name, data.sortOrder ?? 0]
    );
    return this.mapCategory(rows[0]);
  }
  async updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined> {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (data.name !== undefined) { sets.push(`name=$${i++}`); vals.push(data.name); }
    if (data.sortOrder !== undefined) { sets.push(`sort_order=$${i++}`); vals.push(data.sortOrder); }
    if (sets.length === 0) return undefined;
    vals.push(id);
    const { rows } = await this.q(`UPDATE categories SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? this.mapCategory(rows[0]) : undefined;
  }
  async deleteCategory(id: string): Promise<void> {
    await this.q("DELETE FROM categories WHERE id=$1", [id]);
  }

  // ── Brands ──
  async getBrands(): Promise<Brand[]> {
    const { rows } = await this.q("SELECT * FROM brands ORDER BY name");
    return rows.map((r: any) => this.mapBrand(r));
  }
  async getBrand(id: string): Promise<Brand | undefined> {
    const { rows } = await this.q("SELECT * FROM brands WHERE id=$1", [id]);
    return rows[0] ? this.mapBrand(rows[0]) : undefined;
  }
  async createBrand(data: InsertBrand): Promise<Brand> {
    const id = randomUUID();
    await this.q("INSERT INTO brands (id, name, category, is_active) VALUES ($1,$2,$3,$4)", [id, data.name, data.category, data.isActive ?? true]);
    return { id, name: data.name, category: data.category, isActive: data.isActive ?? true };
  }
  async updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined> {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (data.name !== undefined) { sets.push(`name=$${i++}`); vals.push(data.name); }
    if (data.category !== undefined) { sets.push(`category=$${i++}`); vals.push(data.category); }
    if (data.isActive !== undefined) { sets.push(`is_active=$${i++}`); vals.push(data.isActive); }
    if (sets.length === 0) return this.getBrand(id);
    vals.push(id);
    const { rows } = await this.q(`UPDATE brands SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? this.mapBrand(rows[0]) : undefined;
  }

  // ── Counter-Brand assignments ──
  async getCounterBrands(): Promise<CounterBrand[]> {
    const { rows } = await this.q("SELECT * FROM counter_brands");
    return rows.map((r: any) => this.mapCounterBrand(r));
  }
  async getCounterBrandsByCounter(counterId: string): Promise<CounterBrand[]> {
    const { rows } = await this.q("SELECT * FROM counter_brands WHERE counter_id=$1", [counterId]);
    return rows.map((r: any) => this.mapCounterBrand(r));
  }
  async setCounterBrand(counterId: string, brandId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const { rows } = await this.q("SELECT id FROM counter_brands WHERE counter_id=$1 AND brand_id=$2", [counterId, brandId]);
      if (rows.length === 0) {
        await this.q("INSERT INTO counter_brands (id, counter_id, brand_id) VALUES ($1,$2,$3)", [randomUUID(), counterId, brandId]);
      }
    } else {
      await this.q("DELETE FROM counter_brands WHERE counter_id=$1 AND brand_id=$2", [counterId, brandId]);
    }
  }

  // ── Sales entries ──
  async getSalesEntries(filters?: { counterId?: string; brandId?: string; startDate?: string; endDate?: string; date?: string }): Promise<SalesEntry[]> {
    let where = "WHERE 1=1"; const vals: any[] = []; let i = 1;
    if (filters?.counterId) { where += ` AND counter_id=$${i++}`; vals.push(filters.counterId); }
    if (filters?.brandId) { where += ` AND brand_id=$${i++}`; vals.push(filters.brandId); }
    if (filters?.date) { where += ` AND date=$${i++}`; vals.push(filters.date); }
    if (filters?.startDate) { where += ` AND date>=$${i++}`; vals.push(filters.startDate); }
    if (filters?.endDate) { where += ` AND date<=$${i++}`; vals.push(filters.endDate); }
    const { rows } = await this.q(`SELECT * FROM sales_entries ${where} ORDER BY date DESC`, vals);
    return rows.map((r: any) => this.mapSalesEntry(r));
  }
  async createSalesEntry(data: InsertSalesEntry): Promise<SalesEntry> {
    const id = randomUUID();
    await this.q(
      "INSERT INTO sales_entries (id, counter_id, brand_id, date, orders, units, amount, gwp_count, submitted_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [id, data.counterId, data.brandId, data.date, data.orders ?? 0, data.units ?? 0, data.amount ?? 0, data.gwpCount ?? 0, data.submittedBy ?? null],
    );
    return { id, counterId: data.counterId, brandId: data.brandId, date: data.date, orders: data.orders ?? 0, units: data.units ?? 0, amount: data.amount ?? 0, gwpCount: data.gwpCount ?? 0, submittedBy: data.submittedBy ?? null };
  }
  async upsertSalesEntry(data: InsertSalesEntry): Promise<SalesEntry> {
    const { rows } = await this.q("SELECT id, submitted_by FROM sales_entries WHERE counter_id=$1 AND brand_id=$2 AND date=$3", [data.counterId, data.brandId, data.date]);
    if (rows.length > 0) {
      const existingId = rows[0].id;
      // Preserve submittedBy if not explicitly set in the update
      const submitter = data.submittedBy !== undefined ? data.submittedBy : rows[0].submitted_by;
      await this.q("UPDATE sales_entries SET orders=$1, units=$2, amount=$3, gwp_count=$4, submitted_by=$5 WHERE id=$6", [data.orders ?? 0, data.units ?? 0, data.amount ?? 0, data.gwpCount ?? 0, submitter, existingId]);
      return { id: existingId, counterId: data.counterId, brandId: data.brandId, date: data.date, orders: data.orders ?? 0, units: data.units ?? 0, amount: data.amount ?? 0, gwpCount: data.gwpCount ?? 0, submittedBy: submitter };
    }
    return this.createSalesEntry(data);
  }
  async bulkUpsertSalesEntries(entries: InsertSalesEntry[]): Promise<number> {
    if (entries.length === 0) return 0;
    // Use multi-row INSERT ... ON CONFLICT in chunks via pool.query()
    const CHUNK = 200;
    let imported = 0;
    for (let i = 0; i < entries.length; i += CHUNK) {
      const chunk = entries.slice(i, i + CHUNK);
      const values: any[] = [];
      const placeholders = chunk.map((e, idx) => {
        const off = idx * 7;
        values.push(e.counterId, e.brandId, e.date, e.orders ?? 0, e.units ?? 0, e.amount ?? 0, e.gwpCount ?? 0);
        return `(gen_random_uuid(), $${off+1}, $${off+2}, $${off+3}, $${off+4}, $${off+5}, $${off+6}, $${off+7})`;
      });
      await this.q(
        `INSERT INTO sales_entries (id, counter_id, brand_id, date, orders, units, amount, gwp_count)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (counter_id, brand_id, date) DO UPDATE SET
           orders = EXCLUDED.orders,
           units = EXCLUDED.units,
           amount = EXCLUDED.amount,
           gwp_count = EXCLUDED.gwp_count`,
        values
      );
      imported += chunk.length;
    }
    return imported;
  }
  async submitBatchSales(submission: BatchSalesSubmission, submittedBy?: string): Promise<void> {
    for (const entry of submission.entries) {
      if (entry.orders > 0 || entry.units > 0 || entry.amount > 0) {
        await this.upsertSalesEntry({
          counterId: submission.counterId,
          brandId: entry.brandId,
          date: submission.date,
          orders: entry.orders,
          units: entry.units,
          amount: entry.amount,
          gwpCount: entry.gwpCount,
          submittedBy: submittedBy ?? null,
        });
      }
    }
    if (submission.promotionResults) {
      for (const pr of submission.promotionResults) {
        if (pr.gwpGiven > 0) {
          await this.upsertPromotionResult({
            promotionId: pr.promotionId,
            counterId: submission.counterId,
            date: submission.date,
            gwpGiven: pr.gwpGiven,
            notes: pr.notes ?? null,
          });
        }
      }
    }
  }
  async deleteSalesEntry(id: string): Promise<void> {
    await this.q("DELETE FROM sales_entries WHERE id=$1", [id]);
  }

  // ── Promotions ──
  async getPromotions(): Promise<Promotion[]> {
    const { rows } = await this.q("SELECT * FROM promotions ORDER BY start_date DESC, name");
    return rows.map((r: any) => this.mapPromotion(r));
  }
  async getPromotion(id: string): Promise<Promotion | undefined> {
    const { rows } = await this.q("SELECT * FROM promotions WHERE id=$1", [id]);
    return rows[0] ? this.mapPromotion(rows[0]) : undefined;
  }
  async getActivePromotions(date: string): Promise<Promotion[]> {
    const { rows } = await this.q("SELECT * FROM promotions WHERE is_active=true AND start_date<=$1 AND end_date>=$1 ORDER BY name", [date]);
    return rows.map((r: any) => this.mapPromotion(r));
  }
  async createPromotion(data: InsertPromotion): Promise<Promotion> {
    const id = randomUUID();
    await this.q(
      `INSERT INTO promotions (id, name, brand_id, type, description, start_date, end_date, is_active,
       shop_location, mechanics, promo_applies_to, applicable_products, exclusions,
       discount_percentage, discount_fixed_amount, gwp_item, gwp_value, gwp_qty,
       pwp_item, pwp_price, pwp_discount_percentage, bundle_promo_price,
       multi_buy_buy_qty, multi_buy_get_qty, multi_buy_get_type, multi_buy_fixed_price,
       spend_get_spend_amount, spend_get_discount_amount,
       condition_minimum_spend, condition_minimum_qty, condition_required_items, condition_other,
       reference_original_price, reference_promo_price, remarks, entered_by, date_entered,
       source_list_id, last_synced_at, source_app, source_scenario_id, promotion_layer, trackable)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)`,
      [
        id, data.name, data.brandId ?? null, data.type, data.description, data.startDate, data.endDate, data.isActive ?? true,
        data.shopLocation ?? null, data.mechanics ?? null, data.promoAppliesTo ?? null, data.applicableProducts ?? null, data.exclusions ?? null,
        data.discountPercentage ?? null, data.discountFixedAmount ?? null, data.gwpItem ?? null, data.gwpValue ?? null, data.gwpQty ?? null,
        data.pwpItem ?? null, data.pwpPrice ?? null, data.pwpDiscountPercentage ?? null, data.bundlePromoPrice ?? null,
        data.multiBuyBuyQty ?? null, data.multiBuyGetQty ?? null, data.multiBuyGetType ?? null, data.multiBuyFixedPrice ?? null,
        data.spendGetSpendAmount ?? null, data.spendGetDiscountAmount ?? null,
        data.conditionMinimumSpend ?? null, data.conditionMinimumQty ?? null, data.conditionRequiredItems ?? null, data.conditionOther ?? null,
        data.referenceOriginalPrice ?? null, data.referencePromoPrice ?? null, data.remarks ?? null, data.enteredBy ?? null, data.dateEntered ?? null,
        data.sourceListId ?? null, data.lastSyncedAt ?? null,
        data.sourceApp ?? null, data.sourceScenarioId ?? null, data.promotionLayer ?? null, data.trackable ?? false,
      ],
    );
    return makePromotion(id, data);
  }
  async updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    const fieldMap: Record<string, string> = {
      name: "name", brandId: "brand_id", type: "type", description: "description",
      startDate: "start_date", endDate: "end_date", isActive: "is_active",
      shopLocation: "shop_location", mechanics: "mechanics", promoAppliesTo: "promo_applies_to",
      applicableProducts: "applicable_products", exclusions: "exclusions",
      discountPercentage: "discount_percentage", discountFixedAmount: "discount_fixed_amount",
      gwpItem: "gwp_item", gwpValue: "gwp_value", gwpQty: "gwp_qty",
      pwpItem: "pwp_item", pwpPrice: "pwp_price", pwpDiscountPercentage: "pwp_discount_percentage",
      bundlePromoPrice: "bundle_promo_price",
      multiBuyBuyQty: "multi_buy_buy_qty", multiBuyGetQty: "multi_buy_get_qty",
      multiBuyGetType: "multi_buy_get_type", multiBuyFixedPrice: "multi_buy_fixed_price",
      spendGetSpendAmount: "spend_get_spend_amount", spendGetDiscountAmount: "spend_get_discount_amount",
      conditionMinimumSpend: "condition_minimum_spend", conditionMinimumQty: "condition_minimum_qty",
      conditionRequiredItems: "condition_required_items", conditionOther: "condition_other",
      referenceOriginalPrice: "reference_original_price", referencePromoPrice: "reference_promo_price",
      remarks: "remarks", enteredBy: "entered_by", dateEntered: "date_entered",
      sourceListId: "source_list_id", lastSyncedAt: "last_synced_at",
      sourceApp: "source_app", sourceScenarioId: "source_scenario_id",
      promotionLayer: "promotion_layer", trackable: "trackable",
    };
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        sets.push(`${col}=$${i++}`);
        vals.push((data as any)[key]);
      }
    }
    if (sets.length === 0) return this.getPromotion(id);
    vals.push(id);
    const { rows } = await this.q(`UPDATE promotions SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? this.mapPromotion(rows[0]) : undefined;
  }
  async syncPromotionsFromImport(incoming: InsertPromotion[]): Promise<{ created: number; updated: number; total: number }> {
    let created = 0; let updated = 0;
    const { rows: existing } = await this.q("SELECT * FROM promotions");
    const existingList = existing.map((r: any) => this.mapPromotion(r));

    for (const data of incoming) {
      const match = existingList.find(p => p.name === data.name && p.startDate === data.startDate && p.endDate === data.endDate);
      if (match) {
        await this.updatePromotion(match.id, data);
        updated++;
      } else {
        await this.createPromotion(data);
        created++;
      }
    }
    return { created, updated, total: incoming.length };
  }

  // ── Promotion results ──
  async getPromotionResults(filters?: { promotionId?: string; counterId?: string; date?: string }): Promise<PromotionResult[]> {
    let where = "WHERE 1=1"; const vals: any[] = []; let i = 1;
    if (filters?.promotionId) { where += ` AND promotion_id=$${i++}`; vals.push(filters.promotionId); }
    if (filters?.counterId) { where += ` AND counter_id=$${i++}`; vals.push(filters.counterId); }
    if (filters?.date) { where += ` AND date=$${i++}`; vals.push(filters.date); }
    const { rows } = await this.q(`SELECT * FROM promotion_results ${where} ORDER BY date DESC`, vals);
    return rows.map((r: any) => this.mapPromotionResult(r));
  }
  async createPromotionResult(data: InsertPromotionResult): Promise<PromotionResult> {
    const id = randomUUID();
    await this.q(
      "INSERT INTO promotion_results (id, promotion_id, counter_id, date, gwp_given, notes) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, data.promotionId, data.counterId, data.date, data.gwpGiven ?? 0, data.notes ?? null],
    );
    return { id, promotionId: data.promotionId, counterId: data.counterId, date: data.date, gwpGiven: data.gwpGiven ?? 0, notes: data.notes ?? null };
  }
  async upsertPromotionResult(data: InsertPromotionResult): Promise<PromotionResult> {
    const { rows } = await this.q("SELECT id FROM promotion_results WHERE promotion_id=$1 AND counter_id=$2 AND date=$3", [data.promotionId, data.counterId, data.date]);
    if (rows.length > 0) {
      const existingId = rows[0].id;
      await this.q("UPDATE promotion_results SET gwp_given=$1, notes=$2 WHERE id=$3", [data.gwpGiven ?? 0, data.notes ?? null, existingId]);
      return { id: existingId, promotionId: data.promotionId, counterId: data.counterId, date: data.date, gwpGiven: data.gwpGiven ?? 0, notes: data.notes ?? null };
    }
    return this.createPromotionResult(data);
  }

  // ── POS Locations ──
  async getPosLocations(): Promise<PosLocation[]> {
    const { rows } = await this.q("SELECT * FROM pos_locations ORDER BY store_name");
    return rows.map((r: any) => this.mapPosLocation(r));
  }
  async getPosLocation(id: string): Promise<PosLocation | undefined> {
    const { rows } = await this.q("SELECT * FROM pos_locations WHERE id=$1", [id]);
    return rows[0] ? this.mapPosLocation(rows[0]) : undefined;
  }
  async createPosLocation(data: InsertPosLocation): Promise<PosLocation> {
    const id = randomUUID();
    await this.q("INSERT INTO pos_locations (id, sales_channel, store_code, store_name, is_active) VALUES ($1,$2,$3,$4,$5)", [id, data.salesChannel, data.storeCode, data.storeName, data.isActive ?? true]);
    return { id, salesChannel: data.salesChannel, storeCode: data.storeCode, storeName: data.storeName, isActive: data.isActive ?? true };
  }
  async updatePosLocation(id: string, data: Partial<InsertPosLocation>): Promise<PosLocation | undefined> {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (data.salesChannel !== undefined) { sets.push(`sales_channel=$${i++}`); vals.push(data.salesChannel); }
    if (data.storeCode !== undefined) { sets.push(`store_code=$${i++}`); vals.push(data.storeCode); }
    if (data.storeName !== undefined) { sets.push(`store_name=$${i++}`); vals.push(data.storeName); }
    if (data.isActive !== undefined) { sets.push(`is_active=$${i++}`); vals.push(data.isActive); }
    if (sets.length === 0) return this.getPosLocation(id);
    vals.push(id);
    const { rows } = await this.q(`UPDATE pos_locations SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? this.mapPosLocation(rows[0]) : undefined;
  }

  // ── Users ──
  async getUsers(): Promise<User[]> {
    const { rows } = await this.q("SELECT * FROM users ORDER BY name");
    return rows.map((r: any) => this.mapUser(r));
  }
  async getUser(id: string): Promise<User | undefined> {
    const { rows } = await this.q("SELECT * FROM users WHERE id=$1", [id]);
    return rows[0] ? this.mapUser(rows[0]) : undefined;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const { rows } = await this.q("SELECT * FROM users WHERE username=$1", [username]);
    return rows[0] ? this.mapUser(rows[0]) : undefined;
  }
  async createUser(data: InsertUser): Promise<User> {
    const id = randomUUID();
    await this.q("INSERT INTO users (id, username, pin, name, role, is_active) VALUES ($1,$2,$3,$4,$5,$6)", [id, data.username, data.pin, data.name, data.role ?? "ba", data.isActive ?? true]);
    return { id, username: data.username, pin: data.pin, name: data.name, role: data.role ?? "ba", isActive: data.isActive ?? true };
  }
  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const sets: string[] = []; const vals: any[] = []; let i = 1;
    if (data.username !== undefined) { sets.push(`username=$${i++}`); vals.push(data.username); }
    if (data.pin !== undefined) { sets.push(`pin=$${i++}`); vals.push(data.pin); }
    if (data.name !== undefined) { sets.push(`name=$${i++}`); vals.push(data.name); }
    if (data.role !== undefined) { sets.push(`role=$${i++}`); vals.push(data.role); }
    if (data.isActive !== undefined) { sets.push(`is_active=$${i++}`); vals.push(data.isActive); }
    if (data.canViewHistory !== undefined) { sets.push(`can_view_history=$${i++}`); vals.push(data.canViewHistory); }
    if (sets.length === 0) return this.getUser(id);
    vals.push(id);
    const { rows } = await this.q(`UPDATE users SET ${sets.join(",")} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? this.mapUser(rows[0]) : undefined;
  }

  // ── User-POS Assignments ──
  async getUserPosAssignments(userId?: string): Promise<UserPosAssignment[]> {
    if (userId) {
      const { rows } = await this.q("SELECT * FROM user_pos_assignments WHERE user_id=$1", [userId]);
      return rows.map((r: any) => this.mapUserPosAssignment(r));
    }
    const { rows } = await this.q("SELECT * FROM user_pos_assignments");
    return rows.map((r: any) => this.mapUserPosAssignment(r));
  }
  async setUserPosAssignment(userId: string, posId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const { rows } = await this.q("SELECT id FROM user_pos_assignments WHERE user_id=$1 AND pos_id=$2", [userId, posId]);
      if (rows.length === 0) {
        await this.q("INSERT INTO user_pos_assignments (id, user_id, pos_id) VALUES ($1,$2,$3)", [randomUUID(), userId, posId]);
      }
    } else {
      await this.q("DELETE FROM user_pos_assignments WHERE user_id=$1 AND pos_id=$2", [userId, posId]);
    }
  }

  // ── Brand-POS Availability ──
  async getBrandPosAvailability(posId?: string): Promise<BrandPosAvailability[]> {
    if (posId) {
      const { rows } = await this.q("SELECT * FROM brand_pos_availability WHERE pos_id=$1", [posId]);
      return rows.map((r: any) => this.mapBrandPosAvailability(r));
    }
    const { rows } = await this.q("SELECT * FROM brand_pos_availability");
    return rows.map((r: any) => this.mapBrandPosAvailability(r));
  }
  async setBrandPosAvailability(brandId: string, posId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      const { rows } = await this.q("SELECT id FROM brand_pos_availability WHERE brand_id=$1 AND pos_id=$2", [brandId, posId]);
      if (rows.length === 0) {
        await this.q("INSERT INTO brand_pos_availability (id, brand_id, pos_id) VALUES ($1,$2,$3)", [randomUUID(), brandId, posId]);
      }
    } else {
      await this.q("DELETE FROM brand_pos_availability WHERE brand_id=$1 AND pos_id=$2", [brandId, posId]);
    }
  }
}

// ─── In-Memory Storage (fallback for local dev) ─────────────────
export class MemStorage implements IStorage {
  private counters: Map<string, Counter> = new Map();
  private brands: Map<string, Brand> = new Map();
  private counterBrands: Map<string, CounterBrand> = new Map();
  private salesEntries: Map<string, SalesEntry> = new Map();
  private promotions: Map<string, Promotion> = new Map();
  private promotionResults: Map<string, PromotionResult> = new Map();
  private posLocationsMap: Map<string, PosLocation> = new Map();
  private usersMap: Map<string, User> = new Map();
  private userPosAssignmentsMap: Map<string, UserPosAssignment> = new Map();
  private brandPosAvailabilityMap: Map<string, BrandPosAvailability> = new Map();
  private categoriesMap: Map<string, Category> = new Map();

  constructor() {
    this.seed();
  }

  async init(): Promise<void> {
    // No-op for in-memory storage
  }

  private seed() {
    // POS Locations seed
    const posData: Array<{ salesChannel: string; storeCode: string; storeName: string }> = [
      { salesChannel: "FACESSS", storeCode: "AD", storeName: "FACESSS Admiralty" },
      { salesChannel: "LOGON", storeCode: "CWB", storeName: "LOG-ON Causeway Bay" },
      { salesChannel: "LOGON", storeCode: "TS", storeName: "LOG-ON TST Harbour City" },
      { salesChannel: "LOGON", storeCode: "MK", storeName: "LOG-ON Mong Kok" },
      { salesChannel: "LOGON", storeCode: "KT", storeName: "LOG-ON Kowloon Tong" },
      { salesChannel: "LOGON", storeCode: "ST", storeName: "LOG-ON Sha Tin" },
      { salesChannel: "SOGO", storeCode: "KT", storeName: "SOGO Kai Tak" },
    ];
    const posIds: string[] = [];
    for (const pd of posData) {
      const id = randomUUID();
      posIds.push(id);
      this.posLocationsMap.set(id, { id, ...pd, isActive: true });
    }

    // Also seed legacy counters with the same IDs so sales_entries work
    const counterNames = [
      "FACESSS Admiralty",
      "LOG-ON Causeway Bay",
      "LOG-ON TST Harbour City",
      "LOG-ON Mong Kok",
      "LOG-ON Kowloon Tong",
      "LOG-ON Sha Tin",
      "SOGO Kai Tak",
    ];
    const counterIds: string[] = [];
    for (let ci = 0; ci < counterNames.length; ci++) {
      // Use the same ID as the POS location for backward compat
      const id = posIds[ci];
      counterIds.push(id);
      this.counters.set(id, { id, name: counterNames[ci], isActive: true });
    }

    const brandData: Array<{ name: string; category: string }> = [
      { name: "Embryolisse", category: "Skincare" },
      { name: "PHYTO", category: "Haircare" },
      { name: "Novexpert", category: "Skincare" },
      { name: "TALIKA", category: "Skincare" },
      { name: "SAMPAR", category: "Skincare" },
      { name: "Klorane", category: "Haircare" },
      { name: "LADOR", category: "Haircare" },
      { name: "PESTLO", category: "Skincare" },
      { name: "Neutraderm", category: "Skincare" },
      { name: "GESKE", category: "Others" },
      { name: "ASDceuticals", category: "Skincare" },
      { name: "elvis+elvin", category: "Skincare" },
      { name: "Adopt", category: "Body Care" },
      { name: "XPOSOME", category: "Skincare" },
    ];
    const brandIds: string[] = [];
    for (const b of brandData) {
      const id = randomUUID();
      brandIds.push(id);
      this.brands.set(id, { id, name: b.name, category: b.category, isActive: true });
    }

    // Legacy counter-brands (all brands at all counters)
    for (const cid of counterIds) {
      for (const bid of brandIds) {
        const id = randomUUID();
        this.counterBrands.set(id, { id, counterId: cid, brandId: bid });
      }
    }

    // Brand-POS availability: all brands at all POS
    for (const posId of posIds) {
      for (const bid of brandIds) {
        const id = randomUUID();
        this.brandPosAvailabilityMap.set(id, { id, brandId: bid, posId });
      }
    }

    // Seed users with hashed PINs
    const adminId = randomUUID();
    const ba1Id = randomUUID();
    const adminHash = bcrypt.hashSync("1234", 10);
    const ba1Hash = bcrypt.hashSync("1111", 10);
    this.usersMap.set(adminId, { id: adminId, username: "admin", pin: adminHash, name: "Admin", role: "management", isActive: true, canViewHistory: true });
    this.usersMap.set(ba1Id, { id: ba1Id, username: "ba1", pin: ba1Hash, name: "BA Demo", role: "ba", isActive: true, canViewHistory: false });

    // BA1 assigned to LOGON/TS (index 2)
    const logonTsId = posIds[2];
    const assignId = randomUUID();
    this.userPosAssignmentsMap.set(assignId, { id: assignId, userId: ba1Id, posId: logonTsId });

    // Seed sample promotions
    const embryolisseBrandId = brandIds[0];
    const adoptBrandId = brandIds[12];
    const samplePromos: Promotion[] = [
      makePromotion(randomUUID(), { name: "Embryolisse April GWP", brandId: embryolisseBrandId, type: "GWP", description: "Free gift with purchase of HK$300+", startDate: "2026-03-01", endDate: "2026-04-30", isActive: true, shopLocation: "COUNTERS ALL", mechanics: "Spend HK$300 or more on any Embryolisse product and receive a complimentary Lait-Crème Concentré 30ml.", promoAppliesTo: "Brand-wide", gwpItem: "Lait-Crème Concentré 30ml", gwpValue: 89, gwpQty: 1, conditionMinimumSpend: 300 }),
      makePromotion(randomUUID(), { name: "Adopt - Buy 2 30ml perfumes, for $245", brandId: adoptBrandId, type: "Multi-Buy", description: "Buy any 2 x 30ml perfumes for HK$245", startDate: "2026-03-01", endDate: "2026-04-30", isActive: true, shopLocation: "LOGON ALL", mechanics: "Buy any 2 x 30ml Adopt perfumes for a special price of HK$245.", promoAppliesTo: "Brand-wide", applicableProducts: "Any 30ml Perfume", multiBuyBuyQty: 2, multiBuyFixedPrice: 245 }),
    ];
    for (const promo of samplePromos) this.promotions.set(promo.id, promo);

    // Seed sample sales
    const today = new Date();
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const d = new Date(today); d.setDate(d.getDate() - dayOffset);
      const dateStr = d.toISOString().split("T")[0];
      for (let ci = 0; ci < 3; ci++) {
        for (let bi = 0; bi < 5; bi++) {
          const id = randomUUID();
          const units = Math.floor(Math.random() * 8) + 1;
          const amount = units * (Math.floor(Math.random() * 300) + 100);
          this.salesEntries.set(id, { id, counterId: counterIds[ci], brandId: brandIds[bi], date: dateStr, units, amount, gwpCount: 0 });
        }
      }
    }
  }

  async getCounters(): Promise<Counter[]> { return Array.from(this.counters.values()); }
  async getCounter(id: string): Promise<Counter | undefined> { return this.counters.get(id); }
  async createCounter(data: InsertCounter): Promise<Counter> { const id = randomUUID(); const c: Counter = { id, name: data.name, isActive: data.isActive ?? true }; this.counters.set(id, c); return c; }
  async updateCounter(id: string, data: Partial<InsertCounter>): Promise<Counter | undefined> { const c = this.counters.get(id); if (!c) return undefined; const u = { ...c, ...data }; this.counters.set(id, u); return u; }

  async getCategories(): Promise<Category[]> { return Array.from(this.categoriesMap.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)); }
  async createCategory(data: InsertCategory): Promise<Category> { const id = randomUUID(); const c: Category = { id, name: data.name, sortOrder: data.sortOrder ?? 0 }; this.categoriesMap.set(id, c); return c; }
  async updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined> { const c = this.categoriesMap.get(id); if (!c) return undefined; const u = { ...c, ...data }; this.categoriesMap.set(id, u); return u; }
  async deleteCategory(id: string): Promise<void> { this.categoriesMap.delete(id); }

  async getBrands(): Promise<Brand[]> { return Array.from(this.brands.values()); }
  async getBrand(id: string): Promise<Brand | undefined> { return this.brands.get(id); }
  async createBrand(data: InsertBrand): Promise<Brand> { const id = randomUUID(); const b: Brand = { id, name: data.name, category: data.category, isActive: data.isActive ?? true }; this.brands.set(id, b); return b; }
  async updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined> { const b = this.brands.get(id); if (!b) return undefined; const u = { ...b, ...data }; this.brands.set(id, u); return u; }

  async getCounterBrands(): Promise<CounterBrand[]> { return Array.from(this.counterBrands.values()); }
  async getCounterBrandsByCounter(counterId: string): Promise<CounterBrand[]> { return Array.from(this.counterBrands.values()).filter(cb => cb.counterId === counterId); }
  async setCounterBrand(counterId: string, brandId: string, enabled: boolean): Promise<void> {
    const existing = Array.from(this.counterBrands.values()).find(cb => cb.counterId === counterId && cb.brandId === brandId);
    if (enabled && !existing) { const id = randomUUID(); this.counterBrands.set(id, { id, counterId, brandId }); }
    else if (!enabled && existing) { this.counterBrands.delete(existing.id); }
  }

  async getSalesEntries(filters?: { counterId?: string; brandId?: string; startDate?: string; endDate?: string; date?: string }): Promise<SalesEntry[]> {
    let entries = Array.from(this.salesEntries.values());
    if (filters) {
      if (filters.counterId) entries = entries.filter(e => e.counterId === filters.counterId);
      if (filters.brandId) entries = entries.filter(e => e.brandId === filters.brandId);
      if (filters.date) entries = entries.filter(e => e.date === filters.date);
      if (filters.startDate) entries = entries.filter(e => e.date >= filters.startDate!);
      if (filters.endDate) entries = entries.filter(e => e.date <= filters.endDate!);
    }
    return entries;
  }
  async createSalesEntry(data: InsertSalesEntry): Promise<SalesEntry> { const id = randomUUID(); const e: SalesEntry = { id, ...data, orders: data.orders ?? 0, units: data.units ?? 0, amount: data.amount ?? 0, gwpCount: data.gwpCount ?? 0, submittedBy: data.submittedBy ?? null }; this.salesEntries.set(id, e); return e; }
  async upsertSalesEntry(data: InsertSalesEntry): Promise<SalesEntry> {
    const existing = Array.from(this.salesEntries.values()).find(e => e.counterId === data.counterId && e.brandId === data.brandId && e.date === data.date);
    if (existing) { const u: SalesEntry = { ...existing, orders: data.orders ?? 0, units: data.units ?? 0, amount: data.amount ?? 0, gwpCount: data.gwpCount ?? 0 }; this.salesEntries.set(existing.id, u); return u; }
    return this.createSalesEntry(data);
  }
  async submitBatchSales(submission: BatchSalesSubmission, submittedBy?: string): Promise<void> {
    for (const entry of submission.entries) {
      if (entry.units > 0 || entry.amount > 0) {
        await this.upsertSalesEntry({ counterId: submission.counterId, brandId: entry.brandId, date: submission.date, orders: entry.orders, units: entry.units, amount: entry.amount, gwpCount: entry.gwpCount, submittedBy: submittedBy ?? null });
      }
    }
    if (submission.promotionResults) {
      for (const pr of submission.promotionResults) {
        if (pr.gwpGiven > 0) {
          await this.upsertPromotionResult({ promotionId: pr.promotionId, counterId: submission.counterId, date: submission.date, gwpGiven: pr.gwpGiven, notes: pr.notes ?? null });
        }
      }
    }
  }
  async deleteSalesEntry(id: string): Promise<void> { this.salesEntries.delete(id); }
  async bulkUpsertSalesEntries(entries: InsertSalesEntry[]): Promise<number> {
    for (const e of entries) { await this.upsertSalesEntry(e); }
    return entries.length;
  }

  async getPromotions(): Promise<Promotion[]> { return Array.from(this.promotions.values()); }
  async getPromotion(id: string): Promise<Promotion | undefined> { return this.promotions.get(id); }
  async getActivePromotions(date: string): Promise<Promotion[]> { return Array.from(this.promotions.values()).filter(p => p.isActive && p.startDate <= date && p.endDate >= date); }
  async createPromotion(data: InsertPromotion): Promise<Promotion> { const id = randomUUID(); const p = makePromotion(id, data); this.promotions.set(id, p); return p; }
  async updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined> { const p = this.promotions.get(id); if (!p) return undefined; const u = { ...p, ...data }; this.promotions.set(id, u as Promotion); return u as Promotion; }
  async syncPromotionsFromImport(incoming: InsertPromotion[]): Promise<{ created: number; updated: number; total: number }> {
    let created = 0; let updated = 0;
    const existing = Array.from(this.promotions.values());
    for (const data of incoming) {
      const match = existing.find(p => p.name === data.name && p.startDate === data.startDate && p.endDate === data.endDate);
      if (match) { this.promotions.set(match.id, makePromotion(match.id, data)); updated++; }
      else { const id = randomUUID(); this.promotions.set(id, makePromotion(id, data)); created++; }
    }
    return { created, updated, total: incoming.length };
  }

  async getPromotionResults(filters?: { promotionId?: string; counterId?: string; date?: string }): Promise<PromotionResult[]> {
    let results = Array.from(this.promotionResults.values());
    if (filters) {
      if (filters.promotionId) results = results.filter(r => r.promotionId === filters.promotionId);
      if (filters.counterId) results = results.filter(r => r.counterId === filters.counterId);
      if (filters.date) results = results.filter(r => r.date === filters.date);
    }
    return results;
  }
  async createPromotionResult(data: InsertPromotionResult): Promise<PromotionResult> { const id = randomUUID(); const r: PromotionResult = { id, ...data, gwpGiven: data.gwpGiven ?? 0, notes: data.notes ?? null }; this.promotionResults.set(id, r); return r; }
  async upsertPromotionResult(data: InsertPromotionResult): Promise<PromotionResult> {
    const existing = Array.from(this.promotionResults.values()).find(r => r.promotionId === data.promotionId && r.counterId === data.counterId && r.date === data.date);
    if (existing) { const u: PromotionResult = { ...existing, gwpGiven: data.gwpGiven ?? 0, notes: data.notes ?? null }; this.promotionResults.set(existing.id, u); return u; }
    return this.createPromotionResult(data);
  }

  // ── POS Locations ──
  async getPosLocations(): Promise<PosLocation[]> { return Array.from(this.posLocationsMap.values()); }
  async getPosLocation(id: string): Promise<PosLocation | undefined> { return this.posLocationsMap.get(id); }
  async createPosLocation(data: InsertPosLocation): Promise<PosLocation> {
    const id = randomUUID();
    const pos: PosLocation = { id, salesChannel: data.salesChannel, storeCode: data.storeCode, storeName: data.storeName, isActive: data.isActive ?? true };
    this.posLocationsMap.set(id, pos);
    // Also create a legacy counter for backward compat
    this.counters.set(id, { id, name: data.storeName, isActive: data.isActive ?? true });
    return pos;
  }
  async updatePosLocation(id: string, data: Partial<InsertPosLocation>): Promise<PosLocation | undefined> {
    const pos = this.posLocationsMap.get(id);
    if (!pos) return undefined;
    const u = { ...pos, ...data };
    this.posLocationsMap.set(id, u);
    // Also update legacy counter
    const counter = this.counters.get(id);
    if (counter) {
      if (data.storeName !== undefined) counter.name = data.storeName;
      if (data.isActive !== undefined) counter.isActive = data.isActive;
      this.counters.set(id, counter);
    }
    return u;
  }

  // ── Users ──
  async getUsers(): Promise<User[]> { return Array.from(this.usersMap.values()); }
  async getUser(id: string): Promise<User | undefined> { return this.usersMap.get(id); }
  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.usersMap.values()).find(u => u.username === username);
  }
  async createUser(data: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { id, username: data.username, pin: data.pin, name: data.name, role: data.role ?? "ba", isActive: data.isActive ?? true };
    this.usersMap.set(id, user);
    return user;
  }
  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.usersMap.get(id);
    if (!user) return undefined;
    const u = { ...user, ...data };
    this.usersMap.set(id, u);
    return u;
  }

  // ── User-POS Assignments ──
  async getUserPosAssignments(userId?: string): Promise<UserPosAssignment[]> {
    const all = Array.from(this.userPosAssignmentsMap.values());
    if (userId) return all.filter(a => a.userId === userId);
    return all;
  }
  async setUserPosAssignment(userId: string, posId: string, enabled: boolean): Promise<void> {
    const existing = Array.from(this.userPosAssignmentsMap.values()).find(a => a.userId === userId && a.posId === posId);
    if (enabled && !existing) { const id = randomUUID(); this.userPosAssignmentsMap.set(id, { id, userId, posId }); }
    else if (!enabled && existing) { this.userPosAssignmentsMap.delete(existing.id); }
  }

  // ── Brand-POS Availability ──
  async getBrandPosAvailability(posId?: string): Promise<BrandPosAvailability[]> {
    const all = Array.from(this.brandPosAvailabilityMap.values());
    if (posId) return all.filter(a => a.posId === posId);
    return all;
  }
  async setBrandPosAvailability(brandId: string, posId: string, enabled: boolean): Promise<void> {
    const existing = Array.from(this.brandPosAvailabilityMap.values()).find(a => a.brandId === brandId && a.posId === posId);
    if (enabled && !existing) { const id = randomUUID(); this.brandPosAvailabilityMap.set(id, { id, brandId, posId }); }
    else if (!enabled && existing) { this.brandPosAvailabilityMap.delete(existing.id); }
  }
}

// ─── Storage selection ──────────────────────────────────────────
const databaseUrl = process.env.DATABASE_URL;
export const isPostgres = !!databaseUrl;
export const storage: IStorage = databaseUrl ? new PgStorage(databaseUrl) : new MemStorage();
