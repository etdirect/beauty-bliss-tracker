import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/App";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatHk, hkMonth } from "@shared/hkTime";

function basisLabel(basis: string, incomplete: boolean) {
  if (basis === "estimated") return "Estimated, no duty record";
  if (basis === "actual") return incomplete ? "Actual · duty incomplete" : "Actual";
  return incomplete ? "Provisional · duty incomplete" : "Provisional";
}

export default function PayPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(hkMonth());
  const { data, refetch } = useQuery<any>({
    queryKey: ["pay-overview", month],
    queryFn: async () => {
      const res = await fetch(`/api/pay/overview?month=${month}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });
  const act = useMutation({
    mutationFn: async (body: { path: string; counterId: string }) => {
      await apiRequest("POST", body.path, { counterId: body.counterId, month });
    },
    onSuccess: () => { refetch(); toast({ title: "Updated" }); },
    onError: (err: Error) => toast({ title: "Could not update the month", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h2 className="text-xl font-semibold">Pay overview</h2>
          <p className="text-sm text-muted-foreground">Commission uses typed sales until a channel total is entered. Product bonuses are not included.</p>
        </div>
        <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              {["Counter", "BA", "Basis", "Counted sales", "Achievement", "Commission", "Salary", "Income", "Part-timer cost", ""].map(h => (
                <th key={h} className="text-left p-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data?.rows ?? []).map((row: any) => (
              <tr key={row.counterId} className="border-t">
                <td className="p-2">{row.name}</td>
                <td className="p-2">{row.baName}</td>
                <td className="p-2">{basisLabel(row.basis, row.dutyIncomplete)}{row.targetsPublished ? "" : " · targets not published"}</td>
                <td className="p-2 tabular-nums">{formatHk(row.countedSales)}</td>
                <td className="p-2 tabular-nums">{Math.round(row.achievement * 100)}%</td>
                <td className="p-2 tabular-nums">{formatHk(row.commission)}</td>
                <td className="p-2 tabular-nums">{formatHk(row.salary)}</td>
                <td className="p-2 tabular-nums">{formatHk(row.income)}</td>
                <td className="p-2 tabular-nums">{formatHk(row.partTimerCost)}</td>
                <td className="p-2">
                  {row.status === "locked" ? (
                    user?.role === "admin" && <Button size="sm" variant="outline" onClick={() => act.mutate({ path: "/api/pay/reopen", counterId: row.counterId })}>Reopen</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => act.mutate({ path: "/api/pay/lock", counterId: row.counterId })}>Lock</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
