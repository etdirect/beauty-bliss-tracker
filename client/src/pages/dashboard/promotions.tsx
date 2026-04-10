import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Brand, Promotion, PromotionResult, PosLocation } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Search, Filter, Trash2, Pencil, CalendarDays, Gift, Tag, XCircle, CheckCircle,
  ChevronDown, ChevronRight, X,
} from "lucide-react";

const PROMO_TYPE_COLORS: Record<string, string> = {
  "GWP": "bg-pink-100 text-pink-800 border-pink-200",
  "PWP": "bg-green-100 text-green-800 border-green-200",
  "Percentage Discount": "bg-blue-100 text-blue-800 border-blue-200",
  "Fixed Amount Discount": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Bundle Deal": "bg-purple-100 text-purple-800 border-purple-200",
  "Multi-Buy": "bg-orange-100 text-orange-800 border-orange-200",
  "Mix & Match": "bg-violet-100 text-violet-800 border-violet-200",
  "Spend & Get": "bg-amber-100 text-amber-800 border-amber-200",
  "Other": "bg-gray-100 text-gray-800 border-gray-200",
};

const LAYER_COLORS: Record<string, string> = {
  brand: "bg-emerald-600 text-white",
  counter: "bg-blue-600 text-white",
  channel: "bg-purple-600 text-white",
};

function fmtDate(d: string) {
  try { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; } catch { return d; }
}

const CHANNEL_COLORS: Record<string, string> = {
  LOGON: "text-emerald-600 dark:text-emerald-400",
  AEON: "text-red-600 dark:text-red-400",
  SOGO: "text-blue-600 dark:text-blue-400",
  FACESSS: "text-pink-600 dark:text-pink-400",
};

function abbreviateLocation(loc: string): { text: string; channel: string }[] {
  return loc.split(",").map(s => {
    const t = s.trim();
    const si = t.indexOf("/");
    if (si === -1) return { text: t, channel: t.toUpperCase() };
    const ch = t.substring(0, si).trim();
    const door = t.substring(si + 1).trim();
    const chShort = ch.substring(0, 3).toUpperCase();
    const doorWords = door.split(" ");
    const doorShort = doorWords.length > 1
      ? doorWords.map(w => w[0]).join("").toUpperCase()
      : door.substring(0, 3).toUpperCase();
    return { text: `${chShort}/${doorShort}`, channel: ch.toUpperCase() };
  });
}

