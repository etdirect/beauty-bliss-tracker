import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Counter, Brand, SalesEntry } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tag } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { CHART_COLORS } from "../dashboard";

export default function BrandAnalytics() {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [selectedBrandIds, setSelectedBrandIds] = useState<Set<string>>(new Set());

  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"] });
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${startDate}&endDate=${endDate}`],
  });

  const activeBrands = brands.filter(b => b.isActive);

  const toggleBrand = (id: string) => {
    setSelectedBrandIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedBrands = activeBrands.filter(b => selectedBrandIds.has(b.id));

  // Build daily trend data
  const trendData = useMemo(() => {
    if (selectedBrands.length === 0) return [];
    const dateMap: Record<string, Record<string, number>> = {};
    for (const entry of sales) {
      if (!selectedBrandIds.has(entry.brandId)) continue;
      if (!dateMap[entry.date]) dateMap[entry.date] = {};
      const brand = activeBrands.find(b => b.id === entry.brandId);
      if (brand) {
        dateMap[entry.date][brand.name] = (dateMap[entry.date][brand.name] || 0) + entry.amount;
      }
    }
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date: date.slice(5), ...data }));
  }, [sales, selectedBrandIds, activeBrands]);

  // Brand summary table
  const brandSummary = activeBrands.map((brand, i) => {
    const brandEntries = sales.filter(e => e.brandId === brand.id);
    const totalUnits = brandEntries.reduce((s, e) => s + e.units, 0);
    const totalAmount = brandEntries.reduce((s, e) => s + e.amount, 0);
    const daysWithSales = new Set(brandEntries.map(e => e.date)).size;
    return {
      brand,
      totalUnits,
      totalAmount,
      avgDaily: daysWithSales > 0 ? Math.round(totalAmount / daysWithSales) : 0,
      daysWithSales,
      color: CHART_COLORS[i % CHART_COLORS.length],
    };
  }).sort((a, b) => b.totalAmount - a.totalAmount);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Brand Analytics</h2>
        <div className="flex items-center gap-2">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 h-9" />
          <span className="text-muted-foreground text-sm">to</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 h-9" />
        </div>
      </div>

      {/* Brand selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Select brands to compare</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {activeBrands.map((brand, i) => (
              <label
                key={brand.id}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                  selectedBrandIds.has(brand.id) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
                }`}
              >
                <Checkbox
                  checked={selectedBrandIds.has(brand.id)}
                  onCheckedChange={() => toggleBrand(brand.id)}
                  className="w-3.5 h-3.5"
                />
                {brand.name}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Daily Sales Trend (HK$)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                <Tooltip formatter={(v: number) => [`HK$${v.toLocaleString()}`, ""]} />
                <Legend />
                {selectedBrands.map((brand, i) => (
                  <Line
                    key={brand.id}
                    type="monotone"
                    dataKey={brand.name}
                    stroke={CHART_COLORS[activeBrands.indexOf(brand) % CHART_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Summary Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Brand Performance Summary</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Brand</th>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Category</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Total Units</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Total Sales</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Avg Daily</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Days Active</th>
              </tr>
            </thead>
            <tbody>
              {brandSummary.map(row => (
                <tr key={row.brand.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="font-medium">{row.brand.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    <Badge variant="secondary" className="text-xs">{row.brand.category}</Badge>
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{row.totalUnits}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums font-medium">
                    HK${row.totalAmount.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    HK${row.avgDaily.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{row.daysWithSales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
