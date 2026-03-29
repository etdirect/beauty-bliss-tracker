import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SalesEntry, Brand, Promotion, PromotionResult } from "@shared/schema";
import { useAuth } from "@/App";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign, ShoppingCart, TrendingUp, Package, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { CHART_COLORS } from "./dashboard";

// ─── Helpers ────────────────────────────────────────

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getDefaultMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function daysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

function startOf(ym: string) { return `${ym}-01`; }
function endOf(ym: string) {
  return `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
}

function sixMonthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 6, 1);
  const sy = start.getFullYear();
  const sm = String(start.getMonth() + 1).padStart(2, "0");
  return { start: `${sy}-${sm}-01`, end: endOf(ym) };
}

// ─── Component ──────────────────────────────────────

export default function BADashboard() {
  const { user } = useAuth();
  const assignedPos = user?.assignedPos ?? [];
  const posIds = useMemo(() => assignedPos.map((p: any) => p.id), [assignedPos]);

  const [selectedMonth, setSelectedMonth] = useState(getDefaultMonth);

  const monthStart = startOf(selectedMonth);
  const monthEnd = endOf(selectedMonth);
  // Fetch a wide range (2 years back from selected month + 1 month ahead) to derive all available months
  const { start: trendStart, end: trendEnd } = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const start = new Date(y - 2, m - 1, 1); // 2 years back
    const end = new Date(y, m, 0); // end of next month
    const sy = start.getFullYear();
    const sm = String(start.getMonth() + 1).padStart(2, "0");
    const ey = end.getFullYear();
    const em = String(end.getMonth() + 1).padStart(2, "0");
    const ed = String(end.getDate()).padStart(2, "0");
    return { start: `${sy}-${sm}-01`, end: `${ey}-${em}-${ed}` };
  }, [selectedMonth]);

  // ─── Queries ────────────────────────────────────
  const { data: monthlySales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${monthStart}&endDate=${monthEnd}`],
  });

  const { data: trendSales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${trendStart}&endDate=${trendEnd}`],
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

  const isPartTime = user?.role === "part_time";

  // ─── Filtered data (only user's POS, and for part-time: only their submissions) ───────────
  const mySales = useMemo(() => {
    let entries = monthlySales.filter((s) => posIds.includes(s.counterId));
    if (isPartTime) entries = entries.filter((s) => s.submittedBy === user?.id);
    return entries;
  }, [monthlySales, posIds, isPartTime, user?.id]);

  const myTrendSales = useMemo(() => {
    let entries = trendSales.filter((s) => posIds.includes(s.counterId));
    if (isPartTime) entries = entries.filter((s) => s.submittedBy === user?.id);
    return entries;
  }, [trendSales, posIds, isPartTime, user?.id]);

  // Derive month options from the trend data + always include current month
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    months.add(getDefaultMonth()); // always include current month
    myTrendSales.forEach((s) => months.add(s.date.slice(0, 7)));
    mySales.forEach((s) => months.add(s.date.slice(0, 7)));
    return Array.from(months)
      .sort()
      .reverse()
      .map((ym) => {
        const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1);
        return { value: ym, label: d.toLocaleString("en-US", { month: "long", year: "numeric" }) };
      });
  }, [myTrendSales, mySales]);

  // ─── KPIs ───────────────────────────────────────
  const totalSales = useMemo(() => mySales.reduce((s, e) => s + e.amount, 0), [mySales]);
  const totalOrders = useMemo(() => mySales.reduce((s, e) => s + (e.orders ?? 0), 0), [mySales]);
  const totalUnits = useMemo(() => mySales.reduce((s, e) => s + (e.units ?? 0), 0), [mySales]);
  const atv = totalOrders > 0 ? totalSales / totalOrders : null;
  const upt = totalOrders > 0 ? totalUnits / totalOrders : null;

  // ─── Daily Sales chart data ─────────────────────
  const dailyChartData = useMemo(() => {
    const days = daysInMonth(selectedMonth);
    const map: Record<string, number> = {};
    for (let d = 1; d <= days; d++) {
      const key = `${selectedMonth}-${String(d).padStart(2, "0")}`;
      map[key] = 0;
    }
    mySales.forEach((e) => {
      if (map[e.date] !== undefined) map[e.date] += e.amount;
    });
    return Object.entries(map).map(([date, amount]) => ({
      date: date.slice(8), // DD
      amount,
    }));
  }, [mySales, selectedMonth]);

  // ─── Monthly Trend chart data ───────────────────
  const monthlyTrendData = useMemo(() => {
    const map: Record<string, number> = {};
    myTrendSales.forEach((e) => {
      const ym = e.date.slice(0, 7);
      map[ym] = (map[ym] ?? 0) + e.amount;
    });
    const [y, m] = selectedMonth.split("-").map(Number);
    const result: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(y, m - 1 - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short" });
      result.push({ month: label, amount: map[ym] ?? 0 });
    }
    return result;
  }, [myTrendSales, selectedMonth]);

  // ─── Brand pie data ─────────────────────────────
  const brandMap = useMemo(() => {
    const m = new Map<string, string>();
    allBrands.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [allBrands]);

  const brandPieData = useMemo(() => {
    const map: Record<string, number> = {};
    mySales.forEach((e) => {
      const name = brandMap.get(e.brandId) ?? "Unknown";
      map[name] = (map[name] ?? 0) + e.amount;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [mySales, brandMap]);

  // ─── Promotion performance table ────────────────
  const promoTableData = useMemo(() => {
    const activePromos = allPromotions.filter((p) => {
      if (!p.isActive) return false;
      return p.startDate <= monthEnd && p.endDate >= monthStart;
    });

    const myResults = allPromoResults.filter(
      (r) => posIds.includes(r.counterId) && r.date >= monthStart && r.date <= monthEnd,
    );

    return activePromos.map((promo) => {
      const results = myResults.filter((r) => r.promotionId === promo.id);
      const totalGwp = results.reduce((s, r) => s + r.gwpGiven, 0);
      const brandName = brandMap.get(promo.brandId ?? "") ?? "All Brands";
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
  }, [allPromotions, allPromoResults, posIds, monthStart, monthEnd, brandMap]);

  // ─── No POS assigned guard ──────────────────────
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

  // ─── Render ─────────────────────────────────────
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

      {isPartTime && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          Showing only your submitted sales entries. Days without your submissions are not displayed.
        </div>
      )}

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

      {/* Daily Sales Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Sales</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
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
        </CardContent>
      </Card>

      {/* Monthly Trend + Brand Pie side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Sales Trend</CardTitle>
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

        <Card>
          <CardHeader>
            <CardTitle>Sales by Brand</CardTitle>
          </CardHeader>
          <CardContent>
            {brandPieData.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No sales data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={brandPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    dataKey="value"
                    nameKey="name"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {brandPieData.map((_, i) => (
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

      {/* Promotion Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>Promotion Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {promoTableData.length === 0 ? (
            <p className="text-muted-foreground text-sm">No active promotions this month.</p>
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
    </div>
  );
}
