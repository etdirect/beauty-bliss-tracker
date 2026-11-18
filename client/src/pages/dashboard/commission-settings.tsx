import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hkMonth } from "@shared/hkTime";

export default function CommissionSettings() {
  const { toast } = useToast();
  const { data, refetch } = useQuery<any>({ queryKey: ["/api/commission/settings"] });
  const { data: pos = [] } = useQuery<any[]>({ queryKey: ["/api/pos-locations"] });
  const { data: brands = [] } = useQuery<any[]>({ queryKey: ["/api/brands"] });
  const [form, setForm] = useState<any>(null);
  const [tiers, setTiers] = useState<any[]>([]);
  const [table, setTable] = useState<"L" | "S">("L");

  useEffect(() => {
    if (!data?.settings) return;
    const s = data.settings;
    setForm({
      guaranteedRate: String(s.guaranteedRate * 100),
      defaultBasicSalary: String(s.defaultBasicSalary),
      partTimeDayRate: String(s.partTimeDayRate),
      partTimePlannedRate: String(s.partTimePlannedRate * 100),
      partTimeUnexpectedRate: String(s.partTimeUnexpectedRate * 100),
      consecutiveDaysThreshold: String(s.consecutiveDaysThreshold),
      reconciliationGapThreshold: String(s.reconciliationGapThreshold * 100),
      defaultRestDays: String(s.defaultRestDays),
    });
    setTiers(data.tiers ?? []);
  }, [data]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/commission/settings", {
        guaranteedRate: Number(form.guaranteedRate) / 100,
        defaultBasicSalary: Number(form.defaultBasicSalary),
        partTimeDayRate: Number(form.partTimeDayRate),
        partTimePlannedRate: Number(form.partTimePlannedRate) / 100,
        partTimeUnexpectedRate: Number(form.partTimeUnexpectedRate) / 100,
        consecutiveDaysThreshold: Number(form.consecutiveDaysThreshold),
        reconciliationGapThreshold: Number(form.reconciliationGapThreshold) / 100,
        defaultRestDays: Number(form.defaultRestDays),
      });
    },
    onSuccess: () => { refetch(); toast({ title: "Commission settings saved" }); },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const saveTiers = useMutation({
    mutationFn: async () => {
      const rows = tiers.filter(t => t.tierTable === table).map(t => ({
        lower: Number(t.lower),
        upper: t.upper === "" || t.upper == null ? null : Number(t.upper),
        rate: Number(t.rate),
      }));
      await apiRequest("PUT", "/api/commission/tiers", { tierTable: table, rows });
    },
    onSuccess: () => { refetch(); toast({ title: "Tiers saved" }); },
    onError: (err: Error) => toast({ title: "Could not save tiers", description: err.message, variant: "destructive" }),
  });

  if (!form) return null;
  const field = (key: string, label: string) => (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Commission settings</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {field("guaranteedRate", "Guaranteed rate (%)")}
          {field("defaultBasicSalary", "Default basic salary")}
          {field("partTimeDayRate", "Part-timer day rate")}
          {field("partTimePlannedRate", "Planned cover (%)")}
          {field("partTimeUnexpectedRate", "Unexpected cover (%)")}
          {field("consecutiveDaysThreshold", "Long leave from (days)")}
          {field("reconciliationGapThreshold", "Gap flag above (%)")}
          {field("defaultRestDays", "Estimated rest days")}
          <div className="sm:col-span-2"><Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>Save settings</Button></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Minimum targets and shop links</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(data?.counters ?? []).map((c: any) => (
            <div key={c.id} className="border rounded-lg p-3 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-medium text-sm w-40">{c.name}</span>
                <Input className="w-32" defaultValue={c.minTarget} onBlur={e => {
                  if (Number(e.target.value) !== c.minTarget) {
                    apiRequest("PATCH", `/api/commission/counters/${c.id}`, { minTarget: Number(e.target.value) }).then(() => refetch());
                  }
                }} />
                {(c.code === "FW" || c.code === "LP") && (
                  <StepToggle counterId={c.id} plans={data.steps ?? []} onDone={refetch} />
                )}
              </div>
              {c.members?.map((m: any) => (
                <div key={m.shopCode} className="flex flex-wrap gap-2 items-center text-sm">
                  <span className="w-16">{m.shopCode}</span>
                  <span className="text-muted-foreground">{m.posId ? (m.storeName || m.storeCode) : "Not linked"}</span>
                  {!m.posId && (
                    <Select onValueChange={posId => apiRequest("POST", `/api/commission/counters/${c.id}/link`, { shopCode: m.shopCode, posId }).then(() => refetch())}>
                      <SelectTrigger className="w-64"><SelectValue placeholder="Choose the live shop" /></SelectTrigger>
                      <SelectContent>
                        {pos.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.salesChannel} {p.storeCode} · {p.storeName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              <PriorityList counter={c} brands={brands} onDone={refetch} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm">Tier bands</CardTitle>
          <Select value={table} onValueChange={v => setTable(v as "L" | "S")}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="L">LOGON / AEON</SelectItem>
              <SelectItem value="S">SOGO</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2">
          {tiers.filter(t => t.tierTable === table).map((t, i) => (
            <div key={t.id ?? i} className="flex gap-2">
              <Input value={t.lower} onChange={e => setTiers(prev => prev.map(x => x === t ? { ...x, lower: e.target.value } : x))} />
              <Input value={t.upper ?? ""} placeholder="No upper limit" onChange={e => setTiers(prev => prev.map(x => x === t ? { ...x, upper: e.target.value } : x))} />
              <Input value={t.rate} onChange={e => setTiers(prev => prev.map(x => x === t ? { ...x, rate: e.target.value } : x))} />
            </div>
          ))}
          <Button variant="outline" onClick={() => saveTiers.mutate()} disabled={saveTiers.isPending}>Save {table === "L" ? "LOGON / AEON" : "SOGO"} tiers</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StepToggle({ counterId, plans, onDone }: { counterId: string; plans: any[]; onDone: () => void }) {
  const plan = plans.find(p => p.counterId === counterId);
  const [start, setStart] = useState(plan?.startMonth || hkMonth());
  return (
    <div className="flex items-center gap-2 text-xs">
      <Checkbox checked={!!plan?.enabled} onCheckedChange={checked => {
        apiRequest("PUT", "/api/commission/step-plan", { counterId, enabled: !!checked, startMonth: start }).then(onDone);
      }} />
      <span>3-month step from</span>
      <Input type="month" className="w-36 h-8" value={start} onChange={e => setStart(e.target.value)} />
    </div>
  );
}

function PriorityList({ counter, brands, onDone }: { counter: any; brands: any[]; onDone: () => void }) {
  const { data: avail = [] } = useQuery<any[]>({ queryKey: ["/api/brand-pos-availability"] });
  const ids = new Set((counter.members ?? []).map((m: any) => m.posId).filter(Boolean));
  const rows = avail.filter(a => ids.has(a.posId));
  const seen = new Set<string>();
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map(row => {
        if (seen.has(row.brandId)) return null;
        seen.add(row.brandId);
        const brand = brands.find(b => b.id === row.brandId);
        return (
          <label key={row.brandId} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
            <Checkbox checked={!!row.isPriority} onCheckedChange={checked => {
              const jobs = rows.filter(r => r.brandId === row.brandId).map(r =>
                apiRequest("PUT", "/api/commission/priority", { brandId: r.brandId, posId: r.posId, isPriority: !!checked }),
              );
              Promise.all(jobs).then(() => {
                queryClient.invalidateQueries({ queryKey: ["/api/brand-pos-availability"] });
                onDone();
              });
            }} />
            {brand?.name ?? row.brandId}
          </label>
        );
      })}
    </div>
  );
}
