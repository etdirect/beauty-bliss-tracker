import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import type { Brand, Promotion, BrandPosAvailability, PosLocation, SalesEntry, IncentiveScheme, RewardTier, StoreThreshold, ComboBonus, TargetProduct } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CheckCircle, Gift, ShoppingBag, Calendar, Store, LayoutDashboard, MapPin, Tag, Package, LogOut, Pencil, AlertCircle, Trophy, ChevronDown, ChevronUp, Search, Filter, X } from "lucide-react";
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
    (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()
  );
  const [salesData, setSalesData] = useState<Record<string, { orders: number; units: number; amount: number; gwpCount: number }>>({});
  const [promoData, setPromoData] = useState<Record<string, { gwpGiven: number; notes: string }>>({});
  const [submitted, setSubmitted] = useState(false);

  // Promotion filter state
  const [filterBrand, setFilterBrand] = useState<string>("__all__");
  const [filterType, setFilterType] = useState<string>("__all__");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  // Collapsible section state
  const [promoL1Open, setPromoL1Open] = useState(true);
  const [promoL2Open, setPromoL2Open] = useState(true);
  const [incentivesOpen, setIncentivesOpen] = useState(true);

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
    staleTime: 60_000, // re-fetch every 60 seconds so new pushes appear
    refetchOnWindowFocus: true,
  });

  // Filter promotions by selected counter's POS location
  const posFilteredPromotions = useMemo(() => {
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

  // Apply user filters (brand, promo type, date range) on top of POS filter
  const filteredPromotions = useMemo(() => {
    return posFilteredPromotions.filter((promo) => {
      // Brand filter
      if (filterBrand !== "__all__") {
        if (promo.brandId !== filterBrand) {
          // Also check brand name in promo name as fallback
          const brand = brands.find(b => b.id === filterBrand);
          if (!brand || !(promo.name || "").toLowerCase().includes(brand.name.toLowerCase())) {
            return false;
          }
        }
      }
      // Promo type filter
      if (filterType !== "__all__" && promo.type !== filterType) return false;
      // Date range filter (promo must overlap with filter range)
      if (filterStartDate && promo.endDate && promo.endDate < filterStartDate) return false;
      if (filterEndDate && promo.startDate && promo.startDate > filterEndDate) return false;
      return true;
    });
  }, [posFilteredPromotions, filterBrand, filterType, filterStartDate, filterEndDate, brands]);

  // Unique promo types for filter dropdown
  const promoTypes = useMemo(() => {
    const types = new Set<string>();
    posFilteredPromotions.forEach(p => types.add(p.type));
    return Array.from(types).sort();
  }, [posFilteredPromotions]);

  // Unique brands in promotions for filter
  const promoBrands = useMemo(() => {
    const bIds = new Set<string>();
    posFilteredPromotions.forEach(p => {
      if (p.brandId) bIds.add(p.brandId);
    });
    return brands.filter(b => bIds.has(b.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [posFilteredPromotions, brands]);

  const hasActiveFilters = filterBrand !== "__all__" || filterType !== "__all__" || filterStartDate || filterEndDate;

  const clearFilters = () => {
    setFilterBrand("__all__");
    setFilterType("__all__");
    setFilterStartDate("");
    setFilterEndDate("");
  };

  const collapseAll = () => { setPromoL1Open(false); setPromoL2Open(false); setIncentivesOpen(false); };
  const expandAll = () => { setPromoL1Open(true); setPromoL2Open(true); setIncentivesOpen(true); };

  // Incentive schemes
  const currentMonth = selectedDate?.substring(0, 7) || new Date().toISOString().substring(0, 7);

  const { data: activeIncentives = [] } = useQuery<IncentiveScheme[]>({
    queryKey: [`/api/incentive-schemes/month/${currentMonth}`],
    enabled: !!currentMonth,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Incentive entries: daily (today) and accumulated (month total) — from BA manual input
  const { data: incentiveDailyEntries = {}, refetch: refetchDailyEntries } = useQuery<Record<string, number>>({
    queryKey: [`/api/incentive-entries-daily?month=${currentMonth}&date=${selectedDate}&userId=${user?.id || ""}`],
    enabled: !!currentMonth && !!selectedDate && !!user?.id,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  const { data: incentiveTotalEntries = {}, refetch: refetchTotalEntries } = useQuery<Record<string, number>>({
    queryKey: [`/api/incentive-entries-total?month=${currentMonth}&userId=${user?.id || ""}`],
    enabled: !!currentMonth && !!user?.id,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
  // Local state for today's input values (so typing doesn't flicker)
  const [incentiveInputs, setIncentiveInputs] = useState<Record<string, string>>({});
  // Sync from server when data loads
  const prevDailyRef = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify(incentiveDailyEntries);
    if (key !== prevDailyRef.current) {
      prevDailyRef.current = key;
      const inputs: Record<string, string> = {};
      for (const [id, val] of Object.entries(incentiveDailyEntries)) {
        inputs[id] = val > 0 ? String(val) : "";
      }
      setIncentiveInputs(inputs);
    }
  }, [incentiveDailyEntries]);

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

        {/* Promotion Filter Bar + Collapse/Expand */}
        {selectedCounter && posFilteredPromotions.length > 0 && (
          <div className="space-y-2">
            {/* Toggle row: filter button + collapse/expand */}
            <div className="flex items-center justify-between">
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-3 h-3" />
                {showFilters ? "Hide Filters" : "Filters"}
                {hasActiveFilters && (
                  <span className="ml-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                    {(filterBrand !== "__all__" ? 1 : 0) + (filterType !== "__all__" ? 1 : 0) + (filterStartDate ? 1 : 0) + (filterEndDate ? 1 : 0)}
                  </span>
                )}
              </Button>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={expandAll}>
                  <ChevronDown className="w-3 h-3 mr-1" /> Expand All
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={collapseAll}>
                  <ChevronUp className="w-3 h-3 mr-1" /> Collapse All
                </Button>
              </div>
            </div>

            {/* Filter panel */}
            {showFilters && (
              <Card className="border-dashed">
                <CardContent className="pt-3 pb-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Brand</label>
                      <Select value={filterBrand} onValueChange={setFilterBrand}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All Brands" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Brands</SelectItem>
                          {promoBrands.map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Promotion Type</label>
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__all__">All Types</SelectItem>
                          {promoTypes.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">End Date</label>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={filterEndDate}
                        onChange={(e) => setFilterEndDate(e.target.value)}
                      />
                    </div>
                  </div>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearFilters}>
                      <X className="w-3 h-3 mr-1" /> Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Active Promotions — Layer 1 (Brand) */}
        {selectedCounter && filteredPromotions.filter(p => p.promotionLayer !== "counter" && p.promotionLayer !== "channel").length > 0 && (
          <Collapsible open={promoL1Open} onOpenChange={setPromoL1Open}>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-3 pb-3">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold">Active Promotions</span>
                    <span className="text-xs text-muted-foreground">({filteredPromotions.filter(p => p.promotionLayer !== "counter" && p.promotionLayer !== "channel").length})</span>
                  </div>
                  {promoL1Open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
              <div className="space-y-3 mt-3">
                {filteredPromotions.filter(p => p.promotionLayer !== "counter" && p.promotionLayer !== "channel").map(promo => {
                  const typeColor = PROMO_TYPE_COLORS[promo.type] || PROMO_TYPE_COLORS["Other"];
                  const fmtD = (d: string) => { const [y,m,dd] = d.split("-"); return `${dd}/${m}`; };
                  // Resolve brand: from brandId, or try matching brand name in promo name/applicableProducts
                  let brandName = promo.brandId ? brands.find(b => b.id === promo.brandId)?.name : null;
                  if (!brandName) {
                    const nameLC = (promo.name || "").toLowerCase();
                    brandName = brands.find(b => nameLC.includes(b.name.toLowerCase()))?.name || null;
                  }
                  return (
                    <div key={promo.id} className="bg-background/60 rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
                          {promo.type}
                        </span>
                        {promo.startDate && promo.endDate && (
                          <span className="text-[10px] text-muted-foreground">{fmtD(promo.startDate)} – {fmtD(promo.endDate)}</span>
                        )}
                        <span className="font-medium text-sm break-words">{brandName ? `[${brandName}]` : ""}{promo.descriptionZh || promo.name}</span>
                      </div>
                      {(promo.mechanicsZh || promo.mechanics) && (
                        <p className="text-xs text-foreground/90 leading-relaxed font-medium break-words">
                          {promo.mechanicsZh || promo.mechanics}
                        </p>
                      )}
                      {promo.exclusions && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <Tag className="w-3 h-3 shrink-0" />
                          <span className="break-words">除外: {promo.exclusions}</span>
                        </p>
                      )}
                      {promo.trackable && promo.type === "GWP" && (
                        <div className="flex gap-2 items-center pt-1 border-t border-dashed mt-1.5">
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
                      {promo.trackable && promo.type === "PWP" && (
                        <div className="flex gap-2 items-center pt-1 border-t border-dashed mt-1.5">
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
                      {!promo.trackable && promo.type === "GWP" && promo.gwpItem && (
                        <div className="flex gap-2 items-center pt-1 border-t border-dashed mt-1.5">
                          <label className="text-xs font-medium whitespace-nowrap">{promo.gwpItem} given:</label>
                          <Input
                            type="number" min={0} className="h-7 w-20 text-sm"
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
              </CollapsibleContent>
            </CardContent>
          </Card>
          </Collapsible>
        )}

        {/* Active Promotions — Layer 2 (Counter/Shop) in blue */}
        {selectedCounter && filteredPromotions.filter(p => p.promotionLayer === "counter" || p.promotionLayer === "channel").length > 0 && (
          <Collapsible open={promoL2Open} onOpenChange={setPromoL2Open}>
          <Card className="border-blue-300/50 dark:border-blue-700/50 bg-blue-50/60 dark:bg-blue-950/30">
            <CardContent className="pt-3 pb-3">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span className="text-sm font-semibold text-blue-800 dark:text-blue-200">Counter / Shop Promotions</span>
                    <span className="text-xs text-muted-foreground">({filteredPromotions.filter(p => p.promotionLayer === "counter" || p.promotionLayer === "channel").length})</span>
                  </div>
                  {promoL2Open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
              <div className="space-y-3 mt-3">
                {filteredPromotions.filter(p => p.promotionLayer === "counter" || p.promotionLayer === "channel").map(promo => {
                  const typeColor = PROMO_TYPE_COLORS[promo.type] || PROMO_TYPE_COLORS["Other"];
                  const fmtD = (d: string) => { const [y,m,dd] = d.split("-"); return `${dd}/${m}`; };
                  return (
                    <div key={promo.id} className="bg-white/60 dark:bg-blue-900/30 rounded-md p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${typeColor}`}>
                          {promo.type}
                        </span>
                        {promo.startDate && promo.endDate && (
                          <span className="text-[10px] text-muted-foreground">{fmtD(promo.startDate)} – {fmtD(promo.endDate)}</span>
                        )}
                        <span className="font-medium text-sm break-words">{promo.descriptionZh || promo.name}</span>
                      </div>
                      {(promo.mechanicsZh || promo.mechanics) && (
                        <p className="text-xs text-foreground/90 leading-relaxed font-medium break-words">
                          {promo.mechanicsZh || promo.mechanics}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              </CollapsibleContent>
            </CardContent>
          </Card>
          </Collapsible>
        )}

        {/* Monthly Incentives */}
        {selectedCounter && (() => {
          // Filter incentives: active + matching POS (or no POS = all)
          const filteredIncentives = activeIncentives.filter(s => {
            if (!s.isActive) return false;
            if (!s.posIds) return true; // no POS restriction
            const ids = (s.posIds as string).split(",").filter(Boolean);
            return ids.length === 0 || ids.includes(selectedCounter);
          });
          if (filteredIncentives.length === 0) return null;
          return (
          <Collapsible open={incentivesOpen} onOpenChange={setIncentivesOpen}>
          <Card className="border-amber-300/50 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-3 pb-3">
              <CollapsibleTrigger asChild>
                <button className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">Monthly Incentives — {currentMonth}</span>
                    <span className="text-xs text-muted-foreground">({filteredIncentives.length})</span>
                  </div>
                  {incentivesOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
              <div className="space-y-3 mt-3">
                {filteredIncentives.map(scheme => {
                  const totalProgress = incentiveTotalEntries[scheme.id] ?? 0;
                  // Parse new fields
                  const tiers: RewardTier[] = scheme.rewardTiers ? JSON.parse(scheme.rewardTiers) : [];
                  const storeThresholds: StoreThreshold[] = scheme.storeThresholds ? JSON.parse(scheme.storeThresholds) : [];
                  const offset = scheme.incentiveOffset ?? 0;
                  const combo: ComboBonus | null = scheme.comboBonus ? JSON.parse(scheme.comboBonus) : null;
                  const targetProducts: TargetProduct[] = scheme.targetProducts ? JSON.parse(scheme.targetProducts) : [];

                  // Determine effective threshold (per-store or global)
                  const storeThreshold = storeThresholds.find(st => st.posId === selectedCounter);
                  const effectiveThreshold = storeThreshold ? storeThreshold.threshold : scheme.threshold;

                  const pct = effectiveThreshold > 0 ? Math.min(100, (totalProgress / effectiveThreshold) * 100) : 0;
                  const achieved = totalProgress >= effectiveThreshold;
                  const isUnits = scheme.metric === "units" || scheme.metric === "gwp_given";
                  const isTxn = scheme.metric === "transaction_amount";

                  // Chinese description
                  const catZh: Record<string, string> = {
                    product_units: "產品銷售（件數）", product_amount: "產品銷售（金額）",
                    promo_achievement: "推廣達標", brand_units: "品牌銷售（件數）",
                    brand_amount: "品牌銷售（金額）", pos_volume: "銷售點銷售額",
                    transaction_amount: "每筆交易金額",
                  };
                  const thresholdZh = isTxn
                    ? `每筆>HK$${effectiveThreshold.toLocaleString()}`
                    : isUnits ? `${effectiveThreshold}件` : `HK$${effectiveThreshold.toLocaleString()}`;
                  let rewardZh = "";
                  if (tiers.length > 0) {
                    rewardZh = "階梯獎勵: " + tiers.map(t => `${t.minQty}${t.maxQty ? `-${t.maxQty}` : "+"}件=$${t.rewardAmount}/件`).join(", ");
                  } else if (scheme.rewardBasis === "per_unit") rewardZh = `每售出一件可獲HK$${scheme.rewardAmount}`;
                  else if (scheme.rewardBasis === "per_amount") rewardZh = `每達HK$${(scheme.rewardPerAmountUnit || 1000).toLocaleString()}銷售額可獲HK$${scheme.rewardAmount}`;
                  else if (scheme.rewardBasis === "per_transaction") rewardZh = `每筆合資格交易可獲HK$${scheme.rewardAmount}`;
                  else rewardZh = `可獲固定獎金HK$${scheme.rewardAmount}`;
                  if (offset > 0) rewardZh += `（由第${offset + 1}件起計）`;
                  if (combo) rewardZh += `。另加組合獎金HK$${combo.amount}`;
                  const target = scheme.targetName || "";
                  let descZh = "";
                  if (isTxn) {
                    descZh = `${target ? target + "，" : ""}每筆交易金額超過HK$${effectiveThreshold.toLocaleString()}，${rewardZh}。`;
                  } else if (scheme.category === "promo_achievement") {
                    descZh = `達成${target}推廣目標${thresholdZh}，${rewardZh}。`;
                  } else {
                    descZh = `${target ? target + "，" : ""}${catZh[scheme.category] || scheme.category}達${thresholdZh}，${rewardZh}。`;
                  }

                  const progressText = isTxn
                    ? `${Math.round(totalProgress)} 筆`
                    : isUnits
                      ? `${Math.round(totalProgress)} / ${Math.round(effectiveThreshold)}件`
                      : `HK$${totalProgress.toLocaleString()} / HK$${effectiveThreshold.toLocaleString()}`;

                  // Calculate earned reward
                  let earned = 0;
                  if (isTxn) {
                    // per_transaction: reward per qualifying transaction
                    earned = totalProgress * scheme.rewardAmount;
                  } else if (tiers.length > 0) {
                    // Tiered reward calculation
                    const countable = Math.max(0, totalProgress - offset);
                    if (countable > 0 && totalProgress >= effectiveThreshold) {
                      // Find the applicable tier for total qty
                      let tierRate = 0;
                      for (const t of tiers) {
                        if (countable >= t.minQty && (!t.maxQty || countable <= t.maxQty)) {
                          tierRate = t.rewardAmount;
                        }
                      }
                      // If countable exceeds all defined tiers, use the last tier
                      if (tierRate === 0 && tiers.length > 0) {
                        const lastTier = tiers[tiers.length - 1];
                        if (countable >= lastTier.minQty) tierRate = lastTier.rewardAmount;
                      }
                      earned = countable * tierRate;
                    }
                  } else if (achieved || scheme.rewardBasis !== "fixed") {
                    const countable = Math.max(0, totalProgress - offset);
                    if (scheme.rewardBasis === "per_unit") earned = countable * scheme.rewardAmount;
                    else if (scheme.rewardBasis === "per_amount") earned = (totalProgress / (scheme.rewardPerAmountUnit || 1000)) * scheme.rewardAmount;
                    else earned = scheme.rewardAmount;
                  }
                  if (scheme.rewardBasis === "fixed" && !achieved) earned = 0;
                  // Add combo bonus if applicable
                  if (combo && achieved) earned += combo.amount;

                  // Determine current tier for display
                  let currentTierLabel = "";
                  if (tiers.length > 0 && totalProgress >= effectiveThreshold) {
                    const countable = Math.max(0, totalProgress - offset);
                    for (const t of tiers) {
                      if (countable >= t.minQty && (!t.maxQty || countable <= t.maxQty)) {
                        currentTierLabel = `當前: $${t.rewardAmount}/件`;
                      }
                    }
                    // Next tier info
                    const nextTier = tiers.find(t => countable < t.minQty);
                    if (nextTier) {
                      currentTierLabel += ` → 差${nextTier.minQty - countable}件升級$${nextTier.rewardAmount}/件`;
                    }
                  }

                  return (
                    <div key={scheme.id} className={`rounded-md p-2.5 space-y-2 ${achieved ? "bg-green-50 dark:bg-green-900/20 border border-green-300/50" : "bg-background/60"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{scheme.name}</span>
                        {achieved && <span className="text-xs font-semibold text-green-700 dark:text-green-400">✓ 已達標</span>}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{descZh}</p>
                      {targetProducts.length > 0 && (
                        <div className="text-[10px] text-muted-foreground leading-relaxed">
                          <span className="font-medium">適用產品:</span>
                          {targetProducts.map((p, i) => (
                            <span key={p.sgCode}>{i > 0 ? "、" : " "}{p.nameChi || p.nameEng}{p.volume ? ` ${p.volume}` : ""}</span>
                          ))}
                        </div>
                      )}
                      {storeThreshold && (
                        <p className="text-[10px] text-blue-600 dark:text-blue-400">本店目標: {storeThreshold.threshold}{isUnits ? "件" : " HK$"}</p>
                      )}

                      {/* 今日達成 — BA input */}
                      <div className="flex items-center gap-2 pt-1 border-t border-dashed">
                        <label className="text-xs font-medium whitespace-nowrap">今日達成:</label>
                        <Input
                          type="number" min={0} className="h-7 w-24 text-sm"
                          value={incentiveInputs[scheme.id] ?? ""}
                          onChange={e => setIncentiveInputs(prev => ({ ...prev, [scheme.id]: e.target.value }))}
                          onBlur={async () => {
                            const val = parseFloat(incentiveInputs[scheme.id] || "0") || 0;
                            try {
                              await apiRequest("POST", "/api/incentive-entry", {
                                schemeId: scheme.id,
                                date: selectedDate,
                                value: val,
                                posId: selectedCounter || undefined,
                              });
                              refetchDailyEntries();
                              refetchTotalEntries();
                            } catch { /* silent */ }
                          }}
                          placeholder="0"
                        />
                        <span className="text-[10px] text-muted-foreground">{isTxn ? "筆" : isUnits ? "件" : "HK$"}</span>
                      </div>

                      {!isTxn && (
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all ${achieved ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                        <span className="text-muted-foreground">累計達成: <span className="font-medium text-foreground">{progressText}</span></span>
                        {currentTierLabel && <span className="text-blue-600 dark:text-blue-400 text-[10px]">{currentTierLabel}</span>}
                        {earned > 0 && <span className={`font-semibold ${achieved ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>已賺: HK${Math.round(earned).toLocaleString()}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              </CollapsibleContent>
            </CardContent>
          </Card>
          </Collapsible>
          );
        })()}

        {/* Sales Entry by Brand (alphabetical) */}
        {selectedCounter && availableBrands.length > 0 && (
          <div className="space-y-2">
            {availableBrands.map(brand => {
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
        )}

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
