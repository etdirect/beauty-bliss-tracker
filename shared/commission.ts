import { daysInMonth, monthDates, monthStepIndex, nextCalendarDay } from "./hkTime";

export type TierTableId = "L" | "S";

export interface TierSlice {
  lower: number;
  upper: number | null;
  rate: number;
}

export type DutyStatus =
  | "WORKED"
  | "REST"
  | "IRREGULAR_REST"
  | "ANNUAL_LEAVE"
  | "SICK_LEAVE"
  | "MATERNITY_LEAVE"
  | "UNPAID_LEAVE";

export type SubstitutionType = "planned" | "unexpected";

export type LeaveGroup = "worked" | "rest" | "sick" | "unpaid";

export const DEFAULT_TIERS_L: TierSlice[] = [
  { lower: 0, upper: 70000, rate: 0.02 },
  { lower: 70000, upper: 77000, rate: 0.03 },
  { lower: 77000, upper: 100000, rate: 0.04 },
  { lower: 100000, upper: 130000, rate: 0.06 },
  { lower: 130000, upper: 170000, rate: 0.09 },
  { lower: 170000, upper: 220000, rate: 0.12 },
  { lower: 220000, upper: null, rate: 0.15 },
];

export const DEFAULT_TIERS_S: TierSlice[] = [
  { lower: 0, upper: 53000, rate: 0.02 },
  { lower: 53000, upper: 76000, rate: 0.04 },
  { lower: 76000, upper: 106000, rate: 0.06 },
  { lower: 106000, upper: 146000, rate: 0.09 },
  { lower: 146000, upper: 196000, rate: 0.12 },
  { lower: 196000, upper: null, rate: 0.15 },
];

export const DEFAULT_SETTINGS = {
  guaranteedRate: 0.02,
  defaultBasicSalary: 12000,
  partTimeDayRate: 480,
  partTimePlannedRate: 0.025,
  partTimeUnexpectedRate: 0.03,
  consecutiveDaysThreshold: 4,
  reconciliationGapThreshold: 0.05,
  defaultRestDays: 6,
};

/** The amount a BA types is already after discount. Promo money-off is ignored. */
export function provisionalAmount(entryAmount: number, _promoMoneyOffIgnored = 0): number {
  return entryAmount;
}

export function tierAmount(sales: number, tiers: TierSlice[]): number {
  if (!(sales > 0)) return 0;
  const sorted = [...tiers].sort((a, b) => a.lower - b.lower);
  let total = 0;
  for (const t of sorted) {
    const end = t.upper == null ? Infinity : t.upper;
    const portion = Math.min(sales, end) - Math.max(0, t.lower);
    if (portion > 0) total += portion * t.rate;
    if (sales <= end) break;
  }
  return total;
}

export function overallAchievement(brands: { target: number; actual: number }[]): number {
  const usable = brands.filter(b => b.target > 0);
  const total = usable.reduce((s, b) => s + b.target, 0);
  if (!(total > 0)) return 0;
  return usable.reduce((s, b) => {
    const ach = b.actual <= 0 ? 0 : Math.min(b.actual / b.target, 1);
    return s + (b.target / total) * ach;
  }, 0);
}

export function monthlyCommission(
  counted: number,
  achievement: number,
  tiers: TierSlice[],
  guaranteedRate = DEFAULT_SETTINGS.guaranteedRate,
) {
  const T = tierAmount(counted, tiers);
  const G = guaranteedRate * counted;
  const E = Math.max(0, T - G);
  const ach = Math.max(0, Math.min(1, achievement));
  const commission = G + E * ach;
  return { counted, achievement: ach, G, T, E, commission };
}

export function leaveGroup(status: DutyStatus): LeaveGroup {
  if (status === "WORKED") return "worked";
  if (status === "SICK_LEAVE" || status === "MATERNITY_LEAVE") return "sick";
  if (status === "UNPAID_LEAVE") return "unpaid";
  return "rest";
}

export function shareForGroup(group: LeaveGroup, runLength: number, threshold = 4): number {
  if (group === "worked") return 1;
  if (group === "unpaid") return 0;
  if (group === "sick") return runLength >= threshold ? 0 : 0.5;
  return runLength >= threshold ? 0.4 : 0.5;
}

export interface DutyDayInput {
  date: string;
  status: DutyStatus;
  /** Provisional sales that count for her that day (already limited to her shop). */
  sales: number;
  substitutionType?: SubstitutionType | null;
}

