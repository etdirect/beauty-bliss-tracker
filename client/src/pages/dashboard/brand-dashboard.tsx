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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSign, Tag, Award, Layers,
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

// ─── Component ──────────────────────────────────────

export default function BrandDashboard() {
  const now = new Date();
  const currentYear = now.getFullYear();

  // ── Time period state ─────────────────────────
  const [timePeriod, setTimePeriod] = useState<"daily" | "monthly" | "yearly">("daily");

  // Daily state
  const [dailyStart, setDailyStart] = useState(monthStartStr);
  const [dailyEnd, setDailyEnd] = useState(todayStr);

  // Monthly state — year + month selectors
  const [monthlyYear, setMonthlyYear] = useState(String(currentYear));

  // Yearly state — last 2 years
  const [yearlyEnd, setYearlyEnd] = useState(String(currentYear));

  // ── Filter state ──────────────────────────────
  const [selectedBrands, setSelectedBrands] = useState<Set<string> | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Set<string> | null>(null);
  const [counterViewMode, setCounterViewMode] = useState<"counter" | "channel">("channel");
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<Set<string> | null>(null);

  // ── Compute date range from time period ───────
  const { queryStart, queryEnd } = useMemo(() => {
    if (timePeriod === "daily") {
      return { queryStart: dailyStart, queryEnd: dailyEnd };
    }
    if (timePeriod === "monthly") {
      const y = Number(monthlyYear);
      return { queryStart: `${y}-01-01`, queryEnd: `${y}-12-31` };
    }
    // yearly: 2 years ending at yearlyEnd
    const ey = Number(yearlyEnd);
    return { queryStart: `${ey - 1}-01-01`, queryEnd: `${ey}-12-31` };
  }, [timePeriod, dailyStart, dailyEnd, monthlyYear, yearlyEnd]);

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

  // ── KPIs ──────────────────────────────────────
  const totalSales = useMemo(() => filteredSales.reduce((s, e) => s + e.amount, 0), [filteredSales]);
  const activeBrandCount = useMemo(() => {
    const seen = new Set<string>();
    filteredSales.forEach((e) => seen.add(e.brandId));
    return seen.size;
  }, [filteredSales]);

  const topBrand = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      map[e.brandId] = (map[e.brandId] ?? 0) + e.amount;
    });
    let best = "";
    let bestVal = 0;
    for (const [id, val] of Object.entries(map)) {
      if (val > bestVal) { best = id; bestVal = val; }
    }
    return best ? (brandMap.get(best)?.name ?? "—") : "—";
  }, [filteredSales, brandMap]);

  const topCategory = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      const cat = brandMap.get(e.brandId)?.category ?? "Unknown";
      map[cat] = (map[cat] ?? 0) + e.amount;
    });
    let best = "";
    let bestVal = 0;
    for (const [cat, val] of Object.entries(map)) {
      if (val > bestVal) { best = cat; bestVal = val; }
    }
    return best || "—";
  }, [filteredSales, brandMap]);

  // ── Active brand list for multi-line chart ────
  const activeBrandList = useMemo(() => {
    const seen = new Map<string, number>();
    filteredSales.forEach((e) => {
      seen.set(e.brandId, (seen.get(e.brandId) ?? 0) + e.amount);
    });
    return Array.from(seen.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => ({
        id,
        name: brandMap.get(id)?.name ?? "Unknown",
      }));
  }, [filteredSales, brandMap]);

  // ── Sales Trend by Brand (multi-line) ─────────
  const brandTrendData = useMemo(() => {
    if (timePeriod === "daily") {
      const allDates = dateRange(queryStart, queryEnd);
      // Build map: date -> brandId -> amount
      const map: Record<string, Record<string, number>> = {};
      allDates.forEach((d) => (map[d] = {}));
      filteredSales.forEach((e) => {
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
      filteredSales.forEach((e) => {
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
    // yearly
    const ey = Number(yearlyEnd);
    const years = [String(ey - 1), String(ey)];
    const map: Record<string, Record<string, number>> = {};
    years.forEach((y) => (map[y] = {}));
    filteredSales.forEach((e) => {
      const y = e.date.slice(0, 4);
      if (map[y]) {
        map[y][e.brandId] = (map[y][e.brandId] ?? 0) + e.amount;
      }
    });
    return years.map((y) => {
      const row: Record<string, any> = { label: y };
      activeBrandList.forEach((b) => {
        row[b.name] = map[y][b.id] ?? 0;
      });
      return row;
    });
  }, [timePeriod, filteredSales, activeBrandList, queryStart, queryEnd, monthlyYear, yearlyEnd]);

  // ── Brand comparison bar data ─────────────────
  const brandCompareData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      const name = brandMap.get(e.brandId)?.name ?? "Unknown";
      map[name] = (map[name] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredSales, brandMap]);

  // ── Category comparison data ──────────────────
  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      const cat = brandMap.get(e.brandId)?.category ?? "Unknown";
      map[cat] = (map[cat] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSales, brandMap]);

  // ── Sales by Counter (stacked by brand) ───────
  const counterStackedData = useMemo(() => {
    // counterName -> brandName -> amount
    const map: Record<string, Record<string, number>> = {};
    filteredSales.forEach((e) => {
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
  }, [filteredSales, posNameMap, brandMap]);

  // ── Sales by Channel ──────────────────────────
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

  // ── Render ────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Time Period */}
            <div className="flex gap-1">
              {(["daily", "monthly", "yearly"] as const).map((tp) => (
                <Button
                  key={tp}
                  variant={timePeriod === tp ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTimePeriod(tp)}
                >
                  {tp.charAt(0).toUpperCase() + tp.slice(1)}
                </Button>
              ))}
            </div>

            {/* Date controls based on time period */}
            {timePeriod === "daily" && (
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={dailyStart}
                    onChange={(e) => setDailyStart(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={dailyEnd}
                    onChange={(e) => setDailyEnd(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
              </div>
            )}

            {timePeriod === "monthly" && (
              <div>
                <Label className="text-xs text-muted-foreground">Year</Label>
                <Select value={monthlyYear} onValueChange={setMonthlyYear}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {timePeriod === "yearly" && (
              <div>
                <Label className="text-xs text-muted-foreground">Up to Year</Label>
                <Select value={yearlyEnd} onValueChange={setYearlyEnd}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  <ScrollArea className="max-h-[250px]">
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
                  </ScrollArea>
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
                      <ScrollArea className="max-h-[300px]">
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
                      </ScrollArea>
                    </>
                  )}
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
            <CardTitle className="text-sm font-medium">Brands Active</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeBrandCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Brand</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{topBrand}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Top Category</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">{topCategory}</div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Trend by Brand (multi-line) */}
      <Card>
        <CardHeader>
          <CardTitle>
            Sales Trend by Brand
            <Badge variant="outline" className="ml-2 font-normal">
              {timePeriod.charAt(0).toUpperCase() + timePeriod.slice(1)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {brandTrendData.length === 0 || activeBrandList.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data for selected filters
            </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <BarChart data={brandCompareData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
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
              <BarChart data={counterStackedData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="counter" width={110} tick={{ fontSize: 11 }} />
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
