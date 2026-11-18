import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHk, hkMonth } from "@shared/hkTime";

export default function TargetsPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const [counterId, setCounterId] = useState("");
  const [allAdj, setAllAdj] = useState("1");
  const [nonPriority, setNonPriority] = useState("");
  const [brandAdj, setBrandAdj] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const { data: counters = [] } = useQuery<any[]>({ queryKey: ["/api/commission/counters"] });
  const counter = counters.find(c => c.id === counterId) ?? counters[0];
  const activeId = counter?.id ?? "";
  useEffect(() => { if (!counterId && counters[0]) setCounterId(counters[0].id); }, [counters, counterId]);

  const { data } = useQuery<any>({
    queryKey: ["commission-targets", month, activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const res = await fetch(`/api/commission/targets?month=${month}&counterId=${activeId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    if (!data?.ref) return;
    setAllAdj(String(data.allAdj ?? 1));
    setNonPriority(String(data.nonPriority ?? ""));
    const next: Record<string, string> = {};
    for (const b of data.built?.brands ?? []) {
      next[b.brandId] = String(data.brandAdjustments?.[b.brandId] ?? 1);
    }
    for (const row of data.ref.rows.filter((r: any) => r.priority)) {
      if (!next[row.brandId]) next[row.brandId] = "1";
    }
    setBrandAdj(next);
  }, [data]);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const adjustments: Record<string, number> = {};
      for (const [id, value] of Object.entries(brandAdj)) adjustments[id] = Number(value || 1);
      const res = await apiRequest("PUT", "/api/commission/targets", {
        counterId: activeId,
        month,
        publish,
        reason,
        allBrandsAdjustment: Number(allAdj || 1),
        nonPriorityExpected: nonPriority === "" ? null : Number(nonPriority),
        brandAdjustments: adjustments,
      });
      return res.json();
    },
    onSuccess: (body: any) => {
      queryClient.invalidateQueries({ queryKey: ["commission-targets"] });
      toast({ title: body?.belowMinimum ? "Saved. The counter target is below the minimum." : "Targets saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const ref = data?.ref;
  const built = data?.built;
  const priorityRows = (ref?.rows ?? []).filter((r: any) => r.priority);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold">Target setting</h2>
          <p className="text-sm text-muted-foreground">Starting targets use the middle value of the last three months. BAs see targets only after you publish them.</p>
        </div>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        <Select value={activeId} onValueChange={setCounterId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Counter" /></SelectTrigger>
          <SelectContent>{counters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {ref && (
        <Card>
          <CardContent className="p-4 grid sm:grid-cols-3 gap-3 text-sm">
            <div><div className="text-muted-foreground">Counter median</div><div className="font-semibold">{formatHk(ref.counterMedian)}</div></div>
            <div><div className="text-muted-foreground">Starting target</div><div className="font-semibold">{formatHk(data.starting)}</div></div>
            <div><div className="text-muted-foreground">Final counter target</div><div className="font-semibold">{formatHk(built?.finalCounterTarget)}</div></div>
            {built?.belowMinimum && <p className="sm:col-span-3 text-amber-700">This is below the minimum target. You can still save it.</p>}
            {built?.poolNegative && <p className="sm:col-span-3 text-amber-700">The priority pool is negative, so this cannot be published yet.</p>}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">All-brand adjustment</Label>
          <Input className="w-28" value={allAdj} onChange={e => setAllAdj(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Expected non-priority sales</Label>
          <Input className="w-40" value={nonPriority} onChange={e => setNonPriority(e.target.value)} />
        </div>
        <div className="flex-1 min-w-48">
          <Label className="text-xs">Reason if you change a published target</Label>
          <Input value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Brand</th>
              {(ref?.months ?? []).map((m: string) => <th key={m} className="text-right p-2">{m}</th>)}
              <th className="text-right p-2">Median</th>
              <th className="text-right p-2">Starting</th>
              <th className="text-right p-2">Adjustment</th>
              <th className="text-right p-2">Final</th>
              <th className="text-right p-2">Previous</th>
            </tr>
          </thead>
          <tbody>
            {priorityRows.map((row: any) => {
              const final = built?.brands?.find((b: any) => b.brandId === row.brandId);
              const prev = data?.prev?.find?.((p: any) => p.brandId === row.brandId && p.status === "published");
              return (
                <tr key={row.brandId} className="border-t">
                  <td className="p-2">{row.name}</td>
                  {row.months.map((n: number, i: number) => <td key={i} className="p-2 text-right tabular-nums">{formatHk(n)}</td>)}
                  <td className="p-2 text-right tabular-nums">{formatHk(row.median)}</td>
                  <td className="p-2 text-right tabular-nums">{formatHk(final?.startingTarget)}</td>
                  <td className="p-2 text-right">
                    <Input className="h-8 w-20 ml-auto text-right" value={brandAdj[row.brandId] ?? "1"} onChange={e => setBrandAdj(prev => ({ ...prev, [row.brandId]: e.target.value }))} />
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatHk(final?.finalTarget)}</td>
                  <td className="p-2 text-right tabular-nums">{prev ? formatHk(prev.finalTarget) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => save.mutate(false)} disabled={data?.status === "locked" || save.isPending}>Save draft</Button>
        <Button onClick={() => save.mutate(true)} disabled={data?.status === "locked" || save.isPending || built?.poolNegative}>Publish</Button>
      </div>
      <p className="text-xs text-muted-foreground">The numbers above use the adjustments already saved. Change an adjustment and save to refresh the finals.</p>
    </div>
  );
}
