import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { MonthLockedError, commissionRepo } from "./commissionRepo";
import {
  activeCounters,
  baForCounter,
  calculateCounter,
  posIdsOf,
  projectionFor,
  referenceMonths,
  targetPreview,
} from "./commissionCompute";
import {
  canAssignRole,
  canEditActuals,
  canEditCommissionSettings,
  canEditRoster,
  canLockMonth,
  canReopenMonth,
  canSeePay,
  canSetTargets,
  monthEditDecision,
  payRouteDecision,
} from "@shared/access";
import { posIdsForCounter } from "@shared/scheme";

async function actor(req: Request) {
  const id = req.session?.userId;
  if (!id) return undefined;
  return storage.getUser(id);
}

function deny(res: Response) {
  return res.status(403).json({ error: "You do not have access to this" });
}

function fail(res: Response, err: unknown) {
  if (err instanceof MonthLockedError) return res.status(403).json({ error: "This month is locked" });
  if (err instanceof Error && err.message === "REASON_REQUIRED") {
    return res.status(400).json({ error: "A reason is required when changing a published target" });
  }
  console.error("[commission] request failed");
  return res.status(500).json({ error: "Could not save" });
}

export function registerCommissionRoutes(app: Express) {
  app.get("/api/commission/counters", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const [counters, users, assignments, locations] = await Promise.all([
      activeCounters(),
      storage.getUsers(),
      storage.getUserPosAssignments(),
      storage.getPosLocations(),
    ]);
    const withBa = counters.map(counter => {
      const shopIds = new Set(posIdsForCounter(counter, locations));
      const stationed = users.filter(u =>
        u.isActive && u.role === "ba" && u.canViewHistory &&
        assignments.some(a => a.userId === u.id && shopIds.has(a.posId)),
      );
      return {
        ...counter,
        stationedUserId: stationed.length === 1 ? stationed[0].id : null,
        stationedName: stationed.length === 1 ? stationed[0].name : null,
      };
    });
    if (user.role === "ba" || user.role === "part_time") {
      const assigns = await storage.getUserPosAssignments(user.id);
      const mine = new Set(assigns.map(a => a.posId));
      return res.json(withBa.filter(c => c.members.some(m => m.posId && mine.has(m.posId)) || posIdsForCounter(c, locations).some(id => mine.has(id))));
    }
    if (user.role === "management") return res.json([]);
    return res.json(withBa);
  });

  app.get("/api/commission/settings", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    const repo = commissionRepo();
    const [settings, tiers, counters, steps] = await Promise.all([
      repo.getSettings(), repo.listTiers(), repo.listCounters(), repo.listStepPlans(),
    ]);
    res.json({ settings, tiers, counters, steps });
  });

  app.put("/api/commission/settings", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    try {
      await commissionRepo().saveSettings(req.body ?? {}, user.id);
      res.json(await commissionRepo().getSettings());
    } catch (err) { fail(res, err); }
  });

  app.put("/api/commission/tiers", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    const tierTable = req.body?.tierTable;
    const rows = req.body?.rows;
    if (tierTable !== "L" && tierTable !== "S" || !Array.isArray(rows)) {
      return res.status(400).json({ error: "Choose a tier table and its bands" });
    }
    try {
      await commissionRepo().saveTiers(tierTable, rows, user.id);
      res.json(await commissionRepo().listTiers());
    } catch (err) { fail(res, err); }
  });

  app.patch("/api/commission/counters/:id", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    await commissionRepo().updateCounter(req.params.id as string, {
      name: req.body?.name,
      minTarget: req.body?.minTarget != null ? Number(req.body.minTarget) : undefined,
      tradeMargin: req.body?.tradeMargin != null ? Number(req.body.tradeMargin) : undefined,
      isActive: req.body?.isActive,
    }, user.id);
    res.json({ ok: true });
  });

  app.post("/api/commission/counters/:id/link", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    await commissionRepo().linkMember(req.params.id as string, req.body.shopCode, req.body.posId, user.id);
    res.json({ ok: true });
  });

  app.put("/api/commission/priority", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    await commissionRepo().setPriority(req.body.brandId, req.body.posId, !!req.body.isPriority, user.id);
    res.json({ ok: true });
  });

  app.put("/api/commission/step-plan", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditCommissionSettings(user.role)) return deny(res);
    const counter = (await activeCounters()).find(c => c.id === req.body.counterId);
    if (!counter) return res.status(404).json({ error: "Counter not found" });
    let medianAtStart = req.body.medianAtStart ?? null;
    if (req.body.enabled && medianAtStart == null) {
      const ref = await referenceMonths(counter, req.body.startMonth);
      medianAtStart = ref.counterMedian;
    }
    await commissionRepo().saveStepPlan({
      counterId: counter.id,
      startMonth: req.body.startMonth,
      enabled: !!req.body.enabled,
      medianAtStart,
    }, user.id);
    res.json({ ok: true });
  });

  app.get("/api/commission/roster-users", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditRoster(user.role)) return deny(res);
    const [users, assignments] = await Promise.all([
      storage.getUsers(),
      storage.getUserPosAssignments(),
    ]);
    res.json(users
      .filter(u => u.isActive && (u.role === "ba" || u.role === "part_time"))
      .map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
        canViewHistory: !!u.canViewHistory,
        posIds: assignments.filter(a => a.userId === u.id).map(a => a.posId),
      })));
  });

  app.get("/api/commission/duty", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditRoster(user.role)) return deny(res);
    const month = String(req.query.month || "");
    const counterId = String(req.query.counterId || "");
    res.json({
      days: await commissionRepo().listDuty(counterId, month),
      status: await commissionRepo().monthStatus(counterId, month),
    });
  });

  app.put("/api/commission/duty", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditRoster(user.role)) return deny(res);
    const status = await commissionRepo().monthStatus(req.body.counterId, req.body.month);
    if (monthEditDecision(status, user.role, "edit") !== "ok") return res.status(403).json({ error: "This month is locked" });
    try {
      await commissionRepo().saveDuty(req.body.counterId, req.body.month, req.body.days ?? [], user.id);
      res.json({ ok: true });
    } catch (err) { fail(res, err); }
  });

  app.get("/api/commission/actuals", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditActuals(user.role)) return deny(res);
    const month = String(req.query.month || "");
    const counterId = String(req.query.counterId || "");
    const counter = (await activeCounters()).find(c => c.id === counterId);
    if (!counter) return res.json({ rows: [], reconciliation: null });
    const calc = await calculateCounter(counter, month, false);
    const brands = await storage.getBrands();
    const priorities = await commissionRepo().priorities();
    const ids = posIdsOf(counter);
    const brandIds = new Set<string>(Array.from(calc.fig.brands.keys()).concat(calc.fig.actuals.map(a => a.brandId)));
    for (const p of priorities) if (p.isPriority && ids.includes(p.posId)) brandIds.add(p.brandId);
    const avail = await storage.getBrandPosAvailability();
    for (const row of avail) if (ids.includes(row.posId)) brandIds.add(row.brandId);
    res.json({
      rows: Array.from(brandIds).map(brandId => ({
        brandId,
        name: brands.find(b => b.id === brandId)?.name ?? brandId,
        provisional: calc.fig.brands.get(brandId) ?? 0,
        byShop: ids.map(posId => ({
          posId,
          actual: calc.fig.actuals.find(a => a.brandId === brandId && a.posId === posId)?.actualAmount ?? null,
        })),
      })).sort((a, b) => a.name.localeCompare(b.name)),
      reconciliation: {
        provisional: calc.provisional,
        actual: calc.actualTotal,
        gap: calc.gap.gap,
        gapPct: calc.gap.gapPct,
        flagged: calc.gap.flagged,
        posTill: calc.posTill,
        threshold: calc.settings.reconciliationGapThreshold,
      },
      status: await commissionRepo().monthStatus(counterId, month),
    });
  });

  app.put("/api/commission/actuals", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canEditActuals(user.role)) return deny(res);
    const status = await commissionRepo().monthStatus(req.body.counterId, req.body.month);
    if (monthEditDecision(status, user.role, "edit") !== "ok") return res.status(403).json({ error: "This month is locked" });
    try {
      await commissionRepo().saveActuals(req.body.counterId, req.body.month, req.body.rows ?? [], user.id);
      res.json({ ok: true });
    } catch (err) { fail(res, err); }
  });

  app.get("/api/commission/targets", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const month = String(req.query.month || "");
    const counterId = String(req.query.counterId || "");
    const counter = (await activeCounters()).find(c => c.id === counterId);
    if (!counter) return res.status(404).json({ error: "Counter not found" });
    if (user.role === "ba") {
      const assigns = await storage.getUserPosAssignments(user.id);
      const mine = new Set(assigns.map(a => a.posId));
      if (!counter.members.some(m => m.posId && mine.has(m.posId))) return deny(res);
      const rows = (await commissionRepo().listBrandTargets(counter.id, month)).filter(t => t.status === "published");
      const head = await commissionRepo().getCounterTarget(counter.id, month);
      if (head && head.status !== "published") return res.json({ published: false, rows: [] });
      return res.json({ published: true, rows, counter: head });
    }
    if (!canSetTargets(user.role)) return deny(res);
    const preview = await targetPreview(counter, month);
    res.json({
      ...preview,
      status: await commissionRepo().monthStatus(counterId, month),
      isAdmin: canEditCommissionSettings(user.role),
    });
  });

  app.put("/api/commission/targets", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canSetTargets(user.role)) return deny(res);
    const counter = (await activeCounters()).find(c => c.id === req.body.counterId);
    if (!counter) return res.status(404).json({ error: "Counter not found" });
    const status = await commissionRepo().monthStatus(counter.id, req.body.month);
    if (monthEditDecision(status, user.role, "edit") !== "ok") return res.status(403).json({ error: "This month is locked" });
    const isAdmin = canEditCommissionSettings(user.role);
    try {
      const preview = await targetPreview(counter, req.body.month, {
        allBrandsAdjustment: Number(req.body.allBrandsAdjustment ?? 1),
        nonPriorityExpected: req.body.nonPriorityExpected != null ? Number(req.body.nonPriorityExpected) : null,
        brandAdjustments: req.body.brandAdjustments ?? {},
        counterStartingOverride: isAdmin && req.body.counterStarting != null ? Number(req.body.counterStarting) : null,
        brandStartingOverrides: isAdmin ? req.body.brandStartingOverrides ?? undefined : undefined,
      });
      if (req.body.publish && preview.built.poolNegative) {
        return res.status(400).json({ error: "The priority pool is negative. Adjust the figures before publishing." });
      }
      await commissionRepo().saveTargets({
        counterId: counter.id,
        month: req.body.month,
        status: req.body.publish ? "published" : "draft",
        reason: req.body.reason ?? null,
        counter: {
          startingTarget: preview.starting,
          allBrandsAdjustment: preview.allAdj,
          nonPriorityExpected: preview.nonPriority,
          finalCounterTarget: preview.built.finalCounterTarget,
          belowMinimumWarning: preview.built.belowMinimum,
          status: req.body.publish ? "published" : "draft",
        },
        brands: preview.built.brands.map(b => ({
          brandId: b.brandId,
          startingTarget: b.startingTarget,
          brandAdjustment: req.body.brandAdjustments?.[b.brandId] ?? 1,
          finalTarget: b.finalTarget,
        })),
      }, user.id);
      res.json({ ok: true, belowMinimum: preview.built.belowMinimum, poolNegative: preview.built.poolNegative });
    } catch (err) { fail(res, err); }
  });

  app.get("/api/pay/overview", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canSeePay(user.role)) return deny(res);
    const month = String(req.query.month || "");
    const counters = await activeCounters();
    const rows = [];
    for (const counter of counters) {
      const calc = await calculateCounter(counter, month, false);
      const bas = await baForCounter(counter);
      const primary = bas[0];
      const salary = primary ? (await commissionRepo().salaryFor(primary.id, month)) ?? calc.settings.defaultBasicSalary : null;
      rows.push({
        counterId: counter.id,
        code: counter.code,
        name: counter.name,
        baName: bas.map(b => b.name).join(", ") || "No BA assigned",
        baId: primary?.id ?? null,
        basis: calc.result.basis,
        dutyIncomplete: calc.result.dutyIncomplete,
        countedSales: calc.result.countedSales,
        achievement: calc.result.achievement,
        commission: calc.result.commission,
        salary,
        income: salary == null ? null : salary + calc.result.commission,
        partTimerCost: calc.result.partTimerCost,
        status: await commissionRepo().monthStatus(counter.id, month),
        targetsPublished: calc.targets.length > 0,
      });
    }
    res.json({ rows, canReopen: canReopenMonth(user.role) });
  });

  app.get("/api/pay/me", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (payRouteDecision(user.role, user.id, user.id) !== "ok" || user.role !== "ba") return deny(res);
    const month = String(req.query.month || "");
    const assigns = await storage.getUserPosAssignments(user.id);
    const mine = new Set(assigns.map(a => a.posId));
    const counters = (await activeCounters()).filter(c => c.members.some(m => m.posId && mine.has(m.posId)));
    const counterId = String(req.query.counterId || counters[0]?.id || "");
    const counter = counters.find(c => c.id === counterId);
    if (!counter) return res.json({ counter: null });
    const projected = req.query.projected != null && req.query.projected !== "" ? Number(req.query.projected) : null;
    const restDays = req.query.restDays != null && req.query.restDays !== "" ? Number(req.query.restDays) : null;
    const achievement = req.query.achievement != null && req.query.achievement !== "" ? Number(req.query.achievement) : null;
    const view = await projectionFor({
      counter,
      month,
      projectedCounterSales: projected,
      restDays,
      achievementOverride: achievement,
    });
    const salary = (await commissionRepo().salaryFor(user.id, month)) ?? view.calc.settings.defaultBasicSalary;
    const brands = await storage.getBrands();
    res.json({
      counter: { id: counter.id, code: counter.code, name: counter.name, aeon: counter.code === "AEON", members: counter.members },
      counters: counters.map(c => ({ id: c.id, name: c.name, code: c.code })),
      basis: view.calc.result.basis,
      dutyIncomplete: view.calc.result.dutyIncomplete,
      hasDuty: view.hasDuty,
      countedSoFar: view.calc.result.countedSales,
      achievementSoFar: view.calc.result.achievement,
      suggested: view.suggested,
      dutyAware: view.dutyAware,
      projected: view.projected,
      counted: view.counted.counted,
      G: view.counted.G,
      T: view.counted.T,
      E: view.counted.E,
      commission: view.counted.commission,
      salary,
      income: salary + view.counted.commission,
      next: view.next,
      salesSoFar: view.salesSoFar,
      defaultRestDays: view.calc.settings.defaultRestDays,
      days: view.calc.result.days.map(d => ({
        date: d.date,
        shop: counter.members.find(m => m.posId === d.posId)?.shopCode ?? null,
        status: d.status,
        share: d.share,
      })),
      brands: view.calc.targets.map(t => ({
        name: brands.find(b => b.id === t.brandId)?.name ?? t.brandId,
        target: t.finalTarget,
        actual: view.calc.fig.brandActual.get(t.brandId) ?? view.calc.fig.brandsToDate.get(t.brandId) ?? 0,
      })),
      status: await commissionRepo().monthStatus(counter.id, month),
    });
  });

  app.put("/api/pay/salary", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const subject = String(req.body.userId || "");
    if (payRouteDecision(user.role, user.id, subject) !== "ok") return deny(res);
    const month = String(req.body.month || "");
    const amount = Number(req.body.basicSalary);
    if (!(amount >= 0) || Number.isNaN(amount)) return res.status(400).json({ error: "Enter a salary amount" });
    const assigns = await storage.getUserPosAssignments(subject);
    const mine = new Set(assigns.map(a => a.posId));
    const counters = (await activeCounters()).filter(c => c.members.some(m => m.posId && mine.has(m.posId)));
    for (const counter of counters) {
      const status = await commissionRepo().monthStatus(counter.id, month);
      if (monthEditDecision(status, user.role, "edit") !== "ok") return res.status(403).json({ error: "This month is locked" });
    }
    try {
      await commissionRepo().setSalary(subject, month, amount, user.id);
      res.json({ ok: true });
    } catch (err) { fail(res, err); }
  });

  app.put("/api/pay/projection", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (user.role !== "ba") return deny(res);
    await commissionRepo().setProjection({
      userId: user.id,
      month: req.body.month,
      counterId: req.body.counterId,
      projectedCounterSales: req.body.projectedCounterSales == null ? null : Number(req.body.projectedCounterSales),
      expectedRestDays: req.body.expectedRestDays == null ? null : Number(req.body.expectedRestDays),
      achievementOverride: req.body.achievementOverride == null ? null : Number(req.body.achievementOverride),
    });
    res.json({ ok: true });
  });

  app.post("/api/pay/lock", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canLockMonth(user.role)) return deny(res);
    await commissionRepo().lockMonth(req.body.counterId, req.body.month, user.id);
    res.json({ ok: true });
  });

  app.post("/api/pay/reopen", async (req, res) => {
    const user = await actor(req);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    if (!canReopenMonth(user.role)) return deny(res);
    if (monthEditDecision("locked", user.role, "reopen") !== "ok") return deny(res);
    await commissionRepo().reopenMonth(req.body.counterId, req.body.month, user.id);
    res.json({ ok: true });
  });
}

export function assertRoleChange(actorRole: string, nextRole: string | undefined): boolean {
  if (!nextRole) return true;
  return canAssignRole(actorRole, nextRole);
}
