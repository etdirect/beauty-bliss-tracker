import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { channelKey } from "@shared/scheme";

type Channel = "AEON" | "LOGON" | "SOGO";
type Kind = "aeon" | "cashier" | "split";

interface SkuLine {
  siteCode: string;
  brandCode: string;
  sku: string;
  name: string;
  qty: number;
  amount: number;
  amountBasis: "net" | "before-invoice-discount";
  source: "aeon" | "cashier" | "split";
}

interface BrandDoor {
  siteCode: string;
  brandCode: string;
  qty: number;
  amount: number;
}

interface Report {
  channel: Channel;
  month: string;
  uploads: { kind: Kind; filename: string; uploadedAt: string }[];
  brandDoors: BrandDoor[];
  skuLines: SkuLine[];
  motherDoors: { siteCode: string; qty: number; amount: number; label: string }[];
  splitDoors: { siteCode: string; amount: number }[];
  warnings: string[];
}

interface PosRow {
  salesChannel: string;
  storeCode: string;
  siteCode?: string;
  storeName?: string;
  isActive?: boolean;
}

const BRAND_NAMES: Record<string, string> = {
  AD: "Adopt", ASD: "ASDceuticals", AT: "Athe", EM: "Embryolisse", LA: "Lador",
  NE: "Neutraderm", NOVE: "Novexpert", PH: "Phyto", PE: "Pestlo", TA: "Talika",
  GD: "GD11", GE: "Geske", RF: "Rene Furterer", SAM: "SAMPAR", KL: "Klorane",
  BB: "Beauty Bliss", XP: "Xposome", EE: "elvis+elvin", A18: "Addmino18",
};

const DOOR_FALLBACK: Record<string, { initials: string; name: string }> = {
  "001": { initials: "KH", name: "Kornhill" },
  "002": { initials: "SK", name: "Skyline" },
  "006": { initials: "KB", name: "Kowloon Bay" },
  "007": { initials: "WP", name: "Whampoa" },
  "210": { initials: "YT", name: "Yau Tong" },
  "1106": { initials: "TS", name: "Times Square" },
  "1108": { initials: "FW", name: "Festival Walk" },
  "1112": { initials: "LP", name: "Langham Place" },
  "1128": { initials: "HC", name: "Harbour City" },
  "1131": { initials: "NTP", name: "New Town Plaza" },
  CWB: { initials: "CWB", name: "Causeway Bay" },
  KTK: { initials: "KTK", name: "Kai Tak" },
};

const GUIDES: Record<Channel, { kind: Kind; title: string; body: string }[]> = {
  AEON: [{
    kind: "aeon",
    title: "AEON sales report",
    body: "One file for the month. It covers every AEON door. The app reads each product’s units and sales amount, then adds them up by brand and by door.",
  }],
  LOGON: [
    {
      kind: "cashier",
      title: "1. Cashier report",
      body: "Upload the LOGON cashier report. Lines that name a product are kept. A line called HAIR CARE PROMOTION is a mother code: the till recorded the amount and not the products. It is held back and is not treated as a brand.",
    },
    {
      kind: "split",
      title: "2. Adjusted brand workbook",
      body: "Upload the LOGON file whose name says adjusted. It puts the real products back into the mother code. Do not upload the before-adjustment file.",
    },
  ],
  SOGO: [
    {
      kind: "cashier",
      title: "1. Cashier report",
      body: "Upload the SOGO cashier report. Lines that name a product are kept. A line called BEAUTY BLISS-N1 is a mother code. It is held back and is not treated as a brand.",
    },
    {
      kind: "split",
      title: "2. Adjusted brand workbook",
      body: "Upload the SOGO file whose name says adjusted. It puts the real products back into the mother code. Kai Tak may appear only in this file. Do not upload the before-adjustment file.",
    },
  ],
};

function siteKey(code: string): string {
  const trimmed = code.trim().toUpperCase();
  if (/^\d+$/.test(trimmed) && trimmed.length <= 3) return trimmed.padStart(3, "0");
  return trimmed;
}

