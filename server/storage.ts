import {
  type Counter, type InsertCounter,
  type Brand, type InsertBrand,
  type CounterBrand, type InsertCounterBrand,
  type SalesEntry, type InsertSalesEntry,
  type Promotion, type InsertPromotion,
  type PromotionResult, type InsertPromotionResult,
  type BatchSalesSubmission,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Counters
  getCounters(): Promise<Counter[]>;
  getCounter(id: string): Promise<Counter | undefined>;
  createCounter(counter: InsertCounter): Promise<Counter>;
  updateCounter(id: string, data: Partial<InsertCounter>): Promise<Counter | undefined>;

  // Brands
  getBrands(): Promise<Brand[]>;
  getBrand(id: string): Promise<Brand | undefined>;
  createBrand(brand: InsertBrand): Promise<Brand>;
  updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined>;

  // Counter-Brand assignments
  getCounterBrands(): Promise<CounterBrand[]>;
  getCounterBrandsByCounter(counterId: string): Promise<CounterBrand[]>;
  setCounterBrand(counterId: string, brandId: string, enabled: boolean): Promise<void>;

  // Sales entries
  getSalesEntries(filters?: { counterId?: string; brandId?: string; startDate?: string; endDate?: string; date?: string }): Promise<SalesEntry[]>;
  createSalesEntry(entry: InsertSalesEntry): Promise<SalesEntry>;
  upsertSalesEntry(entry: InsertSalesEntry): Promise<SalesEntry>;
  submitBatchSales(submission: BatchSalesSubmission): Promise<void>;

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
  };
}

export class MemStorage implements IStorage {
  private counters: Map<string, Counter> = new Map();
  private brands: Map<string, Brand> = new Map();
  private counterBrands: Map<string, CounterBrand> = new Map();
  private salesEntries: Map<string, SalesEntry> = new Map();
  private promotions: Map<string, Promotion> = new Map();
  private promotionResults: Map<string, PromotionResult> = new Map();

  constructor() {
    this.seed();
  }

