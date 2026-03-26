import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Counter, Brand, CounterBrand, PosLocation, BrandPosAvailability } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Store, Tag, Grid3X3, Eye, EyeOff, Users, MapPin, KeyRound } from "lucide-react";

interface SafeUser {
  id: string;
  username: string;
  name: string;
  role: string;
  isActive: boolean;
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

  // User form
  const [newUserUsername, setNewUserUsername] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPin, setNewUserPin] = useState("");
  const [newUserRole, setNewUserRole] = useState("ba");

  // PIN reset
  const [resetPinUserId, setResetPinUserId] = useState<string | null>(null);
  const [resetPinValue, setResetPinValue] = useState("");

  // New counter/brand forms (legacy)
  const [newCounterName, setNewCounterName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandCategory, setNewBrandCategory] = useState("Skincare");

  // Queries
  const { data: posLocations = [] } = useQuery<PosLocation[]>({ queryKey: ["/api/pos-locations"] });
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: users = [] } = useQuery<SafeUser[]>({ queryKey: ["/api/users"] });
  const { data: userPosAssignments = [] } = useQuery<UserPosAssignment[]>({ queryKey: ["/api/user-pos-assignments"] });
  const { data: brandPosAvail = [] } = useQuery<BrandPosAvailability[]>({ queryKey: ["/api/brand-pos-availability"] });
  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"] });
  const { data: counterBrands = [] } = useQuery<CounterBrand[]>({ queryKey: ["/api/counter-brands"] });

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
    <div className="p-6 space-y-6">
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
          <TabsTrigger value="counters" data-testid="tab-counters">
            <Store className="w-4 h-4 mr-1.5" /> Counters
          </TabsTrigger>
          <TabsTrigger value="assignments" data-testid="tab-assignments">
            <Grid3X3 className="w-4 h-4 mr-1.5" /> Assignments
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
            <CardContent>
              <div className="space-y-2">
                {posLocations.map(pos => (
                  <div key={pos.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs">{pos.salesChannel}</Badge>
                      <Badge variant="outline" className="text-xs">{pos.storeCode}</Badge>
                      <span className={`text-sm ${pos.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                        {pos.storeName}
                      </span>
                      {!pos.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePosMutation.mutate({ id: pos.id, isActive: !pos.isActive })}
                      className="text-xs"
                    >
                      {pos.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" /> Deactivate</> : <><Eye className="w-3.5 h-3.5 mr-1" /> Activate</>}
                    </Button>
                  </div>
                ))}
              </div>
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
            <CardContent>
              <div className="space-y-3">
                {users.map(user => (
                  <div key={user.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className={`text-sm ${user.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                          {user.name}
                        </span>
                        <Badge variant="outline" className="text-xs">@{user.username}</Badge>
                        <Badge variant={user.role === "management" ? "default" : "secondary"} className="text-xs">
                          {user.role}
                        </Badge>
                        {!user.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-1">
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

                    {/* POS Assignments for this user */}
                    {user.role === "ba" && (
                      <div className="ml-6">
                        <p className="text-xs text-muted-foreground mb-1">Assigned POS:</p>
                        <div className="flex flex-wrap gap-2">
                          {activePos.map(pos => (
                            <label key={pos.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                              <Checkbox
                                checked={isUserPosAssigned(user.id, pos.id)}
                                onCheckedChange={(checked) => {
                                  toggleUserPosMutation.mutate({ userId: user.id, posId: pos.id, enabled: !!checked });
                                }}
                              />
                              {pos.storeName}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card">Brand</th>
                    {activePos.map(pos => (
                      <th key={pos.id} className="text-center py-2 px-1 font-medium text-muted-foreground whitespace-nowrap">
                        {pos.storeCode}
                        <div className="text-[10px] font-normal">{pos.salesChannel}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeBrands.map(brand => (
                    <tr key={brand.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium sticky left-0 bg-card whitespace-nowrap">
                        {brand.name}
                      </td>
                      {activePos.map(pos => (
                        <td key={pos.id} className="text-center py-2 px-1">
                          <Checkbox
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
              <div className="flex gap-2">
                <Input
                  value={newBrandName}
                  onChange={e => setNewBrandName(e.target.value)}
                  placeholder="Brand name"
                  className="flex-1"
                  data-testid="input-new-brand"
                />
                <Select value={newBrandCategory} onValueChange={setNewBrandCategory}>
                  <SelectTrigger className="w-32" data-testid="select-brand-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Skincare">Skincare</SelectItem>
                    <SelectItem value="Haircare">Haircare</SelectItem>
                    <SelectItem value="Body Care">Body Care</SelectItem>
                    <SelectItem value="Others">Others</SelectItem>
                  </SelectContent>
                </Select>
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
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <span className={`text-sm ${brand.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                        {brand.name}
                      </span>
                      <Badge variant="secondary" className="text-xs">{brand.category}</Badge>
                      {!brand.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </div>
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
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Counters Tab (legacy) */}
        <TabsContent value="counters" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New Counter (Legacy)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  value={newCounterName}
                  onChange={e => setNewCounterName(e.target.value)}
                  placeholder="e.g. Pop-up Store Central"
                  className="flex-1"
                  data-testid="input-new-counter"
                />
                <Button
                  onClick={() => createCounterMutation.mutate()}
                  disabled={!newCounterName.trim() || createCounterMutation.isPending}
                  data-testid="button-add-counter"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Manage Counters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {counters.map(counter => (
                  <div key={counter.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-muted-foreground" />
                      <span className={`text-sm ${counter.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                        {counter.name}
                      </span>
                      {!counter.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCounterMutation.mutate({ id: counter.id, isActive: !counter.isActive })}
                      className="text-xs"
                      data-testid={`toggle-counter-${counter.id}`}
                    >
                      {counter.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1" /> Deactivate</> : <><Eye className="w-3.5 h-3.5 mr-1" /> Activate</>}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assignments Tab (legacy) */}
        <TabsContent value="assignments" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Counter-Brand Assignments (Legacy)</CardTitle>
              <p className="text-xs text-muted-foreground">Check which brands are available at each counter</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card">Brand</th>
                    {counters.filter(c => c.isActive).map(counter => (
                      <th key={counter.id} className="text-center py-2 px-1 font-medium text-muted-foreground whitespace-nowrap">
                        {counter.name.replace("LOG-ON ", "").replace("FACESSS ", "F·")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {brands.filter(b => b.isActive).map(brand => (
                    <tr key={brand.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium sticky left-0 bg-card whitespace-nowrap">
                        {brand.name}
                      </td>
                      {counters.filter(c => c.isActive).map(counter => (
                        <td key={counter.id} className="text-center py-2 px-1">
                          <Checkbox
                            checked={isAssigned(counter.id, brand.id)}
                            onCheckedChange={(checked) => {
                              toggleAssignmentMutation.mutate({
                                counterId: counter.id,
                                brandId: brand.id,
                                enabled: !!checked,
                              });
                            }}
                            data-testid={`assign-${counter.id}-${brand.id}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
