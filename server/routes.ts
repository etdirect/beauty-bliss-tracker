import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { batchSalesSubmissionSchema, insertCounterSchema, insertBrandSchema, insertPromotionSchema, insertCategorySchema, insertIncentiveSchemeSchema } from "@shared/schema";
import bcrypt from "bcryptjs";

// Extend express-session types
declare module "express-session" {
  interface SessionData {
    userId: string;
    role: string;
  }
}

// ── Auth middleware ──
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

async function requireManagement(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  // If role not in session (old session), fetch from DB
  if (!req.session.role) {
    const user = await storage.getUser(req.session.userId);
    if (user) req.session.role = user.role;
  }
  if (req.session.role !== "management") {
    res.status(403).json({ error: "Management access required" });
    return;
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // === PUBLIC ENDPOINTS (no auth — server-to-server) ===
  app.get("/api/public/pos-locations", async (_req, res) => {
    try {
      const locations = await storage.getPosLocations();
      const active = locations.filter((l: any) => l.isActive);
      res.json(active.map((l: any) => ({ id: l.id, salesChannel: l.salesChannel, storeCode: l.storeCode, storeName: l.storeName })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === AUTH ROUTES ===
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, pin } = req.body;
      if (!username || !pin) {
        return res.status(400).json({ error: "Username and PIN required" });
      }
      const user = await storage.getUserByUsername(username);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const valid = await bcrypt.compare(pin, user.pin);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      // Set session
      req.session.userId = user.id;
      req.session.role = user.role;

      // Get assigned POS
      const assignments = await storage.getUserPosAssignments(user.id);
      const posLocations = await storage.getPosLocations();
      const assignedPos = assignments
        .map(a => posLocations.find(p => p.id === a.posId))
        .filter(Boolean);

      return res.json({
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        canViewHistory: user.canViewHistory,
        assignedPos,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "User not found or inactive" });
    }
    const assignments = await storage.getUserPosAssignments(user.id);
    const posLocations = await storage.getPosLocations();
    const assignedPos = assignments
      .map(a => posLocations.find(p => p.id === a.posId))
      .filter(Boolean);

    return res.json({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      canViewHistory: user.canViewHistory,
      assignedPos,
    });
  });

  // === POS LOCATIONS ===
  app.get("/api/pos-locations", requireAuth, async (_req, res) => {
    const locations = await storage.getPosLocations();
    res.json(locations);
  });

  app.post("/api/pos-locations", requireManagement, async (req, res) => {
    const { salesChannel, storeCode, storeName } = req.body;
    if (!salesChannel || !storeCode || !storeName) {
      return res.status(400).json({ error: "salesChannel, storeCode, storeName required" });
    }
    const pos = await storage.createPosLocation({ salesChannel, storeCode, storeName, isActive: req.body.isActive ?? true });
    res.json(pos);
  });

  app.patch("/api/pos-locations/:id", requireManagement, async (req, res) => {
    const pos = await storage.updatePosLocation(req.params.id as string, req.body);
    if (!pos) return res.status(404).json({ error: "Not found" });
    res.json(pos);
  });

  // === USERS ===
  app.get("/api/users", requireManagement, async (_req, res) => {
    const users = await storage.getUsers();
    // Don't send PINs to client
    const safe = users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, isActive: u.isActive, canViewHistory: u.canViewHistory }));
    res.json(safe);
  });

  app.post("/api/users", requireManagement, async (req, res) => {
    try {
      const { username, pin, name, role } = req.body;
      if (!username || !pin || !name) {
        return res.status(400).json({ error: "username, pin, name required" });
      }
      const hashed = await bcrypt.hash(pin, 10);
      const user = await storage.createUser({ username, pin: hashed, name, role: role || "ba", isActive: true });
      res.json({ id: user.id, username: user.username, name: user.name, role: user.role, isActive: user.isActive, canViewHistory: user.canViewHistory });
    } catch (err: any) {
      const msg = err.message?.includes("unique") || err.message?.includes("UNIQUE") ? "Username already exists" : err.message;
      res.status(400).json({ error: msg });
    }
  });

  app.patch("/api/users/:id", requireManagement, async (req, res) => {
    try {
      const updates: any = { ...req.body };
      if (updates.pin) {
        updates.pin = await bcrypt.hash(updates.pin, 10);
      }
      const user = await storage.updateUser(req.params.id as string, updates);
      if (!user) return res.status(404).json({ error: "Not found" });
      res.json({ id: user.id, username: user.username, name: user.name, role: user.role, isActive: user.isActive, canViewHistory: user.canViewHistory });
    } catch (err: any) {
      const msg = err.message?.includes("unique") || err.message?.includes("UNIQUE") ? "Username already exists" : err.message;
      res.status(400).json({ error: msg });
    }
  });

  // === USER-POS ASSIGNMENTS ===
  app.get("/api/user-pos-assignments", requireAuth, async (req, res) => {
    const userId = (req.query.userId as string) || undefined;
    const assignments = await storage.getUserPosAssignments(userId);
    res.json(assignments);
  });

  app.post("/api/user-pos-assignments", requireManagement, async (req, res) => {
    const { userId, posId, enabled } = req.body;
    if (!userId || !posId || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "userId, posId, enabled required" });
    }
    await storage.setUserPosAssignment(userId, posId, enabled);
    res.json({ success: true });
  });

  // === BRAND-POS AVAILABILITY ===
  app.get("/api/brand-pos-availability", requireAuth, async (req, res) => {
    const posId = (req.query.posId as string) || undefined;
    const availability = await storage.getBrandPosAvailability(posId);
    res.json(availability);
  });

  app.post("/api/brand-pos-availability", requireManagement, async (req, res) => {
    const { brandId, posId, enabled } = req.body;
    if (!brandId || !posId || typeof enabled !== "boolean") {
      return res.status(400).json({ error: "brandId, posId, enabled required" });
    }
    await storage.setBrandPosAvailability(brandId, posId, enabled);
    res.json({ success: true });
  });

  // === COUNTERS (legacy, protected) ===
  app.get("/api/counters", requireAuth, async (_req, res) => {
    const counters = await storage.getCounters();
    res.json(counters);
  });

  app.post("/api/counters", requireManagement, async (req, res) => {
    const parsed = insertCounterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const counter = await storage.createCounter(parsed.data);
    res.json(counter);
  });

  app.patch("/api/counters/:id", requireManagement, async (req, res) => {
    const counter = await storage.updateCounter(req.params.id as string, req.body);
    if (!counter) return res.status(404).json({ error: "Not found" });
    res.json(counter);
  });

  // === BRANDS ===
  // === CATEGORIES ===
  app.get("/api/categories", requireAuth, async (_req, res) => {
    const categories = await storage.getCategories();
    res.json(categories);
  });

  app.post("/api/categories", requireManagement, async (req, res) => {
    const parsed = insertCategorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const cat = await storage.createCategory(parsed.data);
    res.json(cat);
  });

  app.patch("/api/categories/:id", requireManagement, async (req, res) => {
    const cat = await storage.updateCategory(req.params.id as string, req.body);
    if (!cat) return res.status(404).json({ error: "Not found" });
    res.json(cat);
  });

  app.delete("/api/categories/:id", requireManagement, async (req, res) => {
    await storage.deleteCategory(req.params.id as string);
    res.json({ ok: true });
  });

  // === BRANDS ===
  app.get("/api/brands", requireAuth, async (_req, res) => {
    const brands = await storage.getBrands();
    res.json(brands);
  });

  app.post("/api/brands", requireManagement, async (req, res) => {
    const parsed = insertBrandSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const brand = await storage.createBrand(parsed.data);
    res.json(brand);
  });

  app.patch("/api/brands/:id", requireManagement, async (req, res) => {
    const brand = await storage.updateBrand(req.params.id as string, req.body);
    if (!brand) return res.status(404).json({ error: "Not found" });
    res.json(brand);
  });

  // === COUNTER-BRAND ASSIGNMENTS (legacy, protected) ===
  app.get("/api/counter-brands", requireAuth, async (_req, res) => {
    const assignments = await storage.getCounterBrands();
    res.json(assignments);
  });

  app.get("/api/counter-brands/:counterId", requireAuth, async (req, res) => {
    const assignments = await storage.getCounterBrandsByCounter(req.params.counterId as string);
    res.json(assignments);
  });

  app.post("/api/counter-brands", requireManagement, async (req, res) => {
    const { counterId, brandId, enabled } = req.body;
    await storage.setCounterBrand(counterId, brandId, enabled);
    res.json({ success: true });
  });

  // === SALES ENTRIES ===
  app.get("/api/sales", requireAuth, async (req, res) => {
    const filters: any = {};
    if (req.query.counterId) filters.counterId = req.query.counterId as string;
    if (req.query.brandId) filters.brandId = req.query.brandId as string;
    if (req.query.date) filters.date = req.query.date as string;
    if (req.query.startDate) filters.startDate = req.query.startDate as string;
    if (req.query.endDate) filters.endDate = req.query.endDate as string;
    const entries = await storage.getSalesEntries(filters);
    res.json(entries);
  });

  app.post("/api/sales/batch", requireAuth, async (req, res) => {
    const parsed = batchSalesSubmissionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const userId = req.session.userId;
    await storage.submitBatchSales(parsed.data, userId);
    res.json({ success: true });
  });

  // === PROMOTIONS ===
  app.get("/api/promotions", requireAuth, async (_req, res) => {
    const promotions = await storage.getPromotions();
    res.json(promotions);
  });

  app.get("/api/promotions/active", requireAuth, async (req, res) => {
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
    const promos = await storage.getActivePromotions(date);
    res.json(promos);
  });

  app.post("/api/promotions", requireManagement, async (req, res) => {
    const parsed = insertPromotionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
    const promo = await storage.createPromotion(parsed.data);
    res.json(promo);
  });

  app.patch("/api/promotions/:id", requireManagement, async (req, res) => {
    const promo = await storage.updatePromotion(req.params.id as string, req.body);
    if (!promo) return res.status(404).json({ error: "Not found" });
    res.json(promo);
  });

  // DELETE promotion (management or server-to-server)
  app.delete("/api/promotions/:id", requireManagement, async (req, res) => {
    try {
      await storage.deletePromotion(req.params.id as string);
      return res.json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // DELETE promotion by source scenario ID (server-to-server from Simulator, no auth)
  app.delete("/api/promotions/by-source/:sourceId", async (req, res) => {
    try {
      const count = await storage.deletePromotionBySourceId(req.params.sourceId);
      return res.json({ ok: true, deleted: count });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // POST /api/promotions/push — receive promotion from Simulator (no auth — server-to-server)
  app.post("/api/promotions/push", async (req, res) => {
    try {
      const data = req.body;
      if (!data.name || !data.type || !data.startDate || !data.endDate) {
        return res.status(400).json({ error: "name, type, startDate, endDate are required" });
      }

      // Resolve brandName to brandId early (needed for both create and update)
      if (!data.brandId && data.brandName) {
        const allBrands = await storage.getBrands();
        const brandMatch = allBrands.find((b: any) => b.name.toLowerCase() === data.brandName.toLowerCase());
        if (brandMatch) data.brandId = brandMatch.id;
      }

      const existing = await storage.getPromotions();

      // Check 1: exact match by sourceScenarioId (same push, re-pushed)
      if (data.sourceScenarioId) {
        const match = existing.find(p => p.sourceScenarioId === data.sourceScenarioId && p.promotionLayer === data.promotionLayer);
        if (match) {
          const updated = await storage.updatePromotion(match.id, data);
          return res.json({ action: "updated", promotion: updated });
        }
      }

      // Check 2: duplicate detection for counter/channel promos
      // If another team already pushed an identical counter/channel promo for the same period, skip it
      if (data.promotionLayer === "counter" || data.promotionLayer === "channel") {
        const duplicate = existing.find(p =>
          p.promotionLayer === data.promotionLayer &&
          p.type === data.type &&
          p.startDate === data.startDate &&
          p.endDate === data.endDate &&
          p.isActive &&
          // Match by mechanics (the description of what the promo does)
          p.mechanics === data.mechanics
        );
        if (duplicate) {
          return res.json({
            action: "skipped",
            reason: `A ${data.promotionLayer} promotion with the same mechanics already exists for this period: "${duplicate.name}"`,
            existingPromotion: duplicate,
          });
        }
      }

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

  // === INCENTIVE SCHEMES ===
  app.get("/api/incentive-schemes", requireAuth, async (_req, res) => {
    try {
      const schemes = await storage.listIncentiveSchemes();
      res.json(schemes);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.get("/api/incentive-schemes/month/:month", requireAuth, async (req, res) => {
    try {
      const schemes = await storage.getIncentiveSchemesByMonth(req.params.month);
      res.json(schemes);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.get("/api/incentive-progress", requireAuth, async (req, res) => {
    try {
      const month = req.query.month as string;
      const userId = req.query.userId as string | undefined;
      const posId = req.query.posId as string | undefined;
      if (!month) return res.status(400).json({ error: "month required" });
      const progress = await storage.getIncentiveProgress(month, userId, posId);
      res.json(progress);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Daily incentive progress for a specific date
  app.get("/api/incentive-progress-daily", requireAuth, async (req, res) => {
    try {
      const month = req.query.month as string;
      const date = req.query.date as string;
      const userId = req.query.userId as string | undefined;
      if (!month || !date) return res.status(400).json({ error: "month and date required" });
      const progress = await storage.getIncentiveProgressDaily(month, date, userId);
      res.json(progress);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Incentive daily entries (BA input)
  app.get("/api/incentive-entries", requireAuth, async (req, res) => {
    try {
      const { schemeId, userId, month } = req.query as { schemeId: string; userId: string; month: string };
      if (!schemeId || !userId || !month) return res.status(400).json({ error: "schemeId, userId, month required" });
      const entries = await storage.getIncentiveEntries(schemeId, userId, month);
      res.json(entries);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.get("/api/incentive-entry", requireAuth, async (req, res) => {
    try {
      const { schemeId, userId, date } = req.query as { schemeId: string; userId: string; date: string };
      if (!schemeId || !userId || !date) return res.status(400).json({ error: "schemeId, userId, date required" });
      const value = await storage.getIncentiveEntry(schemeId, userId, date);
      res.json({ value });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post("/api/incentive-entry", requireAuth, async (req, res) => {
    try {
      const { schemeId, date, value, posId } = req.body;
      const userId = req.session.userId;
      if (!schemeId || !date || value === undefined || !userId) return res.status(400).json({ error: "schemeId, date, value required" });
      await storage.upsertIncentiveEntry(schemeId, userId, date, Number(value), posId);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Bulk get today's entries for all schemes (for BA view)
  app.get("/api/incentive-entries-daily", requireAuth, async (req, res) => {
    try {
      const { month, date, userId } = req.query as { month: string; date: string; userId: string };
      if (!month || !date || !userId) return res.status(400).json({ error: "month, date, userId required" });
      const schemes = await storage.getIncentiveSchemesByMonth(month);
      const result: Record<string, number> = {};
      for (const s of schemes) {
        result[s.id] = await storage.getIncentiveEntry(s.id, userId, date);
      }
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  // Bulk get accumulated entries for all schemes in a month
  app.get("/api/incentive-entries-total", requireAuth, async (req, res) => {
    try {
      const { month, userId } = req.query as { month: string; userId: string };
      if (!month || !userId) return res.status(400).json({ error: "month, userId required" });
      const schemes = await storage.getIncentiveSchemesByMonth(month);
      const result: Record<string, number> = {};
      for (const s of schemes) {
        const entries = await storage.getIncentiveEntries(s.id, userId, month);
        result[s.id] = entries.reduce((sum, e) => sum + e.value, 0);
      }
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.get("/api/incentive-schemes/:id", requireAuth, async (req, res) => {
    try {
      const scheme = await storage.getIncentiveScheme(req.params.id);
      if (!scheme) return res.status(404).json({ error: "Not found" });
      res.json(scheme);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.post("/api/incentive-schemes", requireManagement, async (req, res) => {
    try {
      const data = req.body;
      if (!data.name || !data.month || !data.category || !data.metric) {
        return res.status(400).json({ error: "name, month, category, and metric are required" });
      }
      const scheme = await storage.createIncentiveScheme(data);
      res.json(scheme);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.patch("/api/incentive-schemes/:id", requireManagement, async (req, res) => {
    try {
      const scheme = await storage.updateIncentiveScheme(req.params.id, req.body);
      if (!scheme) return res.status(404).json({ error: "Not found" });
      res.json(scheme);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
  app.delete("/api/incentive-schemes/:id", requireManagement, async (req, res) => {
    try {
      await storage.deleteIncentiveScheme(req.params.id);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // === PROMOTION RESULTS ===
  app.get("/api/promotion-results", requireAuth, async (req, res) => {
    const filters: any = {};
    if (req.query.promotionId) filters.promotionId = req.query.promotionId as string;
    if (req.query.counterId) filters.counterId = req.query.counterId as string;
    if (req.query.date) filters.date = req.query.date as string;
    const results = await storage.getPromotionResults(filters);
    res.json(results);
  });

  // === DELETE SALES BY DATE RANGE (management only) ===
  app.delete("/api/sales", requireManagement, async (req, res) => {
    try {
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      if (!startDate || !endDate) return res.status(400).json({ error: "startDate and endDate required" });
      // Get entries in range then delete each
      const entries = await storage.getSalesEntries({ startDate, endDate });
      for (const e of entries) {
        await storage.deleteSalesEntry(e.id);
      }
      res.json({ deleted: entries.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === BULK SALES IMPORT (management only) ===
  app.post("/api/sales/import", requireManagement, async (req, res) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: "records array required" });

      const posLocations = await storage.getPosLocations();
      const brands = await storage.getBrands();
      let skipped = 0;
      const missingPos: string[] = [];
      const missingBrands: string[] = [];
      const entriesToUpsert: { counterId: string; brandId: string; date: string; orders: number; units: number; amount: number; gwpCount: number }[] = [];

      // Phase 1: resolve POS and brands, build entries array
      for (const rec of records) {
        const { date, salesChannel, posCode, brandName, amount, orders, units } = rec;
        if (!date || !posCode || !brandName) { skipped++; continue; }

        // Find POS by channel + code
        const channel = salesChannel || "LOGON";
        let pos = posLocations.find(p => p.salesChannel.toUpperCase() === channel.toUpperCase() && p.storeCode.toUpperCase() === posCode.toUpperCase());

        // Create POS if not found
        if (!pos) {
          if (!missingPos.includes(`${channel}/${posCode}`)) missingPos.push(`${channel}/${posCode}`);
          pos = await storage.createPosLocation({ salesChannel: channel, storeCode: posCode, storeName: `${channel} ${posCode} (auto-created)`, isActive: false });
          posLocations.push(pos);
        }

        // Find brand
        const brand = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
        if (!brand) {
          if (!missingBrands.includes(brandName)) missingBrands.push(brandName);
          skipped++;
          continue;
        }

        entriesToUpsert.push({
          counterId: pos.id,
          brandId: brand.id,
          date,
          orders: orders ?? 0,
          units: units ?? 0,
          amount: amount ?? 0,
          gwpCount: 0,
        });
      }

      // Phase 2: deduplicate entries (last wins for same counter+brand+date)
      const deduped = new Map<string, typeof entriesToUpsert[0]>();
      for (const e of entriesToUpsert) {
        deduped.set(`${e.counterId}|${e.brandId}|${e.date}`, e);
      }
      const uniqueEntries = Array.from(deduped.values());

      // Phase 3: bulk upsert all entries
      const imported = await storage.bulkUpsertSalesEntries(uniqueEntries);

      res.json({ imported, skipped, missingPos, missingBrands, total: records.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // === UPDATE UNITS ONLY (management only) ===
  app.post("/api/sales/update-units", requireManagement, async (req, res) => {
    try {
      const { records } = req.body;
      if (!Array.isArray(records)) return res.status(400).json({ error: "records array required" });

      const posLocations = await storage.getPosLocations();
      const brands = await storage.getBrands();
      let updated = 0;
      let skipped = 0;
      const notFound: string[] = [];

      for (const rec of records) {
        const { date, salesChannel, posCode, brandName, units } = rec;
        if (!date || !posCode || !brandName || units === undefined) { skipped++; continue; }

        const channel = salesChannel || "LOGON";
        const pos = posLocations.find(p => p.salesChannel.toUpperCase() === channel.toUpperCase() && p.storeCode.toUpperCase() === posCode.toUpperCase());
        if (!pos) { skipped++; continue; }

        const brand = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
        if (!brand) { skipped++; continue; }

        // Find existing entry and update only units
        const entries = await storage.getSalesEntries({ counterId: pos.id, brandId: brand.id, date });
        if (entries.length > 0) {
          await storage.upsertSalesEntry({
            counterId: pos.id,
            brandId: brand.id,
            date,
            orders: entries[0].orders,
            units: units,
            amount: entries[0].amount,
            gwpCount: entries[0].gwpCount,
          });
          updated++;
        } else {
          // No existing entry — create one with just units (amount=0)
          await storage.upsertSalesEntry({
            counterId: pos.id,
            brandId: brand.id,
            date,
            orders: 0,
            units: units,
            amount: 0,
            gwpCount: 0,
          });
          updated++;
          if (!notFound.includes(`${channel}/${posCode}/${brandName}/${date}`)) {
            notFound.push(`${channel}/${posCode}/${brandName}/${date}`);
          }
        }
      }

      res.json({ updated, skipped, newEntries: notFound.length, total: records.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Temporary: cleanup test data before 2026-04-01 ───
  app.post("/api/admin/cleanup-test-data", requireAuth, async (req: Request, res: Response) => {
    try {
      const session = (req as any).session;
      if (session?.role !== "admin") return res.status(403).json({ message: "Admin only" });
      const cutoffDate = "2026-04-01";
      const r1 = await (storage as any).query("DELETE FROM sales_entries WHERE date < $1", [cutoffDate]);
      const r2 = await (storage as any).query("DELETE FROM promotion_results WHERE date < $1", [cutoffDate]);
      const r3 = await (storage as any).query("DELETE FROM incentive_entries WHERE date < $1", [cutoffDate]);
      return res.json({
        ok: true,
        deleted: {
          sales_entries: r1.rowCount ?? 0,
          promotion_results: r2.rowCount ?? 0,
          incentive_entries: r3.rowCount ?? 0,
        },
        message: `Deleted all data before ${cutoffDate}`,
      });
    } catch (e: any) {
      return res.status(500).json({ message: e.message });
    }
  });

  return httpServer;
}
