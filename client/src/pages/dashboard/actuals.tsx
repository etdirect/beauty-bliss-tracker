import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatHk, hkMonth } from "@shared/hkTime";

const UPLOAD_CHANNELS = ["LOGON", "SOGO", "AEON"] as const;

const FILE_SLOTS = [
  { channel: "AEON", kind: "aeon", label: "Sales report" },
  { channel: "LOGON", kind: "cashier", label: "Cashier report" },
  { channel: "LOGON", kind: "split", label: "Adjusted workbook" },
  { channel: "SOGO", kind: "cashier", label: "Cashier report" },
  { channel: "SOGO", kind: "split", label: "Adjusted workbook" },
] as const;

const UPLOADS: Record<string, { kind: "aeon" | "cashier" | "split"; title: string; body: string }[]> = {
  AEON: [{
    kind: "aeon",
    title: "AEON sales report",
    body: "One file for the month. It covers every AEON door. Product lines are added up by brand and by door.",
  }],
  LOGON: [
    {
      kind: "cashier",
      title: "1. Cashier report",
      body: "Lines that name a product are kept. A line headed HAIR CARE PROMOTION is a mother code. It is held back and is not treated as a brand.",
    },
    {
      kind: "split",
      title: "2. Adjusted brand workbook",
      body: "Upload the LOGON file whose name says adjusted. It puts the products back into the mother code. Do not upload the before-adjustment file.",
    },
  ],
  SOGO: [
    {
      kind: "cashier",
      title: "1. Cashier report",
      body: "Lines that name a product are kept. A line called BEAUTY BLISS-N1 is a mother code. It is held back and is not treated as a brand.",
    },
    {
      kind: "split",
      title: "2. Adjusted brand workbook",
      body: "Upload the SOGO file whose name says adjusted. It puts the products back into the mother code. Do not upload the before-adjustment file.",
    },
  ],
};

interface ReportDoor {
  channel: string;
  siteCode: string;
  initials: string;
  name: string;
  hasBa: boolean;
  baNames: string[];
  counterId: string | null;
  counterName: string | null;
}

