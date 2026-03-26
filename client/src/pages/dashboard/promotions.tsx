import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Brand, Promotion, PromotionResult, Counter } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, CheckCircle, XCircle, Search, Filter } from "lucide-react";

const PROMO_TYPE_COLORS: Record<string, string> = {
  "GWP": "bg-pink-100 text-pink-800 border-pink-200",
  "PWP": "bg-green-100 text-green-800 border-green-200",
  "Percentage Discount": "bg-blue-100 text-blue-800 border-blue-200",
  "Fixed Amount Discount": "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Bundle Deal": "bg-purple-100 text-purple-800 border-purple-200",
  "Multi-Buy": "bg-orange-100 text-orange-800 border-orange-200",
  "Spend & Get": "bg-amber-100 text-amber-800 border-amber-200",
  "Other": "bg-gray-100 text-gray-800 border-gray-200",
};

function PromoTypeBadge({ type }: { type: string }) {
  const colorClass = PROMO_TYPE_COLORS[type] || PROMO_TYPE_COLORS["Other"];
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>{type}</span>;
}

function PromoTypeDetails({ promo }: { promo: Promotion }) {
  const details: string[] = [];
  const t = promo.type;

  if (t === "GWP" || promo.gwpItem) {
    if (promo.gwpItem) details.push(`GWP: ${promo.gwpItem}`);
    if (promo.gwpValue) details.push(`Value: HK$${promo.gwpValue}`);
    if (promo.gwpQty) details.push(`Qty: ${promo.gwpQty}`);
  }
  if (t === "Percentage Discount" && promo.discountPercentage) {
    details.push(`${promo.discountPercentage}% off`);
  }
  if (promo.discountFixedAmount) {
    details.push(`HK$${promo.discountFixedAmount} off`);
  }
  if (t === "Bundle Deal") {
    if (promo.bundlePromoPrice) details.push(`Bundle: HK$${promo.bundlePromoPrice}`);
  }
  if (t === "Multi-Buy") {
    if (promo.multiBuyBuyQty) {
      let txt = `Buy ${promo.multiBuyBuyQty}`;
      if (promo.multiBuyGetQty) txt += ` Get ${promo.multiBuyGetQty}`;
      if (promo.multiBuyGetType) txt += ` ${promo.multiBuyGetType}`;
      details.push(txt);
    }
    if (promo.multiBuyFixedPrice) details.push(`for HK$${promo.multiBuyFixedPrice}`);
  }
  if (t === "PWP") {
    if (promo.pwpItem) details.push(`PWP: ${promo.pwpItem}`);
    if (promo.pwpPrice) details.push(`at HK$${promo.pwpPrice}`);
    if (promo.pwpDiscountPercentage) details.push(`${promo.pwpDiscountPercentage}% off`);
  }
  if (t === "Spend & Get") {
    if (promo.spendGetSpendAmount) details.push(`Spend HK$${promo.spendGetSpendAmount}`);
    if (promo.spendGetDiscountAmount) details.push(`Get HK$${promo.spendGetDiscountAmount} off`);
  }

  if (details.length === 0) return null;
  return <p className="text-xs text-foreground/80 font-medium">{details.join(" · ")}</p>;
}

function PromoConditions({ promo }: { promo: Promotion }) {
  const conditions: string[] = [];
  if (promo.conditionMinimumSpend) conditions.push(`Min spend: HK$${promo.conditionMinimumSpend}`);
  if (promo.conditionMinimumQty) conditions.push(`Min qty: ${promo.conditionMinimumQty}`);
  if (promo.conditionRequiredItems) conditions.push(`Required: ${promo.conditionRequiredItems}`);
  if (promo.conditionOther) conditions.push(promo.conditionOther);
  if (conditions.length === 0) return null;
  return <p className="text-xs text-muted-foreground italic">{conditions.join(" · ")}</p>;
}

function RefPricing({ promo }: { promo: Promotion }) {
  if (!promo.referenceOriginalPrice && !promo.referencePromoPrice) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {promo.referenceOriginalPrice && <span className="line-through mr-1">HK${promo.referenceOriginalPrice}</span>}
      {promo.referencePromoPrice && <span className="font-medium text-foreground">HK${promo.referencePromoPrice}</span>}
    </p>
  );
}

