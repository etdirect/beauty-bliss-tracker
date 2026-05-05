import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Trophy, Store, Gift,
} from "lucide-react";
import type { IncentiveScheme, PosLocation, RewardTier, StoreThreshold, ComboBonus, TargetProduct, TierMode } from "@shared/schema";
import { INCENTIVE_CATEGORY_LABELS } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/App";
import { Download } from "lucide-react";

// ─── Helpers ────────────────────────────────────────

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function parseJSON<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * Compute tiered payout under one of two modes:
 *   "flat"     — every qualifying unit pays at the rate of the highest
 *                tier the BA has reached. Default / legacy behavior.
 *   "marginal" — each band pays its own rate (graduated, like income
 *                tax). Example for $7/35-49 + $9/50-64 + $12/65+ at 55
 *                units: (49-35)*7 + (55-50)*9 = $143.
 *
 * `units` is the qualifying count (already net of offset). Returns the
 * applied rate to display alongside the payout, and the payout itself.
 */
function computeTieredPayout(
  units: number,
  tiers: RewardTier[],
  mode: TierMode = "flat",
): { rate: number; payout: number } {
  if (!tiers.length || units <= 0) return { rate: 0, payout: 0 };
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);

  // Find the topmost tier the BA has reached — used for the displayed
  // rate label in both modes.
  let topTier = sorted[0];
  for (const t of sorted) if (units >= t.minQty) topTier = t;

  if (mode === "marginal") {
    let payout = 0;
    for (const t of sorted) {
      if (units < t.minQty) break;
      // Upper boundary of this band, capped at the BA's count.
      // If the band has no maxQty, it stretches to infinity — use units.
      const bandEnd = t.maxQty != null ? Math.min(units, t.maxQty) : units;
      // Band starts at minQty; subtract -1 because tiers are conventionally
      // inclusive ranges (35–49 means 35,36,...,49 → 15 pieces).
      // Width of the band the BA actually filled:
      const bandWidth = bandEnd - t.minQty + 1;
      if (bandWidth > 0) payout += bandWidth * t.rewardAmount;
    }
    return { rate: topTier.rewardAmount, payout };
  }
  // flat
  return { rate: topTier.rewardAmount, payout: units * topTier.rewardAmount };
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
  const tierMode: TierMode = (scheme.tierMode as TierMode) === "marginal" ? "marginal" : "flat";
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
              {/* Month tag — makes it obvious which month each card is
                  tied to. Also acts as a visual cross-check against the
                  filter dropdown so a card whose month doesn't match
                  the filter (which shouldn't happen, but did once) is
                  immediately visible. */}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                {scheme.month}
              </Badge>
              {scheme.targetName && (
                <span className="text-xs text-muted-foreground">{scheme.targetName}</span>
              )}
              {hasTiers && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {tierDescription(tiers!)}
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider opacity-75 font-sans">
                    {tierMode === "marginal" ? "graduated" : "flat"}
                  </span>
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
            const { rate, payout } = computeTieredPayout(effectiveUnits, tiers!, tierMode);
            return (
              <div className="text-xs text-muted-foreground mt-1">
                Current tier rate: HK${rate}/unit
                <span className="ml-1">({tierMode === "marginal" ? "graduated bands" : "flat — all units at top tier"})</span>
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
                  // Per-store threshold acts as BOTH the eligibility gate
                  // AND the start-counting point for the reward. e.g. if
                  // SOGO Causeway Bay's threshold is 48 and the BA sells
                  // 100, payout is calculated on (100 − 48) = 52 units,
                  // not 100. The scheme-level Offset is added on top so
                  // 'first N pcs don't count' still works.
                  const meetsThreshold = currentUnits >= st.threshold;
                  const effectiveUnits = meetsThreshold
                    ? Math.max(currentUnits - st.threshold - offset, 0)
                    : 0;
                  const pct = st.threshold > 0
                    ? Math.min((currentUnits / st.threshold) * 100, 100)
                    : 0;
                  const onTrack = pct >= monthProgressPct;

                  let payoutAmt = 0;
                  let rateLabel = "";
                  if (hasTiers) {
                    const { rate, payout } = computeTieredPayout(effectiveUnits, tiers!, tierMode);
                    payoutAmt = meetsThreshold ? payout : 0;
                    rateLabel = `$${rate}`;
                  } else {
                    const base = scheme.rewardBasis === "per_unit"
                      ? effectiveUnits * scheme.rewardAmount
                      : scheme.rewardBasis === "per_amount"
                      ? Math.floor(currentUnits / (scheme.rewardPerAmountUnit ?? 1000)) * scheme.rewardAmount
                      : scheme.rewardAmount;
                    payoutAmt = meetsThreshold ? base : 0;
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
                    const meetsThreshold = curr >= st.threshold;
                    if (!meetsThreshold) continue;
                    // Same store-threshold-as-offset logic as the rows above.
                    const eff = Math.max(curr - st.threshold - offset, 0);
                    if (hasTiers) {
                      totalPayout += computeTieredPayout(eff, tiers!, tierMode).payout;
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
                    // Same threshold gate as the per-store-thresholds
                    // path: nothing pays out until the store hits the
                    // scheme's minimum.
                    const meetsThreshold = val >= scheme.threshold;
                    let payoutAmt = 0;
                    if (hasTiers) {
                      payoutAmt = meetsThreshold ? computeTieredPayout(effectiveVal, tiers!, tierMode).payout : 0;
                    } else if (meetsThreshold) {
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

// ─── Channel color codes (shared with Promotion preview UI) ──────
const CHANNEL_COLORS: Record<string, string> = {
  LOGON: "text-emerald-600 dark:text-emerald-400",
  AEON: "text-red-600 dark:text-red-400",
  SOGO: "text-blue-600 dark:text-blue-400",
  FACESSS: "text-pink-600 dark:text-pink-400",
};
function channelColorClass(channel?: string | null): string {
  if (!channel) return "text-foreground";
  return CHANNEL_COLORS[channel.toUpperCase()] ?? "text-foreground";
}

// ─── Payout helper used by the Earnings by Store summary ───────
// Mirrors the per-scheme card logic exactly so the summary always
// reconciles against the per-scheme breakdowns.
function computeStorePayoutForScheme(
  scheme: IncentiveScheme,
  posId: string,
  rawProgress: number,
): { payout: number; combo: number; qualified: boolean } {
  const tiers: RewardTier[] | null = scheme.rewardTiers ? JSON.parse(scheme.rewardTiers) : null;
  const storeThresholds: StoreThreshold[] | null = scheme.storeThresholds ? JSON.parse(scheme.storeThresholds) : null;
  const combo: ComboBonus | null = scheme.comboBonus ? JSON.parse(scheme.comboBonus) : null;
  const tierMode: TierMode = (scheme.tierMode as TierMode) === "marginal" ? "marginal" : "flat";
  const offset = scheme.incentiveOffset ?? 0;
  // Per-store override of the scheme threshold when present.
  const perStore = storeThresholds?.find((s) => s.posId === posId);
  const threshold = perStore ? perStore.threshold : scheme.threshold;
  const qualified = rawProgress >= threshold && rawProgress > 0;
  if (!qualified) return { payout: 0, combo: 0, qualified: false };

  // Threshold doubles as the start-counting point for the reward.
  const effectiveUnits = Math.max(rawProgress - threshold - offset, 0);

  let base = 0;
  if (tiers && tiers.length > 0) {
    const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
    if (effectiveUnits > 0) {
      if (tierMode === "marginal") {
        for (const t of sorted) {
          if (effectiveUnits < t.minQty) break;
          const bandEnd = t.maxQty != null ? Math.min(effectiveUnits, t.maxQty) : effectiveUnits;
          const w = bandEnd - t.minQty + 1;
          if (w > 0) base += w * t.rewardAmount;
        }
      } else {
        let topRate = 0;
        for (const t of sorted) if (effectiveUnits >= t.minQty) topRate = t.rewardAmount;
        base = effectiveUnits * topRate;
      }
    }
  } else if (scheme.rewardBasis === "per_unit") {
    base = effectiveUnits * scheme.rewardAmount;
  } else if (scheme.rewardBasis === "per_amount") {
    base = Math.floor(rawProgress / (scheme.rewardPerAmountUnit ?? 1000)) * scheme.rewardAmount;
  } else if (scheme.rewardBasis === "per_transaction") {
    base = effectiveUnits * scheme.rewardAmount;
  } else {
    base = scheme.rewardAmount;
  }

  const comboAmt = combo ? combo.amount : 0;
  return { payout: base + comboAmt, combo: comboAmt, qualified: true };
}

// ─── Earnings by Store summary table (management only) ──────────
function EarningsByStoreCard({
  selectedMonth,
  schemes,
  posLocations,
}: {
  selectedMonth: string;
  schemes: IncentiveScheme[];
  posLocations: PosLocation[];
}) {
  // Bulk per-store progress for ALL active schemes in the selected
  // month, in one round-trip.
  const { data: bulkProgress = {}, isLoading } = useQuery<Record<string, Record<string, number>>>({
    queryKey: ["/api/incentive-progress-by-store-bulk", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/incentive-progress-by-store-bulk?month=${encodeURIComponent(selectedMonth)}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  // Build per-store rows: one entry per POS that earned anything OR
  // belongs to a store-thresholded scheme this month.
  const rows = useMemo(() => {
    type Row = {
      posId: string;
      channel: string;
      storeCode: string;
      storeName: string;
      qualified: number;       // # schemes where this store qualified
      total: number;            // payout total HK$
      combo: number;            // sum of combo bonuses
      topScheme: { name: string; amount: number } | null;
    };
    const map = new Map<string, Row>();

    // Set of POS ids the schemes apply to (intersection of explicit
    // posIds + storeThresholds.posId across schemes). If neither is set
    // we fall back to all active POS.
    const considered = new Set<string>();
    for (const s of schemes.filter((x) => x.isActive)) {
      const explicit: string[] = (s.posIds || "")
        .split(",").map((x) => x.trim()).filter(Boolean);
      const sts: StoreThreshold[] = s.storeThresholds ? JSON.parse(s.storeThresholds) : [];
      const fromSts = sts.map((x) => x.posId);
      const ids = [...explicit, ...fromSts];
      if (ids.length === 0) {
        // Scheme applies to all active POS — use bulkProgress keys for
        // this scheme so the table stays scoped to actual sellers.
        const sales = bulkProgress[s.id] || {};
        for (const k of Object.keys(sales)) considered.add(k);
      } else {
        for (const id of ids) considered.add(id);
      }
    }

    for (const posId of considered) {
      const pos = posLocations.find((p) => p.id === posId);
      if (!pos) continue;
      const row: Row = {
        posId,
        channel: pos.salesChannel,
        storeCode: pos.storeCode,
        storeName: pos.storeName,
        qualified: 0,
        total: 0,
        combo: 0,
        topScheme: null,
      };
      for (const s of schemes.filter((x) => x.isActive)) {
        const sales = bulkProgress[s.id] || {};
        const raw = sales[posId] ?? 0;
        const { payout, combo, qualified } = computeStorePayoutForScheme(s, posId, raw);
        if (qualified && payout > 0) {
          row.qualified += 1;
          row.total += payout;
          row.combo += combo;
          if (!row.topScheme || payout > row.topScheme.amount) {
            row.topScheme = { name: s.name, amount: payout };
          }
        }
      }
      if (row.total > 0) map.set(posId, row);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [bulkProgress, schemes, posLocations]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  const grandCombo = rows.reduce((s, r) => s + r.combo, 0);

  // CSV export. Columns mirror the on-screen table.
  const exportCsv = () => {
    const header = ["Channel", "Store Code", "Store", "Qualified Schemes", "Combo Bonus (HK$)", "Total Payout (HK$)", "Top Earner"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const cells = [
        r.channel, r.storeCode, r.storeName,
        String(r.qualified),
        String(Math.round(r.combo)),
        String(Math.round(r.total)),
        r.topScheme ? `\"${r.topScheme.name.replace(/"/g, "'")} — HK\$${Math.round(r.topScheme.amount)}\"` : "",
      ];
      lines.push(cells.join(","));
    }
    lines.push(["", "", "TOTAL", "", String(Math.round(grandCombo)), String(Math.round(grandTotal)), ""].join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incentive-earnings-by-store-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Incentive Earnings by Store — {selectedMonth}</span>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0} data-testid="button-export-earnings-by-store">
            <Download className="w-4 h-4 mr-1.5" /> Export CSV
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Estimated cash earned by each store across all active incentive schemes. Reflects per-store thresholds and the Flat / Marginal calculation set on each scheme.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">No store has earned any incentive yet for {selectedMonth}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium">Store</th>
                  <th className="pb-2 font-medium text-right whitespace-nowrap w-[140px]"># Schemes Qualified</th>
                  <th className="pb-2 font-medium text-right whitespace-nowrap w-[140px]">Combo Bonus</th>
                  <th className="pb-2 font-medium text-right whitespace-nowrap w-[140px]">Total Payout</th>
                  <th className="pb-2 font-medium">Top Earner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.posId} className="border-b last:border-0">
                    <td className="py-2">
                      <span className={`font-semibold mr-1.5 ${channelColorClass(r.channel)}`}>
                        {r.channel}{r.storeCode ? ` (${r.storeCode})` : ""}
                      </span>
                      <span className="text-foreground">{r.storeName}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.qualified}</td>
                    <td className="py-2 text-right tabular-nums">{r.combo > 0 ? fmtCurrency(r.combo) : "—"}</td>
                    <td className="py-2 text-right tabular-nums font-semibold">{fmtCurrency(r.total)}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {r.topScheme ? (
                        <span title={r.topScheme.name}>
                          {r.topScheme.name.length > 36 ? r.topScheme.name.slice(0, 33) + "…" : r.topScheme.name}
                          <span className="ml-1.5">({fmtCurrency(r.topScheme.amount)})</span>
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold bg-muted/30">
                  <td className="py-2">Total — {rows.length} store{rows.length === 1 ? "" : "s"} earning</td>
                  <td className="py-2 text-right">—</td>
                  <td className="py-2 text-right tabular-nums">{grandCombo > 0 ? fmtCurrency(grandCombo) : "—"}</td>
                  <td className="py-2 text-right tabular-nums">{fmtCurrency(grandTotal)}</td>
                  <td className="py-2">—</td>
                </tr>
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
  const { user } = useAuth();
  const isManagement = user?.role === "management";
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

  // Schemes for the selected month. Pass selectedMonth as its own array
  // segment so React Query treats month switches as distinct cache keys
  // (previously the URL string was concatenated, which still works but
  // is harder to invalidate selectively). Defensive client-side filter
  // ensures we never render a stale scheme whose month doesn't match the
  // current selection — covers any case where the API returns extra rows.
  const { data: schemesRaw = [] } = useQuery<IncentiveScheme[]>({
    queryKey: ["/api/incentive-schemes/month", selectedMonth],
    staleTime: 30_000,
  });
  const schemes = useMemo(
    () => schemesRaw.filter((s) => s.month === selectedMonth),
    [schemesRaw, selectedMonth],
  );

  const { data: progress = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/incentive-progress", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/incentive-progress?month=${selectedMonth}`);
      return res.json();
    },
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

      {/* Management-only summary table. Sits at the top of the page so
          the headline number is visible before drilling into each scheme. */}
      {isManagement && activeSchemes.length > 0 && (
        <EarningsByStoreCard
          selectedMonth={selectedMonth}
          schemes={activeSchemes}
          posLocations={posLocations}
        />
      )}

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
