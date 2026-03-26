import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Brand, SalesEntry } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

function getMonthOptions() {
  const months: Array<{ label: string; value: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    months.push({ label, value });
  }
  return months;
}

function getMonthRange(monthStr: string) {
  const [year, month] = monthStr.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function MonthlyComparison() {
  const monthOptions = getMonthOptions();
  const [monthA, setMonthA] = useState(monthOptions[0].value);
  const [monthB, setMonthB] = useState(monthOptions[1]?.value || monthOptions[0].value);

  const rangeA = getMonthRange(monthA);
  const rangeB = getMonthRange(monthB);

  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: salesA = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${rangeA.start}&endDate=${rangeA.end}`],
  });
  const { data: salesB = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${rangeB.start}&endDate=${rangeB.end}`],
  });

  const activeBrands = brands.filter(b => b.isActive);

  const labelA = monthOptions.find(m => m.value === monthA)?.label || monthA;
  const labelB = monthOptions.find(m => m.value === monthB)?.label || monthB;

  const comparisonData = useMemo(() => {
    return activeBrands.map(brand => {
      const amountA = salesA.filter(e => e.brandId === brand.id).reduce((s, e) => s + e.amount, 0);
      const unitsA = salesA.filter(e => e.brandId === brand.id).reduce((s, e) => s + e.units, 0);
      const amountB = salesB.filter(e => e.brandId === brand.id).reduce((s, e) => s + e.amount, 0);
      const unitsB = salesB.filter(e => e.brandId === brand.id).reduce((s, e) => s + e.units, 0);
      const change = amountB > 0 ? ((amountA - amountB) / amountB) * 100 : amountA > 0 ? 100 : 0;
      return { brand, amountA, unitsA, amountB, unitsB, change };
    }).filter(r => r.amountA > 0 || r.amountB > 0).sort((a, b) => b.amountA - a.amountA);
  }, [salesA, salesB, activeBrands]);

  const chartData = comparisonData.map(r => ({
    name: r.brand.name,
    [labelA]: r.amountA,
    [labelB]: r.amountB,
  }));

  const totalA = comparisonData.reduce((s, r) => s + r.amountA, 0);
  const totalB = comparisonData.reduce((s, r) => s + r.amountB, 0);
  const totalChange = totalB > 0 ? ((totalA - totalB) / totalB) * 100 : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Monthly Comparison</h2>
        <div className="flex items-center gap-2">
          <Select value={monthA} onValueChange={setMonthA}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-sm">vs</span>
          <Select value={monthB} onValueChange={setMonthB}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Total comparison KPI */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{labelA}</p>
            <p className="text-lg font-bold tabular-nums">HK${totalA.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">{labelB}</p>
            <p className="text-lg font-bold tabular-nums">HK${totalB.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Change</p>
            <div className="flex items-center justify-center gap-1">
              {totalChange > 0 ? <TrendingUp className="w-4 h-4 text-green-600" /> :
               totalChange < 0 ? <TrendingDown className="w-4 h-4 text-red-600" /> :
               <Minus className="w-4 h-4 text-muted-foreground" />}
              <p className={`text-lg font-bold tabular-nums ${totalChange > 0 ? "text-green-600" : totalChange < 0 ? "text-red-600" : ""}`}>
                {totalChange > 0 ? "+" : ""}{totalChange.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Side-by-side Chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales by Brand — {labelA} vs {labelB}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v.toLocaleString()}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={75} />
                <Tooltip formatter={(v: number) => [`HK$${v.toLocaleString()}`, ""]} />
                <Legend />
                <Bar dataKey={labelA} fill="hsl(340, 65%, 47%)" radius={[0, 3, 3, 0]} />
                <Bar dataKey={labelB} fill="hsl(340, 30%, 75%)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detailed Comparison Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Brand Comparison Detail</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Brand</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">{labelA} Units</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">{labelA} Sales</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">{labelB} Units</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">{labelB} Sales</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground">Change</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map(row => (
                <tr key={row.brand.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{row.brand.name}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{row.unitsA}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">HK${row.amountA.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{row.unitsB}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">HK${row.amountB.toLocaleString()}</td>
                  <td className="py-2.5 px-2 text-right">
                    <Badge variant={row.change > 0 ? "default" : row.change < 0 ? "destructive" : "secondary"} className="text-xs tabular-nums">
                      {row.change > 0 ? "+" : ""}{row.change.toFixed(1)}%
                    </Badge>
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