export default function ActualsPage() {
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const [counterId, setCounterId] = useState("");
  const [doorKey, setDoorKey] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const { data: counters = [] } = useQuery<any[]>({ queryKey: ["/api/commission/counters"] });
  const { data: uploadedFiles = [] } = useQuery<{ channel: string; kind: string; filename: string; uploadedAt: string; productLines: number; amountRead: number }[]>({
    queryKey: ["channel-files", month],
    queryFn: async () => {
      const res = await fetch(`/api/channel-reports/files?month=${month}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const { data: doors = [] } = useQuery<ReportDoor[]>({
    queryKey: ["channel-doors", month],
    queryFn: async () => {
      const res = await fetch(`/api/channel-reports/doors?month=${month}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const selectedDoor = doors.find(door => `${door.channel}|${door.siteCode}` === doorKey);
  const counter = counters.find(c => c.id === (selectedDoor?.counterId || counterId)) ?? (doors.length ? undefined : counters[0]);
  const activeId = counter?.id ?? "";
  useEffect(() => { if (!doorKey && !counterId && counters[0] && doors.length === 0) setCounterId(counters[0].id); }, [counters, counterId, doorKey, doors.length]);

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

  const uploadReport = useMutation({
    mutationFn: async ({ channel, kind, file }: { channel: string; kind: string; file: File }) => {
      const body = new FormData();
      body.append("file", file);
      body.append("channel", channel);
      body.append("kind", kind);
      body.append("month", month);
      const res = await fetch("/api/channel-reports", { method: "POST", body, credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "The file could not be read.");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel-doors", month] });
      queryClient.invalidateQueries({ queryKey: ["channel-reports"] });
      queryClient.invalidateQueries({ queryKey: ["channel-files", month] });
      queryClient.invalidateQueries({ queryKey: ["commission-actuals"] });
      toast({ title: "Report saved", description: "Doors from the file are now in the dropdown. Doors with a BA can be used for brand targets." });
    },
    onError: (err: Error) => toast({ title: "The file was not saved", description: err.message, variant: "destructive" }),
  });

  const rec = data?.reconciliation;
  const gapPct = rec?.gapPct == null ? null : `${(rec.gapPct * 100).toFixed(1)}%`;
  const rows = data?.rows ?? [];
  const shops = counter?.members ?? [];
  const typedTotal = rows.reduce((sum: number, row: any) => sum + (Number(row.provisional) || 0), 0);
  const shopTotal = (posId: string) => rows.reduce((sum: number, row: any) => {
    const shop = (row.byShop ?? []).find((s: any) => s.posId === posId);
    if (!shop?.available) return sum;
    const raw = draft[`${row.brandId}|${posId}`];
    const amount = raw === undefined || raw === "" ? (shop.actual ?? 0) : Number(raw);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold">Monthly actuals</h2>
        <p className="text-sm text-muted-foreground">Brands shown are the ones ticked for that shop under Settings, Brand-POS.</p>
      </div>
      <Tabs defaultValue="enter">
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <Input type="month" value={month} onChange={e => { setMonth(e.target.value); setDoorKey(""); }} className="w-40" />
        </div>
        <div className="overflow-x-auto rounded-lg border mb-4">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Channel</th>
                <th className="text-left p-2">File type</th>
                <th className="text-left p-2">File the app read</th>
                <th className="text-right p-2">Products</th>
                <th className="text-right p-2">Amount read</th>
              </tr>
            </thead>
            <tbody>
              {FILE_SLOTS.map(slot => {
                const saved = uploadedFiles.find(file => file.channel === slot.channel && file.kind === slot.kind);
                return (
                  <tr key={`${slot.channel}-${slot.kind}`} className="border-t">
                    <td className="p-2">{slot.channel}</td>
                    <td className="p-2">{slot.label}</td>
                    <td className="p-2">
                      {saved ? (
                        <>
                          <div>{saved.filename}</div>
                          <div className="text-xs text-muted-foreground">{new Date(saved.uploadedAt).toLocaleString("en-HK", { hour12: false })}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Not uploaded</span>
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums">{saved ? saved.productLines.toLocaleString("en-HK") : "—"}</td>
                    <td className="p-2 text-right tabular-nums">{saved ? formatHk(saved.amountRead) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mb-3">This is the latest file the app successfully read for each slot in {month}. Uploading the same slot again replaces it.</p>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="enter">Enter by store</TabsTrigger>
          {UPLOAD_CHANNELS.map(channel => (
            <TabsTrigger key={channel} value={`upload-${channel}`}>Upload {channel}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="enter" className="space-y-4 mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          value={doors.length ? doorKey : activeId}
          onValueChange={value => {
            if (!doors.length) { setCounterId(value); return; }
            setDoorKey(value);
            const door = doors.find(item => `${item.channel}|${item.siteCode}` === value);
            setCounterId(door?.counterId ?? "");
          }}
        >
          <SelectTrigger className="w-80"><SelectValue placeholder={doors.length ? "Door from the report" : "Counter"} /></SelectTrigger>
          <SelectContent>
            {doors.length === 0 && counters.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            {doors.map(door => (
              <SelectItem key={`${door.channel}|${door.siteCode}`} value={`${door.channel}|${door.siteCode}`}>
                {door.channel} · {door.initials} {door.name} · {door.hasBa ? `BA: ${door.baNames.join(", ")}` : "No BA"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {selectedDoor && !selectedDoor.hasBa && (
        <p className="text-sm text-muted-foreground">No BA is stationed at this door, so it is not used for a brand target. Doors with a BA are marked in the list.</p>
      )}

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
            {rows.map((row: any) => (
              <tr key={row.brandId} className="border-t">
                <td className="p-2">{row.name}</td>
                <td className="p-2 text-right tabular-nums">{formatHk(row.provisional)}</td>
                {shops.map((m: any) => {
                  const shop = (row.byShop ?? []).find((s: any) => s.posId === m.posId);
                  return (
                  <td key={m.shopCode} className="p-2 text-right">
                    {shop?.available ? (
                      <Input
                        className="h-8 w-28 ml-auto text-right"
                        inputMode="decimal"
                        value={draft[`${row.brandId}|${shop.posId}`] ?? ""}
                        onChange={e => setDraft(prev => ({ ...prev, [`${row.brandId}|${shop.posId}`]: e.target.value }))}
                        disabled={!shop.posId || data?.status === "locked"}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 font-semibold">
              <td className="p-2">Total</td>
              <td className="p-2 text-right tabular-nums">{formatHk(typedTotal)}</td>
              {shops.map((m: any) => (
                <td key={m.shopCode} className="p-2 text-right tabular-nums">{m.posId ? formatHk(shopTotal(m.posId)) : "—"}</td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <Button onClick={() => save.mutate()} disabled={data?.status === "locked" || save.isPending || rows.length === 0}>Save actuals</Button>
        </TabsContent>
        {UPLOAD_CHANNELS.map(channel => (
          <TabsContent key={channel} value={`upload-${channel}`} className="mt-4 space-y-3">
            {UPLOADS[channel].map(guide => (
              <Card key={guide.kind}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{guide.title}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{guide.body}</p>
                  <Input
                    type="file"
                    accept=".xlsx,.xlsm,.xls"
                    className="max-w-md"
                    disabled={uploadReport.isPending}
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) uploadReport.mutate({ channel, kind: guide.kind, file });
                    }}
                  />
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
