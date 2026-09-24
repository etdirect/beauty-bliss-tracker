import { useState, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesEntry, PosLocation, Brand } from "@shared/schema";
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
  DollarSign, Tag, Package, TrendingUp, TrendingDown, CalendarClock,
  CalendarDays, Filter, ChevronDown, Download, SlidersHorizontal,
  AlertCircle, RefreshCw,
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

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysAgoStr(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
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
    dates.push(localDateStr(d));
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

// ─── Component ──────────────────────────────────────

export default function BrandDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Time period state ─────────────────────────
  const [timePeriod, setTimePeriod] = useState<"range" | "monthly" | "yearly">("range");

  // Date range state
  const [rangeStart, setRangeStart] = useState(monthStartStr);
  const [rangeEnd, setRangeEnd] = useState(yesterdayStr);
  const [quickPreset, setQuickPreset] = useState<"7d" | "14d" | "30d" | "mtd" | "custom">("mtd");
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  function handleSelectPreset(preset: "7d" | "14d" | "30d" | "mtd") {
    setTimePeriod("range");
    setQuickPreset(preset);
    const end = yesterdayStr();
    let start = monthStartStr();
    if (preset === "7d") start = daysAgoStr(7);
    else if (preset === "14d") start = daysAgoStr(14);
    else if (preset === "30d") start = daysAgoStr(30);
    else if (preset === "mtd") {
      start = monthStartStr();
      if (start > end) {
        setRangeStart(start);
        setRangeEnd(start);
        return;
      }
    }
    setRangeStart(start);
    setRangeEnd(end);
  }

  // Monthly state — year + month selectors
  const [monthlyYear, setMonthlyYear] = useState(String(currentYear));
  const [monthlyMonth, setMonthlyMonth] = useState<string>("all"); // "all" or "01"-"12"

  // Yearly state — multi-year checkboxes
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set([String(currentYear)]));

  // ── Filter state ──────────────────────────────
  const [selectedBrands, setSelectedBrands] = useState<Set<string> | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);
  const [counterViewMode, setCounterViewMode] = useState<"counter" | "channel">("channel");
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<Set<string> | null>(null);

  // ── Compute date range from time period ───────
  const { queryStart, queryEnd } = useMemo(() => {
    if (timePeriod === "range") {
      return { queryStart: rangeStart, queryEnd: rangeEnd };
    }
    if (timePeriod === "monthly") {
      const y = Number(monthlyYear);
      // Fetch current year + previous year (for YoY comparison)
      return { queryStart: `${y - 1}-01-01`, queryEnd: `${y}-12-31` };
    }
    // yearly: cover all selected years
    const years = Array.from(selectedYears).map(Number).sort();
    const minY = years[0] || currentYear;
    const maxY = years[years.length - 1] || currentYear;
    return { queryStart: `${minY}-01-01`, queryEnd: `${maxY}-12-31` };
  }, [timePeriod, rangeStart, rangeEnd, monthlyYear, selectedYears, currentYear]);

  // ── Queries ───────────────────────────────────
  const { data: sales = [], isLoading: isLoadingSales, isError: isErrorSales, refetch: refetchSales } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const { data: posLocations = [], isLoading: isLoadingPos } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
  });

  const { data: brands = [], isLoading: isLoadingBrands } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const isDataLoading = isLoadingSales || isLoadingPos || isLoadingBrands;
  const filtersActive = selectedCategories !== null || selectedBrands !== null || selectedChannels !== null || selectedCounters !== null;

  // ── Derived lookups ───────────────────────────
  const brandMap = useMemo(() => {
    const m = new Map<string, Brand>();
    brands.forEach((b) => m.set(b.id, b));
    return m;
  }, [brands]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    brands.forEach((b) => set.add(b.category));
    return Array.from(set).sort();
  }, [brands]);

  const channels = useMemo(() => {
    const set = new Set<string>();
    posLocations.forEach((p) => set.add(p.salesChannel));
    return Array.from(set).sort();
  }, [posLocations]);

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

  // ── Active filters ────────────────────────────
  const activeCategories = useMemo(() => {
    if (selectedCategories === null) return new Set(categories);
    return selectedCategories;
  }, [selectedCategories, categories]);

  // Brands filtered by active categories first
  const categoryFilteredBrands = useMemo(
    () => brands.filter((b) => activeCategories.has(b.category)),
    [brands, activeCategories],
  );

  const activeBrandIds = useMemo(() => {
    if (selectedBrands === null) return new Set(categoryFilteredBrands.map((b) => b.id));
    return new Set(Array.from(selectedBrands).filter((id) => {
      const b = brandMap.get(id);
      return b && activeCategories.has(b.category);
    }));
  }, [selectedBrands, categoryFilteredBrands, brandMap, activeCategories]);

  const activeChannels = useMemo(() => {
    if (selectedChannels === null) return new Set(channels);
    return selectedChannels;
  }, [selectedChannels, channels]);

  const activeCounterIds = useMemo(() => {
    const channelFilteredPos = posLocations.filter((p) => activeChannels.has(p.salesChannel));
    if (selectedCounters === null) return new Set(channelFilteredPos.map((p) => p.id));
    const posSet = new Set(channelFilteredPos.map((p) => p.id));
    return new Set(Array.from(selectedCounters).filter((id) => posSet.has(id)));
  }, [selectedCounters, posLocations, activeChannels]);

  // ── Filtered sales ────────────────────────────
  const filteredSales = useMemo(
    () => sales.filter((s) =>
      activeBrandIds.has(s.brandId) && activeCounterIds.has(s.counterId),
    ),
    [sales, activeBrandIds, activeCounterIds],
  );

  // ── Current-period sales (excludes comparison year for charts) ──
  const currentPeriodSales = useMemo(() => {
    if (timePeriod === "monthly") {
      return filteredSales.filter((s) => s.date.startsWith(monthlyYear));
    }
    return filteredSales;
  }, [filteredSales, timePeriod, monthlyYear]);

  // ── Month-filtered sales (for KPIs when a specific month is selected) ──
  const kpiSales = useMemo(() => {
    if (timePeriod !== "monthly" || monthlyMonth === "all") return currentPeriodSales;
    const prefix = `${monthlyYear}-${monthlyMonth}`;
    return filteredSales.filter((s) => s.date.startsWith(prefix));
  }, [filteredSales, currentPeriodSales, timePeriod, monthlyYear, monthlyMonth]);

  // ── KPIs ──────────────────────────────────────
  const totalSales = useMemo(() => kpiSales.reduce((s, e) => s + e.amount, 0), [kpiSales]);
  const totalUnits = useMemo(() => kpiSales.reduce((s, e) => s + (e.units ?? 0), 0), [kpiSales]);
  const totalOrders = useMemo(() => kpiSales.reduce((s, e) => s + (e.orders ?? 0), 0), [kpiSales]);

  // Days in selected range (for averages)
  const daysInRange = useMemo(() => {
    if (timePeriod !== "range") return 0;
    const start = new Date(rangeStart + "T00:00:00");
    const end = new Date(rangeEnd + "T00:00:00");
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  }, [timePeriod, rangeStart, rangeEnd]);

  const avgOrdersPerDay = daysInRange > 0 && totalOrders > 0 ? totalOrders / daysInRange : null;
  const avgUnitsPerDay = daysInRange > 0 && totalUnits > 0 ? totalUnits / daysInRange : null;

  const activeBrandCount = useMemo(() => {
    const seen = new Set<string>();
    kpiSales.forEach((e) => seen.add(e.brandId));
    return seen.size;
  }, [kpiSales]);

  // Comparison: vs Last Month
  const vsLastMonth = useMemo(() => {
    if (timePeriod !== "monthly" || monthlyMonth === "all") return null;
    const y = Number(monthlyYear);
    const m = Number(monthlyMonth);
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevPrefix = `${prevY}-${String(prevM).padStart(2, "0")}`;
    const prevSales = sales.filter((s) =>
      s.date.startsWith(prevPrefix) && activeBrandIds.has(s.brandId) && activeCounterIds.has(s.counterId)
    );
    const prevTotal = prevSales.reduce((s, e) => s + e.amount, 0);
    if (prevTotal === 0) return null;
    return ((totalSales - prevTotal) / prevTotal) * 100;
  }, [timePeriod, monthlyYear, monthlyMonth, totalSales, sales, activeBrandIds, activeCounterIds]);

  // Comparison: vs Same Month Last Year
  const vsLastYear = useMemo(() => {
    if (timePeriod !== "monthly" || monthlyMonth === "all") return null;
    const y = Number(monthlyYear);
    const lyPrefix = `${y - 1}-${monthlyMonth}`;
    const lySales = sales.filter((s) =>
      s.date.startsWith(lyPrefix) && activeBrandIds.has(s.brandId) && activeCounterIds.has(s.counterId)
    );
    const lyTotal = lySales.reduce((s, e) => s + e.amount, 0);
    if (lyTotal === 0) return null;
    return ((totalSales - lyTotal) / lyTotal) * 100;
  }, [timePeriod, monthlyYear, monthlyMonth, totalSales, sales, activeBrandIds, activeCounterIds]);

  // ── Monthly Projection (range mode, single-month range) ──
  const { lmStart: brandLmStart, lmEnd: brandLmEnd, lmLabel: brandLmLabel } = useMemo(() => {
    if (timePeriod !== "range") return { lmStart: "", lmEnd: "", lmLabel: "" };
    const s = new Date(rangeStart + "T00:00:00");
    const y = s.getFullYear();
    const m = s.getMonth(); // 0-indexed
    const lmDate = new Date(y, m - 1, 1);
    const ly = lmDate.getFullYear();
    const lm = lmDate.getMonth() + 1; // 1-indexed
    const lmDays = daysInMonth(ly, lm);
    return {
      lmStart: `${ly}-${String(lm).padStart(2, "0")}-01`,
      lmEnd: `${ly}-${String(lm).padStart(2, "0")}-${String(lmDays).padStart(2, "0")}`,
      lmLabel: `${MONTH_LABELS[lm - 1]} ${ly}`,
    };
  }, [timePeriod, rangeStart]);

  const { data: brandLmSalesRaw = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${brandLmStart}&endDate=${brandLmEnd}`],
    enabled: timePeriod === "range" && !!brandLmStart,
    staleTime: 30_000,
  });

  const brandLmTotalSales = useMemo(() => {
    return brandLmSalesRaw
      .filter((s) => activeBrandIds.has(s.brandId) && activeCounterIds.has(s.counterId))
      .reduce((s, e) => s + e.amount, 0);
  }, [brandLmSalesRaw, activeBrandIds, activeCounterIds]);

  const brandProjection = useMemo(() => {
    if (timePeriod !== "range") return null;
    const s = new Date(rangeStart + "T00:00:00");
    const e = new Date(rangeEnd + "T00:00:00");
    if (s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth()) return null;
    const year = s.getFullYear();
    const month = s.getMonth() + 1;
    const daysElapsed = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    const monthDays = daysInMonth(year, month);
    const dailyRate = daysElapsed > 0 ? totalSales / daysElapsed : 0;
    const projected = Math.round(dailyRate * monthDays);
    const vsLM = brandLmTotalSales > 0 ? projected - brandLmTotalSales : null;
    const vsLMPct = brandLmTotalSales > 0 ? ((projected - brandLmTotalSales) / brandLmTotalSales) * 100 : null;
    return { year, month, daysElapsed, monthDays, dailyRate, projected, vsLM, vsLMPct, lmTotalSales: brandLmTotalSales };
  }, [timePeriod, rangeStart, rangeEnd, totalSales, brandLmTotalSales]);

  // ── Active brand list for multi-line chart ────
  const activeBrandList = useMemo(() => {
    const seen = new Map<string, number>();
    currentPeriodSales.forEach((e) => {
      seen.set(e.brandId, (seen.get(e.brandId) ?? 0) + e.amount);
    });
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => ({
        id,
        name: brandMap.get(id)?.name ?? "Unknown",
      }));
  }, [currentPeriodSales, brandMap]);

  // ── Sales Trend by Brand (multi-line) ─────────
  const brandTrendData = useMemo(() => {
    if (timePeriod === "range") {
      const allDates = dateRange(queryStart, queryEnd);
      // Build map: date -> brandId -> amount
      const map: Record<string, Record<string, number>> = {};
      allDates.forEach((d) => (map[d] = {}));
      currentPeriodSales.forEach((e) => {
        if (map[e.date]) {
          map[e.date][e.brandId] = (map[e.date][e.brandId] ?? 0) + e.amount;
        }
      });
      return allDates.map((d) => {
        const row: Record<string, any> = { label: d.slice(5) };
        activeBrandList.forEach((b) => {
          row[b.name] = map[d][b.id] ?? 0;
        });
        return row;
      });
    }
    if (timePeriod === "monthly") {
      const allMonths = monthRange(`${monthlyYear}-01`, `${monthlyYear}-12`);
      const map: Record<string, Record<string, number>> = {};
      allMonths.forEach((ym) => (map[ym] = {}));
      currentPeriodSales.forEach((e) => {
        const ym = e.date.slice(0, 7);
        if (map[ym]) {
          map[ym][e.brandId] = (map[ym][e.brandId] ?? 0) + e.amount;
        }
      });
      return allMonths.map((ym) => {
        const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
        const row: Record<string, any> = {
          label: d.toLocaleString("en-US", { month: "short" }),
        };
        activeBrandList.forEach((b) => {
          row[b.name] = map[ym][b.id] ?? 0;
        });
        return row;
      });
    }
    // yearly — overlaid lines per year, x-axis = month
    const years = Array.from(selectedYears).sort();
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    // Build map: month -> year -> total amount
    const map: Record<string, Record<string, number>> = {};
    months.forEach((m) => (map[m] = {}));
    filteredSales.forEach((e) => {
      const y = e.date.slice(0, 4);
      if (!years.includes(y)) return;
      if (!activeBrandIds.has(e.brandId) || !activeCounterIds.has(e.counterId)) return;
      const mIdx = Number(e.date.slice(5, 7)) - 1;
      const mName = months[mIdx];
      map[mName][y] = (map[mName][y] ?? 0) + e.amount;
    });
    return months.map((m) => {
      const row: Record<string, any> = { label: m };
      years.forEach((y) => {
        row[y] = map[m][y] ?? 0;
      });
      return row;
    });
  }, [timePeriod, currentPeriodSales, activeBrandList, queryStart, queryEnd, monthlyYear, selectedYears, filteredSales, activeBrandIds, activeCounterIds]);

  // ── Brand comparison bar data ─────────────────
  const brandCompareData = useMemo(() => {
    const map: Record<string, number> = {};
    currentPeriodSales.forEach((e) => {
      const name = brandMap.get(e.brandId)?.name ?? "Unknown";
      map[name] = (map[name] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [currentPeriodSales, brandMap]);

  // ── Category comparison data ──────────────────
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    currentPeriodSales.forEach((e) => {
      const cat = brandMap.get(e.brandId)?.category ?? "Unknown";
      map[cat] = (map[cat] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentPeriodSales, brandMap]);

  // ── Sales by Counter (stacked by brand) ───────
  const counterStackedData = useMemo(() => {
    // counterName -> brandName -> amount
    const map: Record<string, Record<string, number>> = {};
    currentPeriodSales.forEach((e) => {
      const cName = posNameMap.get(e.counterId) ?? "Unknown";
      const bName = brandMap.get(e.brandId)?.name ?? "Unknown";
      if (!map[cName]) map[cName] = {};
      map[cName][bName] = (map[cName][bName] ?? 0) + e.amount;
    });
    // Totals for sorting
    const entries = Object.entries(map).map(([counter, bMap]) => ({
      counter,
      total: Object.values(bMap).reduce((s, v) => s + v, 0),
      ...bMap,
    }));
    return entries.sort((a, b) => b.total - a.total).slice(0, 15);
  }, [currentPeriodSales, posNameMap, brandMap]);

  // ── Sales by Channel ──────────────────────────
  const channelPieData = useMemo(() => {
    const map: Record<string, number> = {};
    currentPeriodSales.forEach((e) => {
      const ch = posChannelMap.get(e.counterId) ?? "Unknown";
      map[ch] = (map[ch] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [currentPeriodSales, posChannelMap]);

  // ── Toggle helpers ────────────────────────────
  function toggleSet(
    setter: (fn: (prev: Set<string> | null) => Set<string> | null) => void,
    allValues: string[],
    value: string,
  ) {
    setter((prev) => {
      const current = prev ?? new Set(allValues);
      const next = new Set(current);
      if (next.has(value)) next.delete(value); else next.add(value);
      return next;
    });
  }

  function brandLabel() {
    if (selectedBrands === null) return `All (${categoryFilteredBrands.length})`;
    return `${activeBrandIds.size} of ${categoryFilteredBrands.length}`;
  }

  function categoryLabel() {
    if (selectedCategories === null) return `All (${categories.length})`;
    return `${activeCategories.size} of ${categories.length}`;
  }

  function counterChannelLabel() {
    if (counterViewMode === "channel") {
      if (selectedChannels === null) return `All (${channels.length})`;
      return `${activeChannels.size} of ${channels.length}`;
    }
    const allPos = posLocations.filter((p) => activeChannels.has(p.salesChannel));
    if (selectedCounters === null) return `All (${allPos.length})`;
    return `${activeCounterIds.size} of ${allPos.length}`;
  }

  // Year options for selectors
  const yearOptions = useMemo(() => {
    const opts: string[] = [];
    for (let y = currentYear; y >= currentYear - 5; y--) opts.push(String(y));
    return opts;
  }, [currentYear]);

  // POS grouped by channel for counter popover
  const posGroupedByChannel = useMemo(() => {
    const groups: Record<string, PosLocation[]> = {};
    posLocations.filter((p) => activeChannels.has(p.salesChannel)).forEach((p) => {
      (groups[p.salesChannel] ??= []).push(p);
    });
    return groups;
  }, [posLocations, activeChannels]);

  // ── Effective date range for filenames ────────
  const effectiveStart = useMemo(() => {
    if (timePeriod === "range") return rangeStart;
    if (timePeriod === "monthly") {
      if (monthlyMonth === "all") return `${monthlyYear}-01-01`;
      return `${monthlyYear}-${monthlyMonth}-01`;
    }
    const years = Array.from(selectedYears).sort();
    return `${years[0]}-01-01`;
  }, [timePeriod, rangeStart, monthlyYear, monthlyMonth, selectedYears]);

  const effectiveEnd = useMemo(() => {
    if (timePeriod === "range") return rangeEnd;
    if (timePeriod === "monthly") {
      if (monthlyMonth === "all") return `${monthlyYear}-12-31`;
      const m = Number(monthlyMonth);
      return `${monthlyYear}-${monthlyMonth}-${String(daysInMonth(Number(monthlyYear), m)).padStart(2, "0")}`;
    }
    const years = Array.from(selectedYears).sort();
    return `${years[years.length - 1]}-12-31`;
  }, [timePeriod, rangeEnd, monthlyYear, monthlyMonth, selectedYears]);

  // ── Export functions ──────────────────────────

  function exportBrandPerformance() {
    const map: Record<string, { sales: number; units: number; orders: number }> = {};
    kpiSales.forEach((e) => {
      if (!map[e.brandId]) map[e.brandId] = { sales: 0, units: 0, orders: 0 };
      map[e.brandId].sales += e.amount;
      map[e.brandId].units += e.units ?? 0;
      map[e.brandId].orders += e.orders ?? 0;
    });
    const rows = Object.entries(map)
      .sort(([, a], [, b]) => b.sales - a.sales)
      .map(([id, d]) => ({
        Brand: brandMap.get(id)?.name ?? "Unknown",
        Category: brandMap.get(id)?.category ?? "Unknown",
        "Total Sales": fmtCurrencyExport(d.sales),
        "Total Units": d.units,
        "Total Orders": d.orders,
        ATV: fmtRatio(d.sales, d.orders),
        UPT: fmtRatio(d.units, d.orders),
        "% of Total Sales": totalSales > 0 ? Math.round((d.sales / totalSales) * 10000) / 100 : 0,
      }));
    downloadExcel(
      dateRangeFilename("Brand_Analytics_Performance", effectiveStart, effectiveEnd),
      [{ name: "Brand Performance", data: rows }],
    );
  }

  function exportBrandCounterMatrix() {
    // Get active counters with sales
    const counterIds = new Set<string>();
    currentPeriodSales.forEach((e) => counterIds.add(e.counterId));
    const counterList = Array.from(counterIds).map((id) => ({
      id,
      name: posNameMap.get(id) ?? "Unknown",
    })).sort((a, b) => a.name.localeCompare(b.name));

    // brand -> counter -> amount
    const matrix: Record<string, Record<string, number>> = {};
    const brandTotals: Record<string, number> = {};
    currentPeriodSales.forEach((e) => {
      const bName = brandMap.get(e.brandId)?.name ?? "Unknown";
      if (!matrix[bName]) matrix[bName] = {};
      matrix[bName][e.counterId] = (matrix[bName][e.counterId] ?? 0) + e.amount;
      brandTotals[bName] = (brandTotals[bName] ?? 0) + e.amount;
    });

    const rows = Object.entries(brandTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([bName]) => {
        const row: Record<string, any> = { Brand: bName };
        counterList.forEach((c) => {
          row[c.name] = fmtCurrencyExport(matrix[bName]?.[c.id] ?? 0);
        });
        row["Total"] = fmtCurrencyExport(brandTotals[bName]);
        return row;
      });
    downloadExcel(
      dateRangeFilename("Brand_Analytics_Counter_Matrix", effectiveStart, effectiveEnd),
      [{ name: "Brand x Counter", data: rows }],
    );
  }

  function exportCategorySummary() {
    const map: Record<string, { sales: number; units: number; orders: number; brands: Set<string> }> = {};
    kpiSales.forEach((e) => {
      const cat = brandMap.get(e.brandId)?.category ?? "Unknown";
      if (!map[cat]) map[cat] = { sales: 0, units: 0, orders: 0, brands: new Set() };
      map[cat].sales += e.amount;
      map[cat].units += e.units ?? 0;
      map[cat].orders += e.orders ?? 0;
      map[cat].brands.add(e.brandId);
    });
    const rows = Object.entries(map)
      .sort(([, a], [, b]) => b.sales - a.sales)
      .map(([cat, d]) => ({
        Category: cat,
        "# Brands": d.brands.size,
        "Total Sales": fmtCurrencyExport(d.sales),
        "Total Units": d.units,
        "Total Orders": d.orders,
        ATV: fmtRatio(d.sales, d.orders),
        UPT: fmtRatio(d.units, d.orders),
      }));
    downloadExcel(
      dateRangeFilename("Brand_Analytics_Category", effectiveStart, effectiveEnd),
      [{ name: "Category Summary", data: rows }],
    );
  }

  function exportBrandMonthlyTrend() {
    // month -> brand -> amount
    const map: Record<string, Record<string, number>> = {};
    const monthTotals: Record<string, number> = {};
    const brandNames = new Set<string>();
    currentPeriodSales.forEach((e) => {
      const ym = e.date.slice(0, 7);
      const bName = brandMap.get(e.brandId)?.name ?? "Unknown";
      if (!map[ym]) map[ym] = {};
      map[ym][bName] = (map[ym][bName] ?? 0) + e.amount;
      monthTotals[ym] = (monthTotals[ym] ?? 0) + e.amount;
      brandNames.add(bName);
    });
    const sortedMonths = Object.keys(map).sort();
    const sortedBrands = Array.from(brandNames).sort();

    const rows = sortedMonths.map((ym) => {
      const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
      const row: Record<string, any> = {
        Month: d.toLocaleString("en-US", { month: "short", year: "numeric" }),
      };
      sortedBrands.forEach((bn) => {
        row[bn] = fmtCurrencyExport(map[ym][bn] ?? 0);
      });
      row["Total"] = fmtCurrencyExport(monthTotals[ym] ?? 0);
      return row;
    });
    downloadExcel(
      dateRangeFilename("Brand_Analytics_Monthly_Trend", effectiveStart, effectiveEnd),
      [{ name: "Brand Monthly Trend", data: rows }],
    );
  }

  function exportBrandChannelMatrix() {
    // brand -> channel -> amount
    const matrix: Record<string, Record<string, number>> = {};
    const brandTotals: Record<string, number> = {};
    const channelSet = new Set<string>();
    currentPeriodSales.forEach((e) => {
      const bName = brandMap.get(e.brandId)?.name ?? "Unknown";
      const ch = posChannelMap.get(e.counterId) ?? "Unknown";
      if (!matrix[bName]) matrix[bName] = {};
      matrix[bName][ch] = (matrix[bName][ch] ?? 0) + e.amount;
      brandTotals[bName] = (brandTotals[bName] ?? 0) + e.amount;
      channelSet.add(ch);
    });
    const channelList = Array.from(channelSet).sort();

    const rows = Object.entries(brandTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([bName]) => {
        const row: Record<string, any> = { Brand: bName };
        channelList.forEach((ch) => {
          row[ch] = fmtCurrencyExport(matrix[bName]?.[ch] ?? 0);
        });
        row["Total"] = fmtCurrencyExport(brandTotals[bName]);
        return row;
      });
    downloadExcel(
      dateRangeFilename("Brand_Analytics_Channel_Matrix", effectiveStart, effectiveEnd),
      [{ name: "Brand x Channel", data: rows }],
    );
  }

  function exportCurrentView() {
    // Summary sheet — adapt based on time period
    const summaryRow: Record<string, any> = {
      "Total Sales": fmtCurrencyExport(totalSales),
      "Total Units": totalUnits,
    };
    if (timePeriod === "range") {
      summaryRow["Avg Orders/Day"] = avgOrdersPerDay !== null ? Math.round(avgOrdersPerDay * 10) / 10 : "—";
      summaryRow["Avg Units/Day"] = avgUnitsPerDay !== null ? Math.round(avgUnitsPerDay * 10) / 10 : "—";
    } else if (timePeriod === "monthly" && monthlyMonth !== "all") {
      summaryRow["vs Last Month %"] = vsLastMonth !== null ? Math.round(vsLastMonth * 100) / 100 : "—";
      summaryRow["vs Last Year %"] = vsLastYear !== null ? Math.round(vsLastYear * 100) / 100 : "—";
    }

    // By Brand sheet
    const brandRows = brandCompareData.map((r) => ({
      Brand: r.name,
      Sales: fmtCurrencyExport(r.amount),
      "% of Total": totalSales > 0 ? Math.round((r.amount / totalSales) * 10000) / 100 : 0,
    }));

    // By Category sheet
    const catRows = categoryData.map((r) => ({
      Category: r.name,
      Sales: fmtCurrencyExport(r.value),
      "% of Total": totalSales > 0 ? Math.round((r.value / totalSales) * 10000) / 100 : 0,
    }));

    // By Channel sheet
    const channelRows = channelPieData.map((r) => ({
      Channel: r.name,
      Sales: fmtCurrencyExport(r.value),
      "% of Total": totalSales > 0 ? Math.round((r.value / totalSales) * 10000) / 100 : 0,
    }));

    downloadExcel(
      dateRangeFilename("Brand_Analytics_Current_View", effectiveStart, effectiveEnd),
      [
        { name: "Summary", data: [summaryRow] },
        { name: "By Brand", data: brandRows },
        { name: "By Category", data: catRows },
        { name: "By Channel", data: channelRows },
      ],
    );
  }

  // ── Render ────────────────────────────────────
  const filtersReset = () => {
    setSelectedCategories(null);
    setSelectedBrands(null);
    setSelectedChannels(null);
    setSelectedCounters(null);
  };

  return (
    <div className="p-3 sm:p-5 md:p-6 space-y-3.5 sm:space-y-5 max-w-7xl mx-auto">
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

      <Card className="rounded-xl border border-border/80 shadow-2xs">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="group" aria-label="Time period">
              {([["range", "Date Range"], ["monthly", "Monthly"], ["yearly", "Yearly"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTimePeriod(key)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-all",
                    timePeriod === key
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
                  <span>Filters</span>
                  {filtersActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary absolute -top-0.5 -right-0.5" aria-hidden />
                  )}
                </Button>
              </div>

              <div className="hidden sm:flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                      <Filter className="h-3 w-3" />
                      Category: {categoryLabel()}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-56" align="start">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Categories</span>
                        <div className="flex gap-2 text-xs">
                          <button type="button" className="text-primary underline" onClick={() => { setSelectedCategories(null); setSelectedBrands(null); }}>All</button>
                          <button type="button" className="text-primary underline" onClick={() => { setSelectedCategories(new Set()); setSelectedBrands(new Set()); }}>None</button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {categories.map((cat) => (
                          <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={activeCategories.has(cat)}
                              onCheckedChange={() => {
                                toggleSet(setSelectedCategories, categories, cat);
                                setSelectedBrands(null);
                              }}
                            />
                            {cat}
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
                      Brands: {brandLabel()}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64" align="start">
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Brands</span>
                        <div className="flex gap-2 text-xs">
                          <button type="button" className="text-primary underline" onClick={() => setSelectedBrands(null)}>All</button>
                          <button type="button" className="text-primary underline" onClick={() => setSelectedBrands(new Set())}>None</button>
                        </div>
                      </div>
                      <div className="max-h-[350px] overflow-y-auto pr-1 space-y-2">
                        {categoryFilteredBrands.map((b) => (
                          <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={activeBrandIds.has(b.id)}
                              onCheckedChange={() => toggleSet(setSelectedBrands, categoryFilteredBrands.map((x) => x.id), b.id)}
                            />
                            <span className="min-w-0">{b.name}</span>
                            <Badge variant="outline" className="ml-auto text-[10px] px-1 shrink-0">{b.category}</Badge>
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
                      {counterViewMode === "channel" ? "Channels" : "Counters"}: {counterChannelLabel()}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="start">
                    <div className="space-y-3">
                      <div className="flex gap-1">
                        <Button variant={counterViewMode === "channel" ? "default" : "outline"} size="sm" className="h-6 text-xs" onClick={() => { setCounterViewMode("channel"); setSelectedCounters(null); }}>By Channel</Button>
                        <Button variant={counterViewMode === "counter" ? "default" : "outline"} size="sm" className="h-6 text-xs" onClick={() => { setCounterViewMode("counter"); setSelectedChannels(null); }}>By Counter</Button>
                      </div>
                      {counterViewMode === "channel" ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">Channels</span>
                            <div className="flex gap-2 text-xs">
                              <button type="button" className="text-primary underline" onClick={() => setSelectedChannels(null)}>All</button>
                              <button type="button" className="text-primary underline" onClick={() => setSelectedChannels(new Set())}>None</button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {channels.map((ch) => (
                              <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox checked={activeChannels.has(ch)} onCheckedChange={() => toggleSet(setSelectedChannels, channels, ch)} />
                                {ch}
                              </label>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">Counters</span>
                            <div className="flex gap-2 text-xs">
                              <button type="button" className="text-primary underline" onClick={() => setSelectedCounters(null)}>All</button>
                              <button type="button" className="text-primary underline" onClick={() => setSelectedCounters(new Set())}>None</button>
                            </div>
                          </div>
                          <div className="max-h-[400px] overflow-y-auto pr-1 space-y-3">
                            {Object.entries(posGroupedByChannel).map(([channel, locs]) => (
                              <div key={channel}>
                                <div className="text-xs font-medium text-muted-foreground mb-1">{channel}</div>
                                <div className="space-y-1.5 pl-1">
                                  {locs.map((loc) => (
                                    <label key={loc.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                      <Checkbox
                                        checked={activeCounterIds.has(loc.id)}
                                        onCheckedChange={() => {
                                          const allPos = posLocations.filter((p) => activeChannels.has(p.salesChannel));
                                          toggleSet(setSelectedCounters, allPos.map((p) => p.id), loc.id);
                                        }}
                                      />
                                      {loc.storeName}
                                    </label>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                    <Download className="h-3 w-3" />
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportBrandPerformance}>Brand Performance Summary</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportBrandCounterMatrix}>Brand × Counter Matrix</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCategorySummary}>Category Summary</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportBrandMonthlyTrend}>Brand Monthly Trend</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportBrandChannelMatrix}>Brand × Channel Matrix</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={exportCurrentView}>Export Current View</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {timePeriod === "range" && (
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
                    value={rangeStart}
                    onChange={(e) => { setRangeStart(e.target.value); setQuickPreset("custom"); }}
                    className="h-8 text-xs w-full sm:w-[135px]"
                    aria-label="From date"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-1 sm:flex-initial">
                  <span className="text-[11px] text-muted-foreground">To</span>
                  <Input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => { setRangeEnd(e.target.value); setQuickPreset("custom"); }}
                    className="h-8 text-xs w-full sm:w-[135px]"
                    aria-label="To date"
                  />
                </div>
              </div>
            </div>
          )}

          {timePeriod === "monthly" && (
            <div className="flex items-center gap-2 pt-1 border-t border-border/50">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Year</span>
                <Select value={monthlyYear} onValueChange={setMonthlyYear}>
                  <SelectTrigger className="w-[95px] h-8 text-xs" aria-label="Year"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Month</span>
                <Select value={monthlyMonth} onValueChange={setMonthlyMonth}>
                  <SelectTrigger className="w-[120px] h-8 text-xs" aria-label="Month"><SelectValue /></SelectTrigger>
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

          {timePeriod === "yearly" && (
            <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-border/50">
              {yearOptions.map((y) => (
                <label key={y} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={selectedYears.has(y)}
                    onCheckedChange={(checked) => {
                      setSelectedYears((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(y); else next.delete(y);
                        if (next.size === 0) next.add(y);
                        return next;
                      });
                    }}
                  />
                  {y}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 space-y-4">
          <SheetHeader className="text-left border-b pb-2">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-sm font-bold">Filter brands</SheetTitle>
              <Button variant="ghost" size="sm" onClick={filtersReset} className="h-7 text-xs text-primary">
                Reset All
              </Button>
            </div>
            <SheetDescription className="text-xs">
              Limit the view by category, brand, and where it sold
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold">Categories</span>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary underline" onClick={() => { setSelectedCategories(null); setSelectedBrands(null); }}>All</button>
                <button type="button" className="text-primary underline" onClick={() => { setSelectedCategories(new Set()); setSelectedBrands(new Set()); }}>None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => (
                <label key={cat} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-xs cursor-pointer">
                  <Checkbox
                    checked={activeCategories.has(cat)}
                    onCheckedChange={() => {
                      toggleSet(setSelectedCategories, categories, cat);
                      setSelectedBrands(null);
                    }}
                  />
                  <span className="truncate">{cat}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold">Brands</span>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-primary underline" onClick={() => setSelectedBrands(null)}>All</button>
                <button type="button" className="text-primary underline" onClick={() => setSelectedBrands(new Set())}>None</button>
              </div>
            </div>
            <div className="max-h-[180px] overflow-y-auto space-y-1 pr-1">
              {categoryFilteredBrands.map((b) => (
                <label key={b.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 text-xs cursor-pointer">
                  <Checkbox
                    checked={activeBrandIds.has(b.id)}
                    onCheckedChange={() => toggleSet(setSelectedBrands, categoryFilteredBrands.map((x) => x.id), b.id)}
                  />
                  <span className="truncate flex-1">{b.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{b.category}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">Where it sold</span>
              <div className="inline-flex rounded-lg border bg-muted/60 p-0.5" role="group" aria-label="Counter or channel">
                <button type="button" onClick={() => { setCounterViewMode("channel"); setSelectedCounters(null); }} className={cn("px-2 py-0.5 text-[11px] rounded-md", counterViewMode === "channel" ? "bg-background font-semibold shadow-2xs" : "text-muted-foreground")}>Channel</button>
                <button type="button" onClick={() => { setCounterViewMode("counter"); setSelectedChannels(null); }} className={cn("px-2 py-0.5 text-[11px] rounded-md", counterViewMode === "counter" ? "bg-background font-semibold shadow-2xs" : "text-muted-foreground")}>Counter</button>
              </div>
            </div>
            {counterViewMode === "channel" ? (
              <div className="grid grid-cols-2 gap-2">
                {channels.map((ch) => (
                  <label key={ch} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 text-xs cursor-pointer">
                    <Checkbox checked={activeChannels.has(ch)} onCheckedChange={() => toggleSet(setSelectedChannels, channels, ch)} />
                    <span className="truncate">{ch}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                {Object.entries(posGroupedByChannel).map(([channel, locs]) => (
                  <div key={channel} className="space-y-1">
                    <div className="text-[11px] font-semibold text-muted-foreground uppercase">{channel}</div>
                    {locs.map((loc) => (
                      <label key={loc.id} className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/50 text-xs cursor-pointer">
                        <Checkbox
                          checked={activeCounterIds.has(loc.id)}
                          onCheckedChange={() => {
                            const allPos = posLocations.filter((p) => activeChannels.has(p.salesChannel));
                            toggleSet(setSelectedCounters, allPos.map((p) => p.id), loc.id);
                          }}
                        />
                        <span className="truncate">{loc.storeName}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button className="w-full h-9 text-xs" onClick={() => setMobileFilterOpen(false)}>
            Apply Filters
          </Button>
        </SheetContent>
      </Sheet>

      <div className={cn("grid gap-2 sm:gap-3.5", timePeriod === "range" ? "grid-cols-2 lg:grid-cols-5" : "grid-cols-2 lg:grid-cols-4")}>
        <KpiCard label="Total Sales" value={fmtCurrency(totalSales)} loading={isDataLoading} icon={<DollarSign className="h-3 w-3 sm:h-3.5 sm:w-3.5" />} tone="primary" />
        {timePeriod === "range" ? (
          <>
            <KpiCard label="Total Orders" value={totalOrders > 0 ? totalOrders.toLocaleString() : "—"} loading={isDataLoading} icon={<Tag className="h-3 w-3 sm:h-3.5 sm:w-3.5" />} tone="blue" />
            <KpiCard label="Total Units" value={totalUnits > 0 ? totalUnits.toLocaleString() : "—"} loading={isDataLoading} icon={<Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />} tone="amber" />
            <KpiCard label="Avg Orders/Day" value={avgOrdersPerDay !== null ? avgOrdersPerDay.toFixed(1) : "—"} loading={isDataLoading} icon={<TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />} tone="primary" />
            <KpiCard label="Avg Units/Day" value={avgUnitsPerDay !== null ? avgUnitsPerDay.toFixed(1) : "—"} loading={isDataLoading} icon={<Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />} tone="amber" />
          </>
        ) : (
          <>
            <KpiCard label="Total Units" value={totalUnits > 0 ? totalUnits.toLocaleString() : "—"} loading={isDataLoading} icon={<Package className="h-3 w-3 sm:h-3.5 sm:w-3.5" />} tone="amber" />
            <KpiCard
              label="vs. Last Month"
              value={vsLastMonth !== null ? `${vsLastMonth >= 0 ? "+" : ""}${vsLastMonth.toFixed(1)}%` : "—"}
              loading={isDataLoading}
              icon={vsLastMonth !== null && vsLastMonth < 0 ? <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
              tone={vsLastMonth === null ? "muted" : vsLastMonth >= 0 ? "up" : "down"}
              valueClass={vsLastMonth === null ? undefined : vsLastMonth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
            />
            <KpiCard
              label="vs. Last Year"
              value={vsLastYear !== null ? `${vsLastYear >= 0 ? "+" : ""}${vsLastYear.toFixed(1)}%` : "—"}
              loading={isDataLoading}
              icon={<CalendarClock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
              tone={vsLastYear === null ? "muted" : vsLastYear >= 0 ? "up" : "down"}
              valueClass={vsLastYear === null ? undefined : vsLastYear >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}
            />
          </>
        )}
      </div>

      {brandProjection && (() => {
        const pctOfMonth = Math.min(100, Math.max(0, Math.round((brandProjection.daysElapsed / brandProjection.monthDays) * 100)));
        return (
          <Card className="rounded-xl border border-blue-200 dark:border-blue-900 bg-gradient-to-br from-blue-50/70 via-blue-50/30 to-background dark:from-blue-950/30 dark:via-blue-950/10 dark:to-background overflow-hidden shadow-2xs">
            <CardContent className="p-3.5 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-blue-600/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                    <CalendarDays className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-xs sm:text-sm text-blue-900 dark:text-blue-200">
                    Monthly Projection — {MONTH_LABELS[brandProjection.month - 1]} {brandProjection.year}
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <span>Day {brandProjection.daysElapsed} of {brandProjection.monthDays}</span>
                  <span className="font-semibold text-blue-600 dark:text-blue-400">({pctOfMonth}%)</span>
                </div>
              </div>
              <div className="w-full bg-blue-200/50 dark:bg-blue-900/40 h-1.5 rounded-full overflow-hidden mb-3" role="progressbar" aria-valuenow={pctOfMonth} aria-valuemin={0} aria-valuemax={100} aria-label="Month progress">
                <div className="bg-blue-600 dark:bg-blue-400 h-full rounded-full" style={{ width: `${pctOfMonth}%` }} />
              </div>
              <div className="bg-background/95 dark:bg-card/95 rounded-xl p-3 sm:p-4 border border-blue-100 dark:border-blue-900/50 mb-3 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider block">Projected Full Month</span>
                    <div className="text-xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">{fmtCurrency(brandProjection.projected)}</div>
                  </div>
                  {brandProjection.vsLM !== null && (
                    <div className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold w-fit",
                      brandProjection.vsLM >= 0
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-800"
                        : "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-800",
                    )}>
                      <span>{brandProjection.vsLM >= 0 ? "▲ +" : "▼ "}{Math.abs(brandProjection.vsLMPct ?? 0).toFixed(1)}%</span>
                      <span className="font-normal opacity-85 text-[11px]">vs {brandLmLabel}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-1 text-center sm:text-left">
                <div className="p-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{rangeStart.slice(8)}–{rangeEnd.slice(8)} {MONTH_LABELS[brandProjection.month - 1]}</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">{fmtCurrency(totalSales)}</p>
                </div>
                <div className="p-1 border-x border-blue-200/50 dark:border-blue-900/40">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Daily Run Rate</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">{fmtCurrency(Math.round(brandProjection.dailyRate))}</p>
                </div>
                <div className="p-1">
                  <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{brandLmLabel} Total</p>
                  <p className="text-xs sm:text-base font-bold text-foreground truncate">{brandProjection.lmTotalSales > 0 ? fmtCurrency(brandProjection.lmTotalSales) : "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 flex flex-row items-center justify-between space-y-0 border-b border-border/50">
          <div className="flex items-center gap-2 min-w-0">
            <CardTitle className="text-xs sm:text-sm font-semibold">Sales Trend by Brand</CardTitle>
            <Badge variant="outline" className="text-[9px] sm:text-[10px] font-normal py-0 shrink-0">
              {timePeriod === "range" ? (quickPreset !== "custom" ? quickPreset.toUpperCase() : "Daily") : timePeriod === "monthly" ? "Monthly" : "Yearly"}
            </Badge>
          </div>
          {timePeriod === "range" && (
            <div className="flex items-center gap-0.5 bg-muted/60 p-0.5 rounded-lg text-[10px] sm:text-[11px] shrink-0">
              {(["7d", "14d", "30d", "mtd"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleSelectPreset(preset)}
                  className={cn(
                    "px-1.5 sm:px-2 py-0.5 rounded-md font-medium transition-colors",
                    quickPreset === preset ? "bg-background text-foreground shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground",
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
            <div className="flex flex-col items-center justify-center h-[200px] sm:h-[260px] gap-2" aria-busy="true">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading trend data...</span>
            </div>
          ) : brandTrendData.length === 0 ? (
            <div className="flex items-center justify-center h-[200px] sm:h-[260px] text-muted-foreground text-xs sm:text-sm" role="status">
              No data for selected filters
            </div>
          ) : (
            <div className="h-[210px] sm:h-[260px] md:h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={brandTrendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    minTickGap={16}
                    interval={brandTrendData.length > 35 ? Math.floor(brandTrendData.length / 10) : "preserveStartEnd"}
                  />
                  <YAxis tick={{ fontSize: 10 }} width={38} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                  <Tooltip content={<TrendTooltip />} />
                  {timePeriod === "yearly"
                    ? Array.from(selectedYears).sort().map((y, i) => (
                      <Line key={y} type="monotone" dataKey={y} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                    ))
                    : activeBrandList.map((b, i) => (
                      <Line key={b.id} type="monotone" dataKey={b.name} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <BrandKey
              items={timePeriod === "yearly"
                ? Array.from(selectedYears).sort().map((y, i) => ({ name: y, color: CHART_COLORS[i % CHART_COLORS.length] }))
                : activeBrandList.map((b, i) => ({ name: b.name, color: CHART_COLORS[i % CHART_COLORS.length] }))}
            />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
          <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs sm:text-sm font-semibold">Brand Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-2 sm:p-4 pt-3">
            {brandCompareData.length === 0 ? (
              <div className="flex items-center justify-center h-[160px] text-muted-foreground text-xs" role="status">No data</div>
            ) : (
              <>
                <div className="space-y-2 md:hidden">
                  {brandCompareData.map((row, i) => {
                    const share = totalSales > 0 ? (row.amount / totalSales) * 100 : 0;
                    return (
                      <div key={row.name} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium truncate">{row.name}</span>
                          <span className="tabular-nums shrink-0 font-semibold">{fmtCurrency(row.amount)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(2, share)}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{share.toFixed(0)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden md:block" style={{ height: Math.max(220, brandCompareData.length * 28) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={brandCompareData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                        {brandCompareData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <ShareCard title="Category Comparison" rows={categoryData} total={totalSales} empty="No data" />
      </div>

      <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
          <CardTitle className="text-xs sm:text-sm font-semibold">Sales by Counter</CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 pt-3">
          {counterStackedData.length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-muted-foreground text-xs" role="status">No data</div>
          ) : (
            <>
              <div className="space-y-2 md:hidden">
                {counterStackedData.map((row) => {
                  const share = totalSales > 0 ? (row.total / totalSales) * 100 : 0;
                  return (
                    <div key={row.counter} className="p-2.5 rounded-lg border bg-card/60 space-y-1 shadow-2xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold truncate">{row.counter}</span>
                        <span className="text-xs font-bold tabular-nums shrink-0">{fmtCurrency(row.total)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, share)}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{share.toFixed(0)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block" style={{ height: Math.max(240, counterStackedData.length * 32) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={counterStackedData} layout="vertical" margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="counter" width={88} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    {activeBrandList.map((b, i) => (
                      <Bar key={b.id} dataKey={b.name} stackId="brands" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ShareCard title="Sales by Channel" rows={channelPieData} total={totalSales} empty="No data" />
    </div>
  );
}

const KPI_TONES: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  up: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  down: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  muted: "bg-muted text-muted-foreground",
};

function KpiCard({
  label, value, loading, icon, tone, valueClass,
}: {
  label: string;
  value: string;
  loading: boolean;
  icon: ReactNode;
  tone: keyof typeof KPI_TONES;
  valueClass?: string;
}) {
  return (
    <Card className="p-3 sm:p-4 rounded-xl border border-border/80 shadow-2xs">
      <div className="flex items-center justify-between gap-1 pb-0.5">
        <span className="text-[11px] sm:text-sm font-medium text-foreground/80 leading-tight">{label}</span>
        <div className={cn("w-5 h-5 sm:w-6 sm:h-6 rounded-md flex items-center justify-center shrink-0", KPI_TONES[tone])}>
          {icon}
        </div>
      </div>
      <div className="mt-1">
        {loading ? (
          <Skeleton className="h-6 sm:h-7 w-20 my-1" />
        ) : (
          <div className={cn("text-base sm:text-xl lg:text-2xl font-bold tracking-tight text-foreground truncate", valueClass)}>
            {value}
          </div>
        )}
      </div>
    </Card>
  );
}

function BrandKey({ items }: { items: { name: string; color: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4" aria-label="Brands in this chart">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5 min-w-0">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.color }} aria-hidden />
          <span className="text-[11px] leading-tight text-foreground break-words">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .map((row) => ({ name: String(row.name ?? ""), value: Number(row.value ?? 0), color: row.color ?? "currentColor" }))
    .filter((row) => row.name && row.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;
  return (
    <div className="max-w-[220px] rounded-lg border border-border bg-card px-2.5 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      <ul className="max-h-40 space-y-1 overflow-y-auto" role="list">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} aria-hidden />
              <span className="truncate">{row.name}</span>
            </span>
            <span className="shrink-0 tabular-nums font-medium">{fmtCurrency(row.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ShareCard({
  title, rows, total, empty,
}: {
  title: string;
  rows: { name: string; value: number }[];
  total: number;
  empty: string;
}) {
  return (
    <Card className="rounded-xl border border-border/80 shadow-2xs overflow-hidden">
      <CardHeader className="p-3 sm:p-4 pb-2 border-b border-border/50">
        <CardTitle className="text-xs sm:text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-2 sm:p-4 pt-3">
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-[140px] text-muted-foreground text-xs" role="status">{empty}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3 items-center">
            <div className="h-[150px] sm:h-[170px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rows} cx="50%" cy="50%" innerRadius={36} outerRadius={62} paddingAngle={2} dataKey="value" nameKey="name">
                    {rows.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-1.5 min-w-0" role="list">
              {rows.map((row, i) => {
                const share = total > 0 ? (row.value / total) * 100 : 0;
                return (
                  <li key={row.name} className="flex items-center gap-2 text-xs min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
                    <span className="truncate flex-1">{row.name}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">{share.toFixed(0)}%</span>
                    <span className="tabular-nums font-medium shrink-0 w-[72px] text-right">{fmtCurrency(row.value)}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
