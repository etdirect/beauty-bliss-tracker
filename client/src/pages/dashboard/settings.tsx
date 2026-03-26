import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Counter, Brand, CounterBrand } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Store, Tag, Grid3X3, Eye, EyeOff } from "lucide-react";

export default function SettingsPage() {
  const { toast } = useToast();

  // New counter form
  const [newCounterName, setNewCounterName] = useState("");
  // New brand form
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandCategory, setNewBrandCategory] = useState("Skincare");

  const { data: counters = [] } = useQuery<Counter[]>({ queryKey: ["/api/counters"] });
  const { data: brands = [] } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: counterBrands = [] } = useQuery<CounterBrand[]>({ queryKey: ["/api/counter-brands"] });

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

  const isAssigned = (counterId: string, brandId: string) => {
    return counterBrands.some(cb => cb.counterId === counterId && cb.brandId === brandId);
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-semibold">Settings</h2>

      <Tabs defaultValue="counters">
        <TabsList>
          <TabsTrigger value="counters" data-testid="tab-counters">
            <Store className="w-4 h-4 mr-1.5" /> Counters
          </TabsTrigger>
          <TabsTrigger value="brands" data-testid="tab-brands">
            <Tag className="w-4 h-4 mr-1.5" /> Brands
          </TabsTrigger>
          <TabsTrigger value="assignments" data-testid="tab-assignments">
            <Grid3X3 className="w-4 h-4 mr-1.5" /> Assignments
          </TabsTrigger>
        </TabsList>

        {/* Counters Tab */}
        <TabsContent value="counters" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Add New Counter</CardTitle>
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

        {/* Assignments Tab */}
        <TabsContent value="assignments" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Counter-Brand Assignments</CardTitle>
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
