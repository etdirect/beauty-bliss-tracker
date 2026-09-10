import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesEntry, Brand, Promotion, PromotionResult, PosLocation, PromotionDeduction } from "@shared/schema";
import { allocateDeductions, type SalesViewMode } from "@shared/deductionAllocation";
import { useAuth } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DollarSign, ShoppingCart, TrendingUp, Package, ArrowLeft, Filter, ChevronDown,
  CalendarDays, SlidersHorizontal, Table as TableIcon, LayoutGrid, AlertCircle, RefreshCw, Gift,
} from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { CHART_COLORS } from "./dashboard";

// ─── Helpers ────────────────────────────────────────

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtRatio(num: number, denom: number, decimals = 1): string {
  return denom === 0 ? "—" : (num / denom).toFixed(decimals);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// 1st of the current month in local time (e.g. '2026-05-01').
// Used as the default start of the BA dashboard date range so BAs
// open straight onto the month-to-date view they usually want.
function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

type QuickPreset = "7d" | "14d" | "30d" | "mtd" | "custom";

function VsPrev({ pct, show }: { pct: number | null; show: boolean }) {
  if (!show || pct === null) return null;
  const up = pct >= 0;
  return (
    <div
      className={cn(
        "text-[10px] sm:text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 truncate",
        up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      {up ? "▲ +" : "▼ "}{Math.abs(pct).toFixed(1)}%
      <span className="text-muted-foreground font-normal text-[9px] sm:text-[10px]">vs prev</span>
    </div>
  );
}

function fmtShortDate(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

function DeltaCell({ current, prior, show }: { current: number; prior: number; show: boolean }) {
  if (!show) return <span className="text-muted-foreground">—</span>;
  if (prior === 0 && current === 0) return <span className="text-muted-foreground">—</span>;
  if (prior === 0) return <span className="text-xs text-muted-foreground">New</span>;
  const delta = current - prior;
  const pct = (delta / prior) * 100;
  const up = delta >= 0;
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
          up
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400",
        )}
      >
        {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {up ? "+" : "−"}{fmtCurrency(Math.abs(delta))}
      </span>
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getDefaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function ymEndDate(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

// ─── Component ──────────────────────────────────────

export default function BADashboard() {
  const { user } = useAuth();
  const assignedPos: PosLocation[] = user?.assignedPos ?? [];
  const posIds = useMemo(() => assignedPos.map((p: any) => p.id), [assignedPos]);

  const isRestricted = user?.role === "part_time" || (user?.role === "ba" && !user?.canViewHistory);

  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Part-Time state ──────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);

  // ── BA time tab state ────────────────────────────
  const [timeTab, setTimeTab] = useState<"daterange" | "monthly" | "yearly">("daterange");
  // Default range: 1st of the current month → today. This matches the BA
  // mental model (“how am I doing this month?”). Users can still widen it.
  const [drStart, setDrStart] = useState(monthStartStr);
  const [drEnd, setDrEnd] = useState(todayStr);
  const [quickPreset, setQuickPreset] = useState<QuickPreset>("mtd");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [brandViewMode, setBrandViewMode] = useState<"table" | "cards">("cards");
  const [monthlyYear, setMonthlyYear] = useState(String(currentYear));
  const [monthlyMonth, setMonthlyMonth] = useState("all");
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set([String(currentYear)]));

  // ── BA counter filter ────────────────────────────
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null);

  function handleSelectPreset(preset: Exclude<QuickPreset, "custom">) {
    setTimeTab("daterange");
    setQuickPreset(preset);
    const end = todayStr();
    let start = monthStartStr();
    if (preset === "7d") start = daysAgoStr(6);
    else if (preset === "14d") start = daysAgoStr(13);
    else if (preset === "30d") start = daysAgoStr(29);
    else if (preset === "mtd") {
      start = monthStartStr();
      if (start > end) {
        setDrStart(start);
        setDrEnd(start);
        return;
      }
    }
    setDrStart(start);
    setDrEnd(end);
  }

  // Gross / Net toggle — defaults to 'net' per the business rule. Hidden
  // entirely when there are no deductions in the filtered window so BAs
  // never see a toggle with nothing to toggle.
  const [salesView, setSalesView] = useState<SalesViewMode>("net");

  // Deduction card secondary view — 'daily' shows per-day breakdown by promo
  // (the original), 'brand' shows the brand-level allocation of the total
  // deduction (useful when BAs want to see which brand absorbed which share).
  const [deductionView, setDeductionView] = useState<"daily" | "brand">("daily");

  // ── Compute query dates ──────────────────────────
  const { queryStart, queryEnd } = useMemo(() => {
    if (isRestricted) {
      // Part-Time: 2 years back to 3 months ahead
      const startDate = new Date(currentYear - 2, 0, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 4, 0);
      const sy = startDate.getFullYear();
      const ey = endDate.getFullYear();
      const em = String(endDate.getMonth() + 1).padStart(2, "0");
      const ed = String(endDate.getDate()).padStart(2, "0");
      return { queryStart: `${sy}-01-01`, queryEnd: `${ey}-${em}-${ed}` };
    }
    if (timeTab === "daterange") {
      return { queryStart: drStart, queryEnd: drEnd };
    }
    if (timeTab === "monthly") {
      const y = Number(monthlyYear);
      return { queryStart: `${y - 1}-01-01`, queryEnd: `${y}-12-31` };
    }
    // yearly
    const years = Array.from(selectedYears).map(Number).sort();
    const minY = years.length > 0 ? years[0] : currentYear;
    const maxY = years.length > 0 ? years[years.length - 1] : currentYear;
    return { queryStart: `${minY}-01-01`, queryEnd: `${maxY}-12-31` };
  }, [isRestricted, timeTab, drStart, drEnd, monthlyYear, selectedYears, currentYear, now]);

  // ── Queries ──────────────────────────────────────
  const {
    data: sales = [],
    isLoading: isLoadingSales,
    isError: isErrorSales,
    refetch: refetchSales,
  } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const { data: allBrands = [], isLoading: isLoadingBrands } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const { data: allPromotions = [] } = useQuery<Promotion[]>({
    queryKey: ["/api/promotions"],
  });

  const { data: allPromoResults = [] } = useQuery<PromotionResult[]>({
    queryKey: ["/api/promotion-results"],
  });

  // Promo deductions over the same date window as sales — used to show BAs
  // exactly how much was deducted per day from coupon redemptions.
  const { data: allDeductions = [], isLoading: isLoadingDeductions } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const isDataLoading = isLoadingSales || isLoadingDeductions || isLoadingBrands;

  // ── Derive available years from sales data ───────
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => set.add(s.date.slice(0, 4)));
    set.add(String(currentYear));
    return Array.from(set).sort();
  }, [sales, currentYear]);

  // ── Year options for monthly dropdown ────────────
  const yearOptions = useMemo(() => {
    const opts: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) opts.push(String(y));
    return opts;
  }, [currentYear]);

  // ── Active counter IDs ───────────────────────────
  const activeCounterIds = useMemo(() => {
    if (isRestricted) return new Set(posIds);
    if (selectedCounters === null) return new Set(posIds);
    return new Set(Array.from(selectedCounters).filter((id) => posIds.includes(id)));
  }, [isRestricted, selectedCounters, posIds]);

  // ── Filtered sales ──────────────────────────────
  const filteredSales = useMemo(() => {
    let base = sales.filter((s) => activeCounterIds.has(s.counterId));
    if (isRestricted) {
      // Part-time: only own submissions, only selected month
      base = base.filter((s) => s.submittedBy === user?.id);
      base = base.filter((s) => s.date.startsWith(selectedMonth));
      return base;
    }
    // BA filters
    if (timeTab === "daterange") {
      base = base.filter((s) => s.date >= drStart && s.date <= drEnd);
    } else if (timeTab === "monthly") {
      if (monthlyMonth !== "all") {
        const prefix = `${monthlyYear}-${monthlyMonth}`;
        base = base.filter((s) => s.date.startsWith(prefix));
      } else {
        base = base.filter((s) => s.date.startsWith(monthlyYear));
      }
    } else {
      // yearly
      base = base.filter((s) => selectedYears.has(s.date.slice(0, 4)));
    }
    return base;
  }, [sales, activeCounterIds, isRestricted, user?.id, selectedMonth, timeTab, drStart, drEnd, monthlyYear, monthlyMonth, selectedYears]);

  // Deductions over the same POS + time window as filteredSales. Used by the
  // allocator to produce net figures and by the Promotion Deductions card.
  const filteredDeductions = useMemo(() => {
    return allDeductions.filter((d) => {
      if (!activeCounterIds.has(d.counterId)) return false;
      if (isRestricted) {
        return d.date.startsWith(selectedMonth);
      }
      if (timeTab === "daterange") return d.date >= drStart && d.date <= drEnd;
      if (timeTab === "monthly") {
        if (monthlyMonth !== "all") return d.date.startsWith(`${monthlyYear}-${monthlyMonth}`);
        return d.date.startsWith(monthlyYear);
      }
      return selectedYears.has(d.date.slice(0, 4));
    });
  }, [allDeductions, activeCounterIds, isRestricted, selectedMonth, timeTab, drStart, drEnd, monthlyYear, monthlyMonth, selectedYears]);

  // Allocation + effective (view-aware) sales. Raw filteredSales stays
  // untouched on gross. When view is 'net' we swap each entry's amount for
  // the post-deduction net so every downstream aggregator honors the toggle.
  const allocation = useMemo(
    () => allocateDeductions(filteredSales, filteredDeductions),
    [filteredSales, filteredDeductions],
  );
  const effectiveSales = useMemo(() => {
    if (salesView === "gross") return filteredSales;
    return allocation.entries.map((e) => ({
      ...(e as unknown as SalesEntry),
      amount: e.netAmount,
    }));
  }, [salesView, filteredSales, allocation]);
  const totalDeduction = useMemo(
    () => filteredDeductions.reduce((s, d) => s + (d.totalDeduction ?? 0), 0),
    [filteredDeductions],
  );
  const unallocatedDeduction = useMemo(
    () => Array.from(allocation.unallocatedByCounterDate.values()).reduce((s, n) => s + n, 0),
    [allocation],
  );
  // Hide the Gross/Net toggle entirely when there are no deductions — net
  // and gross would be identical and the toggle is just noise.
  const hasAnyDeduction = totalDeduction > 0;

  // ── Part-Time: month options derived from data ───
  const monthOptions = useMemo(() => {
    if (!isRestricted) return [];
    const months = new Set<string>();
    months.add(getDefaultMonth());
    const ownSales = sales.filter((s) => posIds.includes(s.counterId) && s.submittedBy === user?.id);
    ownSales.forEach((s) => months.add(s.date.slice(0, 7)));
    return Array.from(months)
      .sort()
      .reverse()
      .map((ym) => {
        const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
        return { value: ym, label: d.toLocaleString("en-US", { month: "long", year: "numeric" }) };
      });
  }, [isRestricted, sales, posIds, user?.id]);

  // ── Brand lookup ────────────────────────────────
  const brandMap = useMemo(() => {
    const m = new Map<string, Brand>();
    allBrands.forEach((b) => m.set(b.id, b));
    return m;
  }, [allBrands]);

  // ── KPIs ────────────────────────────────────────
  const totalSales = useMemo(() => effectiveSales.reduce((s, e) => s + e.amount, 0), [effectiveSales]);
  const totalOrders = useMemo(() => effectiveSales.reduce((s, e) => s + (e.orders ?? 0), 0), [effectiveSales]);
  const totalUnits = useMemo(() => effectiveSales.reduce((s, e) => s + (e.units ?? 0), 0), [effectiveSales]);

  // ── Monthly Projection (BA-scoped, daterange tab only) ────────
  // BA equivalent of the Management dashboard's projection card. Runs
  // only when (a) the user is a full BA (not part-time, not
  // history-restricted) and (b) the selected range sits within a
  // single month, so 'days elapsed' is meaningful.
  // Last-month figures are the same calendar month one month back, used
  // to compare projected vs prior actual.
  const isProjectionEligible = !isRestricted && timeTab === "daterange" && user?.role === "ba";

  const lmRange = useMemo(() => {
    if (!isProjectionEligible) return { start: "", end: "", label: "" };
    const s = new Date(drStart + "T00:00:00");
    if (Number.isNaN(s.getTime())) return { start: "", end: "", label: "" };
    const lmY = s.getMonth() === 0 ? s.getFullYear() - 1 : s.getFullYear();
    const lmM = s.getMonth() === 0 ? 12 : s.getMonth();
    const last = daysInMonth(lmY, lmM);
    const startStr = `${lmY}-${String(lmM).padStart(2, "0")}-01`;
    const endStr = `${lmY}-${String(lmM).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    return { start: startStr, end: endStr, label: `${MONTH_LABELS[lmM - 1]} ${lmY}` };
  }, [isProjectionEligible, drStart]);

  // Last-month sales for the BA's POS, raw + deductions, run through the
  // same allocator so the comparison matches the Net/Gross toggle.
  const { data: lmSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${lmRange.start}&endDate=${lmRange.end}`],
    enabled: isProjectionEligible && !!lmRange.start,
    staleTime: 30_000,
  });
  const { data: lmDeductionsRaw = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${lmRange.start}&endDate=${lmRange.end}`],
    enabled: isProjectionEligible && !!lmRange.start,
    staleTime: 30_000,
  });
  const lmTotalSales = useMemo(() => {
    if (!isProjectionEligible) return 0;
    const scoped = lmSalesRaw.filter((s) => activeCounterIds.has(s.counterId));
    if (salesView === "gross") return scoped.reduce((s, e) => s + e.amount, 0);
    const ded = lmDeductionsRaw.filter((d) => activeCounterIds.has(d.counterId));
    const alloc = allocateDeductions(scoped, ded);
    return alloc.entries.reduce((s, e) => s + (e.netAmount ?? e.amount), 0);
  }, [isProjectionEligible, lmSalesRaw, lmDeductionsRaw, activeCounterIds, salesView]);

  const projection = useMemo(() => {
    if (!isProjectionEligible) return null;
    const s = new Date(drStart + "T00:00:00");
    const e = new Date(drEnd + "T00:00:00");
    if (s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth()) return null;
    const year = s.getFullYear();
    const month = s.getMonth() + 1;
    const daysElapsed = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const monthDays = daysInMonth(year, month);
    const dailyRate = daysElapsed > 0 ? totalSales / daysElapsed : 0;
    const projected = Math.round(dailyRate * monthDays);
    const vsLM = lmTotalSales > 0 ? projected - lmTotalSales : null;
    const vsLMPct = lmTotalSales > 0 ? ((projected - lmTotalSales) / lmTotalSales) * 100 : null;
    return { year, month, daysElapsed, monthDays, dailyRate, projected, vsLM, vsLMPct, lmTotalSales };
  }, [isProjectionEligible, drStart, drEnd, totalSales, lmTotalSales]);

  // ── Attribution (BA only) ──────────────────────
  const attribution = useMemo(() => {
    if (isRestricted) return null;
    const mine = effectiveSales.filter((e) => e.submittedBy === user?.id);
    const others = effectiveSales.filter((e) => e.submittedBy && e.submittedBy !== user?.id);
    const imported = effectiveSales.filter((e) => !e.submittedBy);
    return {
      mySales: mine.reduce((s, e) => s + e.amount, 0),
      myOrders: mine.reduce((s, e) => s + (e.orders ?? 0), 0),
      othersSales: others.reduce((s, e) => s + e.amount, 0),
      othersOrders: others.reduce((s, e) => s + (e.orders ?? 0), 0),
      importedSales: imported.reduce((s, e) => s + e.amount, 0),
      importedOrders: imported.reduce((s, e) => s + (e.orders ?? 0), 0),
    };
  }, [effectiveSales, isRestricted, user?.id]);

  // ── Daily Sales chart data ─────────────────────
  const dailyChartData = useMemo(() => {
    if (isRestricted) {
      // Part-Time: daily bars for selectedMonth
      const [y, m] = selectedMonth.split("-").map(Number);
      const days = daysInMonth(y, m);
      const result: { date: string; total: number }[] = [];
      for (let d = 1; d <= days; d++) {
        const key = `${selectedMonth}-${String(d).padStart(2, "0")}`;
        const total = effectiveSales.filter((e) => e.date === key).reduce((s, e) => s + e.amount, 0);
        result.push({ date: String(d), total });
      }
      return result;
    }

    // BA view: depends on time tab
    if (timeTab === "daterange") {
      const dates = dateRange(drStart, drEnd);
      return dates.map((dt) => {
        const dayEntries = effectiveSales.filter((e) => e.date === dt);
        const mine = dayEntries.filter((e) => e.submittedBy === user?.id).reduce((s, e) => s + e.amount, 0);
        const others = dayEntries.filter((e) => e.submittedBy !== user?.id).reduce((s, e) => s + e.amount, 0);
        return { date: dt.slice(5), mine, others, total: mine + others };
      });
    }
    if (timeTab === "monthly" && monthlyMonth !== "all") {
      const y = Number(monthlyYear);
      const m = Number(monthlyMonth);
      const days = daysInMonth(y, m);
      const prefix = `${monthlyYear}-${monthlyMonth}`;
      const result: { date: string; mine: number; others: number; total: number }[] = [];
      for (let d = 1; d <= days; d++) {
        const key = `${prefix}-${String(d).padStart(2, "0")}`;
        const dayEntries = effectiveSales.filter((e) => e.date === key);
        const mine = dayEntries.filter((e) => e.submittedBy === user?.id).reduce((s, e) => s + e.amount, 0);
        const others = dayEntries.filter((e) => e.submittedBy !== user?.id).reduce((s, e) => s + e.amount, 0);
        result.push({ date: String(d), mine, others, total: mine + others });
      }
      return result;
    }
    if (timeTab === "monthly" && monthlyMonth === "all") {
      const result: { date: string; mine: number; others: number; total: number }[] = [];
      for (let m = 1; m <= 12; m++) {
        const prefix = `${monthlyYear}-${String(m).padStart(2, "0")}`;
        const monthEntries = effectiveSales.filter((e) => e.date.startsWith(prefix));
        const mine = monthEntries.filter((e) => e.submittedBy === user?.id).reduce((s, e) => s + e.amount, 0);
        const others = monthEntries.filter((e) => e.submittedBy !== user?.id).reduce((s, e) => s + e.amount, 0);
        result.push({ date: MONTH_LABELS[m - 1], mine, others, total: mine + others });
      }
      return result;
    }
    // yearly
    const yearsArr = Array.from(selectedYears).sort();
    if (yearsArr.length === 1) {
      const yr = yearsArr[0];
      const result: { date: string; mine: number; others: number; total: number }[] = [];
      for (let m = 1; m <= 12; m++) {
        const prefix = `${yr}-${String(m).padStart(2, "0")}`;
        const monthEntries = effectiveSales.filter((e) => e.date.startsWith(prefix));
        const mine = monthEntries.filter((e) => e.submittedBy === user?.id).reduce((s, e) => s + e.amount, 0);
        const others = monthEntries.filter((e) => e.submittedBy !== user?.id).reduce((s, e) => s + e.amount, 0);
        result.push({ date: MONTH_LABELS[m - 1], mine, others, total: mine + others });
      }
      return result;
    }
    // multi-year: monthly lines overlaid per year
    const result: Record<string, any>[] = [];
    for (let m = 1; m <= 12; m++) {
      const row: Record<string, any> = { date: MONTH_LABELS[m - 1] };
      yearsArr.forEach((yr) => {
        const prefix = `${yr}-${String(m).padStart(2, "0")}`;
        row[yr] = effectiveSales.filter((e) => e.date.startsWith(prefix)).reduce((s, e) => s + e.amount, 0);
      });
      result.push(row);
    }
    return result;
  }, [isRestricted, effectiveSales, selectedMonth, timeTab, drStart, drEnd, monthlyYear, monthlyMonth, selectedYears, user?.id]);

  const isMultiYearOverlay = !isRestricted && timeTab === "yearly" && selectedYears.size > 1;
  const hasAttribution = !isRestricted && effectiveSales.some((e) => e.submittedBy && e.submittedBy !== user?.id);

  // ── Monthly Trend (BA monthly mode only) ───────
  const monthlyTrendData = useMemo(() => {
    if (isRestricted || timeTab !== "monthly") return [];
    const result: { month: string; amount: number }[] = [];
    const yr = Number(monthlyYear);
    for (let m = 1; m <= 12; m++) {
      const prefix = `${yr}-${String(m).padStart(2, "0")}`;
      const total = sales
        .filter((s) => activeCounterIds.has(s.counterId) && s.date.startsWith(prefix))
        .reduce((s, e) => s + e.amount, 0);
      result.push({ month: MONTH_LABELS[m - 1], amount: total });
    }
    return result;
  }, [isRestricted, timeTab, sales, activeCounterIds, monthlyYear]);

  // ── Sales by Brand table data ──────────────────
  const brandTableData = useMemo(() => {
    const map: Record<string, { sales: number; orders: number; units: number }> = {};
    effectiveSales.forEach((e) => {
      const b = brandMap.get(e.brandId);
      const name = b?.name ?? "Unknown";
      if (!map[name]) map[name] = { sales: 0, orders: 0, units: 0 };
      map[name].sales += e.amount;
      map[name].orders += (e.orders ?? 0);
      map[name].units += (e.units ?? 0);
    });
    return Object.entries(map)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.sales - a.sales);
  }, [effectiveSales, brandMap]);

  // ── PP / SPLM ranges ────────────────────────
  // PP   — same number of days immediately before the selected range.
  // SPLM — same calendar slice one month earlier (day-clamped).
  // Only meaningful on the daterange tab; otherwise blank + queries off.
  const { ppStart, ppEnd, splmStart, splmEnd, ppLabel, splmLabel } = useMemo(() => {
    if (timeTab !== "daterange") {
      return { ppStart: "", ppEnd: "", splmStart: "", splmEnd: "", ppLabel: "", splmLabel: "" };
    }
    const s = new Date(drStart + "T00:00:00");
    const e = new Date(drEnd + "T00:00:00");
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const ppE = new Date(s); ppE.setDate(ppE.getDate() - 1);
    const ppS = new Date(ppE); ppS.setDate(ppS.getDate() - (days - 1));
    const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const fmtShort = (d: Date) => `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
    const shiftMonth = (dStr: string, m: number) => {
      const [y, mo, day] = dStr.split("-").map(Number);
      const target = new Date(y, mo - 1 + m, 1);
      const tY = target.getFullYear();
      const tM = target.getMonth() + 1;
      const last = new Date(tY, tM, 0).getDate();
      const tD = Math.min(day, last);
      return `${tY}-${String(tM).padStart(2, "0")}-${String(tD).padStart(2, "0")}`;
    };
    const splmS = shiftMonth(drStart, -1);
    const splmE = shiftMonth(drEnd, -1);
    const splmFmt = (str: string) => {
      const [y, m, d] = str.split("-").map(Number);
      return `${d} ${MONTH_LABELS[m - 1]}`;
    };
    return {
      ppStart: toISO(ppS),
      ppEnd: toISO(ppE),
      splmStart: splmS,
      splmEnd: splmE,
      ppLabel: `${fmtShort(ppS)} – ${fmtShort(ppE)}`,
      splmLabel: `${splmFmt(splmS)} – ${splmFmt(splmE)}`,
    };
  }, [timeTab, drStart, drEnd]);

  const compareEligible = timeTab === "daterange" && !isRestricted;

  // PP / SPLM sales + deductions queries (gated on date-range tab).
  const { data: ppSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${ppStart}&endDate=${ppEnd}`],
    enabled: compareEligible && !!ppStart,
    staleTime: 30_000,
  });
  const { data: ppDedRaw = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${ppStart}&endDate=${ppEnd}`],
    enabled: compareEligible && !!ppStart,
    staleTime: 30_000,
  });
  const { data: splmSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${splmStart}&endDate=${splmEnd}`],
    enabled: compareEligible && !!splmStart,
    staleTime: 30_000,
  });
  const { data: splmDedRaw = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${splmStart}&endDate=${splmEnd}`],
    enabled: compareEligible && !!splmStart,
    staleTime: 30_000,
  });

  // Brand-name -> sales scoped to the BA's POS, using the same Net/Gross
  // rule as effectiveSales so each comparison is apples-to-apples.
  const buildBrandSalesMap = (rawSales: SalesEntry[], rawDed: PromotionDeduction[]) => {
    const scoped = rawSales.filter((s) => activeCounterIds.has(s.counterId));
    let entries: { brandId: string; amount: number }[];
    if (salesView === "gross") {
      entries = scoped.map((e) => ({ brandId: e.brandId, amount: e.amount }));
    } else {
      const ded = rawDed.filter((d) => activeCounterIds.has(d.counterId));
      const alloc = allocateDeductions(scoped, ded);
      entries = alloc.entries.map((e) => ({ brandId: (e as any).brandId, amount: e.netAmount ?? e.amount }));
    }
    const m: Record<string, number> = {};
    for (const e of entries) {
      const b = brandMap.get(e.brandId);
      const name = b?.name ?? "Unknown";
      m[name] = (m[name] ?? 0) + e.amount;
    }
    return m;
  };
  const ppBrandSales = useMemo(
    () => (compareEligible ? buildBrandSalesMap(ppSalesRaw, ppDedRaw) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareEligible, ppSalesRaw, ppDedRaw, activeCounterIds, salesView, brandMap],
  );
  const splmBrandSales = useMemo(
    () => (compareEligible ? buildBrandSalesMap(splmSalesRaw, splmDedRaw) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compareEligible, splmSalesRaw, splmDedRaw, activeCounterIds, salesView, brandMap],
  );

  const ppKpi = useMemo(() => {
    if (!compareEligible) return { sales: 0, orders: 0, units: 0 };
    const scoped = ppSalesRaw.filter((s) => activeCounterIds.has(s.counterId));
    let entries: { amount: number; orders: number; units: number }[];
    if (salesView === "gross") {
      entries = scoped.map((e) => ({ amount: e.amount, orders: e.orders ?? 0, units: e.units ?? 0 }));
    } else {
      const ded = ppDedRaw.filter((d) => activeCounterIds.has(d.counterId));
      const alloc = allocateDeductions(scoped, ded);
      entries = alloc.entries.map((e) => ({
        amount: e.netAmount ?? e.amount,
        orders: (e as { orders?: number }).orders ?? 0,
        units: (e as { units?: number }).units ?? 0,
      }));
    }
    return {
      sales: entries.reduce((s, e) => s + e.amount, 0),
      orders: entries.reduce((s, e) => s + e.orders, 0),
      units: entries.reduce((s, e) => s + e.units, 0),
    };
  }, [compareEligible, ppSalesRaw, ppDedRaw, activeCounterIds, salesView]);

  const atv = totalOrders > 0 ? totalSales / totalOrders : null;
  const upt = totalOrders > 0 ? totalUnits / totalOrders : null;
  const ppAtv = ppKpi.orders > 0 ? ppKpi.sales / ppKpi.orders : null;
  const ppUpt = ppKpi.orders > 0 ? ppKpi.units / ppKpi.orders : null;
  const salesDeltaPct = ppKpi.sales > 0 ? ((totalSales - ppKpi.sales) / ppKpi.sales) * 100 : null;
  const ordersDeltaPct = ppKpi.orders > 0 ? ((totalOrders - ppKpi.orders) / ppKpi.orders) * 100 : null;
  const atvDeltaPct = atv !== null && ppAtv !== null && ppAtv > 0 ? ((atv - ppAtv) / ppAtv) * 100 : null;
  const uptDeltaPct = upt !== null && ppUpt !== null && ppUpt > 0 ? ((upt - ppUpt) / ppUpt) * 100 : null;
  const showKpiDelta = compareEligible && !isDataLoading;

  // ── Promotion performance table ────────────────
  const { promoStart, promoEnd } = useMemo(() => {
    if (isRestricted) {
      return { promoStart: `${selectedMonth}-01`, promoEnd: ymEndDate(selectedMonth) };
    }
    if (timeTab === "daterange") {
      return { promoStart: drStart, promoEnd: drEnd };
    }
    if (timeTab === "monthly") {
      if (monthlyMonth !== "all") {
        const prefix = `${monthlyYear}-${monthlyMonth}`;
        return { promoStart: `${prefix}-01`, promoEnd: ymEndDate(prefix) };
      }
      return { promoStart: `${monthlyYear}-01-01`, promoEnd: `${monthlyYear}-12-31` };
    }
    const years = Array.from(selectedYears).map(Number).sort();
    const minY = years[0] ?? currentYear;
    const maxY = years[years.length - 1] ?? currentYear;
    return { promoStart: `${minY}-01-01`, promoEnd: `${maxY}-12-31` };
  }, [isRestricted, selectedMonth, timeTab, drStart, drEnd, monthlyYear, monthlyMonth, selectedYears, currentYear]);

  const brandNameMap = useMemo(() => {
    const m = new Map<string, string>();
    allBrands.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [allBrands]);

  const promoTableData = useMemo(() => {
    const activePromos = allPromotions.filter((p) => {
      if (!p.isActive) return false;
      return p.startDate <= promoEnd && p.endDate >= promoStart;
    });

    const myResults = allPromoResults.filter(
      (r) => activeCounterIds.has(r.counterId) && r.date >= promoStart && r.date <= promoEnd,
    );

    return activePromos.map((promo) => {
      const results = myResults.filter((r) => r.promotionId === promo.id);
      const totalGwp = results.reduce((s, r) => s + r.gwpGiven, 0);
      const brandName = brandNameMap.get(promo.brandId ?? "") ?? "All Brands";
      return {
        id: promo.id,
        name: promo.name,
        brand: brandName,
        type: promo.type,
        startDate: promo.startDate,
        endDate: promo.endDate,
        gwpGiven: totalGwp,
        trackable: promo.trackable,
      };
    });
  }, [allPromotions, allPromoResults, activeCounterIds, promoStart, promoEnd, brandNameMap]);

  // Deductions for this BA's POS locations over the selected time window.
  // Grouped by (date, promotion) so the BA sees exactly how many coupons
  // were redeemed per day, per promo, and how much HK$ that took out of
  // the counter's gross sales that day.
  const myDeductions = useMemo(() => {
    const rows = allDeductions.filter((d) => {
      if (!activeCounterIds.has(d.counterId)) return false;
      if ((d.redemptionCount ?? 0) <= 0) return false;
      return true;
    });
    // Group by promotion
    type DedRow = {
      date: string;
      count: number;
      amount: number;
      posName: string;
      tierBreakdown?: { tierId: string; redemptionCount: number; rewardPerRedemption: number }[];
    };
    type TierMeta = { id: string; threshold: number; thresholdType?: "spend" | "qty"; thresholdQty?: number; rewardType: string; discountAmount?: number };
    const byPromo = new Map<string, { promoName: string; rows: DedRow[]; total: number; totalCount: number; tiers?: TierMeta[] }>();
    for (const d of rows) {
      const promo = allPromotions.find((p) => p.id === d.promotionId);
      const promoName = promo?.name || "Unknown promotion";
      const posName = assignedPos.find((p: any) => p.id === d.counterId)?.storeName || "Unknown POS";
      // Parse tier definition off the promo (if multi-tier) so the dashboard
      // can render per-tier sub-rows below the daily total.
      let tiers: TierMeta[] | undefined;
      const rawTiers = (promo as any)?.spendGetTiers as string | null | undefined;
      if (rawTiers) {
        try { tiers = (JSON.parse(rawTiers) as TierMeta[]).filter(t => t.rewardType !== "gift"); } catch { /* ignore */ }
      }
      // Parse the per-day tier breakdown that the BA submitted.
      let tierBreakdown: DedRow["tierBreakdown"];
      const rawBreakdown = (d as any).tierBreakdown as string | null | undefined;
      if (rawBreakdown) {
        try { tierBreakdown = JSON.parse(rawBreakdown); } catch { /* ignore */ }
      }
      const entry = byPromo.get(d.promotionId) ?? { promoName, rows: [], total: 0, totalCount: 0, tiers };
      entry.rows.push({
        date: d.date,
        count: d.redemptionCount ?? 0,
        amount: d.totalDeduction ?? 0,
        posName,
        tierBreakdown,
      });
      entry.total += d.totalDeduction ?? 0;
      entry.totalCount += d.redemptionCount ?? 0;
      // Capture tier metadata at least once per promo group.
      if (!entry.tiers && tiers) entry.tiers = tiers;
      byPromo.set(d.promotionId, entry);
    }
    // Sort each promo's rows by date desc
    for (const v of byPromo.values()) {
      v.rows.sort((a, b) => b.date.localeCompare(a.date));
    }
    return Array.from(byPromo.entries()).map(([promotionId, v]) => ({ promotionId, ...v }));
  }, [allDeductions, allPromotions, activeCounterIds, assignedPos]);

  const totalDeductionAmount = useMemo(
    () => myDeductions.reduce((s, p) => s + p.total, 0),
    [myDeductions],
  );

  // By-brand allocation of the total deduction. Uses the same allocator as
  // the Gross/Net toggle so the numbers match exactly: brand_gross / counter_day_gross
  // × counter_day_deduction. Brands with no sales on a deduction-bearing day
  // get no deduction and don't appear in the list. Only computed when there
  // is actually a deduction to display — keeps the hot path fast.
  const deductionByBrand = useMemo(() => {
    if (totalDeductionAmount <= 0) return [] as { brandId: string; brandName: string; gross: number; deduction: number; net: number }[];
    const byBrand = new Map<string, { gross: number; deduction: number }>();
    for (const e of allocation.entries) {
      if (!(e as any).brandId) continue;
      const brandId = (e as any).brandId as string;
      const prev = byBrand.get(brandId) ?? { gross: 0, deduction: 0 };
      prev.gross += (e.amount ?? 0);
      prev.deduction += (e.deduction ?? 0);
      byBrand.set(brandId, prev);
    }
    return Array.from(byBrand.entries())
      .map(([brandId, v]) => ({
        brandId,
        brandName: brandNameMap.get(brandId) ?? "Unknown brand",
        gross: v.gross,
        deduction: v.deduction,
        net: Math.max(0, v.gross - v.deduction),
      }))
      // Only show brands that actually absorbed part of the deduction
      .filter((r) => r.deduction > 0)
      .sort((a, b) => b.deduction - a.deduction);
  }, [allocation, brandNameMap, totalDeductionAmount]);

  const counterFilterLabel = selectedCounters === null
    ? "All"
    : String(selectedCounters.size);

  // ── No POS assigned guard ──────────────────────
  if (posIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <Card className="max-w-md rounded-xl border border-border/80 shadow-2xs">
          <CardHeader>
            <CardTitle className="text-base">No POS Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You don&apos;t have any POS locations assigned yet. Please contact your manager to get access.
            </p>
            <Link href="/">
              <Button variant="outline" size="sm" className="mt-4 gap-1.5">
                <ArrowLeft className="w-4 h-4" />
                Back to sales entry
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const chartTitle = isRestricted
    ? "Daily Sales"
    : timeTab === "yearly" && selectedYears.size > 1
      ? "Sales Trend (Year Overlay)"
      : timeTab === "monthly" && monthlyMonth === "all"
        ? "Monthly Sales"
        : "Daily Sales";

  // ── Render ─────────────────────────────────────
  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-3.5 sm:space-y-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-2">
        <Link href="/" aria-label="Back to sales entry">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mt-0.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            {assignedPos.map((p) => p.storeName).join(", ")}
          </p>
        </div>
      </div>

      {isErrorSales && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between gap-3 text-xs" role="alert">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Failed to load sales data. Check your network connection.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchSales()} className="h-7 text-xs gap-1 shrink-0">
            <RefreshCw className="w-3 h-3" /> Retry
          </Button>
        </div>
      )}

      {/* ── Part-Time Filter Bar ─────────────────── */}
      {isRestricted && (
        <Card className="rounded-xl border border-border/80 shadow-2xs">
          <CardContent className="p-3 sm:p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Month</span>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Showing only your submitted sales entries.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── BA Filter Bar ────────────────────────── */}
      {!isRestricted && (
        <Card className="rounded-xl border border-border/80 shadow-2xs">
          <CardContent className="p-3 sm:p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="group" aria-label="Time period">
                {([["daterange", "Date Range"], ["monthly", "Monthly"], ["yearly", "Yearly"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimeTab(key)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                      timeTab === key
                        ? "bg-background text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <div className="sm:hidden">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMobileFilterOpen(true)}
                    className="h-8 px-2.5 text-xs gap-1.5 relative"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Filters
                    {selectedCounters !== null && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary absolute -top-0.5 -right-0.5" />
                    )}
                  </Button>
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="hidden sm:inline-flex h-8 gap-1 text-xs">
                      <Filter className="h-3 w-3" />
                      Counters: {counterFilterLabel}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 max-h-[300px] overflow-auto" align="end">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between pb-2 border-b">
                        <span className="text-sm font-medium">Counter</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setSelectedCounters(null)}
                        >
                          Select All
                        </Button>
                      </div>
                      {assignedPos.map((pos) => {
                        const checked = selectedCounters === null || selectedCounters.has(pos.id);
                        return (
                          <label key={pos.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(c) => {
                                const base = selectedCounters ?? new Set(posIds);
                                const next = new Set(base);
                                if (c) next.add(pos.id); else next.delete(pos.id);
                                if (next.size === posIds.length) setSelectedCounters(null);
                                else setSelectedCounters(next);
                              }}
                            />
                            {pos.storeName}
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {timeTab === "daterange" && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border/50">
                <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                  {(["7d", "14d", "30d", "mtd"] as const).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectPreset(preset)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-md font-medium shrink-0 transition-colors border",
                        quickPreset === preset
                          ? "bg-primary text-primary-foreground border-primary font-semibold shadow-2xs"
                          : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60",
                      )}
                    >
                      {preset === "mtd" ? "This Month" : `Last ${preset.slice(0, -1)}D`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setQuickPreset("custom")}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md font-medium shrink-0 transition-colors border",
                      quickPreset === "custom"
                        ? "bg-primary text-primary-foreground border-primary font-semibold shadow-2xs"
                        : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60",
                    )}
                  >
                    Custom
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                    <span className="text-[11px] text-muted-foreground">From</span>
                    <Input
                      type="date"
                      value={drStart}
                      onChange={(e) => {
                        setDrStart(e.target.value);
                        setQuickPreset("custom");
                      }}
                      className="h-8 text-xs w-full sm:w-[135px]"
                      aria-label="Start date"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                    <span className="text-[11px] text-muted-foreground">To</span>
                    <Input
                      type="date"
                      value={drEnd}
                      onChange={(e) => {
                        setDrEnd(e.target.value);
                        setQuickPreset("custom");
                      }}
                      className="h-8 text-xs w-full sm:w-[135px]"
                      aria-label="End date"
                    />
                  </div>
                </div>
              </div>
            )}

            {timeTab === "monthly" && (
              <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Year</span>
                  <Select value={monthlyYear} onValueChange={setMonthlyYear}>
                    <SelectTrigger className="w-[95px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Month</span>
                  <Select value={monthlyMonth} onValueChange={setMonthlyMonth}>
                    <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
                      {MONTH_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {timeTab === "yearly" && (
              <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/50">
                {availableYears.map((yr) => (
                  <label key={yr} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={selectedYears.has(yr)}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedYears);
                        if (checked) next.add(yr); else next.delete(yr);
                        if (next.size > 0) setSelectedYears(next);
                      }}
                    />
                    {yr}
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 space-y-4">
          <SheetHeader className="text-left border-b pb-2">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-bold">Filter Dashboard</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCounters(null)}
                className="h-7 text-xs text-primary"
              >
                Reset
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Choose which of your assigned counters to include.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground">POS Locations</span>
              <button type="button" className="text-xs text-primary underline" onClick={() => setSelectedCounters(null)}>All</button>
            </div>
            <div className="space-y-1">
              {assignedPos.map((pos) => {
                const checked = selectedCounters === null || selectedCounters.has(pos.id);
                return (
                  <label key={pos.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 text-xs cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(c) => {
                        const base = selectedCounters ?? new Set(posIds);
                        const next = new Set(base);
                        if (c) next.add(pos.id); else next.delete(pos.id);
                        if (next.size === posIds.length) setSelectedCounters(null);
                        else setSelectedCounters(next);
                      }}
                    />
                    <span className="truncate">{pos.storeName}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <Button className="w-full h-9 text-xs" onClick={() => setMobileFilterOpen(false)}>
            Apply Filters
          </Button>
        </SheetContent>
      </Sheet>

      {hasAnyDeduction && (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="text-[11px] sm:text-xs text-muted-foreground truncate">
            Showing <span className="font-semibold text-foreground">{salesView === "net" ? "Net" : "Gross"}</span> sales
            {salesView === "net" && (
              <span> · {fmtCurrency(totalDeduction)} promo deductions
                {unallocatedDeduction > 0 && (
                  <span className="text-amber-600 dark:text-amber-400"> ({fmtCurrency(unallocatedDeduction)} unallocated)</span>
                )}
              </span>
            )}
          </div>
          <div className="inline-flex rounded-lg border bg-muted/60 p-0.5 shrink-0" role="group" data-testid="ba-sales-view-toggle" aria-label="Sales view">
            <button
              type="button"
              onClick={() => setSalesView("net")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                salesView === "net" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="ba-toggle-view-net"
            >
              Net
            </button>
            <button
              type="button"
              onClick={() => setSalesView("gross")}
              className={cn(
                "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                salesView === "gross" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground",
              )}
              data-testid="ba-toggle-view-gross"
            >
              Gross
            </button>
          </div>
        </div>
      )}

      {projection && (() => {
        const pctOfMonth = Math.min(100, Math.max(0, Math.round((projection.daysElapsed / projection.monthDays) * 100)));
        return (
          <Card className="rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50/70 via-blue-50/30 to-background dark:from-blue-950/30 dark:via-blue-950/10 dark:to-background overflow-hidden shadow-2xs">
            <CardContent className="p-3.5 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-blue-600/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <CalendarDays className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-xs sm:text-sm text-blue-900 dark:text-blue-200">
                    Monthly Projection — {MONTH_LABELS[projection.month - 1]} {projection.year}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span>Day {projection.daysElapsed} of {projection.monthDays}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">({pctOfMonth}%)</span>
                </div>
              </div>
              <div className="w-full bg-blue-200/50 dark:bg-blue-900/40 h-1.5 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={pctOfMonth} aria-valuemin={0} aria-valuemax={100} aria-label="Month elapsed">
                <div className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-500" style={{ width: `${pctOfMonth}%` }} />
              </div>
              <div className="bg-background/95 dark:bg-card/95 rounded-xl p-3 sm:p-4 border border-blue-100 dark:border-blue-900/50 mb-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider block">
                      Projected Full Month
                    </span>
                    <div className="text-xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">
                      {fmtCurrency(projection.projected)}
                    </div>
                  </div>
                  {projection.vsLM !== null && (
                    <div className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold w-fit",
                      projection.vsLM >= 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800"
                        : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800",
                    )}>
                      <span>{projection.vsLM >= 0 ? "▲ +" : "▼ "}{Math.abs(projection.vsLMPct ?? 0).toFixed(1)}%</span>
                      <span className="font-normal opacity-85 text-[11px]">({fmtCurrency(Math.abs(projection.vsLM))} vs {lmRange.label})</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1 text-center sm:text-left">
                <div className="p-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                    {drStart.slice(8)}–{drEnd.slice(8)} {MONTH_LABELS[projection.month - 1]}
                  </p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">{fmtCurrency(totalSales)}</p>
                </div>
                <div className="p-1 border-x border-blue-200/50 dark:border-blue-900/40">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Daily Run Rate</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">{fmtCurrency(Math.round(projection.dailyRate))}</p>
                </div>
                <div className="p-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{lmRange.label} Total</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">
                    {projection.lmTotalSales > 0 ? fmtCurrency(projection.lmTotalSales) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5">
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium flex items-center gap-1 text-foreground/80">
              Total Sales
              {hasAnyDeduction && (
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                  {salesView === "net" ? "Net" : "Gross"}
                </Badge>
              )}
            </span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? <Skeleton className="h-6 sm:h-7 w-24 sm:w-28 my-1" /> : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">{fmtCurrency(totalSales)}</div>
            )}
            {hasAnyDeduction && salesView === "net" && (
              <div className="text-[10px] text-muted-foreground truncate">− {fmtCurrency(totalDeduction)} promo ded.</div>
            )}
            <VsPrev pct={salesDeltaPct} show={showKpiDelta && ppKpi.sales > 0} />
          </div>
        </Card>
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium text-foreground/80">Total Orders</span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? <Skeleton className="h-6 sm:h-7 w-16 sm:w-20 my-1" /> : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">{totalOrders.toLocaleString()}</div>
            )}
            <VsPrev pct={ordersDeltaPct} show={showKpiDelta && ppKpi.orders > 0} />
          </div>
        </Card>
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium text-foreground/80">ATV</span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? <Skeleton className="h-6 sm:h-7 w-20 sm:w-24 my-1" /> : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">
                {atv !== null ? fmtCurrency(Math.round(atv)) : "—"}
              </div>
            )}
            <VsPrev pct={atvDeltaPct} show={showKpiDelta} />
          </div>
        </Card>
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium text-foreground/80">UPT</span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
              <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? <Skeleton className="h-6 sm:h-7 w-14 sm:w-16 my-1" /> : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">
                {upt !== null ? upt.toFixed(1) : "—"}
              </div>
            )}
            <VsPrev pct={uptDeltaPct} show={showKpiDelta} />
          </div>
        </Card>
      </div>

      {attribution && (attribution.othersSales > 0 || attribution.importedSales > 0) && (
        <Card className="rounded-xl border border-border/80 shadow-2xs">
          <CardHeader className="p-3 sm:p-4 pb-2">
            <CardTitle className="text-xs sm:text-sm font-semibold">Sales Attribution</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
              <div className="p-2 rounded-lg bg-muted/40 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[0] }} />
                  <span className="text-xs text-muted-foreground">My Sales</span>
                </div>
                <div className="text-sm font-semibold truncate">{fmtCurrency(attribution.mySales)}</div>
                <div className="text-[11px] text-muted-foreground">{attribution.myOrders} orders</div>
              </div>
              {attribution.othersSales > 0 && (
                <div className="p-2 rounded-lg bg-muted/40 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[1] }} />
                    <span className="text-xs text-muted-foreground">Part-Time</span>
                  </div>
                  <div className="text-sm font-semibold truncate">{fmtCurrency(attribution.othersSales)}</div>
                  <div className="text-[11px] text-muted-foreground">{attribution.othersOrders} orders</div>
                </div>
              )}
              {attribution.importedSales > 0 && (
                <div className="p-2 rounded-lg bg-muted/40 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
                    <span className="text-xs text-muted-foreground">Imported</span>
                  </div>
                  <div className="text-sm font-semibold truncate">{fmtCurrency(attribution.importedSales)}</div>
                  <div className="text-[11px] text-muted-foreground">{attribution.importedOrders} orders</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-xs sm:text-sm font-semibold truncate">{chartTitle}</CardTitle>
            {!isRestricted && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] font-normal py-0 shrink-0">
                {timeTab === "daterange" ? (quickPreset !== "custom" ? quickPreset.toUpperCase() : "Daily") : timeTab === "monthly"
                  ? (monthlyMonth === "all" ? "Monthly" : "Daily")
                  : selectedYears.size > 1 ? "Year Comparison" : "Monthly"}
              </Badge>
            )}
          </div>
          {timeTab === "daterange" && !isRestricted && (
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg text-[10px] sm:text-[11px]">
              {(["7d", "14d", "30d", "mtd"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    "px-1.5 sm:px-2 py-0.5 rounded-md font-medium transition-colors",
                    quickPreset === preset
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-3">
          {isDataLoading ? (
            <div className="flex flex-col items-center justify-center h-[200px] sm:h-[260px] gap-2" aria-busy="true" aria-label="Loading chart">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading trend data...</span>
            </div>
          ) : dailyChartData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] sm:h-[260px] text-muted-foreground text-xs sm:text-sm" role="status">
              No data for selected filters
            </div>
          ) : (
            <div className="h-[210px] sm:h-[260px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                {isMultiYearOverlay ? (
                  <LineChart data={dailyChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} minTickGap={16} />
                    <YAxis tick={{ fontSize: 10 }} width={38} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(v: number, name: string) => [fmtCurrency(v), name]}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                    {Array.from(selectedYears).sort().map((yr, i) => (
                      <Line key={yr} type="monotone" dataKey={yr} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    ))}
                  </LineChart>
                ) : hasAttribution ? (
                  <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} width={38} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(v: number, name: string) => [fmtCurrency(v), name === "mine" ? "My Sales" : "Others"]}
                    />
                    <Legend formatter={(value) => value === "mine" ? "My Sales" : "Others"} wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
                    <Bar dataKey="mine" stackId="1" fill={CHART_COLORS[0]} />
                    <Bar dataKey="others" stackId="1" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} width={38} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                      formatter={(v: number) => [fmtCurrency(v), "Sales"]}
                    />
                    <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {!isRestricted && timeTab === "monthly" && (
        <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
          <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs sm:text-sm font-semibold">Monthly Sales Trend ({monthlyYear})</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-4 pt-3">
            <div className="h-[210px] sm:h-[260px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} width={38} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                    formatter={(v: number) => [fmtCurrency(v), "Sales"]}
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xs sm:text-sm font-semibold">Sales by Brand</CardTitle>
                {brandTableData.length > 0 && (
                  <Badge variant="outline" className="text-[10px] font-normal py-0 hidden sm:inline-flex">
                    {brandTableData.length} brand{brandTableData.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              {compareEligible && (ppLabel || splmLabel) && (
                <div className="hidden sm:flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {ppLabel && (
                    <span className="text-[11px] text-muted-foreground rounded-md bg-muted/60 px-1.5 py-0.5">
                      vs prev {ppLabel}
                    </span>
                  )}
                  {splmLabel && (
                    <span className="text-[11px] text-muted-foreground rounded-md bg-muted/60 px-1.5 py-0.5">
                      vs last month {splmLabel}
                    </span>
                  )}
                </div>
              )}
              {compareEligible && ppLabel && (
                <p className="sm:hidden text-[11px] text-muted-foreground mt-0.5">vs PP: {ppLabel}</p>
              )}
            </div>
            <div className="flex sm:hidden items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setBrandViewMode("cards")}
                className={cn(
                  "p-1 rounded-md transition-colors",
                  brandViewMode === "cards" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground",
                )}
                aria-label="Card view"
                aria-pressed={brandViewMode === "cards"}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBrandViewMode("table")}
                className={cn(
                  "p-1 rounded-md transition-colors",
                  brandViewMode === "table" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground",
                )}
                aria-label="Table view"
                aria-pressed={brandViewMode === "table"}
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-3">
          {brandTableData.length === 0 ? (
            <div className="py-8 text-center" role="status">
              <p className="text-sm font-medium text-foreground">No sales data for this period</p>
              <p className="text-xs text-muted-foreground mt-1">Try another date range or counter filter.</p>
            </div>
          ) : (() => {
            const deltaPctText = (current: number, prior: number) => {
              if (prior === 0 && current === 0) return "—";
              if (prior === 0) return "New";
              const pct = ((current - prior) / prior) * 100;
              return `${pct >= 0 ? "▲ +" : "▼ "}${Math.abs(pct).toFixed(1)}%`;
            };
            const totalPP = Object.values(ppBrandSales).reduce((s, v) => s + v, 0);
            const totalSPLM = Object.values(splmBrandSales).reduce((s, v) => s + v, 0);
            return (
              <>
                <div className={cn("space-y-2", brandViewMode === "table" ? "hidden" : "sm:hidden")}>
                  {brandTableData.map((row) => {
                    const ppVal = ppBrandSales[row.name] ?? 0;
                    const splmVal = splmBrandSales[row.name] ?? 0;
                    const ppPct = ppVal > 0 ? ((row.sales - ppVal) / ppVal) * 100 : null;
                    const isUp = (ppPct ?? 0) >= 0;
                    return (
                      <div key={row.name} className="p-2.5 rounded-lg border bg-card/60 space-y-1.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-foreground min-w-0">{row.name}</div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold">{fmtCurrency(row.sales)}</div>
                            {compareEligible && (
                              <div className={cn(
                                "text-[10px] font-semibold",
                                ppVal === 0 && row.sales > 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
                              )}>
                                {deltaPctText(row.sales, ppVal)}
                              </div>
                            )}
                          </div>
                        </div>
                        {compareEligible && splmVal > 0 && (
                          <div className="text-[11px] text-muted-foreground">
                            vs last month: {deltaPctText(row.sales, splmVal)}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border/50 text-center text-xs">
                          <div className="bg-muted/40 p-1 rounded">
                            <span className="text-[10px] text-muted-foreground block">Units</span>
                            <span className="font-semibold text-foreground">{row.units.toLocaleString()}</span>
                          </div>
                          <div className="bg-muted/40 p-1 rounded">
                            <span className="text-[10px] text-muted-foreground block">ATV</span>
                            <span className="font-semibold text-foreground">{row.orders > 0 ? fmtCurrency(Math.round(row.sales / row.orders)) : "—"}</span>
                          </div>
                          <div className="bg-muted/40 p-1 rounded">
                            <span className="text-[10px] text-muted-foreground block">UPT</span>
                            <span className="font-semibold text-foreground">{fmtRatio(row.units, row.orders)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className={cn("overflow-x-auto -mx-2 sm:mx-0", brandViewMode === "cards" ? "hidden sm:block" : "")}>
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2.5 pl-2 sm:pl-1 font-medium sticky left-0 z-10 bg-card pr-3">Brand</th>
                        <th className="pb-2.5 font-medium text-right w-[128px]">Sales</th>
                        {compareEligible && (
                          <>
                            <th className="pb-2.5 font-medium text-right whitespace-nowrap w-[120px]">vs Prev</th>
                            <th className="pb-2.5 font-medium text-right whitespace-nowrap w-[128px]">vs Last Month</th>
                          </>
                        )}
                        <th className="pb-2.5 font-medium text-right w-[72px]">Units</th>
                        <th className="pb-2.5 font-medium text-right w-[96px]">ATV</th>
                        <th className="pb-2.5 pr-2 sm:pr-1 font-medium text-right w-[56px]">UPT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {brandTableData.map((row) => {
                        const ppVal = ppBrandSales[row.name] ?? 0;
                        const splmVal = splmBrandSales[row.name] ?? 0;
                        const share = totalSales > 0 ? (row.sales / totalSales) * 100 : 0;
                        return (
                          <tr key={row.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-2.5 pl-2 sm:pl-1 sticky left-0 z-10 bg-card pr-3">
                              <div className="min-w-[160px] max-w-[280px]">
                                <div className="font-medium text-foreground truncate">{row.name}</div>
                                <div className="hidden md:flex items-center gap-1.5 mt-1">
                                  <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden" aria-hidden>
                                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(100, share)}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-8 text-right tabular-nums">{share.toFixed(0)}%</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 text-right font-semibold tabular-nums w-[128px]">{fmtCurrency(row.sales)}</td>
                            {compareEligible && (
                              <>
                                <td className="py-2.5 text-right w-[120px]"><DeltaCell current={row.sales} prior={ppVal} show /></td>
                                <td className="py-2.5 text-right w-[128px]"><DeltaCell current={row.sales} prior={splmVal} show /></td>
                              </>
                            )}
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground w-[72px]">{row.units.toLocaleString()}</td>
                            <td className="py-2.5 text-right tabular-nums text-muted-foreground w-[96px]">{row.orders > 0 ? fmtCurrency(Math.round(row.sales / row.orders)) : "—"}</td>
                            <td className="py-2.5 pr-2 sm:pr-1 text-right tabular-nums text-muted-foreground w-[56px]">{fmtRatio(row.units, row.orders)}</td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 font-semibold bg-muted/40">
                        <td className="py-2.5 pl-2 sm:pl-1 sticky left-0 z-10 bg-muted/40 pr-3">Total</td>
                        <td className="py-2.5 text-right tabular-nums w-[128px]">{fmtCurrency(totalSales)}</td>
                        {compareEligible && (
                          <>
                            <td className="py-2.5 text-right w-[120px]"><DeltaCell current={totalSales} prior={totalPP} show /></td>
                            <td className="py-2.5 text-right w-[128px]"><DeltaCell current={totalSales} prior={totalSPLM} show /></td>
                          </>
                        )}
                        <td className="py-2.5 text-right tabular-nums w-[72px]">{totalUnits.toLocaleString()}</td>
                        <td className="py-2.5 text-right tabular-nums w-[96px]">{totalOrders > 0 ? fmtCurrency(Math.round(totalSales / totalOrders)) : "—"}</td>
                        <td className="py-2.5 pr-2 sm:pr-1 text-right tabular-nums w-[56px]">{totalOrders > 0 ? (totalUnits / totalOrders).toFixed(1) : "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-xs sm:text-sm font-semibold">Promotion Performance</CardTitle>
              {promoTableData.length > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal py-0 hidden sm:inline-flex">
                  {promoTableData.length} active
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-3">
          {promoTableData.length === 0 ? (
            <div className="py-8 text-center" role="status">
              <Gift className="w-6 h-6 mx-auto text-muted-foreground/70 mb-2" />
              <p className="text-sm font-medium text-foreground">No active promotions</p>
              <p className="text-xs text-muted-foreground mt-1">Nothing overlaps this date range for your counters.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 sm:hidden">
                {promoTableData.map((row) => (
                  <div key={row.id} className="p-2.5 rounded-lg border bg-card/60 space-y-1 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold">{row.name}</div>
                        <div className="text-[11px] text-muted-foreground">{row.brand} · {row.type}</div>
                      </div>
                      <div className="text-xs font-semibold tabular-nums shrink-0">
                        {row.trackable ? `${row.gwpGiven} GWP` : "—"}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{fmtShortDate(row.startDate)} – {fmtShortDate(row.endDate)}</div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2.5 pl-1 font-medium">Promotion</th>
                      <th className="pb-2.5 font-medium">Brand</th>
                      <th className="pb-2.5 font-medium">Type</th>
                      <th className="pb-2.5 font-medium">Period</th>
                      <th className="pb-2.5 pr-1 font-medium text-right">GWP Given</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promoTableData.map((row) => (
                      <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 pl-1 pr-3 font-medium max-w-[280px]">
                          <span className="block truncate">{row.name}</span>
                        </td>
                        <td className="py-2.5 text-muted-foreground whitespace-nowrap">{row.brand}</td>
                        <td className="py-2.5">
                          <Badge variant="outline" className="text-[10px] font-normal py-0">
                            {row.type}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                          {fmtShortDate(row.startDate)} – {fmtShortDate(row.endDate)}
                        </td>
                        <td className="py-2.5 pr-1 text-right">
                          {row.trackable ? (
                            <span className="font-semibold tabular-nums">{row.gwpGiven.toLocaleString()}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not tracked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-xs sm:text-sm font-semibold truncate">Promotion Deductions</CardTitle>
              {totalDeductionAmount > 0 && (
                <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                  Total: −{fmtCurrency(totalDeductionAmount)}
                </Badge>
              )}
            </div>
            {totalDeductionAmount > 0 && (
              <div className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="group" data-testid="deduction-view-toggle" aria-label="Deduction view">
                <button
                  type="button"
                  onClick={() => setDeductionView("daily")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                    deductionView === "daily" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="deduction-toggle-daily"
                >
                  By day
                </button>
                <button
                  type="button"
                  onClick={() => setDeductionView("brand")}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                    deductionView === "brand" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground",
                  )}
                  data-testid="deduction-toggle-brand"
                >
                  By brand
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-3">
          {myDeductions.length === 0 ? (
            <p className="text-muted-foreground text-xs sm:text-sm py-4 text-center" role="status">No coupon redemptions recorded in this period.</p>
          ) : deductionView === "brand" ? (
            deductionByBrand.length === 0 ? (
              <p className="text-muted-foreground text-xs sm:text-sm py-4 text-center" role="status">
                Deductions exist but couldn&apos;t be allocated to any brand (counter had no sales on deduction days).
              </p>
            ) : (
              <>
                <div className="space-y-2 sm:hidden">
                  {deductionByBrand.map((b) => (
                    <div key={b.brandId} className="p-2.5 rounded-lg border bg-card/60 space-y-1.5 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{b.brandName}</span>
                        <span className="text-xs font-bold tabular-nums">{fmtCurrency(b.net)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 text-center text-xs">
                        <div className="bg-muted/40 p-1 rounded">
                          <span className="text-[10px] text-muted-foreground block">Gross</span>
                          <span className="font-semibold">{fmtCurrency(b.gross)}</span>
                        </div>
                        <div className="bg-muted/40 p-1 rounded">
                          <span className="text-[10px] text-muted-foreground block">Deduction</span>
                          <span className="font-semibold text-blue-700 dark:text-blue-300">−{fmtCurrency(b.deduction)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm" data-testid="deduction-by-brand-table">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-3 py-2 font-medium sticky left-0 z-10 bg-card">Brand</th>
                        <th className="px-3 py-2 font-medium text-right">Gross Sales</th>
                        <th className="px-3 py-2 font-medium text-right">Deduction</th>
                        <th className="px-3 py-2 font-medium text-right">Net Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductionByBrand.map((b) => (
                        <tr key={b.brandId} className="border-b last:border-0">
                          <td className="px-3 py-1.5 sticky left-0 z-10 bg-card">{b.brandName}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtCurrency(b.gross)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 dark:text-blue-300">−{fmtCurrency(b.deduction)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtCurrency(b.net)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 font-semibold bg-muted/40">
                        <td className="px-3 py-2 sticky left-0 z-10 bg-card">Total</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtCurrency(deductionByBrand.reduce((s, b) => s + b.gross, 0))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-700 dark:text-blue-300">
                          −{fmtCurrency(deductionByBrand.reduce((s, b) => s + b.deduction, 0))}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtCurrency(deductionByBrand.reduce((s, b) => s + b.net, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 px-1">
                  Deductions are spread proportionally across brands that sold on each deduction day.
                </p>
              </>
            )
          ) : (
            <div className="space-y-3">
              {myDeductions.map((p) => (
                <div key={p.promotionId} className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs sm:text-sm font-medium">{p.promoName}</div>
                    <div className="text-[11px] sm:text-xs text-muted-foreground">
                      {p.totalCount} coupon{p.totalCount !== 1 ? "s" : ""} ·{" "}
                      <span className="font-semibold text-blue-700 dark:text-blue-300">−{fmtCurrency(p.total)}</span>
                    </div>
                  </div>
                  <div className="sm:hidden divide-y">
                    {p.rows.map((r, i) => (
                      <div key={`${r.date}-${r.posName}-${i}`} className="px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground">{(() => { const [y, m, d] = r.date.split("-"); return `${d}/${m}/${y}`; })()} · {r.posName}</span>
                          <span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">−{fmtCurrency(r.amount)}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">{r.count} redemption{r.count !== 1 ? "s" : ""}</div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="px-3 py-2 font-medium">Date</th>
                          <th className="px-3 py-2 font-medium">POS</th>
                          <th className="px-3 py-2 font-medium text-right">Redemptions</th>
                          <th className="px-3 py-2 font-medium text-right">Deduction (HK$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.rows.map((r, i) => (
                          <Fragment key={`${r.date}-${r.posName}-${i}`}>
                            <tr className="border-b last:border-0">
                              <td className="px-3 py-1.5 whitespace-nowrap">{(() => { const [y, m, d] = r.date.split("-"); return `${d}/${m}/${y}`; })()}</td>
                              <td className="px-3 py-1.5">{r.posName}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 dark:text-blue-300">−{fmtCurrency(r.amount)}</td>
                            </tr>
                            {r.tierBreakdown && r.tierBreakdown.length > 0 && p.tiers && p.tiers.length > 0 && r.tierBreakdown.map((tb) => {
                              const tierMeta = p.tiers!.find((t) => t.id === tb.tierId);
                              if (!tierMeta) return null;
                              if ((tb.redemptionCount ?? 0) <= 0) return null;
                              const label = tierMeta.thresholdType === "qty"
                                ? `購買 ${tierMeta.thresholdQty ?? 0} 件 → 減 HK$${(tierMeta.discountAmount ?? 0).toLocaleString()}`
                                : `消費 HK$${tierMeta.threshold.toLocaleString()} → 減 HK$${(tierMeta.discountAmount ?? 0).toLocaleString()}`;
                              const tierSubtotal = tb.redemptionCount * (tb.rewardPerRedemption ?? 0);
                              return (
                                <tr key={`${r.date}-${r.posName}-${i}-${tb.tierId}`} className="border-b last:border-0 bg-muted/20 text-muted-foreground">
                                  <td className="px-3 py-1"></td>
                                  <td className="px-3 py-1 pl-6 text-[11px]">↳ {label}</td>
                                  <td className="px-3 py-1 text-right tabular-nums text-[11px]">{tb.redemptionCount}</td>
                                  <td className="px-3 py-1 text-right tabular-nums text-[11px]">−{fmtCurrency(tierSubtotal)}</td>
                                </tr>
                              );
                            })}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

