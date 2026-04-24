import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesEntry, Brand, Promotion, PromotionResult, PosLocation, PromotionDeduction } from "@shared/schema";
import { allocateDeductions, type SalesViewMode } from "@shared/deductionAllocation";
import { useAuth } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DollarSign, ShoppingCart, TrendingUp, Package, ArrowLeft, Filter, ChevronDown,
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

function todayStr() { return new Date().toISOString().split("T")[0]; }

function yearStartStr() {
  return `2026-01-01`;
}

function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    dates.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return dates;
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
  const [drStart, setDrStart] = useState(yearStartStr);
  const [drEnd, setDrEnd] = useState(todayStr);
  const [monthlyYear, setMonthlyYear] = useState(String(currentYear));
  const [monthlyMonth, setMonthlyMonth] = useState("all");
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set([String(currentYear)]));

  // ── BA counter filter ────────────────────────────
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null);

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
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const { data: allBrands = [] } = useQuery<Brand[]>({
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
  const { data: allDeductions = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

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
    const byPromo = new Map<string, { promoName: string; rows: { date: string; count: number; amount: number; posName: string }[]; total: number; totalCount: number }>();
    for (const d of rows) {
      const promo = allPromotions.find((p) => p.id === d.promotionId);
      const promoName = promo?.name || "Unknown promotion";
      const posName = assignedPos.find((p: any) => p.id === d.counterId)?.storeName || "Unknown POS";
      const entry = byPromo.get(d.promotionId) ?? { promoName, rows: [], total: 0, totalCount: 0 };
      entry.rows.push({
        date: d.date,
        count: d.redemptionCount ?? 0,
        amount: d.totalDeduction ?? 0,
        posName,
      });
      entry.total += d.totalDeduction ?? 0;
      entry.totalCount += d.redemptionCount ?? 0;
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

  // ── No POS assigned guard ──────────────────────
  if (posIds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No POS Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              You don't have any POS locations assigned yet. Please contact your manager to get access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/">
              <span className="text-muted-foreground hover:text-foreground cursor-pointer"><ArrowLeft className="w-5 h-5" /></span>
            </Link>
            <h1 className="text-xl md:text-2xl font-bold">My Dashboard</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {assignedPos.map((p: any) => p.storeName ?? p.name).join(", ")}
          </p>
        </div>
      </div>

      {/* ── Part-Time Filter Bar ─────────────────── */}
      {isRestricted && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-4">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── BA Filter Bar ────────────────────────── */}
      {!isRestricted && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-wrap items-end gap-4">
              {/* Time period tabs */}
              <div className="flex rounded-md border">
                {(["daterange", "monthly", "yearly"] as const).map((tab) => (
                  <Button
                    key={tab}
                    variant={timeTab === tab ? "default" : "ghost"}
                    size="sm"
                    className="rounded-none first:rounded-l-md last:rounded-r-md"
                    onClick={() => setTimeTab(tab)}
                  >
                    {tab === "daterange" ? "Date Range" : tab === "monthly" ? "Monthly" : "Yearly"}
                  </Button>
                ))}
              </div>

              {/* Date Range controls */}
              {timeTab === "daterange" && (
                <div className="flex items-end gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date" value={drStart} onChange={(e) => setDrStart(e.target.value)} className="w-[130px] md:w-[150px]" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date" value={drEnd} onChange={(e) => setDrEnd(e.target.value)} className="w-[130px] md:w-[150px]" />
                  </div>
                </div>
              )}

              {/* Monthly controls */}
              {timeTab === "monthly" && (
                <div className="flex items-end gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Year</Label>
                    <Select value={monthlyYear} onValueChange={setMonthlyYear}>
                      <SelectTrigger className="w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {yearOptions.map((y) => (
                          <SelectItem key={y} value={y}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Month</Label>
                    <Select value={monthlyMonth} onValueChange={setMonthlyMonth}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
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

              {/* Yearly controls */}
              {timeTab === "yearly" && (
                <div className="flex flex-wrap gap-3">
                  {availableYears.map((yr) => (
                    <label key={yr} className="flex items-center gap-1.5 text-sm">
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

              {/* Counter filter (assigned POS only) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Filter className="h-3.5 w-3.5" />
                    Counter
                    {selectedCounters !== null && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{selectedCounters.size}</Badge>
                    )}
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 max-h-[300px] overflow-auto" align="start">
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
                    {assignedPos.map((pos: any) => {
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
                          {pos.storeName ?? pos.name}
                        </label>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardContent>
        </Card>
      )}

      {isRestricted && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          Showing only your submitted sales entries.
        </div>
      )}

      {/* Gross / Net toggle — only shown when the period has deductions to apply. */}
      {hasAnyDeduction && (
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="text-xs text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{salesView === "net" ? "Net" : "Gross"}</span> sales
            {salesView === "net" && (
              <> · {fmtCurrency(totalDeduction)} promo deductions
                {unallocatedDeduction > 0 && (
                  <span className="text-amber-600 dark:text-amber-400"> ({fmtCurrency(unallocatedDeduction)} unallocated)</span>
                )}
              </>
            )}
          </div>
          <div className="inline-flex rounded-md border bg-background p-0.5" role="group" data-testid="ba-sales-view-toggle">
            <button
              type="button"
              onClick={() => setSalesView("net")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${salesView === "net" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="ba-toggle-view-net"
            >
              Net
            </button>
            <button
              type="button"
              onClick={() => setSalesView("gross")}
              className={`px-2.5 py-1 text-xs font-medium rounded ${salesView === "gross" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="ba-toggle-view-gross"
            >
              Gross
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sales
              {hasAnyDeduction && (
                <Badge variant="outline" className="ml-1.5 text-[10px] font-normal">
                  {salesView === "net" ? "Net" : "Gross"}
                </Badge>
              )}
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(totalSales)}</div>
            {hasAnyDeduction && salesView === "net" && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                − {fmtCurrency(totalDeduction)} promo {totalDeduction === 1 ? "deduction" : "deductions"}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ATV</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders > 0 ? fmtCurrency(Math.round(totalSales / totalOrders)) : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">UPT</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrders > 0 ? (totalUnits / totalOrders).toFixed(1) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Attribution (BA only) */}
      {attribution && (attribution.othersSales > 0 || attribution.importedSales > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales Attribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[0] }} />
                  <span className="text-muted-foreground">My Sales</span>
                </div>
                <div className="font-semibold">{fmtCurrency(attribution.mySales)}</div>
                <div className="text-xs text-muted-foreground">{attribution.myOrders} orders</div>
              </div>
              {attribution.othersSales > 0 && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[1] }} />
                    <span className="text-muted-foreground">Part-Time</span>
                  </div>
                  <div className="font-semibold">{fmtCurrency(attribution.othersSales)}</div>
                  <div className="text-xs text-muted-foreground">{attribution.othersOrders} orders</div>
                </div>
              )}
              {attribution.importedSales > 0 && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                    <span className="text-muted-foreground">Imported</span>
                  </div>
                  <div className="font-semibold">{fmtCurrency(attribution.importedSales)}</div>
                  <div className="text-xs text-muted-foreground">{attribution.importedOrders} orders</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Sales Chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            {isRestricted
              ? "Daily Sales"
              : timeTab === "yearly" && selectedYears.size > 1
                ? "Sales Trend (Year Overlay)"
                : timeTab === "monthly" && monthlyMonth === "all"
                  ? "Monthly Sales"
                  : "Daily Sales"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            {isMultiYearOverlay ? (
              <LineChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name]} />
                <Legend />
                {Array.from(selectedYears).sort().map((yr, i) => (
                  <Line key={yr} type="monotone" dataKey={yr} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            ) : hasAttribution ? (
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number, name: string) => [fmtCurrency(v), name === "mine" ? "My Sales" : "Others"]} />
                <Legend formatter={(value) => value === "mine" ? "My Sales" : "Others"} />
                <Bar dataKey="mine" stackId="1" fill={CHART_COLORS[0]} radius={[0, 0, 0, 0]} />
                <Bar dataKey="others" stackId="1" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Monthly Sales Trend (BA monthly mode only) */}
      {!isRestricted && timeTab === "monthly" && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Sales Trend ({monthlyYear})</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Sales by Brand Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Brand</CardTitle>
        </CardHeader>
        <CardContent>
          {brandTableData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No sales data for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Brand</th>
                    <th className="pb-2 font-medium text-right">Sales</th>
                    <th className="pb-2 font-medium text-right">Units</th>
                    <th className="pb-2 font-medium text-right">ATV</th>
                    <th className="pb-2 font-medium text-right">UPT</th>
                  </tr>
                </thead>
                <tbody>
                  {brandTableData.map((row) => (
                    <tr key={row.name} className="border-b last:border-0">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-right">{fmtCurrency(row.sales)}</td>
                      <td className="py-2 text-right">{row.units.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.orders > 0 ? fmtCurrency(Math.round(row.sales / row.orders)) : "—"}</td>
                      <td className="py-2 text-right">{fmtRatio(row.units, row.orders)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right">{fmtCurrency(totalSales)}</td>
                    <td className="py-2 text-right">{totalUnits.toLocaleString()}</td>
                    <td className="py-2 text-right">{totalOrders > 0 ? fmtCurrency(Math.round(totalSales / totalOrders)) : "—"}</td>
                    <td className="py-2 text-right">{totalOrders > 0 ? (totalUnits / totalOrders).toFixed(1) : "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promotion Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Promotion Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {promoTableData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active promotions for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Promotion</th>
                    <th className="pb-2 font-medium">Brand</th>
                    <th className="pb-2 font-medium">Type</th>
                    <th className="pb-2 font-medium">Period</th>
                    <th className="pb-2 font-medium text-right">GWP Given</th>
                  </tr>
                </thead>
                <tbody>
                  {promoTableData.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2">{row.brand}</td>
                      <td className="py-2">{row.type}</td>
                      <td className="py-2 whitespace-nowrap">
                        {row.startDate} – {row.endDate}
                      </td>
                      <td className="py-2 text-right">
                        {row.trackable ? row.gwpGiven : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Promotion Deductions — per-day or per-brand view of HK$ taken off counter sales via coupons */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-3">
              <CardTitle>Promotion Deductions (Coupon Redemptions)</CardTitle>
              {totalDeductionAmount > 0 && (
                <Badge variant="outline" className="text-xs font-normal">
                  Total: −{fmtCurrency(totalDeductionAmount)}
                </Badge>
              )}
            </div>
            {totalDeductionAmount > 0 && (
              <div className="inline-flex rounded-md border bg-background p-0.5" role="group" data-testid="deduction-view-toggle">
                <button
                  type="button"
                  onClick={() => setDeductionView("daily")}
                  className={`px-2.5 py-1 text-xs font-medium rounded ${deductionView === "daily" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid="deduction-toggle-daily"
                >
                  By day
                </button>
                <button
                  type="button"
                  onClick={() => setDeductionView("brand")}
                  className={`px-2.5 py-1 text-xs font-medium rounded ${deductionView === "brand" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid="deduction-toggle-brand"
                >
                  By brand
                </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {myDeductions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No coupon redemptions recorded in this period.</p>
          ) : deductionView === "brand" ? (
            /* ── By-brand allocation view ── */
            deductionByBrand.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Deductions exist but couldn't be allocated to any brand (counter had no sales on deduction days).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="deduction-by-brand-table">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-3 py-2 font-medium">Brand</th>
                      <th className="px-3 py-2 font-medium text-right">Gross Sales</th>
                      <th className="px-3 py-2 font-medium text-right">Deduction</th>
                      <th className="px-3 py-2 font-medium text-right">Net Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductionByBrand.map((b) => (
                      <tr key={b.brandId} className="border-b last:border-0">
                        <td className="px-3 py-1.5">{b.brandName}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtCurrency(b.gross)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 dark:text-blue-300">−{fmtCurrency(b.deduction)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmtCurrency(b.net)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 font-semibold">
                      <td className="px-3 py-2">Total</td>
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
                <p className="text-[11px] text-muted-foreground mt-2">
                  Deductions are spread proportionally across brands that sold on each deduction day (brand share × daily deduction).
                </p>
              </div>
            )
          ) : (
            /* ── Original by-day view ── */
            <div className="space-y-4">
              {myDeductions.map((p) => (
                <div key={p.promotionId} className="border rounded-md">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-sm font-medium">{p.promoName}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.totalCount} coupon{p.totalCount !== 1 ? "s" : ""} redeemed ·{" "}
                      <span className="font-semibold text-blue-700 dark:text-blue-300">−{fmtCurrency(p.total)}</span> deducted
                    </div>
                  </div>
                  <div className="overflow-x-auto">
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
                          <tr key={`${r.date}-${r.posName}-${i}`} className="border-b last:border-0">
                            <td className="px-3 py-1.5 whitespace-nowrap">{(() => { const [y,m,d] = r.date.split("-"); return `${d}/${m}/${y}`; })()}</td>
                            <td className="px-3 py-1.5">{r.posName}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{r.count}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-blue-700 dark:text-blue-300">−{fmtCurrency(r.amount)}</td>
                          </tr>
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