  private seed() {
    // Seed counters
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
    for (const name of counterNames) {
      const id = randomUUID();
      counterIds.push(id);
      this.counters.set(id, { id, name, isActive: true });
    }

    // Seed brands
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

    // Assign all brands to all counters
    for (const cid of counterIds) {
      for (const bid of brandIds) {
        const id = randomUUID();
        this.counterBrands.set(id, { id, counterId: cid, brandId: bid });
      }
    }

    // Seed sample promotions with rich Microsoft List data
    const adoptBrandId = brandIds[12]; // Adopt
    const embryolisseBrandId = brandIds[0]; // Embryolisse

    const samplePromos: Promotion[] = [
      makePromotion(randomUUID(), {
        name: "Embryolisse April GWP",
        brandId: embryolisseBrandId,
        type: "GWP",
        description: "Free gift with purchase of HK$300+",
        startDate: "2026-03-01",
        endDate: "2026-04-30",
        isActive: true,
        shopLocation: "COUNTERS ALL",
        mechanics: "Spend HK$300 or more on any Embryolisse product and receive a complimentary Lait-Crème Concentré 30ml.",
        promoAppliesTo: "Brand-wide",
        gwpItem: "Lait-Crème Concentré 30ml",
        gwpValue: 89,
        gwpQty: 1,
        conditionMinimumSpend: 300,
      }),
      makePromotion(randomUUID(), {
        name: "Adopt - Buy 2 30ml perfumes, for $245",
        brandId: adoptBrandId,
        type: "Multi-Buy",
        description: "Buy any 2 x 30ml perfumes for HK$245",
        startDate: "2026-03-01",
        endDate: "2026-04-30",
        isActive: true,
        shopLocation: "LOGON ALL",
        mechanics: "Buy any 2 x 30ml Adopt perfumes for a special price of HK$245 (usual price HK$149 each).",
        promoAppliesTo: "Brand-wide",
        applicableProducts: "Any 30ml Perfume",
        multiBuyBuyQty: 2,
        multiBuyFixedPrice: 245,
        referenceOriginalPrice: 149,
        referencePromoPrice: 122.5,
        sourceListId: "mslist-001",
        lastSyncedAt: "2026-03-15T10:30:00Z",
      }),
      makePromotion(randomUUID(), {
        name: "Adopt - Buy 2 30ml perfumes, Get 10% off",
        brandId: adoptBrandId,
        type: "Percentage Discount",
        description: "10% off when buying 2 x 30ml perfumes",
        startDate: "2026-03-01",
        endDate: "2026-04-30",
        isActive: true,
        shopLocation: "FACESSS ALL",
        mechanics: "Purchase any 2 x 30ml Adopt perfumes and enjoy 10% off the total.",
        promoAppliesTo: "Brand-wide",
        applicableProducts: "Any 30ml Perfume",
        discountPercentage: 10,
        conditionMinimumQty: 2,
        sourceListId: "mslist-002",
        lastSyncedAt: "2026-03-15T10:30:00Z",
      }),
      makePromotion(randomUUID(), {
        name: "Adopt - PWP 1 fragrance from 4 for $60",
        brandId: adoptBrandId,
        type: "PWP",
        description: "Purchase with purchase: any fragrance from selected 4 for HK$60",
        startDate: "2026-03-01",
        endDate: "2026-04-30",
        isActive: true,
        shopLocation: "COUNTERS ALL",
        mechanics: "With any Adopt purchase, add a selected 30ml fragrance for only HK$60 (choose from 4 scents).",
        promoAppliesTo: "Brand-wide",
        applicableProducts: "Any 30ml Perfume",
        pwpItem: "Selected 30ml fragrance (choice of 4)",
        pwpPrice: 60,
        conditionOther: "Valid with any Adopt purchase",
        sourceListId: "mslist-003",
        lastSyncedAt: "2026-03-15T10:30:00Z",
      }),
      makePromotion(randomUUID(), {
        name: "Adopt - Signature Scent Duo bundle",
        brandId: adoptBrandId,
        type: "Bundle Deal",
        description: "Au Feminin 30ml + Au Masculin 30ml bundle deal",
        startDate: "2026-03-01",
        endDate: "2026-04-30",
        isActive: true,
        shopLocation: "FACESSS OT [AS61]",
        mechanics: "Get the Signature Scent Duo (Au Feminin 30ml + Au Masculin 30ml) at a special bundle price of HK$230.",
        promoAppliesTo: "Specific SKUs",
        applicableProducts: "Au Feminin 30ml / Au Masculin 30ml",
        bundlePromoPrice: 230,
        referenceOriginalPrice: 298,
        referencePromoPrice: 230,
        sourceListId: "mslist-004",
        lastSyncedAt: "2026-03-15T10:30:00Z",
      }),
    ];

    for (const promo of samplePromos) {
      this.promotions.set(promo.id, promo);
    }

    // Seed some sample sales data for demo
    const today = new Date();
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      const dateStr = d.toISOString().split("T")[0];
      // Random sales for first 3 counters, first 5 brands
      for (let ci = 0; ci < 3; ci++) {
        for (let bi = 0; bi < 5; bi++) {
          const id = randomUUID();
          const units = Math.floor(Math.random() * 8) + 1;
          const amount = units * (Math.floor(Math.random() * 300) + 100);
          this.salesEntries.set(id, {
            id,
            counterId: counterIds[ci],
            brandId: brandIds[bi],
            date: dateStr,
            units,
            amount,
            gwpCount: 0,
          });
        }
      }
    }
  }

  // Counters
  async getCounters(): Promise<Counter[]> {
    return Array.from(this.counters.values());
  }

  async getCounter(id: string): Promise<Counter | undefined> {
    return this.counters.get(id);
  }

  async createCounter(data: InsertCounter): Promise<Counter> {
    const id = randomUUID();
    const counter: Counter = { id, name: data.name, isActive: data.isActive ?? true };
    this.counters.set(id, counter);
    return counter;
  }

  async updateCounter(id: string, data: Partial<InsertCounter>): Promise<Counter | undefined> {
    const counter = this.counters.get(id);
    if (!counter) return undefined;
    const updated = { ...counter, ...data };
    this.counters.set(id, updated);
    return updated;
  }

  // Brands
  async getBrands(): Promise<Brand[]> {
    return Array.from(this.brands.values());
  }

  async getBrand(id: string): Promise<Brand | undefined> {
    return this.brands.get(id);
  }

  async createBrand(data: InsertBrand): Promise<Brand> {
    const id = randomUUID();
    const brand: Brand = { id, name: data.name, category: data.category, isActive: data.isActive ?? true };
    this.brands.set(id, brand);
    return brand;
  }

  async updateBrand(id: string, data: Partial<InsertBrand>): Promise<Brand | undefined> {
    const brand = this.brands.get(id);
    if (!brand) return undefined;
    const updated = { ...brand, ...data };
    this.brands.set(id, updated);
    return updated;
  }

  // Counter-Brand assignments
  async getCounterBrands(): Promise<CounterBrand[]> {
    return Array.from(this.counterBrands.values());
  }

  async getCounterBrandsByCounter(counterId: string): Promise<CounterBrand[]> {
    return Array.from(this.counterBrands.values()).filter(cb => cb.counterId === counterId);
  }

  async setCounterBrand(counterId: string, brandId: string, enabled: boolean): Promise<void> {
    const existing = Array.from(this.counterBrands.values()).find(
      cb => cb.counterId === counterId && cb.brandId === brandId
    );
    if (enabled && !existing) {
      const id = randomUUID();
      this.counterBrands.set(id, { id, counterId, brandId });
    } else if (!enabled && existing) {
      this.counterBrands.delete(existing.id);
    }
  }

  // Sales entries
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

  async createSalesEntry(data: InsertSalesEntry): Promise<SalesEntry> {
    const id = randomUUID();
    const entry: SalesEntry = { id, ...data, units: data.units ?? 0, amount: data.amount ?? 0, gwpCount: data.gwpCount ?? 0 };
    this.salesEntries.set(id, entry);
    return entry;
  }

  async upsertSalesEntry(data: InsertSalesEntry): Promise<SalesEntry> {
    // Find existing entry for same counter + brand + date
    const existing = Array.from(this.salesEntries.values()).find(
      e => e.counterId === data.counterId && e.brandId === data.brandId && e.date === data.date
    );
    if (existing) {
      const updated: SalesEntry = { ...existing, units: data.units ?? 0, amount: data.amount ?? 0, gwpCount: data.gwpCount ?? 0 };
      this.salesEntries.set(existing.id, updated);
      return updated;
    }
    return this.createSalesEntry(data);
  }

  async submitBatchSales(submission: BatchSalesSubmission): Promise<void> {
    for (const entry of submission.entries) {
      if (entry.units > 0 || entry.amount > 0) {
        await this.upsertSalesEntry({
          counterId: submission.counterId,
          brandId: entry.brandId,
          date: submission.date,
          units: entry.units,
          amount: entry.amount,
          gwpCount: entry.gwpCount,
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

  // Promotions
  async getPromotions(): Promise<Promotion[]> {
    return Array.from(this.promotions.values());
  }

  async getPromotion(id: string): Promise<Promotion | undefined> {
    return this.promotions.get(id);
  }

  async getActivePromotions(date: string): Promise<Promotion[]> {
    return Array.from(this.promotions.values()).filter(
      p => p.isActive && p.startDate <= date && p.endDate >= date
    );
  }

  async createPromotion(data: InsertPromotion): Promise<Promotion> {
    const id = randomUUID();
    const promo = makePromotion(id, data);
    this.promotions.set(id, promo);
    return promo;
  }

  async updatePromotion(id: string, data: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    const promo = this.promotions.get(id);
    if (!promo) return undefined;
    const updated = { ...promo, ...data };
    this.promotions.set(id, updated as Promotion);
    return updated as Promotion;
  }

  async syncPromotionsFromImport(incoming: InsertPromotion[]): Promise<{ created: number; updated: number; total: number }> {
    let created = 0;
    let updated = 0;
    const existing = Array.from(this.promotions.values());

    for (const data of incoming) {
      // Match by name + startDate + endDate
      const match = existing.find(
        p => p.name === data.name && p.startDate === data.startDate && p.endDate === data.endDate
      );
      if (match) {
        // Update all fields
        const updatedPromo = makePromotion(match.id, { ...data });
        this.promotions.set(match.id, updatedPromo);
        updated++;
      } else {
        const id = randomUUID();
        const promo = makePromotion(id, data);
        this.promotions.set(id, promo);
        created++;
      }
    }
    return { created, updated, total: incoming.length };
  }

  // Promotion results
  async getPromotionResults(filters?: { promotionId?: string; counterId?: string; date?: string }): Promise<PromotionResult[]> {
    let results = Array.from(this.promotionResults.values());
    if (filters) {
      if (filters.promotionId) results = results.filter(r => r.promotionId === filters.promotionId);
      if (filters.counterId) results = results.filter(r => r.counterId === filters.counterId);
      if (filters.date) results = results.filter(r => r.date === filters.date);
    }
    return results;
  }

  async createPromotionResult(data: InsertPromotionResult): Promise<PromotionResult> {
    const id = randomUUID();
    const result: PromotionResult = { id, ...data, gwpGiven: data.gwpGiven ?? 0, notes: data.notes ?? null };
    this.promotionResults.set(id, result);
    return result;
  }

  async upsertPromotionResult(data: InsertPromotionResult): Promise<PromotionResult> {
    const existing = Array.from(this.promotionResults.values()).find(
      r => r.promotionId === data.promotionId && r.counterId === data.counterId && r.date === data.date
    );
    if (existing) {
      const updated: PromotionResult = { ...existing, gwpGiven: data.gwpGiven ?? 0, notes: data.notes ?? null };
      this.promotionResults.set(existing.id, updated);
      return updated;
    }
    return this.createPromotionResult(data);
  }
}

export const storage = new MemStorage();
