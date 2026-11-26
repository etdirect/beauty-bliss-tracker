import { storage } from "./storage";
import { commissionRepo, type SchemeCounter } from "./commissionRepo";
import {
  buildTargets,
  calculateMonth,
  dutyAwareProjection,
  median,
  monthlyCommission,
  nextTierInfo,
  projectCountedSales,
  provisionalAmount,
  reconciliationGap,
  resolveCounterStarting,
  runRateProjection,
  type DutyStatus,
  type TierSlice,
} from "@shared/commission";
import { daysInMonth, hkToday, monthEnd, monthStart, previousMonths } from "@shared/hkTime";
import { isAeonCounter } from "@shared/scheme";

export async function activeCounters(): Promise<SchemeCounter[]> {
  return (await commissionRepo().listCounters()).filter(c => c.isActive);
}

export function posIdsOf(counter: SchemeCounter): string[] {
  return counter.members.map(m => m.posId).filter((id): id is string => !!id);
}

async function salesBetween(start: string, end: string) {
  return storage.getSalesEntries({ startDate: start, endDate: end });
}

export async function monthFigures(counter: SchemeCounter, month: string) {
  const repo = commissionRepo();
  const ids = posIdsOf(counter);
  const entries = (await salesBetween(monthStart(month), monthEnd(month))).filter(e => ids.includes(e.counterId));
  const daily = new Map<string, number>();
  const brands = new Map<string, number>();
  const brandsToDate = new Map<string, number>();
  const today = hkToday();
  for (const e of entries) {
    const amount = provisionalAmount(e.amount);
    const key = `${e.counterId}|${e.date}`;
    daily.set(key, (daily.get(key) ?? 0) + amount);
    brands.set(e.brandId, (brands.get(e.brandId) ?? 0) + amount);
    if (e.date <= today) brandsToDate.set(e.brandId, (brandsToDate.get(e.brandId) ?? 0) + amount);
  }
  const actuals = await repo.listActuals(counter.id, month);
  const duty = await repo.listDuty(counter.id, month);
  const shopActual = new Map<string, number>();
  const brandActual = new Map<string, number>();
  for (const row of actuals) {
    if (row.posId) shopActual.set(row.posId, (shopActual.get(row.posId) ?? 0) + row.actualAmount);
    brandActual.set(row.brandId, (brandActual.get(row.brandId) ?? 0) + row.actualAmount);
  }
  let posTill = 0;
  for (const id of ids) {
    const figs = await storage.getPosDailyFigures({ counterId: id, startDate: monthStart(month), endDate: monthEnd(month) });
    posTill += figs.reduce((s, f) => s + f.posFigure, 0);
  }
  return { entries, daily, brands, brandsToDate, actuals, duty, shopActual, brandActual, posTill, ids };
}

export async function calculateCounter(counter: SchemeCounter, month: string, useToDateBrands: boolean) {
  const repo = commissionRepo();
  const settings = await repo.getSettings();
  const tiers = (await repo.listTiers()).filter(t => t.tierTable === counter.tierTable);
  const fig = await monthFigures(counter, month);
  const targets = (await repo.listBrandTargets(counter.id, month)).filter(t => t.status === "published");
  const brandSource = useToDateBrands && month >= hkToday().slice(0, 7) ? fig.brandsToDate : fig.brands;
  const shopsWithActual = Array.from(fig.shopActual.keys());
  const result = calculateMonth({
    month,
    aeon: isAeonCounter(counter.code, counter.members.length),
    shopIds: fig.ids,
    dailySales: Array.from(fig.daily.entries()).map(([k, amount]) => {
      const [posId, date] = k.split("|");
      return { posId, date, amount };
    }),
    duty: fig.duty.length
      ? fig.duty.map(d => ({ date: d.date, posId: d.posId, status: d.status as DutyStatus, substitutionType: d.substitutionType }))
      : null,
    shopActuals: shopsWithActual.length ? shopsWithActual.map(posId => ({ posId, amount: fig.shopActual.get(posId) ?? 0 })) : null,
    tiers: tiers.map(stripTier),
    guaranteedRate: settings.guaranteedRate,
    threshold: settings.consecutiveDaysThreshold,
    defaultRestDays: settings.defaultRestDays,
    partTimeDayRate: settings.partTimeDayRate,
    partTimePlannedRate: settings.partTimePlannedRate,
    partTimeUnexpectedRate: settings.partTimeUnexpectedRate,
    brandTargets: targets.map(t => ({ brandId: t.brandId, target: t.finalTarget })),
    brandSales: Array.from(brandSource.entries()).map(([brandId, amount]) => ({ brandId, amount })),
    brandActuals: fig.actuals.length ? Array.from(fig.brandActual.entries()).map(([brandId, amount]) => ({ brandId, amount })) : null,
  });
  const provisional = Array.from(fig.daily.values()).reduce((s, n) => s + n, 0);
  const actualTotal = fig.actuals.length ? fig.actuals.reduce((s, a) => s + a.actualAmount, 0) : null;
  const gap = reconciliationGap(provisional, actualTotal, settings.reconciliationGapThreshold);
  return { result, settings, tiers, fig, targets, provisional, actualTotal, gap, posTill: fig.posTill };
}

