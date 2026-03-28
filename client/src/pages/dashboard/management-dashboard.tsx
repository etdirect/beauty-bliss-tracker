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
  DollarSign, ShoppingCart, TrendingUp, Package,
  Filter, ChevronDown,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { CHART_COLORS } from "../dashboard";

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

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ─── Component ──────────────────────────────────────

export default function ManagementDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Time tab state ────────────────────────────
  const [timeTab, setTimeTab] = useState<"daterange" | "monthly" | "yearly">("daterange");

  // Date Range tab
  const [drStart, setDrStart] = useState(monthStartStr);
  const [drEnd, setDrEnd] = useState(todayStr);

  // Monthly tab
  const [monthlyYear, setMonthlyYear] = useState(String(currentYear));
  const [monthlyMonth, setMonthlyMonth] = useState("all");

  // Yearly tab — set of selected year strings
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set([String(currentYear)]));

  // ── Filter state ──────────────────────────────
  const [selectedChannels, setSelectedChannels] = useState<Set<string> | null>(null);
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null);

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
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${queryStart}&endDate=${queryEnd}`],
  });

  const { data: posLocations = [] } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

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

  const brandMap = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [brands]);

  // ── KPIs ──────────────────────────────────────
  const totalSales = useMemo(() => filteredSales.reduce((s, e) => s + e.amount, 0), [filteredSales]);
  const totalOrders = useMemo(() => filteredSales.reduce((s, e) => s + (e.orders ?? 0), 0), [filteredSales]);
  const totalUnits = useMemo(() => filteredSales.reduce((s, e) => s + e.units, 0), [filteredSales]);
  const atv = totalOrders > 0 ? totalSales / totalOrders : null;
  const upt = totalOrders > 0 ? totalUnits / totalOrders : null;

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
        filteredSales.forEach((e) => {
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
      filteredSales.forEach((e) => {
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
        filteredSales.forEach((e) => {
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
      filteredSales.forEach((e) => {
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
    filteredSales.forEach((e) => {
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
    selectedYears, filteredSales, showIndividualLines, activePosList, currentYear,
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
    filteredSales.forEach((e) => {
      const ch = posChannelMap.get(e.counterId) ?? "Unknown";
      map[ch] = (map[ch] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSales, posChannelMap]);

  // ── Counter table data ────────────────────────
  const counterTableData = useMemo(() => {
    const map: Record<string, { sales: number; orders: number; units: number }> = {};
    filteredSales.forEach((e) => {
      if (!map[e.counterId]) map[e.counterId] = { sales: 0, orders: 0, units: 0 };
      map[e.counterId].sales += e.amount;
      map[e.counterId].orders += e.orders ?? 0;
      map[e.counterId].units += e.units;
    });
    return Object.entries(map)
      .map(([id, d]) => ({
        name: posNameMap.get(id) ?? "Unknown",
        sales: d.sales,
        orders: d.orders,
        units: d.units,
        atv: d.orders > 0 ? d.sales / d.orders : null,
        upt: d.orders > 0 ? d.units / d.orders : null,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [filteredSales, posNameMap]);

  // ── Brand table data ──────────────────────────
  const brandTableData = useMemo(() => {
    const map: Record<string, { sales: number; orders: number; units: number }> = {};
    filteredSales.forEach((e) => {
      if (!map[e.brandId]) map[e.brandId] = { sales: 0, orders: 0, units: 0 };
      map[e.brandId].sales += e.amount;
      map[e.brandId].orders += e.orders ?? 0;
      map[e.brandId].units += e.units;
    });
    return Object.entries(map)
      .map(([id, d]) => ({
        name: brandMap.get(id) ?? "Unknown",
        sales: d.sales,
        orders: d.orders,
        units: d.units,
        atv: d.orders > 0 ? d.sales / d.orders : null,
        upt: d.orders > 0 ? d.units / d.orders : null,
      }))
      .sort((a, b) => b.sales - a.sales);
  }, [filteredSales, brandMap]);

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

  // ── Render ────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-4">
          {/* Time tabs */}
          <div className="flex gap-1">
            {([["daterange", "Date Range"], ["monthly", "Monthly"], ["yearly", "Yearly"]] as const).map(([key, label]) => (
              <Button
                key={key}
                variant={timeTab === key ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeTab(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            {/* Time controls */}
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

            {timeTab === "monthly" && (
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Year</Label>
                  <Select value={monthlyYear} onValueChange={setMonthlyYear}>
                    <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Month</Label>
                  <Select value={monthlyMonth} onValueChange={setMonthlyMonth}>
                    <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
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
              <div className="flex items-center gap-3 flex-wrap">
                {availableYears.map((yr) => (
                  <label key={yr} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedYears.has(yr)}
                      onCheckedChange={() => toggleYear(yr)}
                    />
                    {yr}
                  </label>
                ))}
              </div>
            )}

            {/* Channel filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  Channels: {channelCountLabel}
                  <ChevronDown className="h-3.5 w-3.5" />
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
                  <div className="max-h-[300px] overflow-y-auto pr-1">
                    <div className="space-y-2">
                      {channels.map((ch) => (
                        <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox checked={activeChannels.has(ch)} onCheckedChange={() => toggleChannel(ch)} />
                          {ch}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Counter filter */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Filter className="h-3.5 w-3.5" />
                  Counters: {counterCountLabel}
                  <ChevronDown className="h-3.5 w-3.5" />
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
                  <div className="max-h-[400px] overflow-y-auto pr-1">
                    <div className="space-y-3">
                      {Object.entries(posGroupedByChannel).map(([channel, locations]) => (
                        <div key={channel}>
                          <div className="text-xs font-medium text-muted-foreground mb-1">{channel}</div>
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
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCurrency(totalSales)}</div>
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
            <div className="text-2xl font-bold">{atv !== null ? fmtCurrency(Math.round(atv)) : "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">UPT</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upt !== null ? upt.toFixed(1) : "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle>
            Sales Trend
            <Badge variant="outline" className="ml-2 font-normal">
              {timeTab === "daterange" ? "Daily" : timeTab === "monthly"
                ? (monthlyMonth === "all" ? "Monthly" : "Daily")
                : selectedYears.size > 1 ? "Year Comparison" : "Monthly"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data for selected filters
            </div>
          ) : useBars ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                <Bar dataKey="Combined" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={trendData.length > 45 ? Math.floor(trendData.length / 15) : "preserveStartEnd"}
                />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                <Legend />
                {trendLineKeys.map((key, i) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={key === "Combined" ? 3 : 2}
                    strokeDasharray={key === "Combined" ? "6 3" : undefined}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Sales by Channel (pie) */}
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

      {/* Sales by Counter (table) */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Counter</CardTitle>
        </CardHeader>
        <CardContent>
          {counterTableData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Counter</th>
                    <th className="pb-2 font-medium text-right">Sales</th>
                    <th className="pb-2 font-medium text-right">Units</th>
                    <th className="pb-2 font-medium text-right">ATV</th>
                    <th className="pb-2 font-medium text-right">UPT</th>
                  </tr>
                </thead>
                <tbody>
                  {counterTableData.map((row) => (
                    <tr key={row.name} className="border-b last:border-0">
                      <td className="py-2">{row.name}</td>
                      <td className="py-2 text-right">{fmtCurrency(row.sales)}</td>
                      <td className="py-2 text-right">{row.units.toLocaleString()}</td>
                      <td className="py-2 text-right">{row.atv !== null ? fmtCurrency(Math.round(row.atv)) : "—"}</td>
                      <td className="py-2 text-right">{row.upt !== null ? row.upt.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sales by Brand (table) */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Brand</CardTitle>
        </CardHeader>
        <CardContent>
          {brandTableData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No data</p>
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
                      <td className="py-2 text-right">{row.atv !== null ? fmtCurrency(Math.round(row.atv)) : "—"}</td>
                      <td className="py-2 text-right">{row.upt !== null ? row.upt.toFixed(1) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
