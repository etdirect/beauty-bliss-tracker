import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import type { Brand, Promotion, BrandPosAvailability, PosLocation, SalesEntry } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Gift, ShoppingBag, Calendar, Store, LayoutDashboard, MapPin, Tag, Package, LogOut, Pencil, AlertCircle } from "lucide-react";
import { Link } from "wouter";

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

export default function BAEntry() {
  const { toast } = useToast();
  const { user, logout } = useAuth();
  const [selectedCounter, setSelectedCounter] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [salesData, setSalesData] = useState<Record<string, { orders: number; units: number; amount: number; gwpCount: number }>>({});
  const [promoData, setPromoData] = useState<Record<string, { gwpGiven: number; notes: string }>>({});
  const [submitted, setSubmitted] = useState(false);

  // Fetch POS locations (all active)
  const { data: posLocations = [] } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
  });

  // Fetch user's POS assignments
  const { data: userAssignments = [], isLoading: assignmentsLoading } = useQuery<Array<{ id: string; userId: string; posId: string }>>({
    queryKey: ["/api/user-pos-assignments", `?userId=${user?.id || ""}`],
    enabled: !!user,
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const { data: brandPosAvail = [] } = useQuery<BrandPosAvailability[]>({
    queryKey: ["/api/brand-pos-availability", `?posId=${selectedCounter}`],
    enabled: !!selectedCounter,
  });

  const { data: activePromotions = [] } = useQuery<Promotion[]>({
    queryKey: ["/api/promotions/active", `?date=${selectedDate}`],
    enabled: !!selectedDate,
  });

  // Filter promotions by selected counter's POS location
  const filteredPromotions = useMemo(() => {
    if (!selectedCounter) return activePromotions;
    const pos = posLocations.find((p) => p.id === selectedCounter);
    if (!pos) return activePromotions;
    return activePromotions.filter((promo) => {
      // No shopLocation = global promo, show to all
      if (!promo.shopLocation) return true;
      const loc = promo.shopLocation as string;
      // Match "Channel / StoreName" against this counter
      return loc.includes(pos.storeName) || loc.includes(`${pos.salesChannel} / ${pos.storeName}`);
    });
  }, [activePromotions, selectedCounter, posLocations]);

  // For management users, show all active POS locations; for BA, only assigned
  const isManagement = user?.role === "management";

  // Fetch existing sales for selected POS + date (to detect previous entries)
  const { data: existingSales = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", `?startDate=${selectedDate}&endDate=${selectedDate}&counterId=${selectedCounter}`],
    enabled: !!selectedCounter && !!selectedDate,
  });

  // Filter existing sales: for non-management, only show entries they submitted (or all if canViewHistory)
  const myExistingEntries = existingSales.filter(e => {
    if (isManagement) return true;
    if (user?.canViewHistory) return true;
    return e.submittedBy === user?.id;
  });
  const assignedPosIds = userAssignments.map(a => a.posId);
  const availablePos = isManagement
    ? posLocations.filter(p => p.isActive)
    : posLocations.filter(p => p.isActive && assignedPosIds.includes(p.id));

  // Get brands available at selected POS
  const availableBrandIds = brandPosAvail.map(bp => bp.brandId);
  const availableBrands = brands
    .filter(b => b.isActive && availableBrandIds.includes(b.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Group brands by category
  const brandsByCategory = availableBrands.reduce((acc, brand) => {
    if (!acc[brand.category]) acc[brand.category] = [];
    acc[brand.category].push(brand);
    return acc;
  }, {} as Record<string, Brand[]>);

  const categoryOrder = ["Skincare", "Haircare", "Body Care", "Others"];

  const submitMutation = useMutation({
    mutationFn: async () => {
      const entries = availableBrands
        .map(b => ({
          brandId: b.id,
          orders: salesData[b.id]?.orders || 0,
          units: salesData[b.id]?.units || 0,
          amount: salesData[b.id]?.amount || 0,
          gwpCount: salesData[b.id]?.gwpCount || 0,
        }))
        .filter(e => e.orders > 0 || e.units > 0 || e.amount > 0);

      const promotionResults = activePromotions
        .filter(p => promoData[p.id]?.gwpGiven > 0)
        .map(p => ({
          promotionId: p.id,
          gwpGiven: promoData[p.id]?.gwpGiven || 0,
          notes: promoData[p.id]?.notes || "",
        }));

      await apiRequest("POST", "/api/sales/batch", {
        counterId: selectedCounter,
        date: selectedDate,
        entries,
        promotionResults,
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: "Sales submitted", description: "Your daily sales have been recorded." });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSales = (brandId: string, field: "orders" | "units" | "amount" | "gwpCount", value: number) => {
    setSalesData(prev => ({
      ...prev,
      [brandId]: { ...prev[brandId], orders: prev[brandId]?.orders || 0, units: prev[brandId]?.units || 0, amount: prev[brandId]?.amount || 0, gwpCount: prev[brandId]?.gwpCount || 0, [field]: value },
    }));
  };

  const updatePromo = (promoId: string, field: "gwpGiven" | "notes", value: number | string) => {
    setPromoData(prev => ({
      ...prev,
      [promoId]: { ...prev[promoId], gwpGiven: prev[promoId]?.gwpGiven || 0, notes: prev[promoId]?.notes || "", [field]: value },
    }));
  };

  const handleReset = () => {
    setSalesData({});
    setPromoData({});
    setSubmitted(false);
  };

  const loadExistingData = () => {
    const data: Record<string, { orders: number; units: number; amount: number; gwpCount: number }> = {};
    myExistingEntries.forEach(e => {
      data[e.brandId] = {
        orders: e.orders ?? 0,
        units: e.units ?? 0,
        amount: e.amount ?? 0,
        gwpCount: e.gwpCount ?? 0,
      };
    });
    setSalesData(data);
    toast({ title: "Data loaded", description: "Previous entries loaded. Edit and re-submit to update." });
  };

  const totalOrders = Object.values(salesData).reduce((sum, d) => sum + (d.orders || 0), 0);
  const totalUnits = Object.values(salesData).reduce((sum, d) => sum + (d.units || 0), 0);
  const totalAmount = Object.values(salesData).reduce((sum, d) => sum + (d.amount || 0), 0);

  // No assigned POS for BA users
  if (!isManagement && availablePos.length === 0 && !submitted && !assignmentsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <Store className="w-10 h-10 mx-auto text-muted-foreground opacity-50" />
            <h2 className="text-lg font-semibold">No POS Locations Assigned</h2>
            <p className="text-sm text-muted-foreground">
              Contact management to get POS locations assigned to your account.
            </p>
            <Button variant="outline" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8 space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-semibold">Sales Submitted</h2>
            <p className="text-muted-foreground text-sm">
              {totalOrders} orders / {totalUnits} units / HK${totalAmount.toLocaleString()} recorded for {selectedDate}
            </p>
            <div className="flex flex-col gap-2 mt-4">
              <Button onClick={handleReset}>
                Enter More Sales
              </Button>
              {!isManagement && (
                <Link href="/my-dashboard">
                  <Button variant="outline" className="w-full">
                    Visit My Dashboard
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <ShoppingBag className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold leading-tight">Beauty Bliss</h1>
              <p className="text-xs text-muted-foreground">Daily Sales Entry — {user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isManagement && (
              <Link href="/my-dashboard">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer px-3 py-2 rounded-md hover:bg-accent" data-testid="link-my-dashboard">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  My Dashboard
                </span>
              </Link>
            )}
            {isManagement && (
              <Link href="/dashboard">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer px-3 py-2 rounded-md hover:bg-accent" data-testid="link-dashboard">
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </span>
              </Link>
            )}
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-2 rounded-md hover:bg-accent"
              data-testid="button-logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto p-4 space-y-4 pb-32">
        {/* Counter & Date Selection */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5" /> POS Location
              </label>
              <Select value={selectedCounter} onValueChange={(v) => { setSelectedCounter(v); setSalesData({}); setPromoData({}); }}>
                <SelectTrigger data-testid="select-counter">
                  <SelectValue placeholder="Select your POS location" />
                </SelectTrigger>
                <SelectContent>
                  {availablePos.map(pos => (
                    <SelectItem key={pos.id} value={pos.id}>{pos.salesChannel} — {pos.storeName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Date
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                data-testid="input-date"
              />
            </div>
          </CardContent>
        </Card>

        {/* Existing Entries Notice */}
        {selectedCounter && myExistingEntries.length > 0 && !submitted && (
          <Card className="border-amber-300/50 bg-amber-50/50 dark:bg-amber-900/10">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Existing entries for this date
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    {myExistingEntries.length} brand{myExistingEntries.length !== 1 ? "s" : ""} recorded
                    {" — "}
                    HK${myExistingEntries.reduce((s, e) => s + e.amount, 0).toLocaleString()}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-xs h-7 border-amber-300 text-amber-700 hover:bg-amber-100"
                    onClick={loadExistingData}
                  >
                    <Pencil className="w-3 h-3 mr-1" /> Load & Edit
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Promotions Banner */}
        {selectedCounter && filteredPromotions.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2 mb-3">
                <Gift className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Active Promotions ({filteredPromotions.length})</span>
              </div>
              <div className="space-y-3">
                {filteredPromotions.map(promo => {
                  const brand = brands.find(b => b.id === promo.brandId);
                  const typeColor = PROMO_TYPE_COLORS[promo.type] || PROMO_TYPE_COLORS["Other"];
                  return (
                    <div key={promo.id} className="bg-background/60 rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
                          {promo.type}
                        </span>
                        <span className="font-medium text-sm">{promo.name}</span>
                      </div>
                      {promo.mechanics && (
                        <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                          {promo.mechanics}
                        </p>
                      )}
                      {!promo.mechanics && promo.description && (
                        <p className="text-xs text-muted-foreground">{promo.description}</p>
                      )}
                      {promo.shopLocation && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {promo.shopLocation}
                        </p>
                      )}
                      {promo.applicableProducts && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {promo.applicableProducts}
                        </p>
                      )}
                      {promo.exclusions && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          Excl: {promo.exclusions}
                        </p>
                      )}
                      {promo.gwpItem && (
                        <p className="text-xs text-foreground/80">
                          GWP: {promo.gwpItem}{promo.gwpQty ? ` (x${promo.gwpQty})` : ""}
                        </p>
                      )}
                      {brand && (
                        <p className="text-xs text-muted-foreground">Brand: {brand.name}</p>
                      )}
                      {promo.trackable && (
                        <div className="space-y-1.5 pt-1 border-t border-dashed mt-1.5">
                          {promo.type === "GWP" && (
                            <div className="flex gap-2 items-center">
                              <label className="text-xs font-medium whitespace-nowrap">
                                {promo.gwpItem ? `${promo.gwpItem} given:` : "GWP Given:"}
                              </label>
                              <Input
                                type="number" min={0} className="h-7 w-20 text-sm"
                                value={promoData[promo.id]?.gwpGiven || ""}
                                onChange={(e) => updatePromo(promo.id, "gwpGiven", parseInt(e.target.value) || 0)}
                                placeholder="0"
                              />
                            </div>
                          )}
                          {promo.type === "PWP" && (
                            <div className="flex gap-2 items-center">
                              <label className="text-xs font-medium whitespace-nowrap">
                                {promo.pwpItem ? `${promo.pwpItem} sold:` : "PWP Sold:"}
                              </label>
                              <Input
                                type="number" min={0} className="h-7 w-20 text-sm"
                                value={promoData[promo.id]?.gwpGiven || ""}
                                onChange={(e) => updatePromo(promo.id, "gwpGiven", parseInt(e.target.value) || 0)}
                                placeholder="0"
                              />
                            </div>
                          )}
                          {promo.type !== "GWP" && promo.type !== "PWP" && (
                            <div className="flex gap-2 items-center">
                              <label className="text-xs font-medium whitespace-nowrap">Activity count:</label>
                              <Input
                                type="number" min={0} className="h-7 w-20 text-sm"
                                value={promoData[promo.id]?.gwpGiven || ""}
                                onChange={(e) => updatePromo(promo.id, "gwpGiven", parseInt(e.target.value) || 0)}
                                placeholder="0"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {!promo.trackable && promo.type === "GWP" && promo.gwpItem && (
                        <div className="flex gap-2 items-center pt-1">
                          <label className="text-xs font-medium whitespace-nowrap">GWP Given:</label>
                          <Input
                            type="number" min={0} className="h-8 w-20 text-sm"
                            value={promoData[promo.id]?.gwpGiven || ""}
                            onChange={(e) => updatePromo(promo.id, "gwpGiven", parseInt(e.target.value) || 0)}
                            placeholder="0"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sales Entry by Brand */}
        {selectedCounter && categoryOrder.map(category => {
          const catBrands = brandsByCategory[category];
          if (!catBrands || catBrands.length === 0) return null;
          return (
            <div key={category} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                {category}
              </h3>
              {catBrands.map(brand => {
                const hasActivePromo = activePromotions.some(p => p.brandId === brand.id);
                return (
                  <Card key={brand.id} className={hasActivePromo ? "border-primary/20" : ""}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{brand.name}</span>
                        {hasActivePromo && (
                          <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                            <Gift className="w-3 h-3 mr-1" /> Promo
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Orders</label>
                          <Input
                            type="number"
                            min={0}
                            className="h-9 tabular-nums"
                            value={salesData[brand.id]?.orders || ""}
                            onChange={(e) => updateSales(brand.id, "orders", parseInt(e.target.value) || 0)}
                            placeholder="0"
                            data-testid={`input-orders-${brand.id}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Units</label>
                          <Input
                            type="number"
                            min={0}
                            className="h-9 tabular-nums"
                            value={salesData[brand.id]?.units || ""}
                            onChange={(e) => updateSales(brand.id, "units", parseInt(e.target.value) || 0)}
                            placeholder="0"
                            data-testid={`input-units-${brand.id}`}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Amount (HK$)</label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-9 tabular-nums"
                            value={salesData[brand.id]?.amount || ""}
                            onChange={(e) => updateSales(brand.id, "amount", parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            data-testid={`input-amount-${brand.id}`}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })}

        {!selectedCounter && (
          <div className="text-center py-12 text-muted-foreground">
            <Store className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Select your POS location to begin</p>
          </div>
        )}
      </div>

      {/* Sticky Submit Footer */}
      {selectedCounter && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
          <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-2 text-sm tabular-nums">
              <span className="text-muted-foreground">
                {totalOrders} order{totalOrders !== 1 ? "s" : ""} / {totalUnits} unit{totalUnits !== 1 ? "s" : ""} / HK${totalAmount.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">{selectedDate}</span>
            </div>
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || (totalOrders === 0 && totalUnits === 0 && totalAmount === 0)}
              data-testid="button-submit"
            >
              {submitMutation.isPending ? "Submitting..." : "Submit Sales"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
