/**
 * Promotion-deduction allocation.
 *
 * When a BA records N "Get Y" redemptions for a deductible L2/L3 promo, the
 * HK$ rebate needs to be taken off the counter's gross sales. We don't know
 * which brand each customer actually bought (the voucher is basket-level),
 * so we spread the deduction proportionally across the brands that actually
 * sold at that counter-day. Brands with zero sales that day get zero of the
 * deduction — the total re-allocates to the brands that did sell.
 *
 * Rules (confirmed):
 *   - Deduction scope is per POS/counter, not pooled across counters.
 *   - Multiple deductible promos on the same counter-day are summed first,
 *     then allocated — users care about the net rebate, not per-promo splits.
 *   - If a counter had zero gross sales that day but deductions were recorded
 *     (data-entry glitch), the deduction is held as "unallocated" instead of
 *     crashing any brand total.
 *   - Allocation is computed on read, never persisted. Raw sales_entries
 *     stays pristine. Amending a prior day recomputes automatically.
 */

export interface SalesEntryLike {
  counterId: string;
  brandId: string;
  date: string;
  amount: number;
}

export interface PromotionDeductionLike {
  counterId: string;
  date: string;
  totalDeduction: number;
}

export interface AllocatedEntry extends SalesEntryLike {
  /** Proportional HK$ deduction assigned to this entry. */
  deduction: number;
  /** amount − deduction, clamped at 0. */
  netAmount: number;
}

export interface AllocationResult {
  entries: AllocatedEntry[];
  /**
   * HK$ deductions that couldn't be allocated (counter had gross = 0 but
   * redemptions were recorded). Keyed by "counterId|date". Surfaces in
   * reports as "Unallocated Promo Deductions".
   */
  unallocatedByCounterDate: Map<string, number>;
  /** Per counter+date deduction total (allocated + unallocated). */
  totalByCounterDate: Map<string, number>;
}

const key = (counterId: string, date: string) => `${counterId}|${date}`;

/**
 * Run the allocation. Pure function — no side effects, stable ordering.
 */
export function allocateDeductions(
  entries: SalesEntryLike[],
  deductions: PromotionDeductionLike[],
): AllocationResult {
  // Sum deductions per counter+date (multiple deductible promos per day
  // are merged first, per the business rule above).
  const deductionTotals = new Map<string, number>();
  for (const d of deductions) {
    const k = key(d.counterId, d.date);
    deductionTotals.set(k, (deductionTotals.get(k) ?? 0) + (d.totalDeduction ?? 0));
  }

  // Sum gross per counter+date so we can compute each brand's share.
  const grossTotals = new Map<string, number>();
  for (const e of entries) {
    const k = key(e.counterId, e.date);
    grossTotals.set(k, (grossTotals.get(k) ?? 0) + (e.amount ?? 0));
  }

  const unallocatedByCounterDate = new Map<string, number>();
  const allocated: AllocatedEntry[] = entries.map((e) => {
    const k = key(e.counterId, e.date);
    const totalDeduction = deductionTotals.get(k) ?? 0;
    const counterGross = grossTotals.get(k) ?? 0;
    if (totalDeduction <= 0 || counterGross <= 0) {
      return { ...e, deduction: 0, netAmount: Math.max(0, e.amount ?? 0) };
    }
    const share = (e.amount ?? 0) / counterGross; // 0..1
    const ded = +(share * totalDeduction).toFixed(2);
    return {
      ...e,
      deduction: ded,
      netAmount: Math.max(0, +(((e.amount ?? 0) - ded).toFixed(2))),
    };
  });

  // Record unallocated: counter+date had deductions but no gross sales.
  for (const [k, d] of deductionTotals) {
    const gross = grossTotals.get(k) ?? 0;
    if (d > 0 && gross <= 0) {
      unallocatedByCounterDate.set(k, d);
    }
  }

  return {
    entries: allocated,
    unallocatedByCounterDate,
    totalByCounterDate: deductionTotals,
  };
}

/**
 * View modes for toggled reports. "net" is the recommended default everywhere
 * except the BA entry screen.
 */
export type SalesViewMode = "gross" | "net";

/**
 * Pick the right field on an allocated entry for a given view mode. Used to
 * keep report aggregation code agnostic to the toggle.
 */
export function amountFor(entry: AllocatedEntry, mode: SalesViewMode): number {
  return mode === "net" ? entry.netAmount : entry.amount ?? 0;
}

/**
 * Convenience wrapper — allocate then aggregate entries in one pass.
 * The aggregator receives (entry, effectiveAmount) and does whatever it
 * wants (sum by brand, by date, etc.).
 */
export function aggregate<T>(
  entries: SalesEntryLike[],
  deductions: PromotionDeductionLike[],
  mode: SalesViewMode,
  reducer: (acc: T, entry: AllocatedEntry, effective: number) => T,
  initial: T,
): { result: T; allocation: AllocationResult } {
  const allocation = allocateDeductions(entries, deductions);
  let acc = initial;
  for (const e of allocation.entries) {
    acc = reducer(acc, e, amountFor(e, mode));
  }
  return { result: acc, allocation };
}
