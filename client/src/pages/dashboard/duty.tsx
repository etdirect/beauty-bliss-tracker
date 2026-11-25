import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { hkMonth, monthDates } from "@shared/hkTime";
import { counterLabel, matchPos, type PosLike } from "@shared/scheme";

const PREFILL_FROM = "2026-10";

const STATUSES = [
  ["WORKED", "Worked"],
  ["REST", "Rest day"],
  ["IRREGULAR_REST", "Irregular rest"],
  ["ANNUAL_LEAVE", "Annual leave"],
  ["SICK_LEAVE", "Sick leave"],
  ["MATERNITY_LEAVE", "Maternity leave"],
  ["UNPAID_LEAVE", "Unpaid leave"],
] as const;

// Full-time BA = "Can view past sales data" is on. Part-time BA = that box is off.
const FULL_TIME_TEXT = "text-teal-800 dark:text-teal-300";
const PART_TIME_TEXT = "text-violet-800 dark:text-violet-300";

type Day = {
  date: string;
  posId: string | null;
  status: string;
  regularUserId: string | null;
  partTimeUserId: string | null;
  substitutionType: string | null;
  note: string | null;
};

export default function DutyPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const [counterId, setCounterId] = useState("");
  const [days, setDays] = useState<Day[]>([]);
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [bulkStatus, setBulkStatus] = useState("ANNUAL_LEAVE");
  const [bulkShop, setBulkShop] = useState("");

  const { data: counters = [] } = useQuery<any[]>({ queryKey: ["/api/commission/counters"] });
  const counter = counters.find(c => c.id === counterId) ?? counters[0];
  const activeId = counter?.id ?? "";
  const aeon = counter?.code === "AEON" || (counter?.members?.length ?? 0) > 1;

  useEffect(() => { if (!counterId && counters[0]) setCounterId(counters[0].id); }, [counters, counterId]);

  const { data } = useQuery<{ days: any[]; status: string }>({
    queryKey: ["commission-duty", month, activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const res = await fetch(`/api/commission/duty?month=${month}&counterId=${activeId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const { data: people = [] } = useQuery<any[]>({ queryKey: ["/api/commission/roster-users"] });
  const { data: locations = [] } = useQuery<PosLike[]>({ queryKey: ["/api/pos-locations"] });
  const { data: assignments = [] } = useQuery<{ userId: string; posId: string }[]>({ queryKey: ["/api/user-pos-assignments"] });

  const shopIds = useMemo(() => {
    if (!counter) return [] as string[];
    const linked = (counter.members ?? []).map((m: any) => m.posId).filter(Boolean) as string[];
    if (linked.length > 0) return linked;
    return (counter.members ?? [])
      .map((m: any) => matchPos(locations, counter.channel, m.shopCode)?.id)
      .filter((id: string | undefined): id is string => !!id);
  }, [counter, locations]);

  const labelFor = (c: any) => {
    const named = (c.members ?? []).find((m: any) => m.storeName);
    if (named?.storeName) return counterLabel(c.channel, named.storeName, c.name);
    const loc = (c.members ?? [])
      .map((m: any) => matchPos(locations, c.channel, m.shopCode))
      .find((loc: PosLike | undefined) => loc?.storeName);
    return loc ? counterLabel(c.channel, loc.storeName, c.name) : c.name;
  };

  const stationedId = useMemo(() => {
    if (!counter || month < PREFILL_FROM || shopIds.length === 0) return null;
    const shopSet = new Set(shopIds);
    const posIdsFor = (person: any) => {
      const fromRoster = person.posIds as string[] | undefined;
      if (fromRoster && fromRoster.length > 0) return fromRoster;
      return assignments.filter(a => a.userId === person.id).map(a => a.posId);
    };
    const stationed = people.filter((p: any) =>
      p.role === "ba" && p.canViewHistory && posIdsFor(p).some(id => shopSet.has(id)),
    );
    return stationed.length === 1 ? stationed[0].id : null;
  }, [counter, people, month, shopIds, assignments]);

  useEffect(() => {
    if (!counter) return;
    const saved = new Map((data?.days ?? []).map((d: any) => [d.date, d]));
    const onlyShop = counter.members?.length === 1 ? (counter.members[0].posId || shopIds[0] || null) : null;
    setDays(monthDates(month).map(date => {
      const row = saved.get(date);
      if (row) {
        return {
          date,
          posId: row.posId,
          status: row.status,
          regularUserId: row.regularUserId || stationedId,
          partTimeUserId: row.partTimeUserId,
          substitutionType: row.substitutionType,
          note: row.note,
        };
      }
      return {
        date,
        posId: aeon ? null : onlyShop,
        status: aeon ? "" : "WORKED",
        regularUserId: aeon ? null : stationedId,
        partTimeUserId: null,
        substitutionType: null,
        note: null,
      };
    }));
  }, [data, counter, month, aeon, stationedId, shopIds]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = days.filter(d => d.status).map(d => ({ ...d, status: d.status || "WORKED" }));
      await apiRequest("PUT", "/api/commission/duty", { counterId: activeId, month, days: payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-duty"] });
      toast({ title: "Duty record saved" });
    },
    onError: (err: Error) => toast({ title: "Could not save", description: err.message, variant: "destructive" }),
  });

  const partTimers = people.filter(p => p.role === "part_time");
  const bas = people.filter(p => p.role === "ba").slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const fullTimeBas = bas.filter(p => p.canViewHistory);
  const partTimeBas = bas.filter(p => !p.canViewHistory);
  const baById = new Map(bas.map(p => [p.id, p]));
  const locked = data?.status === "locked";
  const unset = aeon ? days.filter(d => !d.posId).length : 0;

  const update = (date: string, patch: Partial<Day>) => {
    setDays(prev => prev.map(d => d.date === date ? { ...d, ...patch } : d));
  };

  const applyBulk = () => {
    if (!bulkFrom || !bulkTo) return;
    setDays(prev => prev.map(d => {
      if (d.date < bulkFrom || d.date > bulkTo) return d;
      const shop = aeon ? (bulkShop || d.posId) : d.posId;
      return { ...d, posId: shop, status: bulkStatus, substitutionType: bulkStatus === "WORKED" ? null : (d.substitutionType || "planned") };
    }));
  };

  const weeks = useMemo(() => days, [days]);
  const fullTimeDays = days.filter(d => d.regularUserId && baById.get(d.regularUserId)?.canViewHistory).length;
  const partTimeDays = days.filter(d => {
    const person = d.regularUserId ? baById.get(d.regularUserId) : null;
    return !!person && !person.canViewHistory;
  }).length;

  const baTextClass = (userId: string | null) => {
    const person = userId ? baById.get(userId) : null;
    if (!person) return "";
    return person.canViewHistory ? FULL_TIME_TEXT : PART_TIME_TEXT;
  };

  const dayCardClass = (userId: string | null) => {
    const person = userId ? baById.get(userId) : null;
    if (!person) return "bg-card";
    return person.canViewHistory
      ? "bg-teal-50 border-teal-200 dark:bg-teal-950/40 dark:border-teal-800"
      : "bg-violet-50 border-violet-200 dark:bg-violet-950/40 dark:border-violet-800";
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold">Duty record</h2>
          <p className="text-sm text-muted-foreground">From October 2026, each day starts as Worked for the full-time BA assigned to that store. Change only the rest days and name the part-timer covering them. Until you save, commission uses the 6-rest-day estimate.</p>
        </div>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        <Select value={activeId} onValueChange={setCounterId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Counter" /></SelectTrigger>
          <SelectContent>
            {counters.map(c => <SelectItem key={c.id} value={c.id}>{labelFor(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        {locked && <span className="text-sm text-amber-700">This month is locked</span>}
        {unset > 0 && <span className="text-sm text-amber-700">{unset} days still need a shop</span>}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-teal-600 dark:bg-teal-400" />
          <span className={`font-medium ${FULL_TIME_TEXT}`}>Full-time BA</span>
          <span className="text-muted-foreground">{fullTimeDays} {fullTimeDays === 1 ? "day" : "days"}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-600 dark:bg-violet-400" />
          <span className={`font-medium ${PART_TIME_TEXT}`}>Part-time BA</span>
          <span className="text-muted-foreground">{partTimeDays} {partTimeDays === 1 ? "day" : "days"}</span>
        </span>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Mark a range</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 items-end">
          <div><Label className="text-xs">From</Label><Input type="date" value={bulkFrom} onChange={e => setBulkFrom(e.target.value)} className="w-40" /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={bulkTo} onChange={e => setBulkTo(e.target.value)} className="w-40" /></div>
          {aeon && (
            <div>
              <Label className="text-xs">Shop</Label>
              <Select value={bulkShop} onValueChange={setBulkShop}>
                <SelectTrigger className="w-28"><SelectValue placeholder="Shop" /></SelectTrigger>
                <SelectContent>{counter?.members?.filter((m: any) => m.posId).map((m: any) => <SelectItem key={m.shopCode} value={m.posId}>{m.shopCode}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={applyBulk} disabled={locked}>Apply</Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {weeks.map(day => (
          <div key={day.date} className={`rounded-lg border p-2 space-y-1 ${dayCardClass(day.regularUserId)}`}>
            <div className="text-xs font-medium">{day.date.slice(8)}</div>
            {aeon && (
              <Select value={day.posId || "none"} onValueChange={v => update(day.date, { posId: v === "none" ? null : v, status: day.status || "WORKED" })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Shop" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not in store</SelectItem>
                  {counter?.members?.filter((m: any) => m.posId).map((m: any) => <SelectItem key={m.posId} value={m.posId}>{m.shopCode}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={day.status || "unset"} onValueChange={v => update(day.date, { status: v === "unset" ? "" : v, substitutionType: v === "WORKED" || v === "unset" ? null : (day.substitutionType || "planned") })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {aeon && <SelectItem value="unset">Not set</SelectItem>}
                {STATUSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            {day.status && day.status !== "WORKED" && (
              <>
                <Select value={day.substitutionType || "planned"} onValueChange={v => update(day.date, { substitutionType: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned cover</SelectItem>
                    <SelectItem value="unexpected">Unexpected</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={day.partTimeUserId || "none"} onValueChange={v => update(day.date, { partTimeUserId: v === "none" ? null : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Part-timer" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Part-timer</SelectItem>
                    {partTimers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            {bas.length > 0 && (
              <Select value={day.regularUserId || "none"} onValueChange={v => update(day.date, { regularUserId: v === "none" ? null : v })}>
                <SelectTrigger className={`h-8 text-xs font-medium ${baTextClass(day.regularUserId)}`}><SelectValue placeholder="BA" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Regular BA</SelectItem>
                  {fullTimeBas.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={`pl-2 text-xs uppercase tracking-wide ${FULL_TIME_TEXT}`}>Full time</SelectLabel>
                      {fullTimeBas.map(p => <SelectItem key={p.id} value={p.id} className={FULL_TIME_TEXT}>{p.name}</SelectItem>)}
                    </SelectGroup>
                  )}
                  {partTimeBas.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className={`pl-2 text-xs uppercase tracking-wide ${PART_TIME_TEXT}`}>Part time</SelectLabel>
                      {partTimeBas.map(p => <SelectItem key={p.id} value={p.id} className={PART_TIME_TEXT}>{p.name}</SelectItem>)}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>
        ))}
      </div>
      <Button onClick={() => save.mutate()} disabled={locked || save.isPending}>Save duty record</Button>
    </div>
  );
}