function money(n: number): string {
  return `HK$${n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function units(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString("en-HK") : n.toLocaleString("en-HK", { maximumFractionDigits: 2 });
}

function brandLabel(code: string): string {
  const name = BRAND_NAMES[code];
  return name && name !== code ? `${code} · ${name}` : code;
}

export default function ChannelSalesPage() {
  const { toast } = useToast();
  const [channel, setChannel] = useState<Channel>("AEON");
  const [month, setMonth] = useState("2026-10");
  const [door, setDoor] = useState("all");
  const [brand, setBrand] = useState("all");
  const [search, setSearch] = useState("");
  const { data: locations = [] } = useQuery<PosRow[]>({ queryKey: ["/api/pos-locations"] });
  const { data, isLoading, isError } = useQuery<Report>({
    queryKey: ["channel-reports", channel, month],
    queryFn: async () => {
      const res = await fetch(`/api/channel-reports?channel=${channel}&month=${month}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: Kind; file: File }) => {
      const body = new FormData();
      body.append("file", file);
      body.append("channel", channel);
      body.append("kind", kind);
      body.append("month", month);
      const res = await fetch("/api/channel-reports", { method: "POST", body, credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "The file could not be read.");
      return json as Report;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel-reports", channel, month] });
      toast({ title: "Report saved", description: "The figures below use this file." });
    },
    onError: (err: Error) => toast({ title: "The file was not saved", description: err.message, variant: "destructive" }),
  });

  const doors = useMemo(() => {
    const bySite = new Map<string, { key: string; siteCode: string; initials: string; name: string }>();
    for (const pos of locations) {
      if (channelKey(pos.salesChannel || "") !== channel || pos.isActive === false) continue;
      const site = (pos.siteCode || "").trim();
      if (!site) continue;
      const key = siteKey(site);
      bySite.set(key, { key, siteCode: site, initials: pos.storeCode, name: (pos.storeName || "").trim() });
    }
    const codes = new Set<string>([
      ...(data?.brandDoors ?? []).map(row => row.siteCode),
      ...(data?.skuLines ?? []).map(row => row.siteCode),
      ...(data?.motherDoors ?? []).map(row => row.siteCode),
    ]);
    for (const code of codes) {
      const key = siteKey(code);
      if (bySite.has(key)) continue;
      const known = DOOR_FALLBACK[key] ?? DOOR_FALLBACK[code];
      bySite.set(key, { key, siteCode: code, initials: known?.initials ?? code, name: known?.name ?? "" });
    }
    return Array.from(bySite.values()).sort((a, b) => a.initials.localeCompare(b.initials));
  }, [locations, channel, data]);

  const doorByKey = useMemo(() => new Map(doors.map(item => [item.key, item])), [doors]);
  const labelOf = (code: string) => {
    const door = doorByKey.get(siteKey(code));
    if (!door) return code;
    return door.name ? `${door.initials} ${door.name}` : door.initials;
  };

  const filteredLines = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.skuLines ?? []).filter(line => {
      if (door !== "all" && siteKey(line.siteCode) !== door) return false;
      if (brand !== "all" && line.brandCode !== brand) return false;
      if (!needle) return true;
      return [line.name, line.sku, line.brandCode, BRAND_NAMES[line.brandCode] ?? "", line.siteCode, labelOf(line.siteCode)]
        .join(" ").toLowerCase().includes(needle);
    });
  }, [data, door, brand, search, doorByKey]);

  const brandRows = useMemo(() => {
    const codes = Array.from(new Set((data?.brandDoors ?? []).map(row => row.brandCode)));
    return codes.map(code => {
      const cells = (data?.brandDoors ?? []).filter(row => row.brandCode === code && (door === "all" || siteKey(row.siteCode) === door));
      const qty = cells.reduce((sum, row) => sum + row.qty, 0);
      const amount = cells.reduce((sum, row) => sum + row.amount, 0);
      return { code, cells, qty, amount };
    }).filter(row => row.qty !== 0 || row.amount !== 0).sort((a, b) => b.amount - a.amount);
  }, [data, door]);

  const doorsInTable = doors.filter(item => door === "all" ? (data?.brandDoors ?? []).some(row => siteKey(row.siteCode) === item.key) : item.key === door);
  const brands = Array.from(new Set((data?.brandDoors ?? []).map(row => row.brandCode))).sort();
  const totalQty = brandRows.reduce((sum, row) => sum + row.qty, 0);
  const totalAmount = brandRows.reduce((sum, row) => sum + row.amount, 0);
  const uploaded = new Set((data?.uploads ?? []).map(item => item.kind));

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold">Channel sales</h2>
        <p className="text-sm text-muted-foreground">
          Upload the monthly channel report. The figures are sales by brand, sales by door, and each product’s units and amount. Choose the month the file belongs to.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Month</span>
          <Input type="month" value={month} onChange={event => { setMonth(event.target.value); setDoor("all"); setBrand("all"); }} className="w-40" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Channel</span>
          <Select value={channel} onValueChange={value => { setChannel(value as Channel); setDoor("all"); setBrand("all"); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AEON">AEON</SelectItem>
              <SelectItem value="LOGON">LOGON</SelectItem>
              <SelectItem value="SOGO">SOGO</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {GUIDES[channel].map(guide => (
          <Card key={guide.kind}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{guide.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{guide.body}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  className="max-w-xs"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) upload.mutate({ kind: guide.kind, file });
                  }}
                />
                {uploaded.has(guide.kind) && <span className="text-foreground">Saved for {month}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {upload.isPending && <p className="text-sm text-muted-foreground">Reading the file…</p>}
      {isError && <p className="text-sm text-destructive">The saved reports could not be loaded.</p>}
      {(data?.warnings ?? []).map(warning => (
        <p key={warning} className="text-sm text-amber-700">{warning}</p>
      ))}

      {(data?.motherDoors?.length ?? 0) > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Door</th>
                <th className="text-left p-2">Mother code</th>
                <th className="text-right p-2">Cashier lump</th>
                <th className="text-right p-2">Adjusted file</th>
                <th className="text-right p-2">Difference</th>
              </tr>
            </thead>
            <tbody>
              {data!.motherDoors.map(row => {
                const split = data!.splitDoors.find(item => siteKey(item.siteCode) === siteKey(row.siteCode));
                const gap = split ? split.amount - row.amount : null;
                return (
                  <tr key={row.siteCode} className="border-t">
                    <td className="p-2">{labelOf(row.siteCode)}</td>
                    <td className="p-2">{row.label}</td>
                    <td className="p-2 text-right tabular-nums">{money(row.amount)}</td>
                    <td className="p-2 text-right tabular-nums">{split ? money(split.amount) : "Not uploaded"}</td>
                    <td className="p-2 text-right tabular-nums">{gap == null ? "—" : money(gap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && (data?.uploads.length ?? 0) === 0 && (
        <p className="text-sm text-muted-foreground">No report has been saved for {channel} in {month}.</p>
      )}

      {(data?.brandDoors.length ?? 0) > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Door</span>
              <Select value={door} onValueChange={setDoor}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All doors</SelectItem>
                  {doors.map(item => <SelectItem key={item.key} value={item.key}>{item.name ? `${item.initials} ${item.name}` : item.initials}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Brand</span>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All brands</SelectItem>
                  {brands.map(code => <SelectItem key={code} value={code}>{brandLabel(code)}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm flex-1 min-w-[220px]">
              <span className="text-muted-foreground">Search</span>
              <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Product name or product code" />
            </label>
          </div>
          <p className="text-sm text-muted-foreground">{units(totalQty)} units on the brand grid · {money(totalAmount)}</p>
          <Tabs defaultValue="brand">
            <TabsList>
              <TabsTrigger value="brand">By brand and door</TabsTrigger>
              <TabsTrigger value="product">By product</TabsTrigger>
            </TabsList>
            <TabsContent value="brand" className="mt-4">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Brand</th>
                      {doorsInTable.map(item => <th key={item.key} className="text-right p-2">{item.initials}<div className="font-normal text-muted-foreground">{item.siteCode}</div></th>)}
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {brandRows.map(row => (
                      <tr key={row.code} className="border-t">
                        <td className="p-2 whitespace-nowrap">{brandLabel(row.code)}</td>
                        {doorsInTable.map(item => {
                          const cell = row.cells.find(entry => siteKey(entry.siteCode) === item.key);
                          return (
                            <td key={item.key} className="p-2 text-right tabular-nums">
                              {cell ? <><div>{cell.qty ? units(cell.qty) : "—"}</div><div className="text-xs text-muted-foreground">{money(cell.amount)}</div></> : <span className="text-muted-foreground">—</span>}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right tabular-nums">
                          <div className="font-medium">{units(row.qty)}</div>
                          <div className="text-xs text-muted-foreground">{money(row.amount)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">The amount is the figure for brand targets. Units on this grid are only from lines that name a product. The adjusted workbook adds the rest of the amount. Open By product to see units from both files.</p>
            </TabsContent>
            <TabsContent value="product" className="mt-4">
              <p className="text-xs text-muted-foreground mb-2">
                Product amounts from the adjusted workbook are before that invoice’s discount is shared across brands. The brand grid above is the figure to use for targets. {filteredLines.length} rows.
              </p>
              <div className="overflow-x-auto rounded-lg border max-h-[32rem]">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Door</th>
                      <th className="text-left p-2">Brand</th>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Code</th>
                      <th className="text-right p-2">Units</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.slice(0, 400).map((line, index) => (
                      <tr key={`${line.siteCode}-${line.sku}-${line.name}-${index}`} className="border-t">
                        <td className="p-2 whitespace-nowrap">{labelOf(line.siteCode)}</td>
                        <td className="p-2 whitespace-nowrap">{BRAND_NAMES[line.brandCode] ?? line.brandCode}</td>
                        <td className="p-2">{line.name || "—"}</td>
                        <td className="p-2 font-mono text-xs">{line.sku || "—"}</td>
                        <td className="p-2 text-right tabular-nums">{units(line.qty)}</td>
                        <td className="p-2 text-right tabular-nums">{money(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredLines.length > 400 && <p className="text-xs text-muted-foreground mt-2">Showing the first 400 rows. Use the door, brand, or search to narrow the list.</p>}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
