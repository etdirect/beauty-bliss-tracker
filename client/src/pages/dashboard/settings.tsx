import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Counter, Brand, CounterBrand, PosLocation, BrandPosAvailability, Category, Promotion, IncentiveScheme, InsertIncentiveScheme, IncentiveCategory } from "@shared/schema";
import { incentiveCategories, incentiveRewardBases, INCENTIVE_CATEGORY_LABELS } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Store, Tag, Grid3X3, Eye, EyeOff, Users, MapPin, KeyRound, Pencil, Check, X, Trash2, Layers, Trophy } from "lucide-react";

interface SafeUser {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
  canViewHistory: boolean;
}

interface UserPosAssignment {
  id: string;
  userId: string;
  posId: string;
}

export default function SettingsPage() {
  const { toast } = useToast();

  // POS Location form
  const [newPosSalesChannel, setNewPosSalesChannel] = useState("");
  const [newPosStoreCode, setNewPosStoreCode] = useState("");
  const [newPosStoreName, setNewPosStoreName] = useState("");

  // POS edit state
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [editPosSalesChannel, setEditPosSalesChannel] = useState("");
  const [editPosStoreCode, setEditPosStoreCode] = useState("");
  const [editPosStoreName, setEditPosStoreName] = useState("");

  // User form
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserRole, setNewUserRole] = useState("ba");

  // PIN reset
  const [resetPinUserId, setResetPinUserId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");

  // User edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserUsername, setEditUserUsername] = useState("");
  const [editUserRole, setEditUserRole] = useState("ba");

  // New counter/brand forms (legacy)
  const [newCounterName, setNewCounterName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandCategory, setNewBrandCategory] = useState("Skincare");
  const [editingBrandId, setEditingBrandId] = useState<string | null>(null);
  const [editBrandName, setEditBrandName] = useState("");
  const [editBrandCategory, setEditBrandCategory] = useState("");

  // Queries — staleTime: 30_000 to override global Infinity default
  const { data: posLocations = [] } = useQuery<PosLocation[]>({ queryKey: ["/api/pos-locations"], staleTime: 30_000 });
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"], staleTime: 30_000 });
  const { data: users = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/users"], staleTime: 30_000 });
  const { data: userPosAssignments = [] } = useQuery<UserPosAssignment[]>({ queryKey: ["/api/user-pos-assignments"], staleTime: 30_000 });
  const { data: brandPosAvail = [] } = useQuery<BrandPosAvailability[]>({ queryKey: ["/api/brand-pos-availability"], staleTime: 30_000 });
  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"], staleTime: 30_000 });
  const { data: counterBrands = [] } = useQuery<CounterBrand[]>({ queryKey: ["/api/counter-brands"], staleTime: 30_000 });
  const { data: categoryList = [] } = useQuery<Category[]>({ queryKey: ["/api/categories"], staleTime: 30_000 });

  // Category state
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");

  // Incentive state
  const [incentiveFilterMonth, setIncentiveFilterMonth] = useState("");
  const [incentiveFilterCategory, setIncentiveFilterCategory] = useState("");
  const [incentiveFilterTarget, setIncentiveFilterTarget] = useState("");
  const [incentiveDialogOpen, setIncentiveDialogOpen] = useState(false);
  const [editingIncentiveId, setEditingIncentiveId] = useState<string | null>(null);
  const [incForm, setIncForm] = useState<Partial<InsertIncentiveScheme>>({});
  const [incProductName, setIncProductName] = useState("");

  const { data: promotions = [] } = useQuery<Promotion[]>({ queryKey: ["/api/promotions"], staleTime: 30_000 });
  const { data: allIncentiveSchemes = [] } = useQuery<IncentiveScheme[]>({
    queryKey: ["/api/incentive-schemes"],
    staleTime: 30_000,
  });

  // Client-side filtered incentives
  const incentiveSchemes = useMemo(() => {
    let list = allIncentiveSchemes;
    if (incentiveFilterMonth) list = list.filter(s => s.month === incentiveFilterMonth);
    if (incentiveFilterCategory) list = list.filter(s => s.category === incentiveFilterCategory);
    if (incentiveFilterTarget) list = list.filter(s => (s.targetName || "").toLowerCase().includes(incentiveFilterTarget.toLowerCase()));
    return list;
  }, [allIncentiveSchemes, incentiveFilterMonth, incentiveFilterCategory, incentiveFilterTarget]);

  // Unique months and targets for filter dropdowns
  const incentiveMonths = useMemo(() => Array.from(new Set(allIncentiveSchemes.map(s => s.month))).sort().reverse(), [allIncentiveSchemes]);
  const incentiveTargets = useMemo(() => Array.from(new Set(allIncentiveSchemes.map(s => s.targetName).filter(Boolean))).sort() as string[], [allIncentiveSchemes]);

  const metricForCategory = (cat: string) => {
    if (cat === "product_units" || cat === "brand_units") return "units";
    if (cat === "product_amount" || cat === "brand_amount" || cat === "pos_volume") return "amount";
    if (cat === "promo_achievement") return "gwp_given";
    return "units";
  };

  const rewardBasisLabels: Record<string, string> = { per_unit: "Per Unit", per_amount: "Per Amount", fixed: "Fixed Bonus" };

  const formatReward = (s: IncentiveScheme) => {
    if (s.rewardBasis === "per_unit") return `HK$${s.rewardAmount} / unit`;
    if (s.rewardBasis === "per_amount") return `HK$${s.rewardAmount} / HK$${(s.rewardPerAmountUnit || 1000).toLocaleString()}`;
    return `HK$${s.rewardAmount} flat`;
  };

  const openIncDialog = (s?: IncentiveScheme) => {
    if (s) {
      setEditingIncentiveId(s.id);
      setIncForm({ name: s.name, month: s.month, category: s.category as IncentiveCategory, targetId: s.targetId ?? undefined, targetName: s.targetName ?? undefined, metric: s.metric, threshold: s.threshold, rewardBasis: s.rewardBasis as any, rewardAmount: s.rewardAmount, rewardPerAmountUnit: s.rewardPerAmountUnit ?? undefined, notes: s.notes ?? undefined });
      // Try to extract product name from stored name (format: "Brand ProductName, ...")
      const storedName = s.name || "";
      const target = s.targetName || "";
      if (target && storedName.startsWith(target + " ")) {
        const afterBrand = storedName.substring(target.length + 1);
        const commaIdx = afterBrand.indexOf(",");
        setIncProductName(commaIdx > 0 ? afterBrand.substring(0, commaIdx).trim() : "");
      } else {
        setIncProductName("");
      }
    } else {
      setEditingIncentiveId(null);
      setIncForm({ month: incentiveFilterMonth || new Date().toISOString().substring(0, 7), rewardBasis: "fixed", metric: "units", threshold: 0, rewardAmount: 0 });
      setIncProductName("");
    }
    setIncentiveDialogOpen(true);
  };

  const saveIncentiveMutation = useMutation({
    mutationFn: async () => {
      const body = { ...incForm, metric: metricForCategory(incForm.category || "") };
      if (editingIncentiveId) {
        await apiRequest("PATCH", `/api/incentive-schemes/${editingIncentiveId}`, body);
      } else {
        await apiRequest("POST", "/api/incentive-schemes", body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incentive-schemes"], refetchType: "active" });
      setIncentiveDialogOpen(false);
      toast({ title: editingIncentiveId ? "Incentive updated" : "Incentive created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteIncentiveMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/incentive-schemes/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/incentive-schemes"], refetchType: "active" });
      toast({ title: "Incentive deleted" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleIncentiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/incentive-schemes/${id}`, { isActive });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/incentive-schemes"], refetchType: "active" }); },
  });

  // === POS Location mutations ===
  const createPosMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/pos-locations", {
        salesChannel: newPosSalesChannel,
        storeCode: newPosStoreCode,
        storeName: newPosStoreName,
        isActive: true,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counters"] });
      setNewPosSalesChannel("");
      setNewPosStoreCode("");
      setNewPosStoreName("");
      toast({ title: "POS Location added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const togglePosMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/pos-locations/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counters"] });
    },
  });

  const editPosMutation = useMutation({
    mutationFn: async ({ id, salesChannel, storeCode, storeName }: { id: string; salesChannel: string; storeCode: string; storeName: string }) => {
      await apiRequest("PATCH", `/api/pos-locations/${id}`, { salesChannel, storeCode, storeName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pos-locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/counters"] });
      setEditingPosId(null);
      toast({ title: "POS Location updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // === User mutations ===
  const createUserMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users", {
        username: newUserUsername,
        pin: newUserPin,
        name: newUserName,
        role: newUserRole,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setNewUserUsername("");
      setNewUserName("");
      setNewUserPin("");
      setNewUserRole("ba");
      toast({ title: "User created" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleUserMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/users/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
  });

  const resetPinMutation = useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string }) => {
      await apiRequest("PATCH", `/api/users/${id}`, { pin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setResetPinUserId(null);
      setResetPinValue("");
      toast({ title: "PIN reset successfully" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const editUserMutation = useMutation({
    mutationFn: async ({ id, name, username, role, canViewHistory }: { id: string; name: string; username: string; role: string; canViewHistory?: boolean }) => {
      const body: Record<string, any> = { name, username, role };
      if (canViewHistory !== undefined) body.canViewHistory = canViewHistory;
      await apiRequest("PATCH", `/api/users/${id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingUserId(null);
      toast({ title: "User updated" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // === User-POS assignment mutations ===
  const toggleUserPosMutation = useMutation({
    mutationFn: async ({ userId, posId, enabled }: { userId: string; posId: string; enabled: boolean }) => {
      await apiRequest("POST", "/api/user-pos-assignments", { userId, posId, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-pos-assignments"] });
    },
  });

  // === Brand-POS availability mutations ===
  const toggleBrandPosMutation = useMutation({
    mutationFn: async ({ brandId, posId, enabled }: { brandId: string; posId: string; enabled: boolean }) => {
      await apiRequest("POST", "/api/brand-pos-availability", { brandId, posId, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brand-pos-availability"] });
    },
  });

  // === Legacy mutations ===
  const createCounterMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/counters", { name: newCounterName, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counters"] });
      setNewCounterName("");
      toast({ title: "Counter added" });
    },
  });

  const toggleCounterMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/counters/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counters"] });
    },
  });

  const createBrandMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/brands", { name: newBrandName, category: newBrandCategory, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setNewBrandName("");
      toast({ title: "Brand added" });
    },
  });

  const toggleBrandMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/brands/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
    },
  });

  const editBrandMutation = useMutation({
    mutationFn: async ({ id, name, category }: { id: string; name: string; category: string }) => {
      await apiRequest("PATCH", `/api/brands/${id}`, { name, category });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setEditingBrandId(null);
    },
  });

  // === Category mutations ===
  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/categories", { name: newCategoryName.trim(), sortOrder: categoryList.length + 1 });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setNewCategoryName("");
      toast({ title: "Category created" });
    },
  });

  const editCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiRequest("PATCH", `/api/categories/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/brands"] });
      setEditingCategoryId(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      toast({ title: "Category deleted" });
    },
  });

  const toggleAssignmentMutation = useMutation({
    mutationFn: async ({ counterId, brandId, enabled }: { counterId: string; brandId: string; enabled: boolean }) => {
      await apiRequest("POST", "/api/counter-brands", { counterId, brandId, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/counter-brands"] });
    },
  });

  // Helpers
  const isUserPosAssigned = (userId: string, posId: string) =>
    userPosAssignments.some(a => a.userId === userId && a.posId === posId);

  const isBrandPosAvailable = (brandId: string, posId: string) =>
    brandPosAvail.some(a => a.brandId === brandId && a.posId === posId);

  const isAssigned = (counterId: string, brandId: string) =>
    counterBrands.some(cb => cb.counterId === counterId && cb.brandId === brandId);

  const activePos = posLocations.filter(p => p.isActive);
  const activeBrands = brands.filter(b => b.isActive);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <h2 className="text-xl font-semibold">Settings</h2>

      <Tabs defaultValue="pos-locations">
        <TabsList className="flex-wrap">
          <TabsTrigger value="pos-locations" data-testid="tab-pos-locations">
            <MapPin className="w-4 h-4 mr-1.5" /> POS Locations
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="w-4 h-4 mr-1.5" /> Users
          </TabsTrigger>
          <TabsTrigger value="brand-pos" data-testid="tab-brand-pos">
            <Grid3X3 className="w-4 h-4 mr-1.5" /> Brand-POS
          </TabsTrigger>
          <TabsTrigger value="brands" data-testid="tab-brands">
            <Tag className="w-4 h-4 mr-1.5" /> Brands
          </TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-categories">
            <Layers className="w-4 h-4 mr-1.5" /> Categories
          </TabsTrigger>
          <TabsTrigger value="incentives" data-testid="tab-incentives">
            <Trophy className="w-4 h-4 mr-1.5" /> Incentives
          </TabsTrigger>
        </TabsList>

        {/* POS Locations Tab */}
        <TabsContent value="pos-locations" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New POS Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Input
                  value={newPosSalesChannel}
                  onChange={e => setNewPosSalesChannel(e.target.value)}
                  placeholder="Sales Channel (e.g. LOGON)"
                  className="w-40"
                  data-testid="input-pos-channel"
                />
                <Input
                  value={newPosStoreCode}
                  onChange={e => setNewPosStoreCode(e.target.value)}
                  placeholder="Code (e.g. TS)"
                  className="w-28"
                  data-testid="input-pos-code"
                />
                <Input
                  value={newPosStoreName}
                  onChange={e => setNewPosStoreName(e.target.value)}
                  placeholder="Full name (e.g. LOG-ON TST Harbour City)"
                  className="flex-1 min-w-[200px]"
                  data-testid="input-pos-name"
                />
                <Button
                  onClick={() => createPosMutation.mutate()}
                  disabled={!newPosSalesChannel.trim() || !newPosStoreCode.trim() || !newPosStoreName.trim() || createPosMutation.isPending}
                  data-testid="button-add-pos"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Manage POS Locations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                // Group by sales channel, sort channels alphabetically, then store codes within each
                const sorted = [...posLocations].sort((a, b) => {
                  const ch = a.salesChannel.localeCompare(b.salesChannel);
                  if (ch !== 0) return ch;
                  return a.storeCode.localeCompare(b.storeCode);
                });
                const groups: Record<string, typeof posLocations> = {};
                for (const pos of sorted) {
                  if (!groups[pos.salesChannel]) groups[pos.salesChannel] = [];
                  groups[pos.salesChannel].push(pos);
                }
                return Object.entries(groups).map(([channel, items]) => (
                  <div key={channel}>
                    <div className="px-4 py-2 bg-muted/50 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{channel}</span>
                      <span className="text-xs text-muted-foreground ml-2">({items.length})</span>
                    </div>
                    <div className="divide-y">
                      {items.map(pos => (
                        <div key={pos.id} className="flex items-center px-4 py-2.5 gap-2">
                          {editingPosId === pos.id ? (
                            <>
                              <div className="grid grid-cols-[100px_60px_1fr] gap-2 flex-1">
                                <Input className="h-8 text-sm" value={editPosSalesChannel} onChange={(e) => setEditPosSalesChannel(e.target.value)} placeholder="Channel" />
                                <Input className="h-8 text-sm" value={editPosStoreCode} onChange={(e) => setEditPosStoreCode(e.target.value)} placeholder="Code" />
                                <Input className="h-8 text-sm" value={editPosStoreName} onChange={(e) => setEditPosStoreName(e.target.value)} placeholder="Store Name" />
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                  if (editPosSalesChannel && editPosStoreCode && editPosStoreName) {
                                    editPosMutation.mutate({ id: pos.id, salesChannel: editPosSalesChannel, storeCode: editPosStoreCode, storeName: editPosStoreName });
                                  }
                                }}><Check className="w-4 h-4 text-green-600" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingPosId(null)}><X className="w-4 h-4 text-muted-foreground" /></Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="grid grid-cols-[60px_1fr] gap-3 flex-1 items-center">
                                <Badge variant="outline" className="text-xs justify-center">{pos.storeCode}</Badge>
                                <span className={`text-sm ${pos.isActive ? "" : "text-muted-foreground line-through"}`}>
                                  {pos.storeName}
                                  {!pos.isActive && <Badge variant="secondary" className="text-[10px] ml-2">Inactive</Badge>}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                                  setEditingPosId(pos.id);
                                  setEditPosSalesChannel(pos.salesChannel);
                                  setEditPosStoreCode(pos.storeCode);
                                  setEditPosStoreName(pos.storeName);
                                }}><Pencil className="w-3.5 h-3.5" /></Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => togglePosMutation.mutate({ id: pos.id, isActive: !pos.isActive })}
                                  className="text-xs"
                                >
                                  {pos.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" /> Deactivate</> : <><Eye className="w-3.5 h-3.5 mr-1" /> Activate</>}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New User</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                <Input
                  value={newUserUsername}
                  onChange={e => setNewUserUsername(e.target.value)}
                  placeholder="Username"
                  className="w-32"
                  data-testid="input-new-username"
                />
                <Input
                  value={newUserName}
                  onChange={e => setNewUserName(e.target.value)}
                  placeholder="Display name"
                  className="w-40"
                  data-testid="input-new-user-name"
                />
                <Input
                  type="password"
                  inputMode="numeric"
                  value={newUserPin}
                  onChange={e => setNewUserPin(e.target.value)}
                  placeholder="PIN"
                  className="w-24"
                  data-testid="input-new-user-pin"
                />
                <Select value={newUserRole} onValueChange={setNewUserRole}>
                  <SelectTrigger className="w-36" data-testid="select-new-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ba">BA</SelectItem>
                    <SelectItem value="part_time">Part Time</SelectItem>
                    <SelectItem value="management">Management</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => createUserMutation.mutate()}
                  disabled={!newUserUsername.trim() || !newUserName.trim() || !newUserPin.trim() || createUserMutation.isPending}
                  data-testid="button-add-user"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Manage Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {(() => {
                // Sort: management first, then BA, then Part Time; within each group sort by name
                const roleOrder: Record<string, number> = { management: 0, ba: 1, part_time: 2 };
                const sorted = [...users].sort((a, b) => {
                  const ra = roleOrder[a.role] ?? 3, rb = roleOrder[b.role] ?? 3;
                  if (ra !== rb) return ra - rb;
                  return a.name.localeCompare(b.name);
                });
                const groups = [
                  { label: "Management", items: sorted.filter(u => u.role === "management") },
                  { label: "Beauty Advisors", items: sorted.filter(u => u.role === "ba") },
                  { label: "Part Time", items: sorted.filter(u => u.role === "part_time") },
                ].filter(g => g.items.length > 0);
                // Sort POS once for all users
                const sortedPos = [...activePos].sort((a, b) => {
                  const ch = a.salesChannel.localeCompare(b.salesChannel);
                  return ch !== 0 ? ch : a.storeCode.localeCompare(b.storeCode);
                });
                return groups.map(group => (
                  <div key={group.label}>
                    <div className="px-4 py-2 bg-muted/50 border-b">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">({group.items.length})</span>
                    </div>
                    <div className="divide-y">
                {group.items.map(user => (
                  <div key={user.id} className="px-4 py-3 space-y-2">
                    {editingUserId === user.id ? (
                      /* Edit mode */
                      <>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <Input className="w-[100px] sm:w-[140px] h-8 text-sm" value={editUserName} onChange={(e) => setEditUserName(e.target.value)} placeholder="Name" />
                          <Input className="w-[80px] sm:w-[120px] h-8 text-sm" value={editUserUsername} onChange={(e) => setEditUserUsername(e.target.value)} placeholder="Username" />
                          <Select value={editUserRole} onValueChange={setEditUserRole}>
                            <SelectTrigger className="w-[90px] sm:w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ba">BA</SelectItem>
                              <SelectItem value="part_time">Part Time</SelectItem>
                              <SelectItem value="management">Management</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            if (editUserName && editUserUsername) {
                              editUserMutation.mutate({ id: user.id, name: editUserName, username: editUserUsername, role: editUserRole });
                            }
                          }}><Check className="w-4 h-4 text-green-600" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingUserId(null)}><X className="w-4 h-4 text-muted-foreground" /></Button>
                        </div>
                      </>
                    ) : (
                      /* View mode */
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          <span className={`text-sm truncate ${user.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                            {user.name}
                          </span>
                          <Badge variant="outline" className="text-xs">@{user.username}</Badge>
                          {!user.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditingUserId(user.id);
                            setEditUserName(user.name);
                            setEditUserUsername(user.username);
                            setEditUserRole(user.role);
                          }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              if (resetPinUserId === user.id) {
                                setResetPinUserId(null);
                                setResetPinValue("");
                              } else {
                                setResetPinUserId(user.id);
                                setResetPinValue("");
                              }
                            }}
                          >
                            <KeyRound className="w-3.5 h-3.5 mr-1" /> PIN
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleUserMutation.mutate({ id: user.id, isActive: !user.isActive })}
                            className="text-xs"
                          >
                            {user.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" /> Deactivate</> : <><Eye className="w-3.5 h-3.5 mr-1" /> Activate</>}
                          </Button>
                        </div>
                      </div>
                    )}

                    {resetPinUserId === user.id && (
                      <div className="flex gap-2 items-center ml-6">
                        <Input
                          type="password"
                          inputMode="numeric"
                          value={resetPinValue}
                          onChange={e => setResetPinValue(e.target.value)}
                          placeholder="New PIN"
                          className="w-32 h-8"
                        />
                        <Button
                          size="sm"
                          onClick={() => resetPinMutation.mutate({ id: user.id, pin: resetPinValue })}
                          disabled={!resetPinValue.trim() || resetPinMutation.isPending}
                          className="h-8"
                        >
                          Reset PIN
                        </Button>
                      </div>
                    )}

                    {/* POS Assignments — Option B: compact grid with channel/code prefix */}
                    {(user.role === "ba" || user.role === "part_time") && (
                      <div className="ml-6">
                        <p className="text-xs text-muted-foreground mb-1.5">Assigned POS:</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-1.5">
                          {sortedPos.map(pos => (
                            <label key={pos.id} className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                              <Checkbox
                                className="h-3.5 w-3.5"
                                checked={isUserPosAssigned(user.id, pos.id)}
                                onCheckedChange={(checked) => {
                                  toggleUserPosMutation.mutate({ userId: user.id, posId: pos.id, enabled: !!checked });
                                }}
                              />
                              <span className="font-mono text-[11px]">{pos.salesChannel.substring(0, 3).toUpperCase()}/{pos.storeCode}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Can View History toggle — BA only */}
                    {user.role === "ba" && (
                      <div className="ml-6 mt-2">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            className="h-3.5 w-3.5"
                            checked={user.canViewHistory}
                            onCheckedChange={(checked) => {
                              editUserMutation.mutate({ id: user.id, name: user.name, username: user.username, role: user.role, canViewHistory: !!checked });
                            }}
                          />
                          <span>Can view past sales data</span>
                          {!user.canViewHistory && <Badge variant="secondary" className="text-[10px] px-1">Probation</Badge>}
                        </label>
                      </div>
                    )}
                  </div>
                ))}
                    </div>
                  </div>
                ));
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Brand-POS Availability Tab */}
        <TabsContent value="brand-pos" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Brand-POS Availability</CardTitle>
              <p className="text-xs text-muted-foreground">Check which brands are available at each POS location</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {(() => {
                // Sort POS by channel then code, group by channel
                const sorted = [...activePos].sort((a, b) => {
                  const ch = a.salesChannel.localeCompare(b.salesChannel);
                  return ch !== 0 ? ch : a.storeCode.localeCompare(b.storeCode);
                });
                const channelGroups: { channel: string; items: typeof activePos }[] = [];
                for (const pos of sorted) {
                  const last = channelGroups[channelGroups.length - 1];
                  if (last && last.channel === pos.salesChannel) {
                    last.items.push(pos);
                  } else {
                    channelGroups.push({ channel: pos.salesChannel, items: [pos] });
                  }
                }
                const channelColors: Record<string, string> = {
                  "AEON": "bg-blue-50 dark:bg-blue-950/30",
                  "FACESSS": "bg-purple-50 dark:bg-purple-950/30",
                  "LOGON": "bg-amber-50 dark:bg-amber-950/30",
                  "SOGO": "bg-green-50 dark:bg-green-950/30",
                };
                return (
                  <table className="w-full text-xs">
                    <thead>
                      {/* Channel group header row */}
                      <tr>
                        <th className="sticky left-0 bg-card z-10"></th>
                        {channelGroups.map(g => (
                          <th key={g.channel} colSpan={g.items.length}
                            className={`text-center py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b ${channelColors[g.channel] || "bg-muted/30"}`}>
                            {g.channel}
                          </th>
                        ))}
                      </tr>
                      {/* Store code row */}
                      <tr className="border-b">
                        <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card z-10">Brand</th>
                        {sorted.map(pos => (
                          <th key={pos.id} className="text-center py-2 px-1.5 font-medium text-muted-foreground whitespace-nowrap min-w-[44px]">
                            {pos.storeCode}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeBrands.map(brand => (
                        <tr key={brand.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="py-2 pr-3 font-medium sticky left-0 bg-card z-10 whitespace-nowrap">
                            {brand.name}
                          </td>
                          {sorted.map(pos => (
                            <td key={pos.id} className="text-center py-2 px-1">
                              <Checkbox
                                className="h-3.5 w-3.5"
                                checked={isBrandPosAvailable(brand.id, pos.id)}
                                onCheckedChange={(checked) => {
                                  toggleBrandPosMutation.mutate({
                                    brandId: brand.id,
                                    posId: pos.id,
                                    enabled: !!checked,
                                  });
                                }}
                                data-testid={`brand-pos-${brand.id}-${pos.id}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Brands Tab */}
        <TabsContent value="brands" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New Brand</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <Input
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                  placeholder="Brand name"
                  className="flex-1"
                  data-testid="input-new-brand"
                />
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Category</label>
                  <Select value={newBrandCategory} onValueChange={setNewBrandCategory}>
                    <SelectTrigger className="w-48" data-testid="select-brand-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryList.map(cat => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => createBrandMutation.mutate()}
                  disabled={!newBrandName.trim() || createBrandMutation.isPending}
                  data-testid="button-add-brand"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Manage Brands</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {brands.map(brand => (
                  <div key={brand.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    {editingBrandId === brand.id ? (
                      /* Edit mode */
                      <>
                        <div className="flex items-center gap-2 flex-1">
                          <Tag className="w-4 h-4 text-muted-foreground" />
                          <Input className="h-8 text-sm w-[180px]" value={editBrandName} onChange={(e) => setEditBrandName(e.target.value)} placeholder="Brand name" />
                          <Select value={editBrandCategory} onValueChange={setEditBrandCategory}>
                            <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {categoryList.map(cat => (
                                <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            if (editBrandName.trim()) {
                              editBrandMutation.mutate({ id: brand.id, name: editBrandName.trim(), category: editBrandCategory });
                            }
                          }}><Check className="w-4 h-4 text-green-600" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingBrandId(null)}><X className="w-4 h-4 text-muted-foreground" /></Button>
                        </div>
                      </>
                    ) : (
                      /* View mode */
                      <>
                        <div className="flex items-center gap-2">
                          <Tag className="w-4 h-4 text-muted-foreground" />
                          <span className={`text-sm ${brand.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                            {brand.name}
                          </span>
                          <Badge variant="secondary" className="text-xs">{brand.category}</Badge>
                          {!brand.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            setEditingBrandId(brand.id);
                            setEditBrandName(brand.name);
                            setEditBrandCategory(brand.category);
                          }} data-testid={`edit-brand-${brand.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleBrandMutation.mutate({ id: brand.id, isActive: !brand.isActive })}
                            className="text-xs"
                            data-testid={`toggle-brand-${brand.id}`}
                          >
                            {brand.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" /> Deactivate</> : <><Eye className="w-3.5 h-3.5 mr-1" /> Activate</>}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <Input
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="flex-1"
                  data-testid="input-new-category"
                  onKeyDown={e => { if (e.key === 'Enter' && newCategoryName.trim()) createCategoryMutation.mutate(); }}
                />
                <Button
                  onClick={() => createCategoryMutation.mutate()}
                  disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                  data-testid="button-add-category"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Manage Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {categoryList.map(cat => {
                  const brandsInCat = brands.filter(b => b.category === cat.name);
                  return (
                    <div key={cat.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      {editingCategoryId === cat.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Layers className="w-4 h-4 text-muted-foreground" />
                          <Input className="h-8 text-sm flex-1" value={editCategoryName} onChange={(e) => setEditCategoryName(e.target.value)} placeholder="Category name" />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                            if (editCategoryName.trim()) {
                              editCategoryMutation.mutate({ id: cat.id, name: editCategoryName.trim() });
                            }
                          }}><Check className="w-4 h-4 text-green-600" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingCategoryId(null)}><X className="w-4 h-4 text-muted-foreground" /></Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{cat.name}</span>
                            {brandsInCat.length > 0 && (
                              <Badge variant="secondary" className="text-xs">{brandsInCat.length} brand{brandsInCat.length !== 1 ? 's' : ''}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                              setEditingCategoryId(cat.id);
                              setEditCategoryName(cat.name);
                            }} data-testid={`edit-category-${cat.id}`}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              disabled={brandsInCat.length > 0}
                              title={brandsInCat.length > 0 ? `Cannot delete: ${brandsInCat.length} brand(s) use this category` : "Delete category"}
                              onClick={() => deleteCategoryMutation.mutate(cat.id)}
                              data-testid={`delete-category-${cat.id}`}
                            ><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {categoryList.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No categories yet. Add one above.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Incentives Tab */}
        <TabsContent value="incentives" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-medium">Incentive Schemes</CardTitle>
                <Button size="sm" onClick={() => openIncDialog()}>
                  <Plus className="w-4 h-4 mr-1" /> Create Incentive
                </Button>
              </div>
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap pt-2">
                <Select value={incentiveFilterMonth || "__all__"} onValueChange={v => setIncentiveFilterMonth(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue placeholder="All Months" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Months</SelectItem>
                    {incentiveMonths.map(m => {
                      const [y, mo] = m.split("-");
                      const label = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo)-1]} ${y}`;
                      return <SelectItem key={m} value={m}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
                <Select value={incentiveFilterCategory || "__all__"} onValueChange={v => setIncentiveFilterCategory(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue placeholder="All Categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Categories</SelectItem>
                    {incentiveCategories.map(c => <SelectItem key={c} value={c}>{INCENTIVE_CATEGORY_LABELS[c]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Filter by target..." value={incentiveFilterTarget} onChange={e => setIncentiveFilterTarget(e.target.value)} className="w-[150px] h-8 text-xs" />
                {(incentiveFilterMonth || incentiveFilterCategory || incentiveFilterTarget) && (
                  <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setIncentiveFilterMonth(""); setIncentiveFilterCategory(""); setIncentiveFilterTarget(""); }}>Clear</Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{incentiveSchemes.length} of {allIncentiveSchemes.length} schemes</span>
              </div>
            </CardHeader>
            <CardContent>
              {incentiveSchemes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {allIncentiveSchemes.length === 0 ? "No incentive schemes yet. Create one to get started." : "No schemes match the current filters."}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">Name</th>
                        <th className="py-2 pr-3 font-medium">Month</th>
                        <th className="py-2 pr-3 font-medium">Category</th>
                        <th className="py-2 pr-3 font-medium">Target</th>
                        <th className="py-2 pr-3 font-medium">Threshold</th>
                        <th className="py-2 pr-3 font-medium">Reward</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incentiveSchemes.map(s => {
                        const [yr, mo] = s.month.split("-");
                        const monthLabel = `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(mo)-1]} ${yr}`;
                        return (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{s.name}</td>
                          <td className="py-2 pr-3 text-xs whitespace-nowrap">{monthLabel}</td>
                          <td className="py-2 pr-3"><Badge variant="outline" className="text-xs">{INCENTIVE_CATEGORY_LABELS[s.category as IncentiveCategory] || s.category}</Badge></td>
                          <td className="py-2 pr-3 text-muted-foreground">{s.targetName || "—"}</td>
                          <td className="py-2 pr-3">{s.metric === "units" || s.metric === "gwp_given" ? `${s.threshold} units` : `HK$${s.threshold.toLocaleString()}`}</td>
                          <td className="py-2 pr-3">{formatReward(s)}</td>
                          <td className="py-2 pr-3">
                            <Badge variant={s.isActive ? "default" : "secondary"} className="text-xs cursor-pointer" onClick={() => toggleIncentiveMutation.mutate({ id: s.id, isActive: !s.isActive })}>
                              {s.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openIncDialog(s)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteIncentiveMutation.mutate(s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Create/Edit Dialog */}
          <Dialog open={incentiveDialogOpen} onOpenChange={setIncentiveDialogOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingIncentiveId ? "Edit Incentive" : "Create Incentive"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Month</Label>
                    <Input type="month" value={incForm.month || ""} onChange={e => setIncForm(f => ({ ...f, month: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Category</Label>
                    <Select value={incForm.category || ""} onValueChange={v => setIncForm(f => ({ ...f, category: v as IncentiveCategory, metric: metricForCategory(v), targetId: undefined, targetName: undefined }))}>
                      <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {incentiveCategories.map(c => (
                          <SelectItem key={c} value={c}>{INCENTIVE_CATEGORY_LABELS[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Target selector based on category */}
                {incForm.category && (
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Target</Label>
                    {(incForm.category === "product_units" || incForm.category === "product_amount" || incForm.category === "brand_units" || incForm.category === "brand_amount") && (
                      <Select value={incForm.targetId || ""} onValueChange={v => { const b = brands.find(b => b.id === v); setIncForm(f => ({ ...f, targetId: v, targetName: b?.name || "" })); }}>
                        <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                        <SelectContent>
                          {brands.filter(b => b.isActive).map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {(incForm.category === "product_units" || incForm.category === "product_amount") && incForm.targetId && (
                      <div className="space-y-1 mt-2">
                        <Label className="text-sm font-medium">Product Name</Label>
                        <Input value={incProductName} onChange={e => setIncProductName(e.target.value)} placeholder="e.g. Trio Zinc Spray 100ml" className="text-sm" />
                      </div>
                    )}
                    {incForm.category === "promo_achievement" && (
                      <Select value={incForm.targetId || ""} onValueChange={v => { const p = promotions.find(p => p.id === v); setIncForm(f => ({ ...f, targetId: v, targetName: p?.name || "" })); }}>
                        <SelectTrigger><SelectValue placeholder="Select promotion" /></SelectTrigger>
                        <SelectContent>
                          {promotions.filter(p => {
                            if (!p.isActive) return false;
                            if (!incForm.month) return true;
                            // Show promos active during the selected month
                            const mStart = `${incForm.month}-01`;
                            const mEnd = `${incForm.month}-31`;
                            return p.startDate <= mEnd && p.endDate >= mStart;
                          }).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name} ({p.type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {incForm.category === "pos_volume" && (
                      <Select value={incForm.targetId || ""} onValueChange={v => { const p = posLocations.find(p => p.id === v); setIncForm(f => ({ ...f, targetId: v, targetName: p ? `${p.salesChannel} — ${p.storeName}` : "" })); }}>
                        <SelectTrigger><SelectValue placeholder="Select POS location" /></SelectTrigger>
                        <SelectContent>
                          {posLocations.filter(p => p.isActive).map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.salesChannel} — {p.storeName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {incForm.category && (
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Metric</Label>
                    <Badge variant="outline">{incForm.metric === "gwp_given" ? "GWP/PWP count" : incForm.metric || "—"}</Badge>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-sm font-medium">
                    Threshold {incForm.metric === "units" || incForm.metric === "gwp_given" ? "(minimum units)" : "(minimum HK$)"}
                  </Label>
                  <Input type="number" min={0} value={incForm.threshold ?? ""} onChange={e => setIncForm(f => ({ ...f, threshold: parseFloat(e.target.value) || 0 }))} />
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">Reward Basis</Label>
                  <div className="flex gap-1">
                    {incentiveRewardBases.map(rb => (
                      <Button key={rb} size="sm" variant={incForm.rewardBasis === rb ? "default" : "outline"} onClick={() => setIncForm(f => ({ ...f, rewardBasis: rb }))}>
                        {rewardBasisLabels[rb]}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Reward Amount (HK$)</Label>
                    <Input type="number" min={0} value={incForm.rewardAmount ?? ""} onChange={e => setIncForm(f => ({ ...f, rewardAmount: parseFloat(e.target.value) || 0 }))} />
                  </div>
                  {incForm.rewardBasis === "per_amount" && (
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Per HK$ (unit)</Label>
                      <Input type="number" min={1} value={incForm.rewardPerAmountUnit ?? ""} onChange={e => setIncForm(f => ({ ...f, rewardPerAmountUnit: parseFloat(e.target.value) || 1000 }))} placeholder="1000" />
                    </div>
                  )}
                </div>

                {/* POS Selection */}
                <div className="space-y-1">
                  <Label className="text-sm font-medium">POS Locations <span className="text-xs text-muted-foreground font-normal">(leave empty for all)</span></Label>
                  <div className="max-h-[150px] overflow-y-auto border rounded-md p-2 space-y-1">
                    {(() => {
                      const selectedIds = (incForm.posIds as any as string || "").split(",").filter(Boolean);
                      const channels = [...new Set(posLocations.filter(p => p.isActive).map(p => p.salesChannel))].sort();
                      return channels.map(ch => {
                        const stores = posLocations.filter(p => p.isActive && p.salesChannel === ch);
                        const allSel = stores.every(s => selectedIds.includes(s.id));
                        const someSel = stores.some(s => selectedIds.includes(s.id));
                        return (
                          <div key={ch} className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <Checkbox checked={allSel ? true : someSel ? "indeterminate" : false}
                                onCheckedChange={ck => {
                                  const ids = stores.map(s => s.id);
                                  setIncForm(f => {
                                    const cur = ((f.posIds as any as string) || "").split(",").filter(Boolean);
                                    const next = ck ? [...new Set([...cur, ...ids])] : cur.filter(id => !ids.includes(id));
                                    return { ...f, posIds: next.join(",") || undefined };
                                  });
                                }} />
                              <span className="text-xs font-semibold">{ch}</span>
                            </div>
                            <div className="pl-6 space-y-0.5">
                              {stores.map(s => (
                                <div key={s.id} className="flex items-center gap-2">
                                  <Checkbox checked={selectedIds.includes(s.id)}
                                    onCheckedChange={ck => {
                                      setIncForm(f => {
                                        const cur = ((f.posIds as any as string) || "").split(",").filter(Boolean);
                                        const next = ck ? [...cur, s.id] : cur.filter(id => id !== s.id);
                                        return { ...f, posIds: next.join(",") || undefined };
                                      });
                                    }} />
                                  <span className="text-xs">{s.storeName}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-sm font-medium">Notes (optional)</Label>
                  <Textarea value={incForm.notes || ""} onChange={e => setIncForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Additional details..." />
                </div>

                {/* Auto-generated name + description — Traditional Chinese */}
                {incForm.category && (() => {
                  const target = incForm.targetName || "";
                  const isProductCat = incForm.category === "product_units" || incForm.category === "product_amount";
                  const prodName = isProductCat ? incProductName : "";
                  const isUnits = incForm.metric === "units" || incForm.metric === "gwp_given";
                  const thresholdText = isUnits ? `${incForm.threshold || 0}件` : `HK$${(incForm.threshold || 0).toLocaleString()}`;
                  let rewardShort = "";
                  if (incForm.rewardBasis === "per_unit") rewardShort = `HK$${incForm.rewardAmount || 0}/件`;
                  else if (incForm.rewardBasis === "per_amount") rewardShort = `HK$${incForm.rewardAmount || 0}/HK$${(incForm.rewardPerAmountUnit || 1000).toLocaleString()}`;
                  else rewardShort = `獎金HK$${incForm.rewardAmount || 0}`;
                  // Name format: [Brand] [Product], [Threshold], [Reward]
                  const namePrefix = target && prodName ? `${target} ${prodName}` : target || prodName;
                  const autoName = namePrefix
                    ? `${namePrefix}, ${thresholdText}, ${rewardShort}`
                    : `${thresholdText}, ${rewardShort}`;
                  // Sync name into form if not editing
                  if (!editingIncentiveId && incForm.name !== autoName) {
                    setTimeout(() => setIncForm(f => ({ ...f, name: autoName })), 0);
                  }
                  const catZh: Record<string, string> = {
                    product_units: "產品銷售（件數）", product_amount: "產品銷售（金額）",
                    promo_achievement: "推廣達標", brand_units: "品牌銷售（件數）",
                    brand_amount: "品牌銷售（金額）", pos_volume: "銷售點銷售額",
                  };
                  const catLabel = catZh[incForm.category as string] || incForm.category;
                  let rewardLong = "";
                  if (incForm.rewardBasis === "per_unit") rewardLong = `每售出一件可獲HK$${incForm.rewardAmount || 0}`;
                  else if (incForm.rewardBasis === "per_amount") rewardLong = `每達HK$${(incForm.rewardPerAmountUnit || 1000).toLocaleString()}銷售額可獲HK$${incForm.rewardAmount || 0}`;
                  else rewardLong = `可獲固定獎金HK$${incForm.rewardAmount || 0}`;
                  const descSubject = isProductCat && prodName ? `${target} ${prodName}` : (target || "目標");
                  const descZh = incForm.category === "promo_achievement"
                    ? `達成${target || "目標"}推廣目標${thresholdText}，${rewardLong}。`
                    : `${descSubject}，${catLabel}達${thresholdText}，${rewardLong}。`;
                  return (
                    <div className="space-y-2 p-3 rounded-md bg-muted/50 border">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">名稱 (Name)</Label>
                        <Input value={editingIncentiveId ? (incForm.name || "") : autoName} onChange={e => setIncForm(f => ({ ...f, name: e.target.value }))} className="text-sm h-8" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">自動生成描述</Label>
                        <p className="text-sm leading-relaxed">{descZh}</p>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIncentiveDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => saveIncentiveMutation.mutate()} disabled={!incForm.name || !incForm.month || !incForm.category}>
                  {editingIncentiveId ? "Save Changes" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

      </Tabs>
    </div>
  );
}