export function assignShares<T extends { date: string; status: DutyStatus }>(
  days: T[],
  threshold = 4,
): (T & { share: number; runLength: number })[] {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const groups = sorted.map(d => leaveGroup(d.status));
  const runLength = new Array<number>(sorted.length).fill(1);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (
      j + 1 < sorted.length &&
      groups[j + 1] === groups[i] &&
      groups[i] !== "worked" &&
      nextCalendarDay(sorted[j].date) === sorted[j + 1].date
    ) {
      j++;
    }
    const len = j - i + 1;
    for (let k = i; k <= j; k++) runLength[k] = len;
    i = j + 1;
  }
  return sorted.map((d, idx) => ({
    ...d,
    runLength: runLength[idx],
    share: shareForGroup(groups[idx], runLength[idx], threshold),
  }));
}

export function estimatedCounted(counterSales: number, days: number, restDays = 6): number {
  if (!(days > 0)) return 0;
  return counterSales * (1 - (restDays / days) * 0.5);
}

export function partTimerDayCost(
  daySales: number,
  substitution: SubstitutionType | null | undefined,
  dayRate = DEFAULT_SETTINGS.partTimeDayRate,
  plannedRate = DEFAULT_SETTINGS.partTimePlannedRate,
  unexpectedRate = DEFAULT_SETTINGS.partTimeUnexpectedRate,
): number {
  if (substitution === "planned") return dayRate + plannedRate * daySales;
  if (substitution === "unexpected") return dayRate + unexpectedRate * daySales;
  return 0;
}

export function reconciliationGap(provisional: number, actual: number | null, threshold = 0.05) {
  if (actual == null) return { gap: null as number | null, gapPct: null as number | null, flagged: false };
  const gap = actual - provisional;
  const gapPct = provisional === 0 ? null : gap / provisional;
  const flagged = gapPct != null && Math.abs(gapPct) > threshold + 1e-12;
  return { gap, gapPct, flagged };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) return (s[mid - 1] + s[mid]) / 2;
  return s[mid];
}

export function counterStartingTarget(minTarget: number, recentMedian: number): number {
  return Math.max(minTarget, recentMedian);
}

/** Optional 3-month step from recent sales up to the minimum. Month 4 uses the standard rule. */
export function stepStartingTarget(startMedian: number, minTarget: number, step: number): number {
  return startMedian + (minTarget - startMedian) * (step / 3);
}

export function resolveCounterStarting(opts: {
  minTarget: number;
  recentMedian: number;
  stepEnabled: boolean;
  stepStartMonth: string | null;
  month: string;
  medianAtStepStart: number | null;
}): number {
  if (opts.stepEnabled && opts.stepStartMonth && opts.medianAtStepStart != null) {
    const step = monthStepIndex(opts.stepStartMonth, opts.month);
    if (step >= 1 && step <= 3) return stepStartingTarget(opts.medianAtStepStart, opts.minTarget, step);
  }
  return counterStartingTarget(opts.minTarget, opts.recentMedian);
}

export interface BrandTargetInput {
  brandId: string;
  median: number;
  brandAdjustment: number;
}

export interface TargetBuild {
  pool: number;
  poolNegative: boolean;
  nonPriorityExpected: number;
  brands: { brandId: string; startingTarget: number; finalTarget: number }[];
  finalCounterTarget: number;
  belowMinimum: boolean;
}

export function buildTargets(opts: {
  counterStarting: number;
  minTarget: number;
  priority: BrandTargetInput[];
  nonPriorityExpected: number;
  allBrandsAdjustment: number;
}): TargetBuild {
  const sumMedians = opts.priority.reduce((s, b) => s + Math.max(0, b.median), 0);
  const pool = opts.counterStarting - opts.nonPriorityExpected;
  const brands = opts.priority.map(b => {
    const starting = sumMedians > 0 ? (Math.max(0, b.median) / sumMedians) * pool : 0;
    const finalTarget = starting * opts.allBrandsAdjustment * b.brandAdjustment;
    return { brandId: b.brandId, startingTarget: starting, finalTarget };
  });
  const finalCounterTarget = brands.reduce((s, b) => s + b.finalTarget, 0) + opts.nonPriorityExpected;
  return {
    pool,
    poolNegative: pool < -1e-6,
    nonPriorityExpected: opts.nonPriorityExpected,
    brands,
    finalCounterTarget,
    belowMinimum: finalCounterTarget + 1e-6 < opts.minTarget,
  };
}

export function nextTierInfo(
  counted: number,
  tiers: TierSlice[],
  achievement: number,
  guaranteedRate = DEFAULT_SETTINGS.guaranteedRate,
) {
  const sorted = [...tiers].sort((a, b) => a.lower - b.lower);
  const boundary = sorted
    .map(t => t.upper)
    .filter((u): u is number => u != null && u > counted + 1e-9)
    .sort((a, b) => a - b)[0];
  if (boundary == null) return null;
  const now = monthlyCommission(counted, achievement, tiers, guaranteedRate);
  const at = monthlyCommission(boundary, achievement, tiers, guaranteedRate);
  const next = sorted.find(t => t.lower === boundary);
  return {
    nextAt: boundary,
    salesNeeded: boundary - counted,
    extraCommission: at.commission - now.commission,
    nextRate: next?.rate ?? null,
  };
}

