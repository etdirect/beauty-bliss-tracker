import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHk, hkMonth, previousMonths } from "@shared/hkTime";
import { median } from "@shared/commission";

function brandFinal(starting: number, allMultiplier: number, multiplier: string, amount: string) {
  if (amount.trim() !== "" && !Number.isNaN(Number(amount))) return Number(amount);
  const brandMul = Number(multiplier);
  const allMul = Number(allMultiplier);
  return starting * (Number.isFinite(allMul) ? allMul : 1) * (Number.isFinite(brandMul) ? brandMul : 1);
}

export default function TargetsPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const [counterId, setCounterId] = useState("");
  const [monthCount, setMonthCount] = useState("3");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [allAdj, setAllAdj] = useState("1");
  const [brandAdj, setBrandAdj] = useState<Record<string, string>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { data: counters = [] } = useQuery<any[]>({ queryKey: ["/api/commission/counters"] });
  const counter = counters.find(c => c.id === counterId) ?? counters[0];
  const activeId = counter?.id ?? "";
  useEffect(() => { if (!counterId && counters[0]) setCounterId(counters[0].id); }, [counters, counterId]);

  const historyMonths = useMemo(() => {
    if (/^\d{4}-\d{2}$/.test(fromMonth) && /^\d{4}-\d{2}$/.test(toMonth) && fromMonth <= toMonth) {
      const out: string[] = [];
      let cursor = fromMonth;
      while (cursor <= toMonth && out.length < 24) {
        out.push(cursor);
        const [y, m] = cursor.split("-").map(Number);
        const next = new Date(Date.UTC(y, m, 1));
        cursor = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
      }
      return out;
    }
    return previousMonths(month, Math.min(24, Math.max(1, Number(monthCount) || 3)));
  }, [month, monthCount, fromMonth, toMonth]);

  const { data } = useQuery<any>({
    queryKey: ["commission-targets", month, activeId, historyMonths.join(",")],
    enabled: !!activeId,
    queryFn: async () => {
      const params = new URLSearchParams({ month, counterId: activeId, months: monthCount });
      if (fromMonth && toMonth) {
        params.set("from", fromMonth);
        params.set("to", toMonth);
      }
      const res = await fetch(`/api/commission/targets?${params}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (!data?.ref) return;
    setAllAdj(String(data.allAdj ?? 1));
    const nextAdj: Record<string, string> = {};
    const nextAmt: Record<string, string> = {};
    for (const row of data.ref.rows ?? []) {
      nextAdj[row.brandId] = String(data.brandAdjustments?.[row.brandId] ?? 1);
      const manual = data.manualAmounts?.[row.brandId];
      nextAmt[row.brandId] = manual == null ? "" : String(manual);
    }
    setBrandAdj(nextAdj);
    setAmounts(nextAmt);
  }, [data]);

  const rows = data?.ref?.rows ?? [];
  const priorityRows = rows.filter((r: any) => r.priority);
  const otherRows = rows.filter((r: any) => !r.priority);
  const allMultiplier = Number(allAdj);
  const liveFinal = (row: any) => {
    const built = data?.built?.brands?.find((b: any) => b.brandId === row.brandId);
    const starting = row.priority ? (built?.startingTarget ?? 0) : row.median;
    return { starting, final: brandFinal(starting, Number.isFinite(allMultiplier) ? allMultiplier : 1, brandAdj[row.brandId] ?? "1", amounts[row.brandId] ?? "") };
  };
  const liveCounter = rows.reduce((sum: number, row: any) => sum + liveFinal(row).final, 0);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const adjustments: Record<string, number> = {};
      const manualAmounts: Record<string, string> = {};
      for (const row of rows) {
        adjustments[row.brandId] = Number(brandAdj[row.brandId] || 1);
        manualAmounts[row.brandId] = amounts[row.brandId] ?? "";
      }
      const res = await apiRequest("PUT", "/api/commission/targets", {
        counterId: activeId,
        month,
        publish,
        allBrandsAdjustment: Number.isFinite(allMultiplier) ? allMultiplier : 1,
        brandAdjustments: adjustments,
        manualAmounts,
        historyMonths,
      });
      return res.json();
    },
    onSuccess: (body: any) => {
      queryClient.invalidateQueries({ queryKey: ["commission-targets"] });
      toast({ title: body?.belowMinimum ? "Saved. The counter target is below the minimum." : "Targets saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const setPriority = useMutation({
    mutationFn: async ({ brandId, isPriority }: { brandId: string; isPriority: boolean }) => {
      const shops = (counter?.members ?? []).filter((m: any) => m.posId);
      await Promise.all(shops.map((m: any) => apiRequest("PUT", "/api/commission/priority", { brandId, posId: m.posId, isPriority })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["commission-targets"] }),
    onError: (err: Error) => toast({ title: "Could not update priority", description: err.message, variant: "destructive" }),
  });

  const renderRows = (list: any[], title: string) => (
    <>
      <tr className="bg-muted/70">
        <td colSpan={8 + (data?.ref?.months?.length ?? 0)} className="p-2 text-xs font-semibold uppercase tracking-wide">{title}</td>
      </tr>
      {list.map((row: any) => {
        const figures = liveFinal(row);
        const prev = data?.prev?.find?.((p: any) => p.brandId === row.brandId && p.status === "published");
        return (
          <tr key={row.brandId} className="border-t">
            <td className="p-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={!!row.priority}
                  onCheckedChange={checked => setPriority.mutate({ brandId: row.brandId, isPriority: !!checked })}
                />
                <span>{row.name}</span>
              </label>
            </td>
            {row.months.map((n: number, i: number) => <td key={i} className="p-2 text-right tabular-nums">{formatHk(n)}</td>)}
            <td className="p-2 text-right tabular-nums">{formatHk(row.median)}</td>
            <td className="p-2 text-right tabular-nums">{formatHk(figures.starting)}</td>
            <td className="p-2 text-right">
              <Input className="h-8 w-20 ml-auto text-right" value={brandAdj[row.brandId] ?? "1"} onChange={e => setBrandAdj(prevMap => ({ ...prevMap, [row.brandId]: e.target.value }))} />
            </td>
            <td className="p-2 text-right">
              <Input className="h-8 w-28 ml-auto text-right" inputMode="decimal" placeholder="Optional" value={amounts[row.brandId] ?? ""} onChange={e => setAmounts(prevMap => ({ ...prevMap, [row.brandId]: e.target.value }))} />
            </td>
            <td className="p-2 text-right tabular-nums">{formatHk(figures.final)}</td>
            <td className="p-2 text-right tabular-nums">{prev ? formatHk(prev.finalTarget) : "—"}</td>
          </tr>
        );
      })}
      {list.length === 0 && (
        <tr><td colSpan={8} className="p-2 text-muted-foreground">None</td></tr>
      )}
      {list.length > 0 && (() => {
        const monthCount = data?.ref?.months?.length ?? 0;
        const monthSums = Array.from({ length: monthCount }, (_, i) => list.reduce((sum: number, row: any) => sum + (row.months[i] ?? 0), 0));
        const startingSum = list.reduce((sum: number, row: any) => sum + liveFinal(row).starting, 0);
        const finalSum = list.reduce((sum: number, row: any) => sum + liveFinal(row).final, 0);
        return (
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="p-2">Subtotal</td>
            {monthSums.map((n, i) => <td key={i} className="p-2 text-right tabular-nums">{formatHk(n)}</td>)}
            <td className="p-2 text-right tabular-nums">{formatHk(median(monthSums))}</td>
            <td className="p-2 text-right tabular-nums">{formatHk(startingSum)}</td>
            <td />
            <td />
            <td className="p-2 text-right tabular-nums">{formatHk(finalSum)}</td>
            <td />
          </tr>
        );
      })()}
    </>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold">Target setting</h2>
          <p className="text-sm text-muted-foreground">Tick a brand to make it a priority brand. A multiplier of 1.2 raises the final by 20%. If you type an amount, that amount is the final.</p>
        </div>
        <div>
          <Label className="text-xs">Target month</Label>
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        </div>
        <Select value={activeId} onValueChange={setCounterId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Counter" /></SelectTrigger>
          <SelectContent>{counters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">How many months</Label>
          <Select value={monthCount} onValueChange={setMonthCount}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["1", "3", "6", "12"].map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Or from</Label>
          <Input type="month" value={fromMonth} onChange={e => setFromMonth(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">To</Label>
          <Input type="month" value={toMonth} onChange={e => setToMonth(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">All-brand multiplier</Label>
          <Input className="w-28" value={allAdj} onChange={e => setAllAdj(e.target.value)} />
        </div>
      </div>

      {data?.ref && (
        <Card>
          <CardContent className="p-4 grid sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted-foreground">Counter median</div><div className="font-semibold">{formatHk(data.ref.counterMedian)}</div></div>
            <div><div className="text-muted-foreground">Starting target</div><div className="font-semibold">{formatHk(data.starting)}</div></div>
            <div>
              <div className="text-muted-foreground">Final counter target</div>
              <div className="font-semibold">{formatHk(liveCounter)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {data.lastMonthSales > 0
                  ? `${Math.round((liveCounter / data.lastMonthSales) * 100)}% of ${data.lastMonth} ${data.lastMonthBasis === "actual" ? "actual" : "typed sales"} (${formatHk(data.lastMonthSales)})`
                  : `No sales recorded for ${data.lastMonth ?? "last month"}`}
              </div>
            </div>
            {counter && liveCounter < counter.minTarget && <p className="sm:col-span-3 text-amber-700">This is below the minimum target. You can still save it.</p>}
            {data.built?.poolNegative && <p className="sm:col-span-3 text-amber-700">The priority pool is negative, so this cannot be published yet.</p>}
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Brand</th>
              {(data?.ref?.months ?? []).map((m: string) => <th key={m} className="text-right p-2">{m}</th>)}
              <th className="text-right p-2">Median</th>
              <th className="text-right p-2">Starting</th>
              <th className="text-right p-2">Multiplier</th>
              <th className="text-right p-2">Amount</th>
              <th className="text-right p-2">Final</th>
              <th className="text-right p-2">Previous</th>
            </tr>
          </thead>
          <tbody>
            {renderRows(priorityRows, "Priority brands")}
            {renderRows(otherRows, "Non-priority brands")}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => save.mutate(false)} disabled={data?.status === "locked" || save.isPending}>Save draft</Button>
        <Button onClick={() => save.mutate(true)} disabled={data?.status === "locked" || save.isPending || data?.built?.poolNegative}>Publish</Button>
      </div>
    </div>
  );
}
