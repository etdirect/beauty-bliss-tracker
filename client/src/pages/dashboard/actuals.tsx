import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHk, hkMonth } from "@shared/hkTime";

export default function ActualsPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const [counterId, setCounterId] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { data: counters = [] } = useQuery<any[]>({ queryKey: ["/api/commission/counters"] });
  const counter = counters.find(c => c.id === counterId) ?? counters[0];
  const activeId = counter?.id ?? "";
  useEffect(() => { if (!counterId && counters[0]) setCounterId(counters[0].id); }, [counters, counterId]);

  const { data } = useQuery<any>({
    queryKey: ["commission-actuals", month, activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const res = await fetch(`/api/commission/actuals?month=${month}&counterId=${activeId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of data?.rows ?? []) {
      for (const shop of row.byShop ?? []) {
        if (shop.actual != null) next[`${row.brandId}|${shop.posId}`] = String(shop.actual);
      }
    }
    setDraft(next);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const rows: { brandId: string; posId: string; actualAmount: number }[] = [];
      for (const [key, value] of Object.entries(draft)) {
        if (value === "") continue;
        const [brandId, posId] = key.split("|");
        rows.push({ brandId, posId, actualAmount: Number(value) });
      }
      await apiRequest("PUT", "/api/commission/actuals", { counterId: activeId, month, rows });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-actuals"] });
      toast({ title: "Actual sales saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const rec = data?.reconciliation;
  const gapPct = rec?.gapPct == null ? null : `${(rec.gapPct * 100).toFixed(1)}%`;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold">Monthly actuals</h2>
          <p className="text-sm text-muted-foreground">Type the channel's month-end total. File import is not set up yet.</p>
        </div>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        <Select value={activeId} onValueChange={setCounterId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Counter" /></SelectTrigger>
          <SelectContent>{counters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {rec && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reconciliation</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
            <div><div className="text-muted-foreground">Typed sales</div><div className="font-semibold">{formatHk(rec.provisional)}</div></div>
            <div><div className="text-muted-foreground">Channel total</div><div className="font-semibold">{rec.actual == null ? "Not entered" : formatHk(rec.actual)}</div></div>
            <div><div className="text-muted-foreground">Gap</div><div className="font-semibold">{rec.gap == null ? "—" : `${formatHk(rec.gap)} (${gapPct})`}</div></div>
            <div><div className="text-muted-foreground">POS till</div><div className="font-semibold">{formatHk(rec.posTill)}</div></div>
            <div><div className="text-muted-foreground">Check</div><div className={rec.flagged ? "font-semibold text-amber-700" : "font-semibold"}>{rec.flagged ? "Gap is above the cutoff" : "Within the cutoff"}</div></div>
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">Brand</th>
              <th className="text-right p-2">Typed</th>
              {(counter?.members ?? []).map((m: any) => <th key={m.shopCode} className="text-right p-2">Actual {m.shopCode}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row: any) => (
              <tr key={row.brandId} className="border-t">
                <td className="p-2">{row.name}</td>
                <td className="p-2 text-right tabular-nums">{formatHk(row.provisional)}</td>
                {(row.byShop ?? []).map((shop: any) => (
                  <td key={shop.posId} className="p-2 text-right">
                    <Input
                      className="h-8 w-28 ml-auto text-right"
                      inputMode="decimal"
                      value={draft[`${row.brandId}|${shop.posId}`] ?? ""}
                      onChange={e => setDraft(prev => ({ ...prev, [`${row.brandId}|${shop.posId}`]: e.target.value }))}
                      disabled={!shop.posId || data?.status === "locked"}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button onClick={() => save.mutate()} disabled={data?.status === "locked" || save.isPending}>Save actuals</Button>
    </div>
  );
}