export function runRateProjection(salesSoFar: number, daysElapsed: number, days: number): number {
  if (!(daysElapsed > 0)) return 0;
  return (salesSoFar / daysElapsed) * days;
}

export function dutyAwareProjection(
  workedDaySales: number,
  workedDaysElapsed: number,
  salesSoFar: number,
  remainingWorkingDays: number,
): number {
  if (!(workedDaysElapsed > 0)) return salesSoFar;
  const avg = workedDaySales / workedDaysElapsed;
  return salesSoFar + avg * remainingWorkingDays;
}

export interface ShopMonthActual {
  posId: string;
  amount: number;
}

export interface DailyShopSale {
  posId: string;
  date: string;
  amount: number;
}

export interface DutyRecord {
  date: string;
  posId: string | null;
  status: DutyStatus;
  substitutionType?: SubstitutionType | null;
}

export interface MonthCalcInput {
  month: string;
  aeon: boolean;
  shopIds: string[];
  dailySales: DailyShopSale[];
  /** null when the month has no duty rows at all. */
  duty: DutyRecord[] | null;
  shopActuals: ShopMonthActual[] | null;
  tiers: TierSlice[];
  guaranteedRate?: number;
  threshold?: number;
  defaultRestDays?: number;
  partTimeDayRate?: number;
  partTimePlannedRate?: number;
  partTimeUnexpectedRate?: number;
  brandTargets: { brandId: string; target: number }[];
  brandSales: { brandId: string; amount: number }[];
  brandActuals: { brandId: string; amount: number }[] | null;
}

export interface MonthCalcResult {
  basis: "provisional" | "actual" | "estimated";
  dutyIncomplete: boolean;
  countedSales: number;
  counterSalesUsed: number;
  achievement: number;
  G: number;
  T: number;
  E: number;
  commission: number;
  partTimerCost: number;
  days: {
    date: string;
    posId: string | null;
    status: DutyStatus | null;
    sales: number;
    share: number;
    assigned: boolean;
  }[];
}

function salesOn(daily: DailyShopSale[], posId: string, date: string): number {
  let n = 0;
  for (const row of daily) if (row.posId === posId && row.date === date) n += row.amount;
  return n;
}

function shopMonthSales(daily: DailyShopSale[], posId: string, month: string): number {
  let n = 0;
  for (const row of daily) if (row.posId === posId && row.date.startsWith(month)) n += row.amount;
  return n;
}

