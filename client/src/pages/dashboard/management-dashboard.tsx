import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesEntry, PosLocation, Brand, PromotionDeduction } from "@shared/schema";
import { allocateDeductions, type SalesViewMode } from "@shared/deductionAllocation";
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DollarSign, ShoppingCart, TrendingUp, TrendingDown, Package,
  Filter, ChevronDown, Download, CalendarDays, SlidersHorizontal,
  Table as TableIcon, LayoutGrid, AlertCircle, RefreshCw, Sparkles,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { CHART_COLORS } from "../dashboard";
import { downloadExcel, dateRangeFilename, fmtCurrencyExport, fmtRatio } from "@/lib/exportExcel";

// ─── Helpers ────────────────────────────────────────

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Days ago helper for quick range pills (e.g. 7D, 14D, 30D)
function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Yesterday in local time. Used as the default range end for the
// Management dashboard — BAs typically record sales after close, so
// today's row is empty during the day and skews the picture.
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Subtract one day from a YYYY-MM-DD string in local time. Used to derive
// 'previous day' boundaries without tripping on toISOString() UTC offsets.
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m - 1), d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Shift a YYYY-MM-DD by N months, clamping the day to the new month's
// length so 31 May → 30 Apr (rather than 1 May).
function shiftMonth(dateStr: string, monthsDelta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1 + monthsDelta, 1);
  const ty = target.getFullYear();
  const tm = target.getMonth() + 1;
  const lastDay = new Date(ty, tm, 0).getDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

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

function monthRange(startYM: string, endYM: string): string[] {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  const all: string[] = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    all.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return all;
}

function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Channel color codes shared with the Promotion preview UI. Keeps each
// retailer's brand identity consistent across the app.
const CHANNEL_COLORS: Record<string, string> = {
  LOGON: "text-emerald-600 dark:text-emerald-400",
  AEON: "text-red-600 dark:text-red-400",
  SOGO: "text-blue-600 dark:text-blue-400",
  FACESSS: "text-pink-600 dark:text-pink-400",
};
function channelColorClass(channel?: string | null): string {
  if (!channel) return "text-foreground";
  return CHANNEL_COLORS[channel.toUpperCase()] ?? "text-foreground";
}

// ─── Component ──────────────────────────────────────

