import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Upload, FileSpreadsheet, TrendingUp, TrendingDown, Store,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import type { PosLocation, SalesEntry, PromotionDeduction } from "@shared/schema";

type PosDailyFigure = { id: string; counterId: string; date: string; posFigure: number };

function fmtCurrency(v: number) {
  return `HK$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function PosReconciliation() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const d = new Date();
  const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [importMonth, setImportMonth] = useState(currentMonth);

  // Month options
  const monthOptions = useMemo(() => {
    const opts: string[] = [];
    const dt = new Date();
    for (let i = 11; i >= 0; i--) {
      const md = new Date(dt.getFullYear(), dt.getMonth() - i, 1);
      opts.push(`${md.getFullYear()}-${String(md.getMonth() + 1).padStart(2, "0")}`);
    }
    return opts;
  }, []);

  const startDate = `${selectedMonth}-01`;
  const endDate = `${selectedMonth}-31`;

  // Fetch data
  const { data: posLocations = [] } = useQuery<PosLocation[]>({
    queryKey: ["/api/pos-locations"],
    staleTime: 30_000,
  });

  const { data: posFigures = [] } = useQuery<PosDailyFigure[]>({
    queryKey: ["/api/pos-daily-figures", "month", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/pos-daily-figures?startDate=${startDate}&endDate=${endDate}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: salesEntries = [] } = useQuery<SalesEntry[]>({
    queryKey: ["/api/sales", "reconciliation", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/sales?startDate=${startDate}&endDate=${endDate}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  // Promotion deductions over the same month — surfaced as a separate
  // column in the reconciliation table. The variance between BA-entered
  // gross and POS system figures often matches the total deduction exactly
  // (POS rings full gross but customer pays less thanks to the voucher).
  const { data: deductions = [] } = useQuery<PromotionDeduction[]>({
    queryKey: ["/api/promotion-deductions", "reconciliation", selectedMonth],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/promotion-deductions?startDate=${startDate}&endDate=${endDate}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("month", importMonth);
      const res = await fetch("/api/import/daily-report", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Import Complete",
        description: `${data.imported} sales entries, ${data.posFiguresImported} POS figures imported from ${data.sheetsProcessed} sheets.${data.missingBrands.length > 0 ? ` Missing brands: ${data.missingBrands.join(", ")}` : ""}${data.missingPos.length > 0 ? ` New POS created: ${data.missingPos.join(", ")}` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos-daily-figures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pos-locations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Import Error", description: error.message, variant: "destructive" });
    },
  });

  // Compute reconciliation data per POS per day
  const posMap = useMemo(() => {
    const m = new Map<string, PosLocation>();
    posLocations.forEach(p => m.set(p.id, p));
    return m;
  }, [posLocations]);

  const reconciliation = useMemo(() => {
    // Group BA sales by counter+date
    const baSales = new Map<string, number>();
    for (const e of salesEntries) {
      const key = `${e.counterId}|${e.date}`;
      baSales.set(key, (baSales.get(key) || 0) + e.amount);
    }

    // Group POS figures by counter+date
    const posFigs = new Map<string, number>();
    for (const f of posFigures) {
      posFigs.set(`${f.counterId}|${f.date}`, f.posFigure);
    }

    // Group promotion deductions by counter+date (sum across multiple
    // deductible promos per day).
    const dedTotals = new Map<string, number>();
    for (const d of deductions) {
      const k = `${d.counterId}|${d.date}`;
      dedTotals.set(k, (dedTotals.get(k) || 0) + (d.totalDeduction || 0));
    }

    // Build per-POS monthly summary
    type PosSummary = {
      posId: string; posName: string; channel: string;
      baSalesTotal: number;
      posFigureTotal: number;
      deductionTotal: number;
      baNetTotal: number;      // BA gross − deduction (what the counter actually received)
      variance: number;        // POS − BA gross (existing behaviour)
      varianceNet: number;     // POS − BA net    (after deduction allocation)
      daysWithData: number; daysWithPosFigure: number;
      dailyData: { date: string; baSales: number; posFigure: number; deduction: number; baNet: number; variance: number; varianceNet: number }[];
    };

    const summaryMap = new Map<string, PosSummary>();
    const allKeys = new Set<string>([
      ...baSales.keys(),
      ...posFigs.keys(),
      ...dedTotals.keys(),
    ]);

    for (const key of allKeys) {
      const [posId, date] = key.split("|");
      if (!summaryMap.has(posId)) {
        const pos = posMap.get(posId);
        summaryMap.set(posId, {
          posId, posName: pos?.storeName || posId, channel: pos?.salesChannel || "",
          baSalesTotal: 0, posFigureTotal: 0, deductionTotal: 0, baNetTotal: 0,
          variance: 0, varianceNet: 0,
          daysWithData: 0, daysWithPosFigure: 0, dailyData: [],
        });
      }
      const s = summaryMap.get(posId)!;
      const baAmount = baSales.get(key) || 0;
      const posFig = posFigs.get(key) || 0;
      const ded = dedTotals.get(key) || 0;
      const baNet = Math.max(0, baAmount - ded);

      if (baAmount > 0) { s.baSalesTotal += baAmount; s.daysWithData++; }
      if (posFig > 0) { s.posFigureTotal += posFig; s.daysWithPosFigure++; }
      s.deductionTotal += ded;
      s.baNetTotal += baNet;
      s.dailyData.push({
        date,
        baSales: baAmount,
        posFigure: posFig,
        deduction: ded,
        baNet,
        variance: posFig - baAmount,
        varianceNet: posFig - baNet,
      });
    }

    // Compute variance
    for (const s of summaryMap.values()) {
      s.variance = s.posFigureTotal - s.baSalesTotal;
      s.varianceNet = s.posFigureTotal - s.baNetTotal;
      s.dailyData.sort((a, b) => a.date.localeCompare(b.date));
    }

    return Array.from(summaryMap.values()).sort((a, b) => b.baSalesTotal - a.baSalesTotal);
  }, [salesEntries, posFigures, deductions, posMap]);

  const totalBA = reconciliation.reduce((s, r) => s + r.baSalesTotal, 0);
  const totalPOS = reconciliation.reduce((s, r) => s + r.posFigureTotal, 0);
  const totalVariance = totalPOS - totalBA;
  const captureRate = totalPOS > 0 ? (totalBA / totalPOS * 100) : 0;

  const [expandedPos, setExpandedPos] = useState<string | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Import Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Import Daily Sales Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload the monthly BA sales report Excel file. The file should contain one sheet per POS location with the tab naming convention: StoreCode_POS_Channel.
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Month</label>
              <Select value={importMonth} onValueChange={setImportMonth}>
                <SelectTrigger className="w-[140px] h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1">
              <label className="text-xs font-medium">Excel File (.xlsx)</label>
              <Input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="h-8 text-sm"
                data-testid="input-import-file"
              />
            </div>
            <Button
              size="sm"
              className="h-8"
              disabled={importMutation.isPending}
              onClick={() => {
                const f = fileRef.current?.files?.[0];
                if (!f) return toast({ title: "No file selected", variant: "destructive" });
                importMutation.mutate(f);
              }}
            >
              <Upload className="w-3 h-3 mr-1" />
              {importMutation.isPending ? "Importing..." : "Import"}
            </Button>
          </div>
          {importMutation.data && (
            <div className="text-xs bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded p-2 space-y-1">
              <p className="font-medium text-green-800 dark:text-green-200">
                <CheckCircle2 className="w-3 h-3 inline mr-1" />
                Import successful
              </p>
              <p>Sales entries: {importMutation.data.imported} | POS figures: {importMutation.data.posFiguresImported} | Sheets: {importMutation.data.sheetsProcessed}</p>
              {importMutation.data.missingBrands?.length > 0 && (
                <p className="text-amber-700">Missing brands: {importMutation.data.missingBrands.join(", ")}</p>
              )}
              {importMutation.data.missingPos?.length > 0 && (
                <p className="text-amber-700">Auto-created POS: {importMutation.data.missingPos.join(", ")}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation Section */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Store className="w-5 h-5" /> POS Reconciliation
        </h2>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">BA Recorded Sales</p>
            <p className="text-lg font-bold">{fmtCurrency(totalBA)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">POS System Total</p>
            <p className="text-lg font-bold">{totalPOS > 0 ? fmtCurrency(totalPOS) : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Non-BA Sales</p>
            <p className={`text-lg font-bold ${totalVariance > 0 ? "text-amber-600" : totalVariance < 0 ? "text-red-600" : ""}`}>
              {totalPOS > 0 ? fmtCurrency(totalVariance) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">BA Capture Rate</p>
            <p className="text-lg font-bold">{totalPOS > 0 ? `${captureRate.toFixed(1)}%` : "—"}</p>
            {totalPOS > 0 && <Progress value={Math.min(captureRate, 100)} className="h-1.5 mt-1" />}
          </CardContent>
        </Card>
      </div>

      {/* Per-POS breakdown */}
      {reconciliation.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sales data for {selectedMonth}.</p>
      ) : (
        <div className="space-y-2">
          {reconciliation.map(r => {
            const hasPos = r.posFigureTotal > 0;
            const rate = hasPos ? (r.baSalesTotal / r.posFigureTotal * 100) : 0;
            const isExpanded = expandedPos === r.posId;

            return (
              <Card key={r.posId} className="overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedPos(isExpanded ? null : r.posId)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{r.channel}</Badge>
                      <span className="font-medium text-sm">{r.posName}</span>
                      <span className="text-xs text-muted-foreground">({r.daysWithData}d)</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-right">
                        <span className="text-xs text-muted-foreground">BA: </span>
                        <span className="font-medium">{fmtCurrency(r.baSalesTotal)}</span>
                      </span>
                      {r.deductionTotal > 0 && (
                        <span className="text-right" title="Total HK$ deducted via promo redemptions this month">
                          <span className="text-xs text-muted-foreground">Ded: </span>
                          <span className="font-medium text-blue-700 dark:text-blue-300">−{fmtCurrency(r.deductionTotal)}</span>
                        </span>
                      )}
                      {hasPos && (
                        <>
                          <span className="text-right">
                            <span className="text-xs text-muted-foreground">POS: </span>
                            <span className="font-medium">{fmtCurrency(r.posFigureTotal)}</span>
                          </span>
                          <Badge
                            variant={Math.abs(r.variance) < 500 ? "secondary" : r.variance > 0 ? "default" : "destructive"}
                            className="text-[10px] min-w-[56px] justify-center"
                          >
                            {r.variance > 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> :
                             r.variance < 0 ? <ArrowDownRight className="w-3 h-3 mr-0.5" /> :
                             <Minus className="w-3 h-3 mr-0.5" />}
                            {fmtCurrency(Math.abs(r.variance))}
                          </Badge>
                          <span className="text-xs text-muted-foreground w-[45px] text-right">{rate.toFixed(0)}%</span>
                        </>
                      )}
                      {!hasPos && (
                        <span className="text-xs text-muted-foreground italic">No POS figure</span>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && r.dailyData.length > 0 && (
                  <div className="border-t px-4 py-2 bg-muted/20">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 font-medium">Date</th>
                          <th className="text-right py-1 font-medium">BA Gross</th>
                          <th className="text-right py-1 font-medium" title="Promo deduction recorded for that day">Deduction</th>
                          <th className="text-right py-1 font-medium">BA Net</th>
                          <th className="text-right py-1 font-medium">POS Figure</th>
                          <th className="text-right py-1 font-medium" title="POS − BA Net (after promo deduction)">Variance (vs Net)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.dailyData.map(dd => (
                          <tr key={dd.date} className="border-b last:border-0">
                            <td className="py-1">{(() => { const [y,m,d] = dd.date.split("-"); return `${d}/${m}/${y}`; })()}</td>
                            <td className="py-1 text-right font-mono">{fmtCurrency(dd.baSales)}</td>
                            <td className="py-1 text-right font-mono text-blue-700 dark:text-blue-300">{dd.deduction > 0 ? `−${fmtCurrency(dd.deduction)}` : "—"}</td>
                            <td className="py-1 text-right font-mono font-semibold">{fmtCurrency(dd.baNet)}</td>
                            <td className="py-1 text-right font-mono">{dd.posFigure > 0 ? fmtCurrency(dd.posFigure) : "—"}</td>
                            <td className={`py-1 text-right font-mono ${dd.varianceNet > 0 ? "text-amber-600" : dd.varianceNet < 0 ? "text-red-600" : ""}`}>
                              {dd.posFigure > 0 ? `${dd.varianceNet > 0 ? "+" : ""}${fmtCurrency(dd.varianceNet)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
