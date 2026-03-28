import { useState, useMemo } from "react";
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
  DollarSign, Tag, Package, TrendingUp, TrendingDown, CalendarClock,
  Filter, ChevronDown, Layers, Download,
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

function todayStr() { return new Date().toISOString().split("T")[0]; }

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

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

// ─── Component ──────────────────────────────────────

export default function BrandDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Time period state ─────────────────────────
  const [timePeriod, setTimePeriod] = useState<"range" | "monthly" | "yearly">("range");

  // Date range state
  const [rangeStart, setRangeStart] = useState(monthStartStr);
  const [rangeEnd, setRangeEnd] = useState(todayStr);

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
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const { data: posLocations = [] } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

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
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Time Period */}
            <div className="flex gap-1">
              {(["range", "monthly", "yearly"] as const).map((tp) => (
                <Button
                  key={tp}
                  variant={timePeriod === tp ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimePeriod(tp)}
                >
                  {tp === "range" ? "Date Range" : tp.charAt(0).toUpperCase() + tp.slice(1)}
                </Button>
              ))}
            </div>

            {/* Date controls based on time period */}
            {timePeriod === "range" && (
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className="w-[130px] md:w-[150px]"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className="w-[130px] md:w-[150px]"
                  />
                </div>
              </div>
            )}

            {timePeriod === "monthly" && (
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
                      {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                        <SelectItem key={m} value={m}>
                          {new Date(2000, Number(m) - 1, 1).toLocaleString("en-US", { month: "long" })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {timePeriod === "yearly" && (
              <div className="flex items-end gap-3">
                <Label className="text-xs text-muted-foreground">Years:</Label>
                <div className="flex flex-wrap gap-3">
                  {yearOptions.map((y) => (
                    <label key={y} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <Checkbox
                        checked={selectedYears.has(y)}
                        onCheckedChange={(checked) => {
                          setSelectedYears((prev) => {
                            const next = new Set(prev);
                            if (checked) next.add(y); else next.delete(y);
                            if (next.size === 0) next.add(y); // keep at least 1
                            return next;
                          });
                        }}
                      />
                      {y}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Category filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  Category: {categoryLabel()}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56" align="start">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Categories</span>
                    <div className="flex gap-2 text-xs">
                      <button className="text-primary underline" onClick={() => { setSelectedCategories(null); setSelectedBrands(null); }}>All</button>
                      <button className="text-primary underline" onClick={() => { setSelectedCategories(new Set()); setSelectedBrands(new Set()); }}>None</button>
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

            {/* Brand filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  Brands: {brandLabel()}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Brands</span>
                    <div className="flex gap-2 text-xs">
                      <button className="text-primary underline" onClick={() => setSelectedBrands(null)}>All</button>
                      <button className="text-primary underline" onClick={() => setSelectedBrands(new Set())}>None</button>
                    </div>
                  </div>
                  <div className="max-h-[350px] overflow-y-auto pr-1">
                    <div className="space-y-2">
                      {categoryFilteredBrands.map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={activeBrandIds.has(b.id)}
                            onCheckedChange={() => toggleSet(setSelectedBrands, categoryFilteredBrands.map((x) => x.id), b.id)}
                          />
                          <span>{b.name}</span>
                          <Badge variant="outline" className="ml-auto text-[10px] px-1">{b.category}</Badge>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Counter / Channel filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  {counterViewMode === "channel" ? "Channels" : "Counters"}: {counterChannelLabel()}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="start">
                <div className="space-y-3">
                  <div className="flex gap-1 mb-2">
                    <Button
                      variant={counterViewMode === "channel" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => { setCounterViewMode("channel"); setSelectedCounters(null); }}
                    >
                      By Channel
                    </Button>
                    <Button
                      variant={counterViewMode === "counter" ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => { setCounterViewMode("counter"); setSelectedChannels(null); }}
                    >
                      By Counter
                    </Button>
                  </div>

                  {counterViewMode === "channel" ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Channels</span>
                        <div className="flex gap-2 text-xs">
                          <button className="text-primary underline" onClick={() => setSelectedChannels(null)}>All</button>
                          <button className="text-primary underline" onClick={() => setSelectedChannels(new Set())}>None</button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {channels.map((ch) => (
                          <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={activeChannels.has(ch)}
                              onCheckedChange={() => toggleSet(setSelectedChannels, channels, ch)}
                            />
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
                          <button className="text-primary underline" onClick={() => setSelectedCounters(null)}>All</button>
                          <button className="text-primary underline" onClick={() => setSelectedCounters(new Set())}>None</button>
                        </div>
                      </div>
                      <div className="max-h-[400px] overflow-y-auto pr-1">
                        <div className="space-y-3">
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
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Download className="h-3.5 w-3.5" />
                  Export
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
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className={`grid gap-4 ${timePeriod === "range" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 md:grid-cols-4"}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(totalSales)}</div>
          </CardContent>
        </Card>
        {timePeriod === "range" ? (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
                <Tag className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalOrders > 0 ? totalOrders.toLocaleString() : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUnits > 0 ? totalUnits.toLocaleString() : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Orders/Day</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgOrdersPerDay !== null ? avgOrdersPerDay.toFixed(1) : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Units/Day</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{avgUnitsPerDay !== null ? avgUnitsPerDay.toFixed(1) : "—"}</div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Units</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalUnits > 0 ? totalUnits.toLocaleString() : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">vs. Last Month</CardTitle>
                {vsLastMonth !== null && vsLastMonth >= 0 ? <TrendingUp className="h-4 w-4 text-green-600" /> : vsLastMonth !== null ? <TrendingDown className="h-4 w-4 text-red-500" /> : <TrendingUp className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
              <CardContent>
                {vsLastMonth !== null ? (
                  <div className={`text-2xl font-bold ${vsLastMonth >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {vsLastMonth >= 0 ? "+" : ""}{vsLastMonth.toFixed(1)}%
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-muted-foreground">—</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">vs. Last Year</CardTitle>
                {vsLastYear !== null && vsLastYear >= 0 ? <CalendarClock className="h-4 w-4 text-green-600" /> : vsLastYear !== null ? <CalendarClock className="h-4 w-4 text-red-500" /> : <CalendarClock className="h-4 w-4 text-muted-foreground" />}
              </CardHeader>
              <CardContent>
                {vsLastYear !== null ? (
                  <div className={`text-2xl font-bold ${vsLastYear >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {vsLastYear >= 0 ? "+" : ""}{vsLastYear.toFixed(1)}%
                  </div>
                ) : (
                  <div className="text-2xl font-bold text-muted-foreground">—</div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Sales Trend by Brand (multi-line) */}
      <Card>
        <CardHeader>
          <CardTitle>
            Sales Trend by Brand
            <Badge variant="outline" className="ml-2 font-normal">
              {timePeriod === "range" ? "Daily" : timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brandTrendData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data for selected filters
            </div>
          ) : timePeriod === "yearly" ? (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={brandTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend />
                {Array.from(selectedYears).sort().map((y, i) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={y}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={brandTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={brandTrendData.length > 60 ? Math.floor(brandTrendData.length / 15) : "preserveStartEnd"}
                />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend />
                {activeBrandList.map((b, i) => (
                  <Line
                    key={b.id}
                    type="monotone"
                    dataKey={b.name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Brand Comparison + Category Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Brand Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Brand Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {brandCompareData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, brandCompareData.length * 32)}>
                <BarChart data={brandCompareData} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {brandCompareData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Category Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Category Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales by Counter (stacked by brand) */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Counter (by Brand)</CardTitle>
        </CardHeader>
        <CardContent>
          {counterStackedData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, counterStackedData.length * 36)}>
              <BarChart data={counterStackedData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="counter" width={80} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend />
                {activeBrandList.map((b, i) => (
                  <Bar
                    key={b.id}
                    dataKey={b.name}
                    stackId="brands"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Sales by Channel */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          {channelPieData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={channelPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {channelPieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
