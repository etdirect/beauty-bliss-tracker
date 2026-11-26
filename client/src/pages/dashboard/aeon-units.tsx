import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { channelKey } from "@shared/scheme";

interface AeonUnitLine {
  siteCode: string;
  brandCode: string;
  aeonCode: string;
  sgCode: string;
  name: string;
  nameEn: string;
  qty: number;
  amount: number;
}

interface PosRow {
  salesChannel: string;
  storeCode: string;
  siteCode?: string;
  storeName?: string;
  isActive?: boolean;
}

interface Door {
  key: string;
  siteCode: string;
  initials: string;
  name: string;
}

const BRAND_NAMES: Record<string, string> = {
  AD: "Adopt",
  ASD: "ASDceuticals",
  EM: "Embryolisse",
  LA: "Lador",
  NE: "Neutraderm",
  NOVE: "Novexpert",
  PH: "Phyto",
  RF: "Rene Furterer",
};

/** Used when Settings has not loaded, or a site code has no door yet. */
const FALLBACK_DOORS: Record<string, { initials: string; name: string }> = {
  "1": { initials: "KH", name: "Kornhill" },
  "2": { initials: "SK", name: "Skyline" },
  "4": { initials: "TWH", name: "Tai Wo Hau" },
  "5": { initials: "LCK", name: "Lai Chi Kok" },
  "6": { initials: "KB", name: "Kowloon Bay" },
  "7": { initials: "WP", name: "Whampoa" },
  "8": { initials: "TM", name: "Tuen Mun" },
  "210": { initials: "YT", name: "Yau Tong" },
};

function siteKey(code: string): string {
  const trimmed = code.trim();
  return trimmed.replace(/^0+/, "") || "0";
}

