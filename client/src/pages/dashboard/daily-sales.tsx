import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Counter, Brand, SalesEntry } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Package, Store, Calendar } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { CHART_COLORS } from "../dashboard";

export default function DailySales() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"] });
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: sales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?date=${selectedDate}`],
  });

  const activeCounters = counters.filter(c => c.isActive);
  const activeBrands = brands.filter(b => b.isActive);

  const totalAmount = sales.reduce((s, e) => s + e.amount, 0);
  const totalUnits = sales.reduce((s, e) => s + e.units, 0);
  const countersReporting = new Set(sales.map(e => e.counterId)).size;

  // Sales by brand for chart
  const brandSales = activeBrands.map((brand, i) => {
    const brandEntries = sales.filter(e => e.brandId === brand.id);
    return {
      name: brand.name,
      amount: brandEntries.reduce((s, e) => s + e.amount, 0),
      units: brandEntries.reduce((s, e) => s + e.units, 0),
      fill: CHART_COLORS[i % CHART_COLORS.length],
    };
  }).filter(b => b.amount > 0).sort((a, b) => b.amount - a.amount);

  // Sales by counter table data
  const counterData = activeCounters.map(counter => {
    const counterEntries = sales.filter(e => e.counterId === counter.id);
    const brandBreakdown: Record<string, { units: number; amount: number }> = {};
    for (const entry of counterEntries) {
      const brand = activeBrands.find(b => b.id === entry.brandId);
      if (brand) {
        if (!brandBreakdown[brand.name]) brandBreakdown[brand.name] = { units: 0, amount: 0 };
        brandBreakdown[brand.name].units += entry.units;
        brandBreakdown[brand.name].amount += entry.amount;
      }
    }
    return {
      counter,
      totalAmount: counterEntries.reduce((s, e) => s + e.amount, 0),
      totalUnits: counterEntries.reduce((s, e) => s + e.units, 0),
      brandBreakdown,
    };
  }).filter(c => c.totalAmount > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Daily Sales</h2>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40 h-9"
            data-testid="input-daily-date"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Sales</p>
                <p className="text-lg font-bold tabular-nums" data-testid="text-total-sales">
                  HK${totalAmount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-chart-2/10 flex items-center justify-center">
                <Package className="w-5 h-5 text-[hsl(173,58%,39%)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Units</p>
                <p className="text-lg font-bold tabular-nums" data-testid="text-total-units">{totalUnits}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-chart-3/10 flex items-center justify-center">
                <Store className="w-5 h-5 text-[hsl(43,74%,49%)]" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Counters Reporting</p>
                <p className="text-lg font-bold tabular-nums" data-testid="text-counters-reporting">
                  {countersReporting} / {activeCounters.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart: Sales by Brand */}
      {brandSales.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales by Brand (HK$)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={brandSales} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={75} />
                <Tooltip
                  formatter={(value: number) => [`HK$${value.toLocaleString()}`, "Amount"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {brandSales.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table: Sales by Counter */}
      {counterData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Sales by Counter</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Counter</th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">Units</th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">Amount</th>
                  <th className="text-left py-2 pl-4 font-medium text-muted-foreground">Brand Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {counterData.map(row => (
                  <tr key={row.counter.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{row.counter.name}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{row.totalUnits}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-medium">
                      HK${row.totalAmount.toLocaleString()}
                    </td>
                    <td className="py-2.5 pl-4">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(row.brandBreakdown).map(([name, data]) => (
                          <Badge key={name} variant="secondary" className="text-xs tabular-nums">
                            {name}: {data.units}u / ${data.amount.toLocaleString()}
                          </Badge>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {sales.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No sales data for {selectedDate}</p>
        </div>
      )}
    </div>
  );
}
