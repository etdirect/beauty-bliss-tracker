import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy } from "lucide-react";
import type { IncentiveScheme } from "@shared/schema";
import { INCENTIVE_CATEGORY_LABELS } from "@shared/schema";

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function IncentiveTracking() {
  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const { data: schemes = [] } = useQuery<IncentiveScheme[]>({
    queryKey: ["/api/incentive-schemes/month/" + currentMonth],
    staleTime: 30_000,
  });

  // Fetch aggregated progress (no userId = all BAs combined)
  const { data: progress = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/incentive-progress", `?month=${currentMonth}`],
    staleTime: 30_000,
  });

  const activeSchemes = useMemo(
    () => schemes.filter((s) => s.isActive),
    [schemes],
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-600" />
        <h2 className="text-xl font-bold">Incentive Tracking</h2>
        <Badge variant="outline" className="ml-2">{currentMonth}</Badge>
      </div>

      {activeSchemes.length === 0 ? (
        <p className="text-muted-foreground">No active incentive schemes for {currentMonth}.</p>
      ) : (
        <div className="space-y-4">
          {/* Summary table */}
          <Card>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium">Scheme</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium text-right w-[100px]">Target</th>
                      <th className="pb-2 font-medium text-right w-[100px]">Current</th>
                      <th className="pb-2 font-medium text-right w-[80px]">%</th>
                      <th className="pb-2 font-medium w-[160px]">Progress</th>
                      <th className="pb-2 font-medium text-right w-[80px]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeSchemes.map((scheme) => {
                      const current = progress[scheme.id] ?? 0;
                      const pct = scheme.threshold > 0 ? Math.min((current / scheme.threshold) * 100, 100) : 0;
                      const isAmount = scheme.metric === "amount" || scheme.metric === "transaction_amount";
                      const onTrack = pct >= (d.getDate() / new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()) * 100;
                      return (
                        <tr key={scheme.id} className="border-b last:border-0">
                          <td className="py-2">
                            <div className="font-medium">{scheme.name}</div>
                            <div className="text-xs text-muted-foreground">{scheme.targetName || "All"}</div>
                          </td>
                          <td className="py-2 text-xs">
                            {INCENTIVE_CATEGORY_LABELS[scheme.category as keyof typeof INCENTIVE_CATEGORY_LABELS] || scheme.category}
                          </td>
                          <td className="py-2 text-right w-[100px]">
                            {isAmount ? fmtCurrency(scheme.threshold) : scheme.threshold.toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-medium w-[100px]">
                            {isAmount ? fmtCurrency(current) : current.toLocaleString()}
                          </td>
                          <td className="py-2 text-right w-[80px]">
                            <span className={pct >= 100 ? "text-green-700 dark:text-green-400 font-medium" : ""}>
                              {pct.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 w-[160px]">
                            <Progress value={pct} className="h-2" />
                          </td>
                          <td className="py-2 text-right w-[80px]">
                            <Badge
                              variant={pct >= 100 ? "default" : onTrack ? "secondary" : "destructive"}
                              className="text-xs"
                            >
                              {pct >= 100 ? "Achieved" : onTrack ? "On Track" : "Behind"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Individual scheme cards */}
          {activeSchemes.map((scheme) => {
            const current = progress[scheme.id] ?? 0;
            const pct = scheme.threshold > 0 ? Math.min((current / scheme.threshold) * 100, 100) : 0;
            const isAmount = scheme.metric === "amount" || scheme.metric === "transaction_amount";
            return (
              <Card key={scheme.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-sm">{scheme.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {scheme.targetName || "All"} · {INCENTIVE_CATEGORY_LABELS[scheme.category as keyof typeof INCENTIVE_CATEGORY_LABELS] || scheme.category}
                        · Target: {isAmount ? fmtCurrency(scheme.threshold) : scheme.threshold.toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={pct >= 100 ? "default" : "secondary"} className="text-xs">
                      {pct >= 100 ? "Achieved" : `${pct.toFixed(1)}%`}
                    </Badge>
                  </div>
                  <Progress value={pct} className="h-2 mb-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Current: {isAmount ? fmtCurrency(current) : current.toLocaleString()}</span>
                    <span>
                      Reward: HK${scheme.rewardAmount} per {scheme.rewardBasis === "per_unit" ? "unit" : scheme.rewardBasis === "per_amount" ? `HK$${scheme.rewardPerAmountUnit ?? 1000}` : scheme.rewardBasis === "per_transaction" ? "transaction" : "scheme"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
