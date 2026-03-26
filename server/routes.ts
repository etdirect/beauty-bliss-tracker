import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { batchSalesSubmissionSchema, insertCounterSchema, insertBrandSchema, insertPromotionSchema } from "@shared/schema";

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

  // POST /api/promotions/push — receive promotion from Simulator
  app.post("/api/promotions/push", async (req, res) => {
    try {
      const data = req.body;
      if (!data.name || !data.type || !data.startDate || !data.endDate) {
        return res.status(400).json({ error: "name, type, startDate, endDate are required" });
      }

      // Check if this promotion was already pushed (by sourceScenarioId)
      if (data.sourceScenarioId) {
        const existing = await storage.getPromotions();
        const match = existing.find(p => p.sourceScenarioId === data.sourceScenarioId && p.promotionLayer === data.promotionLayer);
        if (match) {
          // Update existing
          const updated = await storage.updatePromotion(match.id, data);
          return res.json({ action: "updated", promotion: updated });
        }
      }

      // Create new
      const promo = await storage.createPromotion({
        ...data,
        sourceApp: data.sourceApp || "simulator",
        trackable: data.trackable ?? false,
        isActive: data.isActive ?? true,
      });
      return res.json({ action: "created", promotion: promo });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
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
