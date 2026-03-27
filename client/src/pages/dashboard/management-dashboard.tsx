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
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  DollarSign, ShoppingCart, TrendingUp, Package,
  Filter, ChevronDown,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "../dashboard";

// ─── Helpers ────────────────────────────────────────

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function monthStartStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** All dates YYYY-MM-DD between start and end inclusive */
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

// ─── Component ──────────────────────────────────────

export default function ManagementDashboard() {
  // ── Filter state ──────────────────────────────
  const [startDate, setStartDate] = useState(monthStartStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [viewMode, setViewMode] = useState<"daily" | "monthly">("daily");
  const [selectedChannels, setSelectedChannels] = useState<Set<string> | null>(null); // null = all
  const [selectedCounters, setSelectedCounters] = useState<Set<string> | null>(null); // null = all

  // ── Queries ───────────────────────────────────
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${startDate}&endDate=${endDate}`],
  });

  const { data: posLocations = [] } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  // ── Derived: channels & grouped POS ───────────
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
    // Intersect with filteredPos (channel filter takes precedence)
    const posSet = new Set(filteredPos.map((p) => p.id));
    return new Set(Array.from(selectedCounters).filter((id) => posSet.has(id)));
  }, [selectedCounters, filteredPos]);

  // ── Filtered sales ────────────────────────────
  const filteredSales = useMemo(
    () => sales.filter((s) => activeCounterIds.has(s.counterId)),
    [sales, activeCounterIds],
  );

  // ── KPIs ──────────────────────────────────────
  const totalSales = useMemo(() => filteredSales.reduce((s, e) => s + e.amount, 0), [filteredSales]);
  const totalOrders = useMemo(() => filteredSales.reduce((s, e) => s + (e.orders ?? 0), 0), [filteredSales]);
  const totalUnits = useMemo(() => filteredSales.reduce((s, e) => s + e.units, 0), [filteredSales]);
  const atv = totalOrders > 0 ? totalSales / totalOrders : null;
  const upt = totalOrders > 0 ? totalUnits / totalOrders : null;

  // ── Trend chart data ──────────────────────────
  const trendData = useMemo(() => {
    if (viewMode === "daily") {
      const allDates = dateRange(startDate, endDate);
      const map: Record<string, number> = {};
      allDates.forEach((d) => (map[d] = 0));
      filteredSales.forEach((e) => {
        if (map[e.date] !== undefined) map[e.date] += e.amount;
      });
      return allDates.map((d) => ({
        label: d.slice(5), // MM-DD
        amount: map[d],
      }));
    }
    // Monthly
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      const ym = e.date.slice(0, 7);
      map[ym] = (map[ym] ?? 0) + e.amount;
    });
    const months = Object.keys(map).sort();
    // Fill gaps
    if (months.length > 0) {
      const [sy, sm] = startDate.slice(0, 7).split("-").map(Number);
      const [ey, em] = endDate.slice(0, 7).split("-").map(Number);
      const all: string[] = [];
      let y = sy, m = sm;
      while (y < ey || (y === ey && m <= em)) {
        all.push(`${y}-${String(m).padStart(2, "0")}`);
        m++;
        if (m > 12) { m = 1; y++; }
      }
      return all.map((ym) => {
        const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
        return {
          label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
          amount: map[ym] ?? 0,
        };
      });
    }
    return [];
  }, [filteredSales, viewMode, startDate, endDate]);

  // ── Channel pie data ──────────────────────────
  const posChannelMap = useMemo(() => {
    const m = new Map<string, string>();
    posLocations.forEach((p) => m.set(p.id, p.salesChannel));
    return m;
  }, [posLocations]);

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

  // ── Counter bar data ──────────────────────────
  const posNameMap = useMemo(() => {
    const m = new Map<string, string>();
    posLocations.forEach((p) => m.set(p.id, p.storeName));
    return m;
  }, [posLocations]);

  const counterBarData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      const name = posNameMap.get(e.counterId) ?? "Unknown";
      map[name] = (map[name] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 15);
  }, [filteredSales, posNameMap]);

  // ── Brand bar data ────────────────────────────
  const brandMap = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [brands]);

  const brandBarData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredSales.forEach((e) => {
      const name = brandMap.get(e.brandId) ?? "Unknown";
      map[name] = (map[name] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [filteredSales, brandMap]);

  // ── Channel toggle helpers ────────────────────
  function toggleChannel(ch: string) {
    setSelectedChannels((prev) => {
      const current = prev ?? new Set(channels);
      const next = new Set(current);
      if (next.has(ch)) next.delete(ch);
      else next.add(ch);
      return next;
    });
    // Reset counter selection when channels change
    setSelectedCounters(null);
  }

  function selectAllChannels() {
    setSelectedChannels(null);
    setSelectedCounters(null);
  }

  function clearAllChannels() {
    setSelectedChannels(new Set());
    setSelectedCounters(new Set());
  }

  // ── Counter toggle helpers ────────────────────
  function toggleCounter(id: string) {
    setSelectedCounters((prev) => {
      const current = prev ?? new Set(filteredPos.map((p) => p.id));
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllCounters() {
    setSelectedCounters(null);
  }

  function clearAllCounters() {
    setSelectedCounters(new Set());
  }

  const channelCountLabel = selectedChannels === null
    ? `All (${channels.length})`
    : `${activeChannels.size} of ${channels.length}`;

  const counterCountLabel = selectedCounters === null
    ? `All (${filteredPos.length})`
    : `${activeCounterIds.size} of ${filteredPos.length}`;

  // Group filtered POS by channel for the counter popover
  const posGroupedByChannel = useMemo(() => {
    const groups: Record<string, PosLocation[]> = {};
    filteredPos.forEach((p) => {
      (groups[p.salesChannel] ??= []).push(p);
    });
    return groups;
  }, [filteredPos]);

  // ── Render ────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Date range */}
            <div className="flex items-end gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
            </div>

            {/* View mode */}
            <div className="flex gap-1">
              <Button
                variant={viewMode === "daily" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("daily")}
              >
                Daily
              </Button>
              <Button
                variant={viewMode === "monthly" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("monthly")}
              >
                Monthly
              </Button>
            </div>

            {/* Channel filter popover */}
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
                      <button className="text-primary underline" onClick={selectAllChannels}>All</button>
                      <button className="text-primary underline" onClick={clearAllChannels}>None</button>
                    </div>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto pr-1">
                    <div className="space-y-2">
                      {channels.map((ch) => (
                        <label key={ch} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={activeChannels.has(ch)}
                            onCheckedChange={() => toggleChannel(ch)}
                          />
                          {ch}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Counter filter popover */}
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
                      <button className="text-primary underline" onClick={selectAllCounters}>All</button>
                      <button className="text-primary underline" onClick={clearAllCounters}>None</button>
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
                                <Checkbox
                                  checked={activeCounterIds.has(loc.id)}
                                  onCheckedChange={() => toggleCounter(loc.id)}
                                />
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
              {viewMode === "daily" ? "Daily" : "Monthly"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data for selected filters
            </div>
          ) : viewMode === "daily" ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval={trendData.length > 60 ? Math.floor(trendData.length / 15) : "preserveStartEnd"}
                />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                <Line
                  type="monotone"
                  dataKey="amount"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                <Bar dataKey="amount" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Channel Pie + Counter Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        {/* Sales by Counter */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by Counter</CardTitle>
          </CardHeader>
          <CardContent>
            {counterBarData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                No data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, counterBarData.length * 32)}>
                <BarChart data={counterBarData} layout="vertical" margin={{ left: 120 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                  <Bar dataKey="amount" fill={CHART_COLORS[4]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sales by Brand */}
      <Card>
        <CardHeader>
          <CardTitle>Sales by Brand</CardTitle>
        </CardHeader>
        <CardContent>
          {brandBarData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
              No data
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(300, brandBarData.length * 32)}>
              <BarChart data={brandBarData} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [fmtCurrency(v), "Sales"]} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {brandBarData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
