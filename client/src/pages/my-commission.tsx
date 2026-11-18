import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, Redirect } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHk, hkMonth } from "@shared/hkTime";

function basisLabel(basis: string, incomplete: boolean) {
  if (basis === "estimated") return "Estimated, no duty record";
  if (basis === "actual") return incomplete ? "Actual · duty incomplete" : "Actual";
  return incomplete ? "Provisional · duty incomplete" : "Provisional";
}

export default function MyCommission() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const [counterId, setCounterId] = useState("");
  const [projected, setProjected] = useState("");
  const [restDays, setRestDays] = useState("");
  const [achievement, setAchievement] = useState("");
  const [salary, setSalary] = useState("");

  const query = `/api/pay/me?month=${month}` +
    (counterId ? `&counterId=${counterId}` : "") +
    (projected !== "" ? `&projected=${projected}` : "") +
    (restDays !== "" ? `&restDays=${restDays}` : "") +
    (achievement !== "" ? `&achievement=${Number(achievement) / 100}` : "");
  const { data } = useQuery<any>({
    queryKey: ["pay-me", query],
    enabled: user?.role === "ba",
    queryFn: async () => {
      const res = await fetch(query, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const saveSalary = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", "/api/pay/salary", { userId: user?.id, month, basicSalary: Number(salary) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pay-me"] });
      toast({ title: "Salary updated" });
      setSalary("");
    },
    onError: (err: Error) => toast({ title: "Could not update salary", description: err.message, variant: "destructive" }),
  });

  if (user?.role !== "ba") return <Redirect to="/" />;
  if (data && !data.counter) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-3">
        <h1 className="text-xl font-semibold">My commission</h1>
        <p className="text-sm text-muted-foreground">Your shop is not part of this commission scheme.</p>
        <Link href="/"><Button variant="outline">Back to sales entry</Button></Link>
      </div>
    );
  }

  const pct = data ? Math.round((data.achievementSoFar ?? 0) * 1000) / 10 : 0;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">My commission</h1>
          <p className="text-sm text-muted-foreground">{data?.counter?.name} · {data ? basisLabel(data.basis, data.dutyIncomplete) : ""}</p>
        </div>
        <Link href="/"><Button variant="ghost" size="sm">Sales entry</Button></Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        {(data?.counters?.length ?? 0) > 1 && (
          <Select value={data.counter.id} onValueChange={setCounterId}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{data.counters.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Counted sales so far</div><div className="text-lg font-semibold">{formatHk(data?.countedSoFar)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Brand achievement</div><div className="text-lg font-semibold">{pct}%</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Projected income</div><div className="text-lg font-semibold">{formatHk(data?.income)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Projection</CardTitle></CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>Run-rate suggestion: <span className="font-medium">{formatHk(data?.suggested)}</span></div>
          <div>Working-day suggestion: <span className="font-medium">{formatHk(data?.dutyAware)}</span></div>
          <div>
            <Label className="text-xs">Your projected counter sales</Label>
            <Input value={projected} placeholder={data ? String(Math.round(data.suggested ?? 0)) : ""} onChange={e => setProjected(e.target.value)} />
          </div>
          {!data?.hasDuty && (
            <div>
              <Label className="text-xs">Expected rest days</Label>
              <Input value={restDays} placeholder={String(data?.defaultRestDays ?? 6)} onChange={e => setRestDays(e.target.value)} />
            </div>
          )}
          <div>
            <Label className="text-xs">Achievement override (%)</Label>
            <Input value={achievement} placeholder={String(pct)} onChange={e => setAchievement(e.target.value)} />
          </div>
          <div className="sm:col-span-2 grid grid-cols-2 gap-2">
            <div>Guaranteed {formatHk(data?.G)}</div>
            <div>Extra {formatHk(data?.E)}</div>
            <div>Commission {formatHk(data?.commission)}</div>
            <div>Basic salary {formatHk(data?.salary)}</div>
          </div>
          {data?.next && (
            <p className="sm:col-span-2 text-muted-foreground">
              {formatHk(data.next.salesNeeded)} more counted sales reaches the next band and adds about {formatHk(data.next.extraCommission)} in commission at the current achievement.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Brand progress</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(data?.brands ?? []).map((b: any) => (
            <div key={b.name} className="flex justify-between gap-3">
              <span>{b.name}</span>
              <span className="tabular-nums">{formatHk(b.actual)} / {formatHk(b.target)}</span>
            </div>
          ))}
          {(data?.brands ?? []).length === 0 && <p className="text-muted-foreground">No published targets for this month yet.</p>}
        </CardContent>
      </Card>

      {data?.counter?.aeon && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Shop days</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1">
            {(data.days ?? []).map((d: any) => (
              <span key={d.date} className="text-[11px] rounded border px-1.5 py-0.5" title={d.status || "Not set"}>
                {d.date.slice(8)} {d.shop || "—"}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Basic salary</CardTitle></CardHeader>
        <CardContent className="flex gap-2 items-end">
          <div>
            <Label className="text-xs">New basic salary for {month}</Label>
            <Input value={salary} onChange={e => setSalary(e.target.value)} className="w-40" inputMode="decimal" />
          </div>
          <Button onClick={() => saveSalary.mutate()} disabled={salary === "" || data?.status === "locked" || saveSalary.isPending}>Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}
