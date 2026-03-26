import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { batchSalesSubmissionSchema, insertCounterSchema, insertBrandSchema, insertPromotionSchema } from "@shared/schema";
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

function requireManagement(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
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
    const safe = users.map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, isActive: u.isActive }));
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
      res.json({ id: user.id, username: user.username, name: user.name, role: user.role, isActive: user.isActive });
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
      res.json({ id: user.id, username: user.username, name: user.name, role: user.role, isActive: user.isActive });
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
    await storage.submitBatchSales(parsed.data);
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

  // POST /api/promotions/push — receive promotion from Simulator (no auth — server-to-server)
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
          const updated = await storage.updatePromotion(match.id, data);
          return res.json({ action: "updated", promotion: updated });
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
      let imported = 0;
      let skipped = 0;
      const missingPos: string[] = [];

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
          posLocations.push(pos); // add to local cache
        }

        // Find brand
        const brand = brands.find(b => b.name.toLowerCase() === brandName.toLowerCase());
        if (!brand) { skipped++; continue; }

        await storage.upsertSalesEntry({
          counterId: pos.id,
          brandId: brand.id,
          date,
          orders: orders ?? 0,
          units: units ?? 0,
          amount: amount ?? 0,
          gwpCount: 0,
        });
        imported++;
      }

      res.json({ imported, skipped, missingPos, total: records.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