function money(n: number): string {
  return `HK$${n.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function units(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString("en-HK")
    : n.toLocaleString("en-HK", { maximumFractionDigits: 2 });
}

function brandLabel(code: string): string {
  const name = BRAND_NAMES[code];
  return name ? `${code} · ${name}` : code;
}

function doorLabel(door: Door): string {
  const place = door.name ? `${door.initials} ${door.name}` : door.initials;
  return `${place} · ${door.siteCode}`;
}

export default function AeonUnitsPage() {
  const [door, setDoor] = useState("all");
  const [brand, setBrand] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("amount");

  const { data, isLoading, isError } = useQuery<{ month: string; lines: AeonUnitLine[] }>({
    queryKey: ["/api/aeon-units"],
  });
  const { data: locations = [] } = useQuery<PosRow[]>({ queryKey: ["/api/pos-locations"] });

  const lines = data?.lines ?? [];

  const doors = useMemo(() => {
    const bySite = new Map<string, Door>();
    for (const pos of locations) {
      if (channelKey(pos.salesChannel || "") !== "AEON" || pos.isActive === false) continue;
      const site = (pos.siteCode || "").trim();
      if (!site) continue;
      const key = siteKey(site);
      bySite.set(key, {
        key,
        siteCode: site,
        initials: pos.storeCode,
        name: (pos.storeName || "").trim(),
      });
    }
    for (const line of lines) {
      const key = siteKey(line.siteCode);
      if (bySite.has(key)) continue;
      const known = FALLBACK_DOORS[key];
      bySite.set(key, {
        key,
        siteCode: line.siteCode,
        initials: known?.initials ?? line.siteCode,
        name: known?.name ?? "",
      });
    }
    return Array.from(bySite.values()).sort((a, b) => a.initials.localeCompare(b.initials));
  }, [locations, lines]);

  const doorByKey = useMemo(() => new Map(doors.map(item => [item.key, item])), [doors]);

  const brands = useMemo(() => {
    const codes = Array.from(new Set(lines.map(line => line.brandCode)));
    return codes.sort((a, b) => brandLabel(a).localeCompare(brandLabel(b)));
  }, [lines]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter(line => {
      if (door !== "all" && siteKey(line.siteCode) !== door) return false;
      if (brand !== "all" && line.brandCode !== brand) return false;
      if (!needle) return true;
      const doorName = doorByKey.get(siteKey(line.siteCode));
      const haystack = [
        line.name,
        line.nameEn,
        line.sgCode,
        line.aeonCode,
        line.brandCode,
        BRAND_NAMES[line.brandCode] ?? "",
        doorName?.initials ?? "",
        doorName?.name ?? "",
        line.siteCode,
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [lines, door, brand, search, doorByKey]);

  const doorsInTable = useMemo(() => {
    const keys = new Set(filtered.map(line => siteKey(line.siteCode)));
    return doors.filter(item => keys.has(item.key));
  }, [doors, filtered]);

  const brandRows = useMemo(() => {
    const codes = Array.from(new Set(filtered.map(line => line.brandCode)));
    return codes
      .map(code => {
        const byDoor = new Map<string, { qty: number; amount: number }>();
        let qty = 0;
        let amount = 0;
        for (const line of filtered) {
          if (line.brandCode !== code) continue;
          const key = siteKey(line.siteCode);
          const cell = byDoor.get(key) ?? { qty: 0, amount: 0 };
          cell.qty += line.qty;
          cell.amount += line.amount;
          byDoor.set(key, cell);
          qty += line.qty;
          amount += line.amount;
        }
        return { code, byDoor, qty, amount };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const products = useMemo(() => {
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "qty") return b.qty - a.qty || b.amount - a.amount;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.amount - a.amount || b.qty - a.qty;
    });
    return sorted;
  }, [filtered, sort]);

  const totalQty = filtered.reduce((sum, line) => sum + line.qty, 0);
  const totalAmount = filtered.reduce((sum, line) => sum + line.amount, 0);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div>
        <h2 className="text-xl font-semibold">AEON units</h2>
        <p className="text-sm text-muted-foreground">
          October 2026 quantities and sales amounts from the AEON file. Each shop number is matched to a door in Settings using the site code. The amount is the same basis as the figure a BA types each day. A gap against her daily total can be normal, because sales also happen outside her working hours.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Door</span>
          <Select value={door} onValueChange={setDoor}>
            <SelectTrigger className="w-64"><SelectValue placeholder="All doors" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All doors</SelectItem>
              {doors.map(item => (
                <SelectItem key={item.key} value={item.key}>{doorLabel(item)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Brand</span>
          <Select value={brand} onValueChange={setBrand}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All brands" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All brands</SelectItem>
              {brands.map(code => (
                <SelectItem key={code} value={code}>{brandLabel(code)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm flex-1 min-w-[220px]">
          <span className="text-muted-foreground">Search</span>
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Product name, SG code, or AEON code"
          />
        </label>
      </div>

      <div className="text-sm text-muted-foreground">
        {isLoading && "Loading the October file…"}
        {isError && "The October units could not be loaded."}
        {!isLoading && !isError && (
          <>
            {units(totalQty)} units · {money(totalAmount)} · {products.length} product {products.length === 1 ? "row" : "rows"}
          </>
        )}
      </div>

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
                  {doorsInTable.map(item => (
                    <th key={item.key} className="text-right p-2 whitespace-nowrap">{item.initials}<div className="font-normal text-muted-foreground">{item.siteCode}</div></th>
                  ))}
                  <th className="text-right p-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {brandRows.map(row => (
                  <tr key={row.code} className="border-t">
                    <td className="p-2 whitespace-nowrap">{brandLabel(row.code)}</td>
                    {doorsInTable.map(item => {
                      const cell = row.byDoor.get(item.key);
                      return (
                        <td key={item.key} className="p-2 text-right tabular-nums">
                          {cell ? (
                            <>
                              <div>{units(cell.qty)}</div>
                              <div className="text-xs text-muted-foreground">{money(cell.amount)}</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right tabular-nums">
                      <div className="font-medium">{units(row.qty)}</div>
                      <div className="text-xs text-muted-foreground">{money(row.amount)}</div>
                    </td>
                  </tr>
                ))}
                {brandRows.length === 0 && (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={doorsInTable.length + 2}>Nothing matches these filters.</td>
                  </tr>
                )}
              </tbody>
              {brandRows.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/40 font-medium">
                    <td className="p-2">Total</td>
                    {doorsInTable.map(item => {
                      const qty = filtered.filter(line => siteKey(line.siteCode) === item.key).reduce((sum, line) => sum + line.qty, 0);
                      const amount = filtered.filter(line => siteKey(line.siteCode) === item.key).reduce((sum, line) => sum + line.amount, 0);
                      return (
                        <td key={item.key} className="p-2 text-right tabular-nums">
                          <div>{units(qty)}</div>
                          <div className="text-xs font-normal text-muted-foreground">{money(amount)}</div>
                        </td>
                      );
                    })}
                    <td className="p-2 text-right tabular-nums">
                      <div>{units(totalQty)}</div>
                      <div className="text-xs font-normal text-muted-foreground">{money(totalAmount)}</div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Each cell is units, with the sales amount underneath.</p>
        </TabsContent>

        <TabsContent value="product" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Highest amount</SelectItem>
                <SelectItem value="qty">Highest units</SelectItem>
                <SelectItem value="name">Product name</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Door</th>
                  <th className="text-left p-2">Brand</th>
                  <th className="text-left p-2">Product</th>
                  <th className="text-left p-2">SG code</th>
                  <th className="text-left p-2">AEON code</th>
                  <th className="text-right p-2">Units</th>
                  <th className="text-right p-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {products.map((line, index) => {
                  const place = doorByKey.get(siteKey(line.siteCode));
                  return (
                    <tr key={`${line.siteCode}-${line.aeonCode}-${line.sgCode}-${index}`} className="border-t">
                      <td className="p-2 whitespace-nowrap">{place ? `${place.initials} ${place.name}` : line.siteCode}</td>
                      <td className="p-2 whitespace-nowrap">{BRAND_NAMES[line.brandCode] ?? line.brandCode}</td>
                      <td className="p-2">
                        <div>{line.name || "—"}</div>
                        {line.nameEn && <div className="text-xs text-muted-foreground">{line.nameEn}</div>}
                      </td>
                      <td className="p-2 font-mono text-xs">{line.sgCode || "—"}</td>
                      <td className="p-2 font-mono text-xs">{line.aeonCode || "—"}</td>
                      <td className="p-2 text-right tabular-nums">{units(line.qty)}</td>
                      <td className="p-2 text-right tabular-nums">{money(line.amount)}</td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td className="p-4 text-muted-foreground" colSpan={7}>Nothing matches these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
