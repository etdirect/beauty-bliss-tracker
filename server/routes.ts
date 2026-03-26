import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { batchSalesSubmissionSchema, insertCounterSchema, insertBrandSchema, insertPromotionSchema } from "@shared/schema";
import type { InsertPromotion, Brand } from "@shared/schema";
import { parse } from "csv-parse/sync";

// Brand code mapping for Microsoft List import
const BRAND_CODE_MAP: Record<string, string> = {
  "AD": "Adopt",
  "EM": "Embryolisse",
  "PH": "PHYTO",
  "NV": "Novexpert",
  "TK": "TALIKA",
  "SP": "SAMPAR",
  "KL": "Klorane",
  "LA": "LADOR",
  "PE": "PESTLO",
  "ND": "Neutraderm",
  "GE": "GESKE",
  "AS": "ASDceuticals",
  "EE": "elvis+elvin",
  "XP": "XPOSOME",
};

// Map Microsoft List PromotionType to our type field
function mapPromotionType(msType: string): string {
  const typeMap: Record<string, string> = {
    "Multi-Buy": "Multi-Buy",
    "Percentage Discount": "Percentage Discount",
    "PWP": "PWP",
    "Bundle Deal": "Bundle Deal",
    "GWP": "GWP",
    "Spend & Get": "Spend & Get",
  };
  return typeMap[msType] || msType || "Other";
}

function findBrandByCode(code: string, brands: Brand[]): Brand | undefined {
  if (!code) return undefined;
  const codeTrimmed = code.trim();

  // First try the explicit mapping
  const mappedName = BRAND_CODE_MAP[codeTrimmed.toUpperCase()];
  if (mappedName) {
    const found = brands.find(b => b.name.toLowerCase() === mappedName.toLowerCase());
    if (found) return found;
  }

  // Try case-insensitive prefix match
  const found = brands.find(b => b.name.toLowerCase().startsWith(codeTrimmed.toLowerCase()));
  if (found) return found;

  // Try if the code is a full brand name
  return brands.find(b => b.name.toLowerCase() === codeTrimmed.toLowerCase());
}

function parseNum(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function parseInt_(val: string | undefined): number | null {
  if (!val || val.trim() === "") return null;
  const n = parseInt(val, 10);
  return isNaN(n) ? null : n;
}

function parseDate(val: string | undefined): string | null {
  if (!val || val.trim() === "") return null;
  // Try ISO format first
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split("T")[0];
  }
  return val.trim();
}