export function calculateMonth(input: MonthCalcInput): MonthCalcResult {
  const dates = monthDates(input.month);
  const threshold = input.threshold ?? DEFAULT_SETTINGS.consecutiveDaysThreshold;
  const restDays = input.defaultRestDays ?? DEFAULT_SETTINGS.defaultRestDays;
  const rate = input.guaranteedRate ?? DEFAULT_SETTINGS.guaranteedRate;
  const dutyByDate = new Map((input.duty ?? []).map(d => [d.date, d]));
  const hasDuty = input.duty != null && input.duty.length > 0;
  const actualByShop = new Map((input.shopActuals ?? []).map(s => [s.posId, s.amount]));
  const hasActual = input.shopActuals != null && input.shopActuals.length > 0;

  const achievement = overallAchievement(
    input.brandTargets.map(t => {
      const fromActual = input.brandActuals?.filter(b => b.brandId === t.brandId) ?? [];
      const actual = input.brandActuals != null && fromActual.length > 0
        ? fromActual.reduce((s, b) => s + b.amount, 0)
        : input.brandSales.filter(b => b.brandId === t.brandId).reduce((s, b) => s + b.amount, 0);
      return { target: t.target, actual };
    }),
  );

  const emptyDays = dates.map(date => ({
    date,
    posId: null as string | null,
    status: null as DutyStatus | null,
    sales: 0,
    share: 0,
    assigned: false,
  }));

  if (!hasDuty) {
    const provisional = input.shopIds.reduce((s, id) => s + shopMonthSales(input.dailySales, id, input.month), 0);
    const actualTotal = hasActual
      ? input.shopIds.reduce((s, id) => s + (actualByShop.get(id) ?? 0), 0)
      : null;
    const base = actualTotal != null ? actualTotal : provisional;
    const counted = estimatedCounted(base, daysInMonth(input.month), restDays);
    const pay = monthlyCommission(counted, achievement, input.tiers, rate);
    return {
      basis: "estimated",
      dutyIncomplete: input.aeon,
      countedSales: pay.counted,
      counterSalesUsed: base,
      achievement: pay.achievement,
      G: pay.G,
      T: pay.T,
      E: pay.E,
      commission: pay.commission,
      partTimerCost: 0,
      days: emptyDays,
    };
  }

  type Raw = DutyDayInput & { posId: string | null; assigned: boolean; costSales: number };
  const raw: Raw[] = [];
  let dutyIncomplete = false;

  for (const date of dates) {
    const duty = dutyByDate.get(date);
    if (input.aeon) {
      if (!duty || !duty.posId) {
        dutyIncomplete = true;
        raw.push({
          date,
          status: "WORKED",
          sales: 0,
          posId: null,
          assigned: false,
          substitutionType: null,
          costSales: 0,
        });
        continue;
      }
      const sales = salesOn(input.dailySales, duty.posId, date);
      raw.push({
        date,
        status: duty.status,
        sales,
        posId: duty.posId,
        assigned: true,
        substitutionType: duty.substitutionType ?? null,
        costSales: sales,
      });
      continue;
    }
    const posId = duty?.posId || input.shopIds[0] || null;
    const sales = posId ? salesOn(input.dailySales, posId, date) : 0;
    raw.push({
      date,
      status: duty?.status ?? "WORKED",
      sales,
      posId,
      assigned: true,
      substitutionType: duty?.substitutionType ?? null,
      costSales: sales,
    });
  }

  const shared = assignShares(raw, threshold);
  const byDate = new Map(shared.map(d => [d.date, d]));

  let counted = 0;
  let basis: MonthCalcResult["basis"] = "provisional";

  if (!input.aeon) {
    const provisionalCounted = shared.reduce((s, d) => s + d.sales * d.share, 0);
    const provisionalTotal = shared.reduce((s, d) => s + d.sales, 0);
    const shopId = input.shopIds[0];
    const actual = shopId != null && hasActual ? actualByShop.get(shopId) : undefined;
    if (actual != null) {
      basis = "actual";
      if (provisionalTotal > 0) counted = actual * (provisionalCounted / provisionalTotal);
      else counted = estimatedCounted(actual, dates.length, restDays);
    } else {
      counted = provisionalCounted;
    }
  } else if (!hasActual) {
    counted = shared.reduce((s, d) => s + (d.assigned ? d.sales * d.share : 0), 0);
  } else {
    basis = "actual";
    for (const shopId of input.shopIds) {
      const allSales = shopMonthSales(input.dailySales, shopId, input.month);
      let weighted = 0;
      for (const day of shared) {
        if (!day.assigned || day.posId !== shopId) continue;
        weighted += day.sales * day.share;
      }
      const actual = actualByShop.get(shopId);
      if (actual == null) {
        counted += weighted;
        basis = "provisional";
      } else if (allSales > 0) {
        counted += actual * (weighted / allSales);
      }
    }
  }

  let partTimerCost = 0;
  for (const day of shared) {
    if (!day.assigned) continue;
    partTimerCost += partTimerDayCost(
      day.costSales,
      day.substitutionType,
      input.partTimeDayRate,
      input.partTimePlannedRate,
      input.partTimeUnexpectedRate,
    );
  }

  const pay = monthlyCommission(counted, achievement, input.tiers, rate);
  return {
    basis,
    dutyIncomplete,
    countedSales: pay.counted,
    counterSalesUsed: counted,
    achievement: pay.achievement,
    G: pay.G,
    T: pay.T,
    E: pay.E,
    commission: pay.commission,
    partTimerCost,
    days: dates.map(date => {
      const d = byDate.get(date)!;
      return {
        date,
        posId: d.assigned ? d.posId : null,
        status: d.assigned ? d.status : null,
        sales: d.assigned ? d.sales : 0,
        share: d.assigned ? d.share : 0,
        assigned: d.assigned,
      };
    }),
  };
}

export function projectCountedSales(opts: {
  projectedCounterSales: number;
  days: { date: string; sales: number; share: number; future: boolean }[];
  restDays: number;
  daysInMonth: number;
  useDuty: boolean;
}): number {
  if (!opts.useDuty) {
    return opts.projectedCounterSales * (1 - (opts.restDays / opts.daysInMonth) * 0.5);
  }
  const past = opts.days.filter(d => !d.future);
  const future = opts.days.filter(d => d.future);
  const pastSales = past.reduce((s, d) => s + d.sales, 0);
  const pastCounted = past.reduce((s, d) => s + d.sales * d.share, 0);
  const remaining = Math.max(0, opts.projectedCounterSales - pastSales);
  if (future.length === 0) return pastCounted;
  const each = remaining / future.length;
  return pastCounted + future.reduce((s, d) => s + each * d.share, 0);
}
