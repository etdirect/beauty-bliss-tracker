import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Trophy, Store, Gift,
} from "lucide-react";
import type { IncentiveScheme, PosLocation, RewardTier, StoreThreshold, ComboBonus, TargetProduct } from "@shared/schema";
import { INCENTIVE_CATEGORY_LABELS } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

// ─── Helpers ────────────────────────────────────────

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function parseJSON<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/** Compute tiered payout: all units paid at the rate of the HIGHEST qualifying tier */
function computeTieredPayout(units: number, tiers: RewardTier[]): { rate: number; payout: number } {
  if (!tiers.length || units <= 0) return { rate: 0, payout: 0 };
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let appliedTier = sorted[0];
  for (const t of sorted) {
    if (units >= t.minQty) appliedTier = t;
  }
  return { rate: appliedTier.rewardAmount, payout: units * appliedTier.rewardAmount };
}

/** "$7/35+, $9/50+, $12/80+" */
function tierDescription(tiers: RewardTier[]): string {
  return [...tiers]
    .sort((a, b) => a.minQty - b.minQty)
    .map((t) => `$${t.rewardAmount}/${t.minQty}+`)
    .join(", ");
}

// ─── Per-scheme card (uses its own useQuery for store progress) ──

function SchemeCard({
  scheme,
  overallCurrent,
  monthProgressPct,
  posMap,
  selectedPosId,
  selectedMonth,
}: {
  scheme: IncentiveScheme;
  overallCurrent: number;
  monthProgressPct: number;
  posMap: Map<string, PosLocation>;
  selectedPosId: string;
  selectedMonth: string;
}) {
  const tiers = parseJSON<RewardTier[]>(scheme.rewardTiers);
  const storeThresholds = parseJSON<StoreThreshold[]>(scheme.storeThresholds);
  const combo = parseJSON<ComboBonus>(scheme.comboBonus);
  const targetProducts = parseJSON<TargetProduct[]>(scheme.targetProducts);
  const hasTiers = tiers && tiers.length > 0;
  const hasStoreThresholds = storeThresholds && storeThresholds.length > 0;
  const offset = scheme.incentiveOffset ?? 0;
  const isAmount = scheme.metric === "amount" || scheme.metric === "transaction_amount";

  const overallPct = scheme.threshold > 0
    ? Math.min((overallCurrent / scheme.threshold) * 100, 100)
    : 0;

  // Per-store progress query (one per scheme card)
  const { data: storeProgress = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/incentive-progress-by-store", selectedMonth, scheme.id],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/incentive-progress-by-store?month=${selectedMonth}&schemeId=${scheme.id}`);
      return res.json();
    },
  });

  const storesToShow = hasStoreThresholds
    ? storeThresholds!.filter((st) => selectedPosId === "__all__" || st.posId === selectedPosId)
    : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{scheme.name}</CardTitle>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <Badge variant="outline" className="text-xs">
                {INCENTIVE_CATEGORY_LABELS[scheme.category as keyof typeof INCENTIVE_CATEGORY_LABELS] || scheme.category}
              </Badge>
              {scheme.targetName && (
                <span className="text-xs text-muted-foreground">{scheme.targetName}</span>
              )}
              {hasTiers && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {tierDescription(tiers!)}
                </Badge>
              )}
              {combo && (
                <Badge variant="secondary" className="text-xs">
                  <Gift className="w-3 h-3 mr-1" />
                  +${combo.amount} {combo.description}
                </Badge>
              )}
              {offset > 0 && (
                <span className="text-xs text-muted-foreground">
                  (counts from piece #{offset + 1})
                </span>
              )}
            </div>
            {targetProducts && targetProducts.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {targetProducts.map((tp) => (
                  <span key={tp.sgCode} className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {tp.nameChi || tp.nameEng}{tp.volume ? ` ${tp.volume}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
          <Badge
            variant={overallPct >= 100 ? "default" : overallPct >= monthProgressPct ? "secondary" : "destructive"}
            className="text-xs shrink-0"
          >
            {overallPct >= 100 ? "Achieved" : overallPct >= monthProgressPct ? "On Track" : "Behind"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>
              Overall: {isAmount ? fmtCurrency(overallCurrent) : overallCurrent.toLocaleString()}
              {" / "}
              {isAmount ? fmtCurrency(scheme.threshold) : scheme.threshold.toLocaleString()}
            </span>
            <span className={overallPct >= 100 ? "text-green-600 dark:text-green-400 font-medium" : ""}>
              {overallPct.toFixed(1)}%
            </span>
          </div>
          <Progress value={overallPct} className="h-2" />
          {!hasTiers && (
            <div className="text-xs text-muted-foreground mt-1">
              Reward: HK${scheme.rewardAmount} per{" "}
              {scheme.rewardBasis === "per_unit" ? "unit" : scheme.rewardBasis === "per_amount" ? `HK$${scheme.rewardPerAmountUnit ?? 1000}` : scheme.rewardBasis === "per_transaction" ? "transaction" : "scheme"}
              {" · "}
              Estimated payout: {fmtCurrency(
                scheme.rewardBasis === "per_unit"
                  ? Math.max(overallCurrent - offset, 0) * scheme.rewardAmount
                  : scheme.rewardBasis === "per_amount"
                  ? Math.floor(overallCurrent / (scheme.rewardPerAmountUnit ?? 1000)) * scheme.rewardAmount
                  : scheme.rewardAmount
              )}
            </div>
          )}
          {hasTiers && (() => {
            const effectiveUnits = Math.max(overallCurrent - offset, 0);
            const { rate, payout } = computeTieredPayout(effectiveUnits, tiers!);
            return (
              <div className="text-xs text-muted-foreground mt-1">
                Current tier rate: HK${rate}/unit
                {" · "}
                Estimated payout: {fmtCurrency(payout)}
                {combo ? ` + combo bonus pool` : ""}
              </div>
            );
          })()}
        </div>

        {/* Per-store breakdown table (when storeThresholds defined) */}
        {hasStoreThresholds && storesToShow.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-xs">
                    <div className="flex items-center gap-1">
                      <Store className="w-3 h-3" /> POS / Door
                    </div>
                  </th>
                  <th className="pb-2 font-medium text-xs text-right">Target</th>
                  <th className="pb-2 font-medium text-xs text-right">Current</th>
                  <th className="pb-2 font-medium text-xs text-right">%</th>
                  <th className="pb-2 font-medium text-xs w-[120px]">Progress</th>
                  {hasTiers && <th className="pb-2 font-medium text-xs text-right">Rate</th>}
                  <th className="pb-2 font-medium text-xs text-right">Payout</th>
                  <th className="pb-2 font-medium text-xs text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {storesToShow.map((st) => {
                  const posInfo = posMap.get(st.posId);
                  const posName = st.posName || posInfo?.storeName || st.posId;
                  const currentUnits = storeProgress[st.posId] ?? 0;
                  const effectiveUnits = Math.max(currentUnits - offset, 0);
                  const pct = st.threshold > 0
                    ? Math.min((currentUnits / st.threshold) * 100, 100)
                    : 0;
                  const onTrack = pct >= monthProgressPct;

                  let payoutAmt = 0;
                  let rateLabel = "";
                  if (hasTiers) {
                    const { rate, payout } = computeTieredPayout(effectiveUnits, tiers!);
                    payoutAmt = payout;
                    rateLabel = `$${rate}`;
                  } else {
                    payoutAmt = scheme.rewardBasis === "per_unit"
                      ? effectiveUnits * scheme.rewardAmount
                      : scheme.rewardBasis === "per_amount"
                      ? Math.floor(currentUnits / (scheme.rewardPerAmountUnit ?? 1000)) * scheme.rewardAmount
                      : scheme.rewardAmount;
                  }

                  return (
                    <tr key={st.posId} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="font-medium text-xs">{posName}</div>
                      </td>
                      <td className="py-2 text-right text-xs">
                        {isAmount ? fmtCurrency(st.threshold) : st.threshold.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-xs font-medium">
                        {isAmount ? fmtCurrency(currentUnits) : currentUnits.toLocaleString()}
                      </td>
                      <td className="py-2 text-right text-xs">
                        <span className={pct >= 100 ? "text-green-600 dark:text-green-400 font-medium" : ""}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 w-[120px]">
                        <Progress value={pct} className="h-1.5" />
                      </td>
                      {hasTiers && (
                        <td className="py-2 text-right text-xs font-mono">{rateLabel}</td>
                      )}
                      <td className="py-2 text-right text-xs font-medium">
                        {fmtCurrency(payoutAmt)}
                      </td>
                      <td className="py-2 text-right">
                        <Badge
                          variant={pct >= 100 ? "default" : onTrack ? "secondary" : "destructive"}
                          className="text-[10px] px-1.5"
                        >
                          {pct >= 100 ? "Achieved" : onTrack ? "On Track" : "Behind"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                {storesToShow.length > 1 && (() => {
                  let totalCurrent = 0;
                  let totalPayout = 0;
                  for (const st of storesToShow) {
                    const curr = storeProgress[st.posId] ?? 0;
                    totalCurrent += curr;
                    const eff = Math.max(curr - offset, 0);
                    if (hasTiers) {
                      totalPayout += computeTieredPayout(eff, tiers!).payout;
                    } else {
                      totalPayout += scheme.rewardBasis === "per_unit"
                        ? eff * scheme.rewardAmount
                        : scheme.rewardBasis === "per_amount"
                        ? Math.floor(curr / (scheme.rewardPerAmountUnit ?? 1000)) * scheme.rewardAmount
                        : scheme.rewardAmount;
                    }
                  }
                  return (
                    <tr className="border-t-2 font-medium">
                      <td className="py-2 text-xs">Total</td>
                      <td className="py-2 text-right text-xs">—</td>
                      <td className="py-2 text-right text-xs">{isAmount ? fmtCurrency(totalCurrent) : totalCurrent.toLocaleString()}</td>
                      <td className="py-2 text-right text-xs">—</td>
                      <td className="py-2"></td>
                      {hasTiers && <td className="py-2"></td>}
                      <td className="py-2 text-right text-xs">{fmtCurrency(totalPayout)}</td>
                      <td className="py-2"></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* Fallback: per-store breakdown without storeThresholds */}
        {!hasStoreThresholds && Object.keys(storeProgress).length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
              <Store className="w-3 h-3" /> Breakdown by POS
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-xs">POS</th>
                  <th className="pb-2 font-medium text-xs text-right">Current</th>
                  <th className="pb-2 font-medium text-xs text-right">Payout</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(storeProgress)
                  .filter(([posId]) => selectedPosId === "__all__" || posId === selectedPosId)
                  .sort(([, a], [, b]) => b - a)
                  .map(([posId, val]) => {
                    const posInfo = posMap.get(posId);
                    const effectiveVal = Math.max(val - offset, 0);
                    let payoutAmt = 0;
                    if (hasTiers) {
                      payoutAmt = computeTieredPayout(effectiveVal, tiers!).payout;
                    } else {
                      payoutAmt = scheme.rewardBasis === "per_unit"
                        ? effectiveVal * scheme.rewardAmount
                        : scheme.rewardBasis === "per_amount"
                        ? Math.floor(val / (scheme.rewardPerAmountUnit ?? 1000)) * scheme.rewardAmount
                        : 0;
                    }
                    return (
                      <tr key={posId} className="border-b last:border-0">
                        <td className="py-1.5 text-xs">{posInfo?.storeName || posId}</td>
                        <td className="py-1.5 text-right text-xs font-medium">
                          {isAmount ? fmtCurrency(val) : val.toLocaleString()}
                        </td>
                        <td className="py-1.5 text-right text-xs">{fmtCurrency(payoutAmt)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Component ─────────────────────────────────

export default function IncentiveTracking() {
  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedPosId, setSelectedPosId] = useState<string>("__all__");

  // 6 months back + 12 months forward so admins can view incentive schemes
  // tied to upcoming promos (a June scheme in April) as well as historical.
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const dt = new Date();
    for (let i = 5; i >= -12; i--) {
      const md = new Date(dt.getFullYear(), dt.getMonth() - i, 1);
      opts.push(`${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  const { data: schemes = [] } = useQuery<IncentiveScheme[]>({
    queryKey: ["/api/incentive-schemes/month/" + selectedMonth],
    staleTime: 30_000,
  });

  const { data: progress = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/incentive-progress", `?month=${selectedMonth}`],
    staleTime: 30_000,
  });

  const { data: posLocations = [] } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
    staleTime: 30_000,
  });

  const activeSchemes = useMemo(() => schemes.filter((s) => s.isActive), [schemes]);

  const posMap = useMemo(() => {
    const m = new Map<string, PosLocation>();
    for (const p of posLocations) m.set(p.id, p);
    return m;
  }, [posLocations]);

  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const dayOfMonth = d.getDate();
  const monthProgressPct = (dayOfMonth / daysInMonth) * 100;

  const activePosOptions = useMemo(() => {
    return posLocations.filter((p) => p.isActive).sort((a, b) => a.storeName.localeCompare(b.storeName));
  }, [posLocations]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-600" />
          <h2 className="text-xl font-bold">Incentive Tracking</h2>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedPosId} onValueChange={setSelectedPosId}>
            <SelectTrigger className="w-[200px] h-8 text-sm">
              <SelectValue placeholder="All POS" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All POS</SelectItem>
              {activePosOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.storeName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {activeSchemes.length === 0 ? (
        <p className="text-muted-foreground">No active incentive schemes for {selectedMonth}.</p>
      ) : (
        <div className="space-y-5">
          {activeSchemes.map((scheme) => (
            <SchemeCard
              key={scheme.id}
              scheme={scheme}
              overallCurrent={progress[scheme.id] ?? 0}
              monthProgressPct={monthProgressPct}
              posMap={posMap}
              selectedPosId={selectedPosId}
              selectedMonth={selectedMonth}
            />
          ))}
        </div>
      )}
    </div>
  );
}