export default function Promotions() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formName, setFormName] = useState("");
  const [formBrandId, setFormBrandId] = useState<string>("cross-brand");
  const [formType, setFormType] = useState("GWP");
  const [formDescription, setFormDescription] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");

  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"] });
  const { data: promotions = [] } = useQuery<Promotion[]>({ queryKey: ["/api/promotions"] });
  const { data: promotionResults = [] } = useQuery<PromotionResult[]>({ queryKey: ["/api/promotion-results"] });

  const activeBrands = brands.filter(b => b.isActive);
  const today = new Date().toISOString().split("T")[0];

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/promotions", {
        name: formName,
        brandId: formBrandId === "cross-brand" ? null : formBrandId,
        type: formType,
        description: formDescription,
        startDate: formStartDate,
        endDate: formEndDate,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: "Promotion created" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/promotions/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promotions"] });
    },
  });

  const resetForm = () => {
    setFormName("");
    setFormBrandId("cross-brand");
    setFormType("GWP");
    setFormDescription("");
    setFormStartDate("");
    setFormEndDate("");
  };

  // Promotion type options from data
  const promoTypes = useMemo(() => {
    const types = new Set(promotions.map(p => p.type));
    return Array.from(types).sort();
  }, [promotions]);

  // Brand options from promotions
  const promoBrandIds = useMemo(() => {
    const ids = new Set(promotions.map(p => p.brandId).filter(Boolean));
    return Array.from(ids) as string[];
  }, [promotions]);

  // Filtered promotions
  const filteredPromotions = useMemo(() => {
    let filtered = [...promotions];

    // Status filter
    if (filterStatus === "active") {
      filtered = filtered.filter(p => p.isActive && p.endDate >= today);
    } else if (filterStatus === "past") {
      filtered = filtered.filter(p => !p.isActive || p.endDate < today);
    }

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter(p => p.type === filterType);
    }

    // Brand filter
    if (filterBrand !== "all") {
      if (filterBrand === "cross-brand") {
        filtered = filtered.filter(p => !p.brandId);
      } else {
        filtered = filtered.filter(p => p.brandId === filterBrand);
      }
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.mechanics && p.mechanics.toLowerCase().includes(q)) ||
        (p.shopLocation && p.shopLocation.toLowerCase().includes(q))
      );
    }

    return filtered;
  }, [promotions, filterStatus, filterType, filterBrand, searchQuery, today]);

  const getPromoStats = (promo: Promotion) => {
    const results = promotionResults.filter(r => r.promotionId === promo.id);
    const totalGwp = results.reduce((s, r) => s + r.gwpGiven, 0);
    const byCounter: Record<string, number> = {};
    for (const r of results) {
      const counter = counters.find(c => c.id === r.counterId);
      const name = counter?.name || "Unknown";
      byCounter[name] = (byCounter[name] || 0) + r.gwpGiven;
    }
    return { totalGwp, byCounter };
  };

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Promotions</h2>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-promotion">
                <Plus className="w-4 h-4 mr-1" /> New Promotion
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Promotion</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Name</label>
                  <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Embryolisse April GWP" data-testid="input-promo-name" />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Brand</label>
                  <Select value={formBrandId} onValueChange={setFormBrandId}>
                    <SelectTrigger data-testid="select-promo-brand"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cross-brand">Cross-brand</SelectItem>
                      {activeBrands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Type</label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger data-testid="select-promo-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GWP">GWP (Gift with Purchase)</SelectItem>
                      <SelectItem value="PWP">PWP (Purchase with Purchase)</SelectItem>
                      <SelectItem value="Percentage Discount">Percentage Discount</SelectItem>
                      <SelectItem value="Fixed Amount Discount">Fixed Amount Discount</SelectItem>
                      <SelectItem value="Bundle Deal">Bundle Deal</SelectItem>
                      <SelectItem value="Multi-Buy">Multi-Buy</SelectItem>
                      <SelectItem value="Spend & Get">Spend & Get</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="e.g. Free gift with purchase of HK$300+" data-testid="input-promo-desc" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Start Date</label>
                    <Input type="date" value={formStartDate} onChange={e => setFormStartDate(e.target.value)} data-testid="input-promo-start" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">End Date</label>
                    <Input type="date" value={formEndDate} onChange={e => setFormEndDate(e.target.value)} data-testid="input-promo-end" />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={!formName || !formStartDate || !formEndDate || createMutation.isPending}
                  data-testid="button-save-promotion"
                >
                  {createMutation.isPending ? "Creating..." : "Create Promotion"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search promotions..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <Filter className="w-3 h-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="past">Past/Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {promoTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterBrand} onValueChange={setFilterBrand}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="All Brands" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Brands</SelectItem>
            <SelectItem value="cross-brand">Cross-brand</SelectItem>
            {promoBrandIds.map(id => {
              const brand = brands.find(b => b.id === id);
              return brand ? <SelectItem key={id} value={id}>{brand.name}</SelectItem> : null;
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-xs text-muted-foreground">{filteredPromotions.length} promotion{filteredPromotions.length !== 1 ? "s" : ""}</p>

      {/* Promotions Table/List */}
      {filteredPromotions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No promotions match your filters</p>
      ) : (
        <div className="space-y-2">
          {filteredPromotions.map(promo => {
            const brand = brands.find(b => b.id === promo.brandId);
            const stats = getPromoStats(promo);
            const isActive = promo.isActive && promo.endDate >= today;
            return (
              <Card key={promo.id} className={!isActive ? "opacity-60" : ""}>
                <CardContent className="pt-3 pb-3 space-y-1.5">
                  {/* Row 1: Type badge, name, brand, location, toggle */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PromoTypeBadge type={promo.type} />
                        {promo.trackable && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Trackable</span>
                        )}
                        {promo.sourceApp === "simulator" && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">From Simulator</span>
                        )}
                        <span className="font-medium text-sm truncate">{promo.name}</span>
                        {brand && <Badge variant="outline" className="text-xs shrink-0">{brand.name}</Badge>}
                      </div>
                      {promo.shopLocation && (
                        <p className="text-xs text-muted-foreground">
                          {promo.shopLocation}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {promo.startDate} — {promo.endDate}
                      </span>
                      {isActive ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate({ id: promo.id, isActive: false })}
                          className="text-xs text-muted-foreground h-7 px-2"
                          data-testid={`button-deactivate-${promo.id}`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate({ id: promo.id, isActive: true })}
                          className="text-xs h-7 px-2"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Mechanics (key info for BAs) */}
                  {promo.mechanics && (
                    <p className="text-xs text-foreground/90 leading-relaxed">{promo.mechanics}</p>
                  )}
                  {!promo.mechanics && promo.description && (
                    <p className="text-xs text-muted-foreground">{promo.description}</p>
                  )}

                  {/* Row 3: Type-specific details */}
                  <PromoTypeDetails promo={promo} />

                  {/* Row 4: Applicable products & exclusions */}
                  {(promo.applicableProducts || promo.exclusions || promo.promoAppliesTo) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                      {promo.promoAppliesTo && (
                        <span className="text-xs text-muted-foreground">Applies to: {promo.promoAppliesTo}</span>
                      )}
                      {promo.applicableProducts && (
                        <span className="text-xs text-muted-foreground">Products: {promo.applicableProducts}</span>
                      )}
                      {promo.exclusions && (
                        <span className="text-xs text-muted-foreground text-red-600">Excl: {promo.exclusions}</span>
                      )}
                    </div>
                  )}

                  {/* Row 5: Conditions & pricing */}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 items-center">
                    <PromoConditions promo={promo} />
                    <RefPricing promo={promo} />
                  </div>

                  {/* Row 6: Remarks */}
                  {promo.remarks && (
                    <p className="text-xs text-muted-foreground italic">Note: {promo.remarks}</p>
                  )}

                  {/* Row 7: Performance stats (GWP tracking) */}
                  {stats.totalGwp > 0 && (
                    <div className="border-t pt-1.5 mt-1">
                      <p className="text-xs font-medium mb-0.5">{stats.totalGwp} GWPs given</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(stats.byCounter).map(([name, count]) => (
                          <Badge key={name} variant="secondary" className="text-xs tabular-nums">
                            {name}: {count}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