export default function Promotions() {
  const { toast } = useToast();
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthAgo = new Date(today.getTime() - 30 * 86400000);
  const monthAgoStr = `${monthAgo.getFullYear()}-${String(monthAgo.getMonth() + 1).padStart(2, "0")}-${String(monthAgo.getDate()).padStart(2, "0")}`;
  const monthAhead = new Date(today.getTime() + 60 * 86400000);
  const monthAheadStr = `${monthAhead.getFullYear()}-${String(monthAhead.getMonth() + 1).padStart(2, "0")}-${String(monthAhead.getDate()).padStart(2, "0")}`;

  // Filters
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState(monthAgoStr);
  const [endDate, setEndDate] = useState(monthAheadStr);
  const [filterType, setFilterType] = useState("__all__");
  const [filterBrand, setFilterBrand] = useState("__all__");
  const [filterStatus, setFilterStatus] = useState("__all__");
  const [filterLayer, setFilterLayer] = useState("__all__");
  const [groupBy, setGroupBy] = useState("flat");

  // Edit dialog
  const [editItem, setEditItem] = useState<Promotion | null>(null);

  // Data
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"], staleTime: 30_000 });
  const { data: promotions = [] } = useQuery<Promotion[]>({ queryKey: ["/api/promotions"], staleTime: 30_000, refetchOnWindowFocus: true });
  const { data: promotionResults = [] } = useQuery<PromotionResult[]>({ queryKey: ["/api/promotion-results"], staleTime: 30_000 });
  const { data: posLocations = [] } = useQuery<PosLocation[]>({ queryKey: ["/api/pos-locations"], staleTime: 30_000 });

  const brandMap = useMemo(() => { const m = new Map<string, Brand>(); brands.forEach(b => m.set(b.id, b)); return m; }, [brands]);

  // Mutations
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Promotion> }) => {
      await apiRequest("PATCH", `/api/promotions/${id}`, data);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/promotions"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/promotions/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      toast({ title: "Promotion deleted" });
    },
  });

  // Computed
  const promoTypes = useMemo(() => Array.from(new Set(promotions.map(p => p.type))).sort(), [promotions]);
  const promoBrands = useMemo(() => {
    const ids = new Set(promotions.map(p => p.brandId).filter(Boolean) as string[]);
    return brands.filter(b => ids.has(b.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [promotions, brands]);

  const getStatus = (p: Promotion) => {
    if (!p.isActive) return "inactive";
    if (p.endDate < todayStr) return "ended";
    if (p.startDate > todayStr) return "upcoming";
    return "active";
  };

  const filtered = useMemo(() => {
    let list = [...promotions];
    // Date range overlap
    list = list.filter(p => p.startDate <= endDate && p.endDate >= startDate);
    if (filterType !== "__all__") list = list.filter(p => p.type === filterType);
    if (filterBrand !== "__all__") {
      if (filterBrand === "cross-brand") list = list.filter(p => !p.brandId);
      else list = list.filter(p => p.brandId === filterBrand);
    }
    if (filterStatus !== "__all__") {
      list = list.filter(p => getStatus(p) === filterStatus);
    }
    if (filterLayer !== "__all__") list = list.filter(p => p.promotionLayer === filterLayer);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) ||
        (p.mechanics || "").toLowerCase().includes(q) || (p.shopLocation || "").toLowerCase().includes(q) ||
        (p.applicableProducts || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [promotions, startDate, endDate, filterType, filterBrand, filterStatus, filterLayer, search, todayStr]);

  // Grouping
  const groups = useMemo(() => {
    if (groupBy === "flat") return [{ label: `All Promotions (${filtered.length})`, items: filtered }];
    if (groupBy === "brand") {
      const map = new Map<string, Promotion[]>();
      for (const p of filtered) {
        const key = p.brandId ? (brandMap.get(p.brandId)?.name || "Unknown") : "Cross-brand";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      }
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items }));
    }
    if (groupBy === "channel") {
      const map = new Map<string, Promotion[]>();
      for (const p of filtered) {
        const loc = p.shopLocation || "All Channels";
        const channels = new Set(loc.split(",").map(s => { const t = s.trim(); const si = t.indexOf("/"); return si === -1 ? t : t.substring(0, si).trim(); }));
        channels.forEach(ch => {
          if (!map.has(ch)) map.set(ch, []);
          map.get(ch)!.push(p);
        });
      }
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items }));
    }
    if (groupBy === "type") {
      const map = new Map<string, Promotion[]>();
      for (const p of filtered) { if (!map.has(p.type)) map.set(p.type, []); map.get(p.type)!.push(p); }
      return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([label, items]) => ({ label, items }));
    }
    if (groupBy === "layer") {
      const map = new Map<string, Promotion[]>();
      for (const p of filtered) { const l = p.promotionLayer || "brand"; if (!map.has(l)) map.set(l, []); map.get(l)!.push(p); }
      return Array.from(map.entries()).sort().map(([label, items]) => ({ label: label === "brand" ? "L1 — Brand" : label === "counter" ? "L2 — Counter" : "L3 — Channel", items }));
    }
    return [{ label: "All", items: filtered }];
  }, [filtered, groupBy, brandMap]);

  // GWP stats
  const getPromoStats = (promo: Promotion) => {
    const results = promotionResults.filter(r => r.promotionId === promo.id);
    const total = results.reduce((s, r) => s + r.gwpGiven, 0);
    const byCounter: Record<string, number> = {};
    for (const r of results) {
      const pos = posLocations.find(p => p.id === r.counterId);
      const name = pos?.storeName || "Unknown";
      byCounter[name] = (byCounter[name] || 0) + r.gwpGiven;
    }
    return { total, byCounter };
  };

  // Summary
  const activeCount = filtered.filter(p => getStatus(p) === "active").length;
  const brandCount = new Set(filtered.map(p => p.brandId).filter(Boolean)).size;

  const renderCard = (p: Promotion, channelFilter?: string) => {
    const brand = p.brandId ? brandMap.get(p.brandId) : null;
    const status = getStatus(p);
    const stats = getPromoStats(p);
    const layer = p.promotionLayer || "brand";
    const layerLabel = layer === "brand" ? "L1" : layer === "counter" ? "L2" : "L3";
    const typeColor = PROMO_TYPE_COLORS[p.type] || PROMO_TYPE_COLORS["Other"];
    const layerColor = LAYER_COLORS[layer] || LAYER_COLORS.brand;
    let locParts = p.shopLocation ? abbreviateLocation(p.shopLocation) : [];
    // When viewing By Channel, only show locations matching this channel group
    if (channelFilter && locParts.length > 0) {
      locParts = locParts.filter(lp => lp.channel === channelFilter.toUpperCase() || lp.text.toUpperCase().startsWith(channelFilter.substring(0, 3).toUpperCase()));
    }

    return (
      <div key={p.id} className={`flex items-start gap-2 py-2.5 text-sm ${status === "ended" || status === "inactive" ? "opacity-50" : ""}`}>
        {/* Layer + Type */}
        <div className="flex items-center gap-1 shrink-0 pt-0.5 w-[160px]">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${layerColor}`}>{layerLabel}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${typeColor}`}>{p.type}</span>
        </div>
        {/* Location */}
        <div className="shrink-0 w-[200px] pt-0.5">
          {locParts.length > 0 ? (
            <div className="flex flex-wrap gap-x-1 gap-y-0 leading-snug" title={p.shopLocation || ""}>
              {locParts.map((part, i) => (
                <span key={i} className={`text-xs font-medium ${CHANNEL_COLORS[part.channel] || "text-foreground/80"}`}>
                  {part.text}{i < locParts.length - 1 ? "," : ""}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground italic">All</span>
          )}
        </div>
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="font-medium">{p.name}</div>
          {p.mechanics && <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.mechanics}</div>}
          {!p.mechanics && p.description && <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
            {p.trackable && <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">Trackable</Badge>}
            {p.sourceApp === "simulator" && <Badge variant="outline" className="text-[9px] border-indigo-300 text-indigo-700">From Simulator</Badge>}
            {brand && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{brand.name}</span>}
            {p.applicableProducts && <span title={p.applicableProducts}>Products: {p.applicableProducts.substring(0, 40)}{p.applicableProducts.length > 40 ? "..." : ""}</span>}
            {status !== "active" && (
              <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${
                status === "upcoming" ? "border-amber-400 text-amber-700" :
                status === "ended" ? "border-slate-400 text-slate-500" :
                "border-red-400 text-red-600"
              }`}>{status}</Badge>
            )}
          </div>
          {/* GWP/PWP stats */}
          {stats.total > 0 && (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Gift className="w-3 h-3 text-pink-500" />
              <span className="text-[11px] font-medium">{stats.total} given</span>
              {Object.entries(stats.byCounter).slice(0, 5).map(([name, count]) => (
                <Badge key={name} variant="secondary" className="text-[10px] tabular-nums">{name}: {count}</Badge>
              ))}
            </div>
          )}
        </div>
        {/* Right side: dates + actions */}
        <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(p.startDate)} – {fmtDate(p.endDate)}</span>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Edit" onClick={() => setEditItem({ ...p })}><Pencil className="w-3 h-3" /></Button>
            {status === "active" ? (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Deactivate" onClick={() => updateMutation.mutate({ id: p.id, data: { isActive: false } })}><XCircle className="w-3 h-3 text-muted-foreground" /></Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Activate" onClick={() => updateMutation.mutate({ id: p.id, data: { isActive: true } })}><CheckCircle className="w-3 h-3" /></Button>
            )}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" title="Delete" onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteMutation.mutate(p.id); }}><Trash2 className="w-3 h-3" /></Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gift className="w-5 h-5" />
        <h2 className="text-lg font-bold">Promotions</h2>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search promotions..." className="w-[180px] h-9 text-sm pl-8" />
        </div>
        <div className="flex items-center gap-1.5 border rounded-md px-2 h-9 text-sm bg-background hover:bg-muted/50 cursor-pointer" onClick={() => (document.getElementById("promo-start") as HTMLInputElement)?.showPicker?.()}>
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="whitespace-nowrap">{fmtDate(startDate)}</span>
          <input id="promo-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="sr-only" />
        </div>
        <span className="text-xs text-muted-foreground">to</span>
        <div className="flex items-center gap-1.5 border rounded-md px-2 h-9 text-sm bg-background hover:bg-muted/50 cursor-pointer" onClick={() => (document.getElementById("promo-end") as HTMLInputElement)?.showPicker?.()}>
          <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="whitespace-nowrap">{fmtDate(endDate)}</span>
          <input id="promo-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="sr-only" />
        </div>

        <Select value={groupBy} onValueChange={setGroupBy}>
          <SelectTrigger className="w-auto h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="flat">Flat List</SelectItem>
            <SelectItem value="brand">By Brand</SelectItem>
            <SelectItem value="channel">By Channel</SelectItem>
            <SelectItem value="type">By Type</SelectItem>
            <SelectItem value="layer">By Layer</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterBrand} onValueChange={setFilterBrand}>
          <SelectTrigger className="w-auto h-9 text-sm gap-1"><Filter className="w-3.5 h-3.5" /><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Brands</SelectItem>
            <SelectItem value="cross-brand">Cross-brand</SelectItem>
            {promoBrands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-auto h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Types</SelectItem>
            {promoTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-auto h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterLayer} onValueChange={setFilterLayer}>
          <SelectTrigger className="w-auto h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Layers</SelectItem>
            <SelectItem value="brand">L1 — Brand</SelectItem>
            <SelectItem value="counter">L2 — Counter</SelectItem>
            <SelectItem value="channel">L3 — Channel</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => { setSearch(""); setFilterType("__all__"); setFilterBrand("__all__"); setFilterStatus("__all__"); setFilterLayer("__all__"); }}>
          <X className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-6 text-xs text-muted-foreground">
        <span>{filtered.length} promotions</span>
        <span>{activeCount} active</span>
        <span>{brandCount} brands</span>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Active</p><p className="text-lg font-bold">{activeCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Brands</p><p className="text-lg font-bold">{brandCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Trackable</p><p className="text-lg font-bold">{filtered.filter(p => p.trackable).length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">From Simulator</p><p className="text-lg font-bold">{filtered.filter(p => p.sourceApp === "simulator").length}</p></CardContent></Card>
      </div>

      {/* Grouped cards */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No promotions match your filters</p>
      ) : (
        <div className="space-y-3">
          {groups.map(group => (
            <Card key={group.label}>
              <CardHeader className="pb-2 pt-3">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>{group.label}</span>
                  <Badge variant="secondary" className="text-xs font-normal">{group.items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-3">
                <div className="divide-y">
                  {group.items.map(p => renderCard(p, groupBy === "channel" ? group.label : undefined))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Promotion</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Name</Label>
                <Input value={editItem.name} onChange={e => setEditItem(prev => prev ? { ...prev, name: e.target.value } : prev)} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Description</Label>
                <Textarea value={editItem.description || ""} onChange={e => setEditItem(prev => prev ? { ...prev, description: e.target.value } : prev)} rows={2} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Mechanics</Label>
                <Textarea value={editItem.mechanics || ""} onChange={e => setEditItem(prev => prev ? { ...prev, mechanics: e.target.value } : prev)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Start Date</Label>
                  <div className="flex items-center gap-1.5 border rounded-md px-2 h-9 text-sm bg-background hover:bg-muted/50 cursor-pointer" onClick={() => (document.getElementById("edit-promo-start") as HTMLInputElement)?.showPicker?.()}>
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{fmtDate(editItem.startDate)}</span>
                    <input id="edit-promo-start" type="date" value={editItem.startDate} onChange={e => setEditItem(prev => prev ? { ...prev, startDate: e.target.value } : prev)} className="sr-only" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">End Date</Label>
                  <div className="flex items-center gap-1.5 border rounded-md px-2 h-9 text-sm bg-background hover:bg-muted/50 cursor-pointer" onClick={() => (document.getElementById("edit-promo-end") as HTMLInputElement)?.showPicker?.()}>
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span>{fmtDate(editItem.endDate)}</span>
                    <input id="edit-promo-end" type="date" value={editItem.endDate} onChange={e => setEditItem(prev => prev ? { ...prev, endDate: e.target.value } : prev)} className="sr-only" />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Status</Label>
                <Select value={editItem.isActive ? "active" : "inactive"} onValueChange={v => setEditItem(prev => prev ? { ...prev, isActive: v === "active" } : prev)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-2 py-1">
                <Checkbox
                  id="edit-promo-trackable"
                  checked={editItem.trackable}
                  onCheckedChange={v => setEditItem(prev => prev ? { ...prev, trackable: !!v } : prev)}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="edit-promo-trackable" className="text-sm cursor-pointer font-medium">BA Tracking</Label>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">BAs will see an input field to record daily GWP/PWP quantities</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">Remarks</Label>
                <Textarea value={editItem.remarks || ""} onChange={e => setEditItem(prev => prev ? { ...prev, remarks: e.target.value } : prev)} rows={2} />
              </div>
              <Button className="w-full" onClick={async () => {
                try {
                  await apiRequest("PATCH", `/api/promotions/${editItem.id}`, {
                    name: editItem.name,
                    description: editItem.description,
                    mechanics: editItem.mechanics,
                    startDate: editItem.startDate,
                    endDate: editItem.endDate,
                    isActive: editItem.isActive,
                    trackable: editItem.trackable,
                    remarks: editItem.remarks,
                  });
                  queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
                  setEditItem(null);
                  toast({ title: "Promotion updated" });
                } catch (e: any) {
                  toast({ title: "Update failed", description: e.message, variant: "destructive" });
                }
              }}>Save</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
