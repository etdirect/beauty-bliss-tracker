import { useState, useMemo } from "react";
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
import { Plus, Store, Tag, Grid3X3, Eye, EyeOff, Users, MapPin, KeyRound, Pencil, Check, X } from "lucide-react";

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
    mutationFn: async ({ id, name, username, role }: { id: string; name: string; username: string; role: string }) => {
      await apiRequest("PATCH", `/api/users/${id}`, { name, username, role });
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
                          <Input className="w-[140px] h-8 text-sm" value={editUserName} onChange={(e) => setEditUserName(e.target.value)} placeholder="Display Name" />
                          <Input className="w-[120px] h-8 text-sm" value={editUserUsername} onChange={(e) => setEditUserUsername(e.target.value)} placeholder="Username" />
                          <Select value={editUserRole} onValueChange={setEditUserRole}>
                            <SelectTrigger className="w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger>
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
                        <div className="grid grid-cols-[16px_120px_100px_auto] gap-2 items-center">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className={`text-sm truncate ${user.isActive ? "font-medium" : "text-muted-foreground line-through"}`}>
                            {user.name}
                          </span>
                          <Badge variant="outline" className="text-xs justify-center">@{user.username}</Badge>
                          <span>
                            {!user.isActive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                          </span>
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
                        <div className="grid grid-cols-4 gap-x-3 gap-y-1.5">
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
                      <SelectItem value="Skincare">Skincare</SelectItem>
                      <SelectItem value="Haircare">Haircare</SelectItem>
                      <SelectItem value="Babycare">Babycare</SelectItem>
                      <SelectItem value="Makeup">Makeup</SelectItem>
                      <SelectItem value="Fragrance">Fragrance</SelectItem>
                      <SelectItem value="Personal Care">Personal Care</SelectItem>
                      <SelectItem value="Health Supplements">Health Supplements</SelectItem>
                      <SelectItem value="Small Electronic Devices">Small Electronic Devices</SelectItem>
                      <SelectItem value="Snacks">Snacks</SelectItem>
                      <SelectItem value="Beauty Accessories">Beauty Accessories</SelectItem>
                      <SelectItem value="Body Care">Body Care</SelectItem>
                      <SelectItem value="Others">Others</SelectItem>
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
                              <SelectItem value="Skincare">Skincare</SelectItem>
                              <SelectItem value="Haircare">Haircare</SelectItem>
                              <SelectItem value="Babycare">Babycare</SelectItem>
                              <SelectItem value="Makeup">Makeup</SelectItem>
                              <SelectItem value="Fragrance">Fragrance</SelectItem>
                              <SelectItem value="Personal Care">Personal Care</SelectItem>
                              <SelectItem value="Health Supplements">Health Supplements</SelectItem>
                              <SelectItem value="Small Electronic Devices">Small Electronic Devices</SelectItem>
                              <SelectItem value="Snacks">Snacks</SelectItem>
                              <SelectItem value="Beauty Accessories">Beauty Accessories</SelectItem>
                              <SelectItem value="Body Care">Body Care</SelectItem>
                              <SelectItem value="Others">Others</SelectItem>
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


      </Tabs>
    </div>
  );
}