function strOrNull(val: string | undefined): string | null {
  if (!val || val.trim() === "") return null;
  return val.trim();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === COUNTERS ===
  app.get("/api/counters", async (_req, res) => {
    const counters = await storage.getCounters();
    res.json(counters);
  });

  app.post("/api/counters", async (req, res) => {
    const parsed = insertCounterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const counter = await storage.createCounter(parsed.data);
    res.json(counter);
  });

  app.patch("/api/counters/:id", async (req, res) => {
    const counter = await storage.updateCounter(req.params.id, req.body);
    if (!counter) return res.status(404).json({ error: "Not found" });
    res.json(counter);
  });

  // === BRANDS ===
  app.get("/api/brands", async (_req, res) => {
    const brands = await storage.getBrands();
    res.json(brands);
  });

  app.post("/api/brands", async (req, res) => {
    const parsed = insertBrandSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const brand = await storage.createBrand(parsed.data);
    res.json(brand);
  });

  app.patch("/api/brands/:id", async (req, res) => {
    const brand = await storage.updateBrand(req.params.id, req.body);
    if (!brand) return res.status(404).json({ error: "Not found" });
    res.json(brand);
  });

  // === COUNTER-BRAND ASSIGNMENTS ===
  app.get("/api/counter-brands", async (_req, res) => {
    const assignments = await storage.getCounterBrands();
    res.json(assignments);
  });

  app.get("/api/counter-brands/:counterId", async (req, res) => {
    const assignments = await storage.getCounterBrandsByCounter(req.params.counterId);
    res.json(assignments);
  });

  app.post("/api/counter-brands", async (req, res) => {
    const { counterId, brandId, enabled } = req.body;
    await storage.setCounterBrand(counterId, brandId, enabled);
    res.json({ success: true });
  });

  // === SALES ENTRIES ===
  app.get("/api/sales", async (req, res) => {
    const filters: any = {};
    if (req.query.counterId) filters.counterId = req.query.counterId;
    if (req.query.brandId) filters.brandId = req.query.brandId;
    if (req.query.date) filters.date = req.query.date;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    const entries = await storage.getSalesEntries(filters);
    res.json(entries);
  });

  app.post("/api/sales/batch", async (req, res) => {
    const parsed = batchSalesSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    await storage.submitBatchSales(parsed.data);
    res.json({ success: true });
  });

  // === PROMOTIONS ===
  app.get("/api/promotions", async (_req, res) => {
    const promotions = await storage.getPromotions();
    res.json(promotions);
  });

  app.get("/api/promotions/active", async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const promos = await storage.getActivePromotions(date);
    res.json(promos);
  });

  app.post("/api/promotions", async (req, res) => {
    const parsed = insertPromotionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const promo = await storage.createPromotion(parsed.data);
    res.json(promo);
  });

  app.patch("/api/promotions/:id", async (req, res) => {
    const promo = await storage.updatePromotion(req.params.id, req.body);
    if (!promo) return res.status(404).json({ error: "Not found" });
    res.json(promo);
  });

  // === CSV SYNC FROM MICROSOFT LISTS ===
  app.post("/api/promotions/sync-csv", async (req, res) => {
    try {
      const { csvText } = req.body;
      if (!csvText || typeof csvText !== "string") {
        return res.status(400).json({ error: "csvText is required" });
      }

      const brands = await storage.getBrands();
      const records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
        relax_column_count: true,
      }) as Record<string, string>[];

      const now = new Date().toISOString();
      const promotions: InsertPromotion[] = [];

      for (const row of records) {
        const brandCode = row["BrandCode"] || row["Brand Code"] || "";
        const brand = findBrandByCode(brandCode, brands);

        const promotionName = row["PromotionName"] || row["Promotion Name"] || row["Title"] || "";
        const startDate = parseDate(row["StartDate"] || row["Start Date"]);
        const endDate = parseDate(row["EndDate"] || row["End Date"]);

        if (!promotionName || !startDate || !endDate) continue;

        const mechanicsText = strOrNull(row["Mechanics"]);
        const promoType = mapPromotionType(row["PromotionType"] || row["Promotion Type"] || "");

        const promo: InsertPromotion = {
          name: promotionName,
          brandId: brand?.id ?? null,
          type: promoType,
          description: mechanicsText || promotionName,
          startDate,
          endDate,
          isActive: true,
          shopLocation: strOrNull(row["ShopLocation"] || row["Shop Location"]),
          mechanics: mechanicsText,
          promoAppliesTo: strOrNull(row["PromoAppliesTo"] || row["Promo Applies To"]),
          applicableProducts: strOrNull(row["ApplicableProducts"] || row["Applicable Products"]),
          exclusions: strOrNull(row["Exclusions"]),
          discountPercentage: parseNum(row["DiscountPercentage"] || row["Discount Percentage"]),
          discountFixedAmount: parseNum(row["DiscountFixedAmount"] || row["Discount Fixed Amount"]),
          gwpItem: strOrNull(row["GWP_Item"] || row["GWP Item"]),
          gwpValue: parseNum(row["GWP_Value"] || row["GWP Value"]),
          gwpQty: parseInt_(row["GWP_Qty"] || row["GWP Qty"]),
          pwpItem: strOrNull(row["PWP_Item"] || row["PWP Item"]),
          pwpPrice: parseNum(row["PWP_Price"] || row["PWP Price"]),
          pwpDiscountPercentage: parseNum(row["PWP_DiscountPercentage"] || row["PWP Discount Percentage"]),
          bundlePromoPrice: parseNum(row["Bundle_PromoPrice"] || row["Bundle Promo Price"]),
          multiBuyBuyQty: parseInt_(row["MultiBuy_BuyQty"] || row["MultiBuy Buy Qty"]),
          multiBuyGetQty: parseInt_(row["MultiBuy_GetQty"] || row["MultiBuy Get Qty"]),
          multiBuyGetType: strOrNull(row["MultiBuy_GetType"] || row["MultiBuy Get Type"]),
          multiBuyFixedPrice: parseNum(row["MultiBuy_FixedPrice"] || row["MultiBuy Fixed Price"]),
          spendGetSpendAmount: parseNum(row["SpendGet_SpendAmount"] || row["Spend Get Spend Amount"]),
          spendGetDiscountAmount: parseNum(row["SpendGet_DiscountAmount"] || row["Spend Get Discount Amount"]),
          conditionMinimumSpend: parseNum(row["Condition_MinimumSpend"] || row["Condition Minimum Spend"]),
          conditionMinimumQty: parseInt_(row["Condition_MinimumQty"] || row["Condition Minimum Qty"]),
          conditionRequiredItems: strOrNull(row["Condition_RequiredItems"] || row["Condition Required Items"]),
          conditionOther: strOrNull(row["Condition_Other"] || row["Condition Other"]),
          referenceOriginalPrice: parseNum(row["Reference_OriginalPrice"] || row["Reference Original Price"]),
          referencePromoPrice: parseNum(row["Reference_PromoPrice"] || row["Reference Promo Price"]),
          remarks: strOrNull(row["Remarks"]),
          enteredBy: strOrNull(row["EnteredBy"] || row["Entered By"]),
          dateEntered: strOrNull(row["DateEntered"] || row["Date Entered"]),
          sourceListId: `mslist-${Date.now()}`,
          lastSyncedAt: now,
        };

        promotions.push(promo);
      }

      if (promotions.length === 0) {
        return res.status(400).json({ error: "No valid promotions found in CSV. Ensure columns PromotionName, StartDate, and EndDate are present." });
      }

      const result = await storage.syncPromotionsFromImport(promotions);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: `CSV parse error: ${err.message}` });
    }
  });

  // === PROMOTION RESULTS ===
  app.get("/api/promotion-results", async (req, res) => {
    const filters: any = {};
    if (req.query.promotionId) filters.promotionId = req.query.promotionId;
    if (req.query.counterId) filters.counterId = req.query.counterId;
    if (req.query.date) filters.date = req.query.date;
    const results = await storage.getPromotionResults(filters);
    res.json(results);
  });

  return httpServer;
}