function stripTier(t: { lower: number; upper: number | null; rate: number }): TierSlice {
  return { lower: t.lower, upper: t.upper, rate: t.rate };
}

export async function baForCounter(counter: SchemeCounter) {
  const ids = new Set(posIdsOf(counter));
  const [users, assigns, duty] = await Promise.all([
    storage.getUsers(),
    storage.getUserPosAssignments(),
    Promise.resolve([] as { regularUserId: string | null }[]),
  ]);
  void duty;
  const bas = users.filter(u => u.role === "ba" && u.isActive && assigns.some(a => a.userId === u.id && ids.has(a.posId)));
  return bas.map(u => ({ id: u.id, name: u.name }));
}

export async function referenceMonths(counter: SchemeCounter, month: string, historyMonths?: string[]) {
  const ids = posIdsOf(counter);
  const months = historyMonths && historyMonths.length > 0 ? historyMonths : previousMonths(month, 3);
  const repo = commissionRepo();
  const priorities = await repo.priorities();
  const priorityBrandIds = new Set(
    priorities.filter(p => p.isPriority && ids.includes(p.posId)).map(p => p.brandId),
  );
  const brands = await storage.getBrands();
  const start = monthStart(months[0] ?? month);
  const end = monthEnd(months[months.length - 1] ?? month);
  const entries = (await salesBetween(start, end)).filter(e => ids.includes(e.counterId));
  const byMonthBrand = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.date.slice(0, 7)}|${e.brandId}`;
    byMonthBrand.set(key, (byMonthBrand.get(key) ?? 0) + provisionalAmount(e.amount));
  }
  for (const m of months) {
    const actuals = await repo.listActuals(counter.id, m);
    const actualByBrand = new Map<string, number>();
    for (const a of actuals) actualByBrand.set(a.brandId, (actualByBrand.get(a.brandId) ?? 0) + a.actualAmount);
    for (const pair of Array.from(actualByBrand.entries())) byMonthBrand.set(`${m}|${pair[0]}`, pair[1]);
  }

  const availability = await storage.getBrandPosAvailability();
  const brandIds = new Set<string>();
  for (const row of availability) if (ids.includes(row.posId)) brandIds.add(row.brandId);

  const rows = Array.from(brandIds).map(brandId => {
    const values = months.map(m => byMonthBrand.get(`${m}|${brandId}`) ?? 0);
    return {
      brandId,
      name: brands.find(b => b.id === brandId)?.name ?? brandId,
      priority: priorityBrandIds.has(brandId),
      months: values,
      median: median(values),
    };
  }).sort((a, b) => Number(b.priority) - Number(a.priority) || a.name.localeCompare(b.name));

  const counterMonths = months.map((_, i) => rows.reduce((s, r) => s + r.months[i], 0));
  const nonPriorityMonths = months.map((_, i) => rows.filter(r => !r.priority).reduce((s, r) => s + r.months[i], 0));
  return {
    months,
    rows,
    counterMedian: median(counterMonths),
    nonPriorityMedian: median(nonPriorityMonths),
  };
}

export async function targetPreview(counter: SchemeCounter, month: string, input?: {
  allBrandsAdjustment?: number;
  nonPriorityExpected?: number | null;
  brandAdjustments?: Record<string, number>;
  counterStartingOverride?: number | null;
  brandStartingOverrides?: Record<string, number>;
  historyMonths?: string[];
}) {
  const repo = commissionRepo();
  const ref = await referenceMonths(counter, month, input?.historyMonths);
  const steps = await repo.listStepPlans();
  const step = steps.find(s => s.counterId === counter.id);
  const saved = await repo.getCounterTarget(counter.id, month);
  const savedBrands = await repo.listBrandTargets(counter.id, month);
  const allAdj = input?.allBrandsAdjustment ?? saved?.allBrandsAdjustment ?? 1;
  const nonPriority = input?.nonPriorityExpected ?? saved?.nonPriorityExpected ?? ref.nonPriorityMedian;
  const starting = input?.counterStartingOverride ?? resolveCounterStarting({
    minTarget: counter.minTarget,
    recentMedian: ref.counterMedian,
    stepEnabled: !!step?.enabled,
    stepStartMonth: step?.startMonth ?? null,
    month,
    medianAtStepStart: step?.medianAtStart ?? null,
  });
  const priority = ref.rows.filter(r => r.priority);
  const built = buildTargets({
    counterStarting: starting,
    minTarget: counter.minTarget,
    nonPriorityExpected: nonPriority,
    allBrandsAdjustment: allAdj,
    priority: priority.map(r => ({
      brandId: r.brandId,
      median: r.median,
      brandAdjustment: input?.brandAdjustments?.[r.brandId] ?? savedBrands.find(b => b.brandId === r.brandId)?.brandAdjustment ?? 1,
    })),
  });
  if (input?.brandStartingOverrides) {
    for (const b of built.brands) {
      const override = input.brandStartingOverrides[b.brandId];
      if (override == null) continue;
      const adj = input?.brandAdjustments?.[b.brandId] ?? savedBrands.find(s => s.brandId === b.brandId)?.brandAdjustment ?? 1;
      b.startingTarget = override;
      b.finalTarget = override * allAdj * adj;
    }
    built.finalCounterTarget = built.brands.reduce((s, b) => s + b.finalTarget, 0) + nonPriority;
    built.belowMinimum = built.finalCounterTarget < counter.minTarget;
  }
  const prevMonth = previousMonths(month, 1)[0];
  const prev = prevMonth ? await repo.listBrandTargets(counter.id, prevMonth) : [];
  const brandAdjustments: Record<string, number> = {};
  const manualAmounts: Record<string, number | null> = {};
  for (const b of savedBrands) {
    brandAdjustments[b.brandId] = b.brandAdjustment;
    manualAmounts[b.brandId] = b.manualAmount;
  }
  return { ref, starting, built, saved, prev, allAdj, nonPriority, step, brandAdjustments, manualAmounts };
}

export async function projectionFor(opts: {
  counter: SchemeCounter;
  month: string;
  projectedCounterSales: number | null;
  restDays: number | null;
  achievementOverride: number | null;
}) {
  const calc = await calculateCounter(opts.counter, opts.month, true);
  const today = hkToday();
  const days = calc.result.days;
  const elapsed = days.filter(d => d.date <= today);
  const future = days.filter(d => d.date > today);
  const salesSoFar = elapsed.reduce((s, d) => s + d.sales, 0);
  const worked = elapsed.filter(d => d.assigned && d.status === "WORKED");
  const workedSales = worked.reduce((s, d) => s + d.sales, 0);
  const remainingWorking = future.filter(d => d.assigned && d.status === "WORKED").length;
  const hasDuty = calc.fig.duty.length > 0;
  const suggested = runRateProjection(salesSoFar, elapsed.length, daysInMonth(opts.month));
  const dutyAware = dutyAwareProjection(workedSales, worked.length, salesSoFar, remainingWorking);
  const projected = opts.projectedCounterSales ?? suggested;
  const rest = opts.restDays ?? calc.settings.defaultRestDays;
  const counted = projectCountedSales({
    projectedCounterSales: projected,
    days: days.map(d => ({ date: d.date, sales: d.sales, share: d.share, future: d.date > today })),
    restDays: rest,
    daysInMonth: days.length,
    useDuty: hasDuty,
  });
  const achievement = opts.achievementOverride ?? calc.result.achievement;
  const pay = monthlyCommission(counted, achievement, calc.tiers.map(stripTier), calc.settings.guaranteedRate);
  const next = nextTierInfo(pay.counted, calc.tiers.map(stripTier), achievement, calc.settings.guaranteedRate);
  return { calc, suggested, dutyAware, projected, counted: pay, next, hasDuty, salesSoFar, rest };
}