export default function ManagementDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Time tab state ────────────────────────────
  const [timeTab, setTimeTab] = useState<"daterange" | "monthly" | "yearly">("daterange");

  // Date Range tab
  // Defaults: 1st of the current month → yesterday. Today is excluded
  // because BAs record sales after close, so 'today' typically reads as
  // 0 and would visually drag every comparison down.
  const [drStart, setDrStart] = useState(monthStartStr);
  const [drEnd, setDrEnd] = useState(yesterdayStr);
  const [quickPreset, setQuickPreset] = useState<"7d" | "14d" | "30d" | "mtd" | "custom">("mtd");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [counterViewMode, setCounterViewMode] = useState<"table" | "cards">("table");
  const [brandViewMode, setBrandViewMode] = useState<"table" | "cards">("table");

  function handleSelectPreset(preset: "7d" | "14d" | "30d" | "mtd") {
    setTimeTab("daterange");
    setQuickPreset(preset);
    const end = yesterdayStr();
    let start = monthStartStr();
    if (preset === "7d") start = daysAgoStr(7);
    else if (preset === "14d") start = daysAgoStr(14);
    else if (preset === "30d") start = daysAgoStr(30);
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

  // Monthly tab
  const [monthlyYear, setMonthlyYear] = useState(String(currentYear));
  const [monthlyMonth, setMonthlyMonth] = useState("all");

  // Yearly tab — set of selected year strings
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set([String(currentYear)]));

  // ── Filter state ──────────────────────────────
  const [selectedChannels, setSelectedChannels] = useState<Set<string> | null>(null);
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null);

  // Gross / Net toggle — default "net" per business rule. Switching to
  // "gross" leaves the raw sales_entries untouched. Switching to "net"
  // applies proportional promo-deduction allocation to every aggregation.
  const [salesView, setSalesView] = useState<SalesViewMode>("net");

  // ── Compute query date range ──────────────────
  const { queryStart, queryEnd } = useMemo(() => {
    if (timeTab === "daterange") {
      return { queryStart: drStart, queryEnd: drEnd };
    }
    if (timeTab === "monthly") {
      const y = Number(monthlyYear);
      return { queryStart: `${y - 1}-01-01`, queryEnd: `${y}-12-31` };
    }
    // yearly — fetch min to max selected year
    const years = Array.from(selectedYears).map(Number).sort();
    const minY = years.length > 0 ? years[0] : currentYear;
    const maxY = years.length > 0 ? years[years.length - 1] : currentYear;
    return { queryStart: `${minY}-01-01`, queryEnd: `${maxY}-12-31` };
  }, [timeTab, drStart, drEnd, monthlyYear, selectedYears, currentYear]);

  // ── Queries ───────────────────────────────────
  const {
    data: sales = [],
    isLoading: isLoadingSales,
    isError: isErrorSales,
    refetch: refetchSales,
  } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  // Promotion deductions over the same date window as sales. Used by the
  // allocation engine to produce net figures for every downstream report.
  const { data: deductions = [], isLoading: isLoadingDeductions } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const { data: posLocations = [], isLoading: isLoadingPos } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
  });

  const { data: brands = [], isLoading: isLoadingBrands } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const isDataLoading = isLoadingSales || isLoadingDeductions || isLoadingPos || isLoadingBrands;

  // ── Derive available years from sales data ────
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    sales.forEach((s) => set.add(s.date.slice(0, 4)));
    set.add(String(currentYear));
    return Array.from(set).sort();
  }, [sales, currentYear]);

  // ── Year options for monthly dropdown ─────────
  const yearOptions = useMemo(() => {
    const opts: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) opts.push(String(y));
    return opts;
  }, [currentYear]);

  // ── Channels & POS ────────────────────────────
  const channels = useMemo(() => {
    const set = new Set<string>();
    posLocations.forEach((p) => set.add(p.salesChannel));
    return Array.from(set).sort();
  }, [posLocations]);

  const activeChannels = useMemo(() => {
    if (selectedChannels === null) return new Set(channels);
    return selectedChannels;
  }, [selectedChannels, channels]);

  const filteredPos = useMemo(
    () => posLocations.filter((p) => activeChannels.has(p.salesChannel)),
    [posLocations, activeChannels],
  );

  const activeCounterIds = useMemo(() => {
    if (selectedCounters === null) return new Set(filteredPos.map((p) => p.id));
    const posSet = new Set(filteredPos.map((p) => p.id));
    return new Set(Array.from(selectedCounters).filter((id) => posSet.has(id)));
  }, [selectedCounters, filteredPos]);

  // ── Filtered sales (by POS filter + time tab scope) ──
  const filteredSales = useMemo(() => {
    let base = sales.filter((s) => activeCounterIds.has(s.counterId));
    if (timeTab === "monthly" && monthlyMonth !== "all") {
      const prefix = `${monthlyYear}-${monthlyMonth}`;
      base = base.filter((s) => s.date.startsWith(prefix));
    }
    if (timeTab === "yearly") {
      base = base.filter((s) => selectedYears.has(s.date.slice(0, 4)));
    }
    return base;
  }, [sales, activeCounterIds, timeTab, monthlyYear, monthlyMonth, selectedYears]);

  // ── Filtered deductions (same POS + time window as filteredSales) ─────
  const filteredDeductions = useMemo(() => {
    return deductions.filter((d) => {
      if (!activeCounterIds.has(d.counterId)) return false;
      if (timeTab === "monthly" && monthlyMonth !== "all") {
        const prefix = `${monthlyYear}-${monthlyMonth}`;
        if (!d.date.startsWith(prefix)) return false;
      }
      if (timeTab === "yearly") {
        if (!selectedYears.has(d.date.slice(0, 4))) return false;
      }
      return true;
    });
  }, [deductions, activeCounterIds, timeTab, monthlyYear, monthlyMonth, selectedYears]);

  // ── Allocation + effective (view-aware) sales ──────────────────
  // Allocation spreads each counter-day's total deduction proportionally
  // across the brands that actually sold there that day. Result is stable:
  // raw sales_entries untouched, so toggling view or amending deductions
  // recomputes cleanly.
  const allocation = useMemo(
    () => allocateDeductions(filteredSales, filteredDeductions),
    [filteredSales, filteredDeductions],
  );

  // Effective sales — when the toggle is "net" we swap each row's amount
  // for its post-deduction net. Every downstream aggregator below reads
  // e.amount, so nothing else has to change to honor the toggle.
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

  // ── Lookups ───────────────────────────────────
  const posChannelMap = useMemo(() => {
    const m = new Map<string, string>();
    posLocations.forEach((p) => m.set(p.id, p.salesChannel));
    return m;
  }, [posLocations]);

  const posNameMap = useMemo(() => {
    const m = new Map<string, string>();
    posLocations.forEach((p) => m.set(p.id, p.storeName));
    return m;
  }, [posLocations]);

  // Channel + store code per POS, used to render the Sales by Counter
  // table as 'CHANNEL (CODE) StoreName' with a channel-specific color.
  const posMetaMap = useMemo(() => {
    const m = new Map<string, { channel: string; storeCode: string; storeName: string }>();
    posLocations.forEach((p) => m.set(p.id, {
      channel: p.salesChannel,
      storeCode: p.storeCode,
      storeName: p.storeName,
    }));
    return m;
  }, [posLocations]);

  const brandMap = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [brands]);

  // ── KPIs ──────────────────────────────────────
  const totalSales = useMemo(() => effectiveSales.reduce((s, e) => s + e.amount, 0), [effectiveSales]);
  const totalOrders = useMemo(() => effectiveSales.reduce((s, e) => s + (e.orders ?? 0), 0), [effectiveSales]);
  const totalUnits = useMemo(() => effectiveSales.reduce((s, e) => s + e.units, 0), [effectiveSales]);
  const atv = totalOrders > 0 ? totalSales / totalOrders : null;
  const upt = totalOrders > 0 ? totalUnits / totalOrders : null;

  // ── Previous Period (PP) date range ───────────
  // PP = same number of days, immediately before the selected start date.
  // Only calculated for the daterange tab.
  const { ppStart, ppEnd, ppLabel } = useMemo(() => {
    if (timeTab !== "daterange") return { ppStart: "", ppEnd: "", ppLabel: "" };
    const s = new Date(drStart + "T00:00:00");
    const e = new Date(drEnd + "T00:00:00");
    const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const ppE = new Date(s); ppE.setDate(ppE.getDate() - 1);
    const ppS = new Date(ppE); ppS.setDate(ppS.getDate() - (days - 1));
    const fmt = (d: Date) => `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`;
    return {
      ppStart: `${ppS.getFullYear()}-${String(ppS.getMonth() + 1).padStart(2, "0")}-${String(ppS.getDate()).padStart(2, "0")}`,
      ppEnd: `${ppE.getFullYear()}-${String(ppE.getMonth() + 1).padStart(2, "0")}-${String(ppE.getDate()).padStart(2, "0")}`,
      ppLabel: `${fmt(ppS)} – ${fmt(ppE)}`,
    };
  }, [timeTab, drStart, drEnd]);

  // ── Same Period Last Month (SPLM) date range ─────
  // Same calendar slot one month earlier, e.g. 1–3 May vs 1–3 Apr.
  // Day numbers are clamped to the prior month's length via shiftMonth().
  const { splmStart, splmEnd, splmLabel } = useMemo(() => {
    if (timeTab !== "daterange") return { splmStart: "", splmEnd: "", splmLabel: "" };
    const splmS = shiftMonth(drStart, -1);
    const splmE = shiftMonth(drEnd, -1);
    const fmt = (s: string) => {
      const [y, m, d] = s.split("-").map(Number);
      return `${d} ${MONTH_LABELS[m - 1]}`;
    };
    return { splmStart: splmS, splmEnd: splmE, splmLabel: `${fmt(splmS)} – ${fmt(splmE)}` };
  }, [timeTab, drStart, drEnd]);

  // ── Last month date range (for projection comparison) ──
  const { lmStart, lmEnd, lmLabel } = useMemo(() => {
    if (timeTab !== "daterange") return { lmStart: "", lmEnd: "", lmLabel: "" };
    const s = new Date(drStart + "T00:00:00");
    const y = s.getFullYear();
    const m = s.getMonth(); // 0-indexed
    // Step one month back
    const lmDate = new Date(y, m - 1, 1);
    const ly = lmDate.getFullYear();
    const lm = lmDate.getMonth() + 1; // 1-indexed
    const lmDays = daysInMonth(ly, lm);
    return {
      lmStart: `${ly}-${String(lm).padStart(2, "0")}-01`,
      lmEnd: `${ly}-${String(lm).padStart(2, "0")}-${String(lmDays).padStart(2, "0")}`,
      lmLabel: `${MONTH_LABELS[lm - 1]} ${ly}`,
    };
  }, [timeTab, drStart]);

  // PP sales query — only for daterange tab (placed after PP/LM date calcs to avoid TDZ)
  const { data: ppSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${ppStart}&endDate=${ppEnd}`],
    enabled: timeTab === "daterange" && !!ppStart,
    staleTime: 30_000,
  });
  // Deductions for the PP window so Net comparisons are apples-to-apples
  // with the current period. Enabled only when the date range is daterange.
  const { data: ppDeductionsRaw = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${ppStart}&endDate=${ppEnd}`],
    enabled: timeTab === "daterange" && !!ppStart,
    staleTime: 30_000,
  });

  // Last month sales query — for projection vs last month comparison
  const { data: lmSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${lmStart}&endDate=${lmEnd}`],
    enabled: timeTab === "daterange" && !!lmStart,
    staleTime: 30_000,
  });
  const { data: lmDeductionsRaw = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${lmStart}&endDate=${lmEnd}`],
    enabled: timeTab === "daterange" && !!lmStart,
    staleTime: 30_000,
  });

  // SPLM — Same period one month earlier. Used by the second Sales by
  // Counter table to compare against the equivalent slice of last month.
  const { data: splmSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${splmStart}&endDate=${splmEnd}`],
    enabled: timeTab === "daterange" && !!splmStart,
    staleTime: 30_000,
  });
  const { data: splmDeductionsRaw = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", `?startDate=${splmStart}&endDate=${splmEnd}`],
    enabled: timeTab === "daterange" && !!splmStart,
    staleTime: 30_000,
  });

  // ── Active POS info for trend chart logic ─────
  const activePosList = useMemo(
    () => filteredPos.filter((p) => activeCounterIds.has(p.id)),
    [filteredPos, activeCounterIds],
  );
  const showIndividualLines = activePosList.length > 1 && activePosList.length <= 5;

  // ── Trend chart data ──────────────────────────
  const trendChartMode = useMemo((): "daily" | "monthly-bar" | "monthly-lines" => {
    if (timeTab === "daterange") return "daily";
    if (timeTab === "monthly") {
      if (monthlyMonth !== "all") return "daily";
      return "monthly-bar";
    }
    if (selectedYears.size > 1) return "monthly-lines";
    return "monthly-bar";
  }, [timeTab, monthlyMonth, selectedYears]);

  const trendData = useMemo(() => {
    // ── Daily line chart ──
    if (trendChartMode === "daily") {
      let start: string, end: string;
      if (timeTab === "daterange") {
        start = drStart;
        end = drEnd;
      } else {
        const y = Number(monthlyYear);
        const m = Number(monthlyMonth);
        start = `${monthlyYear}-${monthlyMonth}-01`;
        end = `${monthlyYear}-${monthlyMonth}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
      }
      const allDates = dateRange(start, end);

      if (showIndividualLines) {
        const map: Record<string, Record<string, number>> = {};
        allDates.forEach((d) => {
          map[d] = {};
          activePosList.forEach((p) => { map[d][p.id] = 0; });
          map[d]["__combined__"] = 0;
        });
        effectiveSales.forEach((e) => {
          if (map[e.date]) {
            map[e.date][e.counterId] = (map[e.date][e.counterId] ?? 0) + e.amount;
            map[e.date]["__combined__"] += e.amount;
          }
        });
        return allDates.map((d) => {
          const row: Record<string, any> = { label: d.slice(5) };
          activePosList.forEach((p) => { row[p.storeName] = map[d][p.id]; });
          row["Combined"] = map[d]["__combined__"];
          return row;
        });
      }
      const map: Record<string, number> = {};
      allDates.forEach((d) => (map[d] = 0));
      effectiveSales.forEach((e) => {
        if (map[e.date] !== undefined) map[e.date] += e.amount;
      });
      return allDates.map((d) => ({ label: d.slice(5), Combined: map[d] }));
    }

    // ── Monthly bar chart (single period) ──
    if (trendChartMode === "monthly-bar") {
      let startYM: string, endYM: string;
      if (timeTab === "monthly") {
        startYM = `${monthlyYear}-01`;
        endYM = `${monthlyYear}-12`;
      } else {
        const yr = Array.from(selectedYears)[0] ?? String(currentYear);
        startYM = `${yr}-01`;
        endYM = `${yr}-12`;
      }
      const allMonths = monthRange(startYM, endYM);

      if (showIndividualLines) {
        const map: Record<string, Record<string, number>> = {};
        allMonths.forEach((ym) => {
          map[ym] = {};
          activePosList.forEach((p) => { map[ym][p.id] = 0; });
          map[ym]["__combined__"] = 0;
        });
        effectiveSales.forEach((e) => {
          const ym = e.date.slice(0, 7);
          if (map[ym]) {
            map[ym][e.counterId] = (map[ym][e.counterId] ?? 0) + e.amount;
            map[ym]["__combined__"] += e.amount;
          }
        });
        return allMonths.map((ym) => {
          const mi = Number(ym.slice(5, 7)) - 1;
          const row: Record<string, any> = { label: MONTH_LABELS[mi] };
          activePosList.forEach((p) => { row[p.storeName] = map[ym][p.id]; });
          row["Combined"] = map[ym]["__combined__"];
          return row;
        });
      }

      const map: Record<string, number> = {};
      allMonths.forEach((ym) => (map[ym] = 0));
      effectiveSales.forEach((e) => {
        const ym = e.date.slice(0, 7);
        if (map[ym] !== undefined) map[ym] += e.amount;
      });
      return allMonths.map((ym) => {
        const mi = Number(ym.slice(5, 7)) - 1;
        return { label: MONTH_LABELS[mi], Combined: map[ym] };
      });
    }

    // ── Monthly-lines: multi-year overlay (x = month, one line per year) ──
    const yearsArr = Array.from(selectedYears).sort();
    const map: Record<string, Record<string, number>> = {};
    MONTH_LABELS.forEach((ml) => {
      map[ml] = {};
      yearsArr.forEach((y) => { map[ml][y] = 0; });
    });
    effectiveSales.forEach((e) => {
      const yr = e.date.slice(0, 4);
      const mi = Number(e.date.slice(5, 7)) - 1;
      if (selectedYears.has(yr)) {
        map[MONTH_LABELS[mi]][yr] += e.amount;
      }
    });
    return MONTH_LABELS.map((ml) => {
      const row: Record<string, any> = { label: ml };
      yearsArr.forEach((y) => { row[y] = map[ml][y]; });
      return row;
    });
  }, [
    trendChartMode, timeTab, drStart, drEnd, monthlyYear, monthlyMonth,
    selectedYears, effectiveSales, showIndividualLines, activePosList, currentYear,
  ]);

  // Keys for multi-line charts
  const trendLineKeys = useMemo(() => {
    if (trendChartMode === "monthly-lines") {
      return Array.from(selectedYears).sort();
    }
    if (showIndividualLines) {
      return [...activePosList.map((p) => p.storeName), "Combined"];
    }
    return ["Combined"];
  }, [trendChartMode, selectedYears, showIndividualLines, activePosList]);

  // ── Channel pie data ──────────────────────────
  const channelPieData = useMemo(() => {
    const map: Record<string, number> = {};
    effectiveSales.forEach((e) => {
      const ch = posChannelMap.get(e.counterId) ?? "Unknown";
      map[ch] = (map[ch] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [effectiveSales, posChannelMap]);

  // ── PP & last-month filtered sales (same POS filter + view-mode swap) ──
  // Apply the same allocation + view-mode swap to PP / LM so comparisons
  // are apples-to-apples with the current-period figures.
  const ppRawSales = useMemo(
    () => ppSalesRaw.filter((s) => activeCounterIds.has(s.counterId)),
    [ppSalesRaw, activeCounterIds],
  );
  const ppFilteredSales = useMemo(() => {
    if (salesView === "gross") return ppRawSales;
    const ded = ppDeductionsRaw.filter((d) => activeCounterIds.has(d.counterId));
    const alloc = allocateDeductions(ppRawSales, ded);
    return alloc.entries.map((e) => ({ ...(e as unknown as SalesEntry), amount: e.netAmount }));
  }, [salesView, ppRawSales, ppDeductionsRaw, activeCounterIds]);

  const lmRawSales = useMemo(
    () => lmSalesRaw.filter((s) => activeCounterIds.has(s.counterId)),
    [lmSalesRaw, activeCounterIds],
  );
  const lmFilteredSales = useMemo(() => {
    if (salesView === "gross") return lmRawSales;
    const ded = lmDeductionsRaw.filter((d) => activeCounterIds.has(d.counterId));
    const alloc = allocateDeductions(lmRawSales, ded);
    return alloc.entries.map((e) => ({ ...(e as unknown as SalesEntry), amount: e.netAmount }));
  }, [salesView, lmRawSales, lmDeductionsRaw, activeCounterIds]);

  // Same-Period-Last-Month filtered sales — matches selected channels +
  // brands and respects gross/net toggle.
  const splmRawSales = useMemo(
    () => splmSalesRaw.filter((s) => activeCounterIds.has(s.counterId)),
    [splmSalesRaw, activeCounterIds],
  );
  const splmFilteredSales = useMemo(() => {
    if (salesView === "gross") return splmRawSales;
    const ded = splmDeductionsRaw.filter((d) => activeCounterIds.has(d.counterId));
    const alloc = allocateDeductions(splmRawSales, ded);
    return alloc.entries.map((e) => ({ ...(e as unknown as SalesEntry), amount: e.netAmount }));
  }, [salesView, splmRawSales, splmDeductionsRaw, activeCounterIds]);

  // SPLM counter → sales lookup, mirrors ppCounterSalesMap.
  const splmCounterSalesMap = useMemo(() => {
    const m: Record<string, number> = {};
    splmFilteredSales.forEach((e) => { m[e.counterId] = (m[e.counterId] ?? 0) + e.amount; });
    return m;
  }, [splmFilteredSales]);

  // PP & last-month totals
  const ppTotalSales = useMemo(() => ppFilteredSales.reduce((s, e) => s + e.amount, 0), [ppFilteredSales]);
  const lmTotalSales = useMemo(() => lmFilteredSales.reduce((s, e) => s + e.amount, 0), [lmFilteredSales]);

  // PP counter/brand lookup maps (id → sales)
  const ppCounterSalesMap = useMemo(() => {
    const m: Record<string, number> = {};
    ppFilteredSales.forEach((e) => { m[e.counterId] = (m[e.counterId] ?? 0) + e.amount; });
    return m;
  }, [ppFilteredSales]);
  const ppBrandSalesMap = useMemo(() => {
    const m: Record<string, number> = {};
    ppFilteredSales.forEach((e) => { m[e.brandId] = (m[e.brandId] ?? 0) + e.amount; });
    return m;
  }, [ppFilteredSales]);

  const ppTotalOrders = useMemo(
    () => ppFilteredSales.reduce((s, e) => s + (e.orders ?? 0), 0),
    [ppFilteredSales],
  );
  const ppTotalUnits = useMemo(
    () => ppFilteredSales.reduce((s, e) => s + e.units, 0),
    [ppFilteredSales],
  );
  const ppAtv = ppTotalOrders > 0 ? ppTotalSales / ppTotalOrders : null;
  const ppUpt = ppTotalOrders > 0 ? ppTotalUnits / ppTotalOrders : null;

  const salesDelta = totalSales - ppTotalSales;
  const salesDeltaPct = ppTotalSales > 0 ? (salesDelta / ppTotalSales) * 100 : null;

  const ordersDelta = totalOrders - ppTotalOrders;
  const ordersDeltaPct = ppTotalOrders > 0 ? (ordersDelta / ppTotalOrders) * 100 : null;

  const atvDelta = atv !== null && ppAtv !== null ? atv - ppAtv : null;
  const atvDeltaPct = ppAtv !== null && atvDelta !== null && ppAtv > 0 ? (atvDelta / ppAtv) * 100 : null;

  const uptDelta = upt !== null && ppUpt !== null ? upt - ppUpt : null;
  const uptDeltaPct = ppUpt !== null && uptDelta !== null && ppUpt > 0 ? (uptDelta / ppUpt) * 100 : null;

  // ── Counter table data ────────────────────────
  const counterTableData = useMemo(() => {
    const map: Record<string, { sales: number; orders: number; units: number }> = {};
    effectiveSales.forEach((e) => {
      if (!map[e.counterId]) map[e.counterId] = { sales: 0, orders: 0, units: 0 };
      map[e.counterId].sales += e.amount;
      map[e.counterId].orders += e.orders ?? 0;
      map[e.counterId].units += e.units;
    });
    return Object.entries(map)
      .map(([id, d]) => {
        const meta = posMetaMap.get(id);
        return {
          id,
          name: posNameMap.get(id) ?? "Unknown",
          channel: meta?.channel ?? "",
          storeCode: meta?.storeCode ?? "",
          sales: d.sales,
          orders: d.orders,
          units: d.units,
          atv: d.orders > 0 ? d.sales / d.orders : null,
          upt: d.orders > 0 ? d.units / d.orders : null,
        };
      })
      .sort((a, b) => b.sales - a.sales);
  }, [effectiveSales, posNameMap, posMetaMap]);

  // ── Brand table data ──────────────────────────
  // Two aggregations per brand: view-aware 'sales' (respects Gross/Net toggle)
  // and raw gross+deduction (always available for the extra columns).
  // Group by RESOLVED brand display name rather than raw brandId. This
  // protects the table from stale/orphaned brand_id values in
  // sales_entries (e.g. when a brand was renamed or reseeded with a new
  // UUID after entries were already recorded). All unresolvable IDs
  // collapse into a single 'Unknown' bucket instead of producing one
  // ghost row per orphaned id.
  const brandTableData = useMemo(() => {
    const nameOf = (id: string | null | undefined) =>
      (id && brandMap.get(id)) || "Unknown";

    const map: Record<string, { sales: number; orders: number; units: number }> = {};
    effectiveSales.forEach((e) => {
      const key = nameOf(e.brandId);
      if (!map[key]) map[key] = { sales: 0, orders: 0, units: 0 };
      map[key].sales += e.amount;
      map[key].orders += e.orders ?? 0;
      map[key].units += e.units;
    });

    const dedMap: Record<string, { gross: number; deduction: number }> = {};
    for (const e of allocation.entries) {
      const key = nameOf((e as any).brandId);
      if (!dedMap[key]) dedMap[key] = { gross: 0, deduction: 0 };
      dedMap[key].gross += e.amount ?? 0;
      dedMap[key].deduction += e.deduction ?? 0;
    }

    return Object.entries(map)
      .map(([name, d]) => ({
        id: name,
        name,
        sales: d.sales,
        gross: dedMap[name]?.gross ?? d.sales,
        deduction: dedMap[name]?.deduction ?? 0,
        net: Math.max(0, (dedMap[name]?.gross ?? d.sales) - (dedMap[name]?.deduction ?? 0)),
        orders: d.orders,
        units: d.units,
        atv: d.orders > 0 ? d.sales / d.orders : null,
        upt: d.orders > 0 ? d.units / d.orders : null,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [effectiveSales, allocation, brandMap]);

  // ── Monthly projection (daterange tab only, same-month range) ──
  const projection = useMemo(() => {
    if (timeTab !== "daterange") return null;
    const s = new Date(drStart + "T00:00:00");
    const e = new Date(drEnd + "T00:00:00");
    // Only project when the range is within a single month
    if (s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth()) return null;
    const year = s.getFullYear();
    const month = s.getMonth() + 1; // 1-indexed
    const daysElapsed = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    const monthDays = daysInMonth(year, month);
    const dailyRate = daysElapsed > 0 ? totalSales / daysElapsed : 0;
    const projected = Math.round(dailyRate * monthDays);
    const vsLM = lmTotalSales > 0 ? projected - lmTotalSales : null;
    const vsLMPct = lmTotalSales > 0 ? ((projected - lmTotalSales) / lmTotalSales) * 100 : null;
    return { year, month, daysElapsed, monthDays, dailyRate, projected, vsLM, vsLMPct, lmTotalSales };
  }, [timeTab, drStart, drEnd, totalSales, lmTotalSales]);

  // ── Channel toggle helpers ────────────────────
  function toggleChannel(ch: string) {
    setSelectedChannels((prev) => {
      const current = prev ?? new Set(channels);
      const next = new Set(current);
      if (next.has(ch)) next.delete(ch); else next.add(ch);
      return next;
    });
    setSelectedCounters(null);
  }

  function toggleCounter(id: string) {
    setSelectedCounters((prev) => {
      const current = prev ?? new Set(filteredPos.map((p) => p.id));
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleYear(yr: string) {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(yr)) { if (next.size > 1) next.delete(yr); }
      else next.add(yr);
      return next;
    });
  }

  const channelCountLabel = selectedChannels === null
    ? `All (${channels.length})`
    : `${activeChannels.size} of ${channels.length}`;

  const counterCountLabel = selectedCounters === null
    ? `All (${filteredPos.length})`
    : `${activeCounterIds.size} of ${filteredPos.length}`;

  const posGroupedByChannel = useMemo(() => {
    const groups: Record<string, PosLocation[]> = {};
    filteredPos.forEach((p) => { (groups[p.salesChannel] ??= []).push(p); });
    return groups;
  }, [filteredPos]);

  const useBars = trendChartMode === "monthly-bar" && !showIndividualLines;

  // Brand category lookup
  const brandCategoryMap = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.id, b.category));
    return m;
  }, [brands]);

  // ── Export functions ──────────────────────────

  function exportDailySales() {
    const map: Record<string, { sales: number; units: number; orders: number }> = {};
    effectiveSales.forEach((e) => {
      if (!map[e.date]) map[e.date] = { sales: 0, units: 0, orders: 0 };
      map[e.date].sales += e.amount;
      map[e.date].units += e.units;
      map[e.date].orders += e.orders ?? 0;
    });
    const rows = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        Date: date,
        "Total Sales": fmtCurrencyExport(d.sales),
        "Total Units": d.units,
        "Total Orders": d.orders,
        ATV: fmtRatio(d.sales, d.orders),
        UPT: fmtRatio(d.units, d.orders),
      }));
    downloadExcel(
      dateRangeFilename("Management_Daily_Sales", queryStart, queryEnd),
      [{ name: "Daily Sales", data: rows }],
    );
  }

  function exportPosPerformance() {
    const map: Record<string, { sales: number; units: number; orders: number }> = {};
    effectiveSales.forEach((e) => {
      if (!map[e.counterId]) map[e.counterId] = { sales: 0, units: 0, orders: 0 };
      map[e.counterId].sales += e.amount;
      map[e.counterId].units += e.units;
      map[e.counterId].orders += e.orders ?? 0;
    });
    const rows = Object.entries(map)
      .sort(([, a], [, b]) => b.sales - a.sales)
      .map(([id, d]) => ({
        Counter: posNameMap.get(id) ?? "Unknown",
        Channel: posChannelMap.get(id) ?? "Unknown",
        "Total Sales": fmtCurrencyExport(d.sales),
        "Total Units": d.units,
        "Total Orders": d.orders,
        ATV: fmtRatio(d.sales, d.orders),
        UPT: fmtRatio(d.units, d.orders),
        "% of Total": totalSales > 0 ? Math.round((d.sales / totalSales) * 10000) / 100 : 0,
      }));
    downloadExcel(
      dateRangeFilename("Management_POS_Performance", queryStart, queryEnd),
      [{ name: "POS Performance", data: rows }],
    );
  }

  function exportChannelSummary() {
    const map: Record<string, { sales: number; units: number; orders: number; counters: Set<string> }> = {};
    effectiveSales.forEach((e) => {
      const ch = posChannelMap.get(e.counterId) ?? "Unknown";
      if (!map[ch]) map[ch] = { sales: 0, units: 0, orders: 0, counters: new Set() };
      map[ch].sales += e.amount;
      map[ch].units += e.units;
      map[ch].orders += e.orders ?? 0;
      map[ch].counters.add(e.counterId);
    });
    const rows = Object.entries(map)
      .sort(([, a], [, b]) => b.sales - a.sales)
      .map(([ch, d]) => ({
        Channel: ch,
        "Total Sales": fmtCurrencyExport(d.sales),
        "Total Units": d.units,
        "Total Orders": d.orders,
        ATV: fmtRatio(d.sales, d.orders),
        UPT: fmtRatio(d.units, d.orders),
        "# Counters": d.counters.size,
      }));
    downloadExcel(
      dateRangeFilename("Management_Channel_Summary", queryStart, queryEnd),
      [{ name: "Channel Summary", data: rows }],
    );
  }

  function exportMoMTrend() {
    // Aggregate by month from all fetched sales (filtered by POS)
    const allFiltered = sales.filter((s) => activeCounterIds.has(s.counterId));
    const map: Record<string, { sales: number; units: number; orders: number }> = {};
    allFiltered.forEach((e) => {
      const ym = e.date.slice(0, 7);
      if (!map[ym]) map[ym] = { sales: 0, units: 0, orders: 0 };
      map[ym].sales += e.amount;
      map[ym].units += e.units;
      map[ym].orders += e.orders ?? 0;
    });
    const sortedMonths = Object.keys(map).sort();
    const rows = sortedMonths.map((ym, i) => {
      const d = map[ym];
      const prev = i > 0 ? map[sortedMonths[i - 1]] : null;
      const sameMonthLY = map[`${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`] ?? null;
      const vsPrior = prev && prev.sales > 0
        ? Math.round(((d.sales - prev.sales) / prev.sales) * 10000) / 100
        : "—";
      const vsLY = sameMonthLY && sameMonthLY.sales > 0
        ? Math.round(((d.sales - sameMonthLY.sales) / sameMonthLY.sales) * 10000) / 100
        : "—";
      const date = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
      return {
        Month: date.toLocaleString("en-US", { month: "short", year: "numeric" }),
        Sales: fmtCurrencyExport(d.sales),
        Units: d.units,
        Orders: d.orders,
        ATV: fmtRatio(d.sales, d.orders),
        UPT: fmtRatio(d.units, d.orders),
        "vs Prior Month %": vsPrior,
        "vs Same Month LY %": vsLY,
      };
    });
    downloadExcel(
      dateRangeFilename("Management_MoM_Trend", queryStart, queryEnd),
      [{ name: "Month over Month", data: rows }],
    );
  }

  function exportRawData() {
    const rows = effectiveSales
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => ({
        Date: e.date,
        Channel: posChannelMap.get(e.counterId) ?? "Unknown",
        Counter: posNameMap.get(e.counterId) ?? "Unknown",
        Brand: brandMap.get(e.brandId) ?? "Unknown",
        Category: brandCategoryMap.get(e.brandId) ?? "Unknown",
        Sales: fmtCurrencyExport(e.amount),
        Units: e.units,
        Orders: e.orders ?? 0,
      }));
    downloadExcel(
      dateRangeFilename("Management_Raw_Data", queryStart, queryEnd),
      [{ name: "Raw Data", data: rows }],
    );
  }

  function exportCurrentView() {
    const summaryData = [{
      "Total Sales": fmtCurrencyExport(totalSales),
      "Total Orders": totalOrders,
      ATV: atv !== null ? fmtCurrencyExport(atv) : "—",
      UPT: upt !== null ? Math.round(upt * 10) / 10 : "—",
    }];

    const counterRows = counterTableData.map((r) => ({
      Counter: r.name,
      Sales: fmtCurrencyExport(r.sales),
      Units: r.units,
      ATV: r.atv !== null ? fmtCurrencyExport(r.atv) : "—",
      UPT: r.upt !== null ? Math.round(r.upt * 10) / 10 : "—",
    }));

    const brandRows = brandTableData.map((r) => ({
      Brand: r.name,
      Sales: fmtCurrencyExport(r.sales),
      Units: r.units,
      ATV: r.atv !== null ? fmtCurrencyExport(r.atv) : "—",
      UPT: r.upt !== null ? Math.round(r.upt * 10) / 10 : "—",
    }));

    const channelRows = channelPieData.map((r) => ({
      Channel: r.name,
      Sales: fmtCurrencyExport(r.value),
      "% of Total": totalSales > 0 ? Math.round((r.value / totalSales) * 10000) / 100 : 0,
    }));

    downloadExcel(
      dateRangeFilename("Management_Current_View", queryStart, queryEnd),
      [
        { name: "Summary", data: summaryData },
        { name: "By Counter", data: counterRows },
        { name: "By Brand", data: brandRows },
        { name: "By Channel", data: channelRows },
      ],
    );
  }

  // ── Render ────────────────────────────────────
  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-3.5 sm:space-y-5 max-w-7xl mx-auto">
      {/* Network / Fetch Error Retry Banner */}
      {isErrorSales && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Failed to load sales data. Check your network connection.</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchSales()} className="h-7 text-xs gap-1 shrink-0">
            <RefreshCw className="w-3 h-3" /> Retry
          </Button>
        </div>
      )}

      {/* Filter Bar */}
      <Card className="rounded-xl border border-border/80 shadow-2xs">
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Top Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Primary Time Mode Tabs */}
            <div className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="group">
              {([["daterange", "Date Range"], ["monthly", "Monthly"], ["yearly", "Yearly"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTimeTab(key)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                    timeTab === key
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Right: Mobile Filter Button & Export Dropdown */}
            <div className="flex items-center gap-1.5 ml-auto">
              {/* Mobile Filter Sheet Trigger */}
              <div className="sm:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMobileFilterOpen(true)}
                  className="h-8 px-2.5 text-xs gap-1.5 relative"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span>Filters</span>
                  {(selectedChannels !== null || selectedCounters !== null) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary absolute -top-0.5 -right-0.5" />
                  )}
                </Button>
              </div>

              {/* Desktop Filters (Channels & Counters Popovers) */}
              <div className="hidden sm:flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                      <Filter className="h-3 w-3" />
                      Channels: {channelCountLabel}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="start">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Sales Channels</span>
                        <div className="flex gap-2 text-xs">
                          <button className="text-primary underline" onClick={() => { setSelectedChannels(null); setSelectedCounters(null); }}>All</button>
                          <button className="text-primary underline" onClick={() => { setSelectedChannels(new Set()); setSelectedCounters(new Set()); }}>None</button>
                        </div>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto pr-1 space-y-2">
                        {channels.map((ch) => (
                          <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox checked={activeChannels.has(ch)} onCheckedChange={() => toggleChannel(ch)} />
                            {ch}
                          </label>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                      <Filter className="h-3 w-3" />
                      Counters: {counterCountLabel}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">POS Locations</span>
                        <div className="flex gap-2 text-xs">
                          <button className="text-primary underline" onClick={() => setSelectedCounters(null)}>All</button>
                          <button className="text-primary underline" onClick={() => setSelectedCounters(new Set())}>None</button>
                        </div>
                      </div>
                      <div className="max-h-[380px] overflow-y-auto pr-1 space-y-3">
                        {Object.entries(posGroupedByChannel).map(([channel, locations]) => (
                          <div key={channel}>
                            <div className="text-xs font-semibold text-muted-foreground mb-1">{channel}</div>
                            <div className="space-y-1.5 pl-1">
                              {locations.map((loc) => (
                                <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                  <Checkbox checked={activeCounterIds.has(loc.id)} onCheckedChange={() => toggleCounter(loc.id)} />
                                  {loc.storeName}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportDailySales}>Daily Sales Summary</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportPosPerformance}>POS Performance Ranking</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportChannelSummary}>Channel Summary</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportMoMTrend}>Month-over-Month Trend</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportRawData}>Raw Data Export</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportCurrentView}>Export Current View</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Time Controls Sub-row */}
          {timeTab === "daterange" && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-border/50">
              {/* Quick Range Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {(["7d", "14d", "30d", "mtd"] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={cn(
                      "px-2.5 py-1 text-xs rounded-md font-medium shrink-0 transition-colors border",
                      quickPreset === preset
                        ? "bg-primary text-primary-foreground border-primary font-semibold shadow-2xs"
                        : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
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
                      : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
                  )}
                >
                  Custom
                </button>
              </div>

              {/* Date Inputs */}
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
                    {MONTH_LABELS.map((ml, i) => (
                      <SelectItem key={i} value={String(i + 1).padStart(2, "0")}>{ml}</SelectItem>
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
                  <Checkbox checked={selectedYears.has(yr)} onCheckedChange={() => toggleYear(yr)} />
                  {yr}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mobile Filter Sheet */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 space-y-4">
          <SheetHeader className="text-left border-b pb-2">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-bold">Filter Dashboard</SheetTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedChannels(null); setSelectedCounters(null); }}
                className="h-7 text-xs text-primary"
              >
                Reset All
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Filter metrics by sales channels and POS counter locations
            </SheetDescription>
          </SheetHeader>

          {/* Channels Filter */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground">Sales Channels</span>
              <div className="flex gap-2 text-xs">
                <button className="text-primary underline" onClick={() => { setSelectedChannels(null); setSelectedCounters(null); }}>All</button>
                <button className="text-primary underline" onClick={() => { setSelectedChannels(new Set()); setSelectedCounters(new Set()); }}>None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {channels.map((ch) => (
                <label key={ch} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-xs cursor-pointer">
                  <Checkbox checked={activeChannels.has(ch)} onCheckedChange={() => toggleChannel(ch)} />
                  <span className="truncate">{ch}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Counters Filter */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-foreground">POS Locations</span>
              <div className="flex gap-2 text-xs">
                <button className="text-primary underline" onClick={() => setSelectedCounters(null)}>All</button>
                <button className="text-primary underline" onClick={() => setSelectedCounters(new Set())}>None</button>
              </div>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {Object.entries(posGroupedByChannel).map(([channel, locations]) => (
                <div key={channel} className="space-y-1">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase">{channel}</div>
                  <div className="space-y-1">
                    {locations.map((loc) => (
                      <label key={loc.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 text-xs cursor-pointer">
                        <Checkbox checked={activeCounterIds.has(loc.id)} onCheckedChange={() => toggleCounter(loc.id)} />
                        <span className="truncate">{loc.storeName}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button className="w-full h-9 text-xs" onClick={() => setMobileFilterOpen(false)}>
            Apply Filters
          </Button>
        </SheetContent>
      </Sheet>

      {/* Gross / Net toggle bar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="text-[11px] sm:text-xs text-muted-foreground truncate">
          Showing <span className="font-semibold text-foreground">{salesView === "net" ? "Net" : "Gross"}</span> sales
          {salesView === "net" && totalDeduction > 0 && (
            <span> · {fmtCurrency(totalDeduction)} promo deductions
              {unallocatedDeduction > 0 && (
                <span className="text-amber-600 dark:text-amber-400"> ({fmtCurrency(unallocatedDeduction)} unallocated)</span>
              )}
            </span>
          )}
        </div>
        <div className="inline-flex rounded-lg border bg-muted/60 p-0.5 shrink-0" role="group" data-testid="sales-view-toggle">
          <button
            type="button"
            onClick={() => setSalesView("net")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              salesView === "net" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="toggle-view-net"
          >
            Net
          </button>
          <button
            type="button"
            onClick={() => setSalesView("gross")}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
              salesView === "gross" ? "bg-primary text-primary-foreground font-semibold shadow-2xs" : "text-muted-foreground hover:text-foreground"
            )}
            data-testid="toggle-view-gross"
          >
            Gross
          </button>
        </div>
      </div>

      {/* KPI Cards — Responsive typography & compact mobile layout (Image 1 fix) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5">
        {/* Total Sales */}
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium flex items-center gap-1 text-foreground/80">
              Total Sales
              <Badge variant="outline" className="text-[9px] px-1 py-0 font-normal">
                {salesView === "net" ? "Net" : "Gross"}
              </Badge>
            </span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? (
              <Skeleton className="h-6 sm:h-7 w-24 sm:w-28 my-1" />
            ) : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">
                {fmtCurrency(totalSales)}
              </div>
            )}
            {salesView === "net" && totalDeduction > 0 && (
              <div className="text-[10px] text-muted-foreground truncate" data-testid="kpi-deduction-note">
                − {fmtCurrency(totalDeduction)} promo ded.
              </div>
            )}
            {timeTab === "daterange" && ppTotalSales > 0 && !isDataLoading && (
              <div className={cn(
                "text-[10px] sm:text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 truncate",
                salesDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                {salesDelta >= 0 ? "▲ +" : "▼ "}{Math.abs(salesDeltaPct ?? 0).toFixed(1)}%
                <span className="text-muted-foreground font-normal text-[9px] sm:text-[10px]">vs prev</span>
              </div>
            )}
          </div>
        </Card>

        {/* Total Orders */}
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium text-foreground/80">Total Orders</span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? (
              <Skeleton className="h-6 sm:h-7 w-16 sm:w-20 my-1" />
            ) : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">
                {totalOrders.toLocaleString()}
              </div>
            )}
            {timeTab === "daterange" && ppTotalOrders > 0 && !isDataLoading && (
              <div className={cn(
                "text-[10px] sm:text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 truncate",
                ordersDelta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                {ordersDelta >= 0 ? "▲ +" : "▼ "}{Math.abs(ordersDeltaPct ?? 0).toFixed(1)}%
                <span className="text-muted-foreground font-normal text-[9px] sm:text-[10px]">vs prev</span>
              </div>
            )}
          </div>
        </Card>

        {/* ATV */}
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium text-foreground/80">ATV</span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? (
              <Skeleton className="h-6 sm:h-7 w-20 sm:w-24 my-1" />
            ) : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">
                {atv !== null ? fmtCurrency(Math.round(atv)) : "—"}
              </div>
            )}
            {timeTab === "daterange" && atvDeltaPct !== null && !isDataLoading && (
              <div className={cn(
                "text-[10px] sm:text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 truncate",
                atvDelta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                {atvDelta! >= 0 ? "▲ +" : "▼ "}{Math.abs(atvDeltaPct).toFixed(1)}%
                <span className="text-muted-foreground font-normal text-[9px] sm:text-[10px]">vs prev</span>
              </div>
            )}
          </div>
        </Card>

        {/* UPT */}
        <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-muted-foreground pb-0.5">
            <span className="text-xs sm:text-sm font-medium text-foreground/80">UPT</span>
            <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
              <Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </div>
          </div>
          <div className="mt-1">
            {isDataLoading ? (
              <Skeleton className="h-6 sm:h-7 w-14 sm:w-16 my-1" />
            ) : (
              <div className="text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate">
                {upt !== null ? upt.toFixed(1) : "—"}
              </div>
            )}
            {timeTab === "daterange" && uptDeltaPct !== null && !isDataLoading && (
              <div className={cn(
                "text-[10px] sm:text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 truncate",
                uptDelta! >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
              )}>
                {uptDelta! >= 0 ? "▲ +" : "▼ "}{Math.abs(uptDeltaPct).toFixed(1)}%
                <span className="text-muted-foreground font-normal text-[9px] sm:text-[10px]">vs prev</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Sales Trend Chart — Proportional height & slim Y-axis margins (Image 2 fix) */}
      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xs sm:text-sm font-semibold">
              Sales Trend
            </CardTitle>
            <Badge variant="outline" className="text-[9px] sm:text-[10px] font-normal py-0">
              {timeTab === "daterange" ? (quickPreset !== "custom" ? quickPreset.toUpperCase() : "Daily") : timeTab === "monthly"
                ? (monthlyMonth === "all" ? "Monthly" : "Daily")
                : selectedYears.size > 1 ? "Year Comparison" : "Monthly"}
            </Badge>
          </div>
          {/* Quick preset pills inside chart header for rapid mobile switching */}
          {timeTab === "daterange" && (
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
                      : "text-muted-foreground hover:text-foreground"
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
            <div className="flex flex-col items-center justify-center h-[200px] sm:h-[260px] gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading trend data...</span>
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] sm:h-[260px] text-muted-foreground text-xs sm:text-sm">
              No data for selected filters
            </div>
          ) : useBars ? (
            <div className="h-[210px] sm:h-[260px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={38}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                  />
                  <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                  <Bar dataKey="Combined" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[210px] sm:h-[260px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    minTickGap={16}
                    interval={trendData.length > 35 ? Math.floor(trendData.length / 10) : "preserveStartEnd"}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    width={38}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v: number) => fmtCurrency(v)}
                  />
                  {trendLineKeys.length > 1 && <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />}
                  {trendLineKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={key === "Combined" ? 2.5 : 1.75}
                      strokeDasharray={key === "Combined" ? "6 3" : undefined}
                      dot={false}
                      activeDot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales by Channel (Donut pie) */}
      <Card className="rounded-xl border border-border/80 shadow-2xs">
        <CardHeader className="p-3 sm:p-4 pb-1">
          <CardTitle className="text-xs sm:text-sm font-semibold">Sales by Channel</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-0">
          {channelPieData.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] sm:h-[220px] text-muted-foreground text-xs sm:text-sm">
              No data
            </div>
          ) : (
            <div className="h-[200px] sm:h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={channelPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {channelPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Monthly Projection Card — Clean Progress Bar & Hierarchy (Image 3 fix) ── */}
      {projection && (() => {
        const pctOfMonth = Math.min(100, Math.max(0, Math.round((projection.daysElapsed / projection.monthDays) * 100)));
        return (
          <Card className="rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50/70 via-blue-50/30 to-background dark:from-blue-950/30 dark:via-blue-950/10 dark:to-background overflow-hidden shadow-2xs">
            <CardContent className="p-3.5 sm:p-5">
              {/* Header with Title and Month Progress */}
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

              {/* Progress bar */}
              <div className="w-full bg-blue-200/50 dark:bg-blue-900/40 h-1.5 rounded-full overflow-hidden mb-3">
                <div
                  className="bg-blue-600 dark:bg-blue-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${pctOfMonth}%` }}
                />
              </div>

              {/* Hero Projection Box */}
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
                        : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800"
                    )}>
                      <span>{projection.vsLM >= 0 ? "▲ +" : "▼ "}{Math.abs(projection.vsLMPct ?? 0).toFixed(1)}%</span>
                      <span className="font-normal opacity-85 text-[11px]">({fmtCurrency(Math.abs(projection.vsLM))} vs {lmLabel})</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3-column Supporting metrics */}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1 text-center sm:text-left">
                <div className="p-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">
                    {drStart.slice(8)}–{drEnd.slice(8)} {MONTH_LABELS[projection.month - 1]}
                  </p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">
                    {fmtCurrency(totalSales)}
                  </p>
                </div>
                <div className="p-1 border-x border-blue-200/50 dark:border-blue-900/40">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Daily Run Rate</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">
                    {fmtCurrency(Math.round(projection.dailyRate))}
                  </p>
                </div>
                <div className="p-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{lmLabel} Total</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">
                    {projection.lmTotalSales > 0 ? fmtCurrency(projection.lmTotalSales) : "—"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Sales by Counter — Card view option + Sticky table columns */}
      {(() => {
        const renderCounterTable = (
          title: string,
          priorSalesMap: Record<string, number>,
          priorLabel: string,
          comparisonHeader: string,
          showComparison: boolean,
        ) => (
          <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-xs sm:text-sm font-semibold">{title}</CardTitle>
                  {showComparison && priorLabel && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {comparisonHeader}: {priorLabel}
                    </p>
                  )}
                </div>
                {/* Mobile View Toggle (Cards vs Table) */}
                <div className="flex sm:hidden items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setCounterViewMode("cards")}
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      counterViewMode === "cards" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground"
                    )}
                    title="Card view"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCounterViewMode("table")}
                    className={cn(
                      "p-1 rounded-md transition-colors",
                      counterViewMode === "table" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground"
                    )}
                    title="Table view"
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-2 sm:p-4 pt-3">
              {counterTableData.length === 0 ? (
                <p className="text-muted-foreground text-xs sm:text-sm py-4 text-center">No data</p>
              ) : counterViewMode === "cards" ? (
                /* Mobile Card View */
                <div className="space-y-2 sm:hidden">
                  {counterTableData.map((row) => {
                    const priorSales = priorSalesMap[row.id] ?? 0;
                    const delta = row.sales - priorSales;
                    const deltaPct = priorSales > 0 ? (delta / priorSales) * 100 : null;
                    const isUp = delta >= 0;
                    const colorCls = channelColorClass(row.channel);
                    const prefix = row.channel
                      ? `${row.channel}${row.storeCode ? ` (${row.storeCode})` : ""}`
                      : "";
                    return (
                      <div key={row.id} className="p-2.5 rounded-lg border bg-card/60 space-y-1.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            {prefix && (
                              <span className={cn("text-[11px] font-semibold mr-1.5", colorCls)}>
                                {prefix}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-foreground">{row.name}</span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs sm:text-sm font-bold">{fmtCurrency(row.sales)}</div>
                            {showComparison && (
                              <div className={cn(
                                "text-[10px] font-semibold",
                                priorSales === 0 && row.sales > 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                              )}>
                                {priorSales === 0 && row.sales === 0 ? "—" : priorSales === 0 ? "New" : `${isUp ? "▲ +" : "▼ "}${Math.abs(deltaPct ?? 0).toFixed(1)}%`}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border/50 text-center text-xs">
                          <div className="bg-muted/40 p-1 rounded">
                            <span className="text-[10px] text-muted-foreground block">Units</span>
                            <span className="font-semibold text-foreground">{row.units.toLocaleString()}</span>
                          </div>
                          <div className="bg-muted/40 p-1 rounded">
                            <span className="text-[10px] text-muted-foreground block">ATV</span>
                            <span className="font-semibold text-foreground">{row.atv !== null ? fmtCurrency(Math.round(row.atv)) : "—"}</span>
                          </div>
                          <div className="bg-muted/40 p-1 rounded">
                            <span className="text-[10px] text-muted-foreground block">UPT</span>
                            <span className="font-semibold text-foreground">{row.upt !== null ? row.upt.toFixed(1) : "—"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {/* Totals card */}
                  {counterTableData.length > 1 && (() => {
                    const totSales = counterTableData.reduce((s, r) => s + r.sales, 0);
                    const totPrior = Object.values(priorSalesMap).reduce((s, v) => s + v, 0);
                    const totDelta = totSales - totPrior;
                    const totPct = totPrior > 0 ? (totDelta / totPrior) * 100 : null;
                    const isUp = totDelta >= 0;
                    return (
                      <div className="p-2.5 rounded-lg border-2 border-primary/20 bg-muted/40 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">Total</span>
                          <div className="text-right">
                            <div className="text-xs sm:text-sm font-bold">{fmtCurrency(totSales)}</div>
                            {showComparison && totPrior > 0 && (
                              <div className={cn("text-[10px] font-semibold", isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {isUp ? "▲ +" : "▼ "}{Math.abs(totPct ?? 0).toFixed(1)}%
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-muted-foreground flex justify-between pt-1 border-t border-border/50">
                          <span>Total Units: {counterTableData.reduce((s, r) => s + r.units, 0).toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                /* Standard Table View with Sticky First Column */
                <div className="overflow-x-auto -mx-2 sm:mx-0">
                  <table className="w-full text-xs sm:text-sm min-w-[500px]">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pl-2 sm:pl-0 font-medium text-left sticky left-0 z-10 bg-card pr-2">Counter</th>
                        <th className="pb-2 font-medium text-right w-[110px]">Sales</th>
                        {showComparison && (
                          <th className="pb-2 font-medium text-right whitespace-nowrap w-[120px]">{comparisonHeader}</th>
                        )}
                        <th className="pb-2 font-medium text-right w-[65px]">Units</th>
                        <th className="pb-2 font-medium text-right w-[85px]">ATV</th>
                        <th className="pb-2 pr-2 sm:pr-0 font-medium text-right w-[55px]">UPT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {counterTableData.map((row) => {
                        const priorSales = priorSalesMap[row.id] ?? 0;
                        const delta = row.sales - priorSales;
                        const deltaPct = priorSales > 0 ? (delta / priorSales) * 100 : null;
                        const isUp = delta >= 0;
                        const colorCls = channelColorClass(row.channel);
                        const prefix = row.channel
                          ? `${row.channel}${row.storeCode ? ` (${row.storeCode})` : ""}`
                          : "";
                        return (
                          <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-2 pl-2 sm:pl-0 text-left sticky left-0 z-10 bg-card pr-2">
                              {prefix && (
                                <span className={`font-semibold mr-1.5 ${colorCls}`}>{prefix}</span>
                              )}
                              <span className="text-foreground">{row.name}</span>
                            </td>
                            <td className="py-2 text-right font-medium w-[110px] tabular-nums">{fmtCurrency(row.sales)}</td>
                            {showComparison && (
                              <td className={`py-2 text-right text-xs w-[120px] tabular-nums ${priorSales === 0 && row.sales > 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {priorSales === 0 && row.sales === 0 ? "—" : priorSales === 0 ? (
                                  <span className="text-muted-foreground">New</span>
                                ) : (
                                  <>
                                    <div>{isUp ? "▲" : "▼"} {fmtCurrency(Math.abs(delta))}</div>
                                    <div className="text-[10px]">{deltaPct !== null ? `${isUp ? "+" : ""}${deltaPct.toFixed(1)}%` : "—"}</div>
                                  </>
                                )}
                              </td>
                            )}
                            <td className="py-2 text-right w-[65px] tabular-nums">{row.units.toLocaleString()}</td>
                            <td className="py-2 text-right w-[85px] tabular-nums">{row.atv !== null ? fmtCurrency(Math.round(row.atv)) : "—"}</td>
                            <td className="py-2 pr-2 sm:pr-0 text-right w-[55px] tabular-nums">{row.upt !== null ? row.upt.toFixed(1) : "—"}</td>
                          </tr>
                        );
                      })}
                      {counterTableData.length > 1 && (() => {
                        const totSales = counterTableData.reduce((s, r) => s + r.sales, 0);
                        const totPrior = Object.values(priorSalesMap).reduce((s, v) => s + v, 0);
                        const totDelta = totSales - totPrior;
                        const totPct = totPrior > 0 ? (totDelta / totPrior) * 100 : null;
                        const isUp = totDelta >= 0;
                        return (
                          <tr className="border-t-2 font-semibold bg-muted/40">
                            <td className="py-2 pl-2 sm:pl-0 text-left sticky left-0 z-10 bg-card pr-2">Total</td>
                            <td className="py-2 text-right w-[110px] tabular-nums">{fmtCurrency(totSales)}</td>
                            {showComparison && (
                              <td className={`py-2 text-right text-xs w-[120px] tabular-nums ${totPrior === 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                                {totPrior > 0 ? (
                                  <>
                                    <div>{isUp ? "▲" : "▼"} {fmtCurrency(Math.abs(totDelta))}</div>
                                    <div className="text-[10px]">{totPct !== null ? `${isUp ? "+" : ""}${totPct.toFixed(1)}%` : "—"}</div>
                                  </>
                                ) : "—"}
                              </td>
                            )}
                            <td className="py-2 text-right w-[65px] tabular-nums">{counterTableData.reduce((s, r) => s + r.units, 0).toLocaleString()}</td>
                            <td className="py-2 text-right w-[85px]">—</td>
                            <td className="py-2 pr-2 sm:pr-0 text-right w-[55px]">—</td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        );
        return (
          <>
            {renderCounterTable(
              "Sales by Counter (vs. Previous Period)",
              ppCounterSalesMap,
              ppLabel,
              "vs Prev Period",
              timeTab === "daterange",
            )}
            {timeTab === "daterange" && renderCounterTable(
              "Sales by Counter (vs. same period last month)",
              splmCounterSalesMap,
              splmLabel,
              "vs SPLM",
              true,
            )}
          </>
        );
      })()}

      {/* Sales by Brand (table / cards) */}
      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xs sm:text-sm font-semibold">Sales by Brand</CardTitle>
              {timeTab === "daterange" && ppLabel && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  vs PP: {ppLabel}
                </p>
              )}
            </div>
            {/* Mobile View Toggle (Cards vs Table) */}
            <div className="flex sm:hidden items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setBrandViewMode("cards")}
                className={cn(
                  "p-1 rounded-md transition-colors",
                  brandViewMode === "cards" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground"
                )}
                title="Card view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setBrandViewMode("table")}
                className={cn(
                  "p-1 rounded-md transition-colors",
                  brandViewMode === "table" ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground"
                )}
                title="Table view"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-3">
          {brandTableData.length === 0 ? (
            <p className="text-muted-foreground text-xs sm:text-sm py-4 text-center">No data</p>
          ) : brandViewMode === "cards" ? (
            /* Mobile Card View for Brands */
            <div className="space-y-2 sm:hidden">
              {brandTableData.map((row) => {
                const ppSales = ppBrandSalesMap[row.id] ?? 0;
                const delta = row.sales - ppSales;
                const deltaPct = ppSales > 0 ? (delta / ppSales) * 100 : null;
                const isUp = delta >= 0;
                return (
                  <div key={row.name} className="p-2.5 rounded-lg border bg-card/60 space-y-1.5 shadow-2xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs font-semibold text-foreground">{row.name}</div>
                      <div className="text-right shrink-0">
                        <div className="text-xs sm:text-sm font-bold">{fmtCurrency(row.sales)}</div>
                        {timeTab === "daterange" && (
                          <div className={cn(
                            "text-[10px] font-semibold",
                            ppSales === 0 && row.sales > 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                          )}>
                            {ppSales === 0 && row.sales === 0 ? "—" : ppSales === 0 ? "New" : `${isUp ? "▲ +" : "▼ "}${Math.abs(deltaPct ?? 0).toFixed(1)}%`}
                          </div>
                        )}
                      </div>
                    </div>
                    {totalDeduction > 0 && (
                      <div className="flex justify-between items-center text-[11px] bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded">
                        <span className="text-muted-foreground">Ded: {row.deduction > 0 ? `−${fmtCurrency(row.deduction)}` : "—"}</span>
                        <span className="font-semibold text-blue-700 dark:text-blue-300">Net: {fmtCurrency(row.net)}</span>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-border/50 text-center text-xs">
                      <div className="bg-muted/40 p-1 rounded">
                        <span className="text-[10px] text-muted-foreground block">Units</span>
                        <span className="font-semibold text-foreground">{row.units.toLocaleString()}</span>
                      </div>
                      <div className="bg-muted/40 p-1 rounded">
                        <span className="text-[10px] text-muted-foreground block">ATV</span>
                        <span className="font-semibold text-foreground">{row.atv !== null ? fmtCurrency(Math.round(row.atv)) : "—"}</span>
                      </div>
                      <div className="bg-muted/40 p-1 rounded">
                        <span className="text-[10px] text-muted-foreground block">UPT</span>
                        <span className="font-semibold text-foreground">{row.upt !== null ? row.upt.toFixed(1) : "—"}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Totals card */}
              {brandTableData.length > 1 && (() => {
                const totSales = brandTableData.reduce((s, r) => s + r.sales, 0);
                const totDeduction = brandTableData.reduce((s, r) => s + r.deduction, 0);
                const totNet = brandTableData.reduce((s, r) => s + r.net, 0);
                const totPP = Object.values(ppBrandSalesMap).reduce((s, v) => s + v, 0);
                const totDelta = totSales - totPP;
                const totPct = totPP > 0 ? (totDelta / totPP) * 100 : null;
                const isUp = totDelta >= 0;
                return (
                  <div className="p-2.5 rounded-lg border-2 border-primary/20 bg-muted/40 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Total</span>
                      <div className="text-right">
                        <div className="text-xs sm:text-sm font-bold">{fmtCurrency(totSales)}</div>
                        {timeTab === "daterange" && totPP > 0 && (
                          <div className={cn("text-[10px] font-semibold", isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                            {isUp ? "▲ +" : "▼ "}{Math.abs(totPct ?? 0).toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                    {totalDeduction > 0 && (
                      <div className="flex justify-between items-center text-[11px] bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded">
                        <span className="text-muted-foreground">Total Ded: −{fmtCurrency(totDeduction)}</span>
                        <span className="font-semibold text-blue-700 dark:text-blue-300">Total Net: {fmtCurrency(totNet)}</span>
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground flex justify-between pt-1 border-t border-border/50">
                      <span>Total Units: {brandTableData.reduce((s, r) => s + r.units, 0).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Standard Table View with Sticky First Column */
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <table className="w-full text-xs sm:text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pl-2 sm:pl-0 font-medium text-left sticky left-0 z-10 bg-card pr-2">Brand</th>
                    <th className="pb-2 font-medium text-right w-[110px]">Sales</th>
                    {totalDeduction > 0 && (
                      <>
                        <th className="pb-2 font-medium text-right w-[95px]" title="HK$ allocated from promo coupon redemptions">Deduction</th>
                        <th className="pb-2 font-medium text-right w-[110px]">Net</th>
                      </>
                    )}
                    {timeTab === "daterange" && <th className="pb-2 font-medium text-right whitespace-nowrap w-[120px]">vs Prev Period</th>}
                    <th className="pb-2 font-medium text-right w-[65px]">Units</th>
                    <th className="pb-2 font-medium text-right w-[85px]">ATV</th>
                    <th className="pb-2 pr-2 sm:pr-0 font-medium text-right w-[55px]">UPT</th>
                  </tr>
                </thead>
                <tbody>
                  {brandTableData.map((row) => {
                    const ppSales = ppBrandSalesMap[row.id] ?? 0;
                    const delta = row.sales - ppSales;
                    const deltaPct = ppSales > 0 ? (delta / ppSales) * 100 : null;
                    const isUp = delta >= 0;
                    return (
                      <tr key={row.name} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 pl-2 sm:pl-0 text-left sticky left-0 z-10 bg-card pr-2">{row.name}</td>
                        <td className="py-2 text-right font-medium w-[110px] tabular-nums">{fmtCurrency(row.sales)}</td>
                        {totalDeduction > 0 && (
                          <>
                            <td className="py-2 text-right tabular-nums text-blue-700 dark:text-blue-300 w-[95px]">
                              {row.deduction > 0 ? `−${fmtCurrency(row.deduction)}` : "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums font-semibold w-[110px]">
                              {fmtCurrency(row.net)}
                            </td>
                          </>
                        )}
                        {timeTab === "daterange" && (
                          <td className={`py-2 text-right text-xs w-[120px] tabular-nums ${ppSales === 0 && row.sales > 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {ppSales === 0 && row.sales === 0 ? "—" : ppSales === 0 ? (
                              <span className="text-muted-foreground">New</span>
                            ) : (
                              <>
                                <div>{isUp ? "▲" : "▼"} {fmtCurrency(Math.abs(delta))}</div>
                                <div className="text-[10px]">{deltaPct !== null ? `${isUp ? "+" : ""}${deltaPct.toFixed(1)}%` : "—"}</div>
                              </>
                            )}
                          </td>
                        )}
                        <td className="py-2 text-right w-[65px] tabular-nums">{row.units.toLocaleString()}</td>
                        <td className="py-2 text-right w-[85px] tabular-nums">{row.atv !== null ? fmtCurrency(Math.round(row.atv)) : "—"}</td>
                        <td className="py-2 pr-2 sm:pr-0 text-right w-[55px] tabular-nums">{row.upt !== null ? row.upt.toFixed(1) : "—"}</td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  {brandTableData.length > 1 && (() => {
                    const totSales = brandTableData.reduce((s, r) => s + r.sales, 0);
                    const totDeduction = brandTableData.reduce((s, r) => s + r.deduction, 0);
                    const totNet = brandTableData.reduce((s, r) => s + r.net, 0);
                    const totPP = Object.values(ppBrandSalesMap).reduce((s, v) => s + v, 0);
                    const totDelta = totSales - totPP;
                    const totPct = totPP > 0 ? (totDelta / totPP) * 100 : null;
                    const isUp = totDelta >= 0;
                    return (
                      <tr className="border-t-2 font-semibold bg-muted/40">
                        <td className="py-2 pl-2 sm:pl-0 text-left sticky left-0 z-10 bg-card pr-2">Total</td>
                        <td className="py-2 text-right w-[110px] tabular-nums">{fmtCurrency(totSales)}</td>
                        {totalDeduction > 0 && (
                          <>
                            <td className="py-2 text-right tabular-nums text-blue-700 dark:text-blue-300 w-[95px]">
                              {totDeduction > 0 ? `−${fmtCurrency(totDeduction)}` : "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums w-[110px]">{fmtCurrency(totNet)}</td>
                          </>
                        )}
                        {timeTab === "daterange" && (
                          <td className={`py-2 text-right text-xs w-[120px] tabular-nums ${totPP === 0 ? "text-muted-foreground" : isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                            {totPP > 0 ? (
                              <>
                                <div>{isUp ? "▲" : "▼"} {fmtCurrency(Math.abs(totDelta))}</div>
                                <div className="text-[10px]">{totPct !== null ? `${isUp ? "+" : ""}${totPct.toFixed(1)}%` : "—"}</div>
                              </>
                            ) : "—"}
                          </td>
                        )}
                        <td className="py-2 text-right w-[65px] tabular-nums">{brandTableData.reduce((s, r) => s + r.units, 0).toLocaleString()}</td>
                        <td className="py-2 text-right w-[85px]">—</td>
                        <td className="py-2 pr-2 sm:pr-0 text-right w-[55px]">—</td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
