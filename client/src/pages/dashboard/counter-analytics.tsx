import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Counter, Brand, SalesEntry } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Store } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { CHART_COLORS } from "../dashboard";

export default function CounterAnalytics() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [selectedCounterId, setSelectedCounterId] = useState<string>("all");

  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"] });
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${startDate}&endDate=${endDate}`],
  });

  const activeCounters = counters.filter(c => c.isActive);
  const activeBrands = brands.filter(b => b.isActive);

  const filteredSales = selectedCounterId === "all" ? sales : sales.filter(e => e.counterId === selectedCounterId);

  // Stacked bar: each counter, breakdown by brand
  const counterBrandData = useMemo(() => {
    return activeCounters.map(counter => {
      const counterEntries = sales.filter(e => e.counterId === counter.id);
      const row: any = { name: counter.name.replace("LOG-ON ", "").replace("FACESSS ", "F·") };
      for (const brand of activeBrands) {
        const brandEntries = counterEntries.filter(e => e.brandId === brand.id);
        row[brand.name] = brandEntries.reduce((s, e) => s + e.amount, 0);
      }
      row._total = counterEntries.reduce((s, e) => s + e.amount, 0);
      return row;
    }).filter(r => r._total > 0).sort((a, b) => b._total - a._total);
  }, [sales, activeCounters, activeBrands]);

  // Top brands with sales for the legend
  const brandsWithSales = activeBrands.filter(brand =>
    sales.some(e => e.brandId === brand.id)
  );

  // Counter performance summary
  const counterSummary = activeCounters.map(counter => {
    const counterEntries = sales.filter(e => e.counterId === counter.id);
    const totalUnits = counterEntries.reduce((s, e) => s + e.units, 0);
    const totalAmount = counterEntries.reduce((s, e) => s + e.amount, 0);
    const daysWithSales = new Set(counterEntries.map(e => e.date)).size;
    const topBrand = activeBrands.reduce((best, brand) => {
      const amt = counterEntries.filter(e => e.brandId === brand.id).reduce((s, e) => s + e.amount, 0);
      return amt > best.amount ? { name: brand.name, amount: amt } : best;
    }, { name: "-", amount: 0 });
    return {
      counter,
      totalUnits,
      totalAmount,
      avgDaily: daysWithSales > 0 ? Math.round(totalAmount / daysWithSales) : 0,
      daysWithSales,
      topBrand: topBrand.name,
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Counter Analytics</h2>
        <div className="flex items-center gap-2">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 h-9" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 h-9" />
        </div>
      </div>

      {/* Stacked Bar Chart */}
      {counterBrandData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales by Counter & Brand (HK$)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={counterBrandData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={95} />
                <Tooltip formatter={(v: number, name: string) => [`HK$${v.toLocaleString()}`, name]} />
                {brandsWithSales.map((brand, i) => (
                  <Bar
                    key={brand.id}
                    dataKey={brand.name}
                    stackId="a"
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-3">
              {brandsWithSales.map((brand, i) => (
                <div key={brand.id} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                  {brand.name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Counter Summary Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Counter Performance Summary</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Counter</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Units</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Total Sales</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg Daily</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Days</th>
                <th className="text-left py-2 pl-4 font-medium text-muted-foreground">Top Brand</th>
              </tr>
            </thead>
            <tbody>
              {counterSummary.map(row => (
                <tr key={row.counter.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{row.counter.name}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{row.totalUnits}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">HK${row.totalAmount.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">HK${row.avgDaily.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{row.daysWithSales}</td>
                  <td className="py-2.5 pl-4">
                    <Badge variant="secondary" className="text-xs">{row.topBrand}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
