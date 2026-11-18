import { describe, expect, it } from "vitest";
import { payRouteDecision, monthEditDecision } from "./access";
import {
  DEFAULT_TIERS_L,
  DEFAULT_TIERS_S,
  assignShares,
  buildTargets,
  calculateMonth,
  counterStartingTarget,
  estimatedCounted,
  median,
  monthlyCommission,
  overallAchievement,
  partTimerDayCost,
  provisionalAmount,
  reconciliationGap,
  stepStartingTarget,
  type DutyStatus,
} from "./commission";
import { monthDates } from "./hkTime";

const cent = (actual: number, expected: number) => {
  expect(Math.abs(actual - expected)).toBeLessThan(0.001);
};

const DAY = 100000 / 30;
const MONTH = "2026-04";

function commission(table: "L" | "S", counted: number, ach: number) {
  return monthlyCommission(counted, ach, table === "L" ? DEFAULT_TIERS_L : DEFAULT_TIERS_S);
}

function flatSales(posId: string, amount: number) {
  return monthDates(MONTH).map(date => ({ posId, date, amount }));
}

function duty(statuses: DutyStatus[], posId = "shop") {
  return monthDates(MONTH).map((date, i) => ({
    date,
    posId,
    status: statuses[i] ?? "WORKED" as DutyStatus,
    substitutionType: statuses[i] && statuses[i] !== "WORKED" ? "planned" as const : null,
  }));
}

describe("section 8.1 spec cases", () => {
  it("1 L 90,000 at 100%", () => {
    const r = commission("L", 90000, 1);
    cent(r.G, 1800);
    cent(r.T, 2130);
    cent(r.commission, 2130);
  });

  it("2 L 90,000 at 80%", () => {
    const r = commission("L", 90000, 0.8);
    cent(r.commission, 2064);
  });

  it("3 S 90,000 at 100%", () => {
    const r = commission("S", 90000, 1);
    cent(r.G, 1800);
    cent(r.T, 2820);
    cent(r.commission, 2820);
  });

  it("4 S 90,000 at 80%", () => {
    cent(commission("S", 90000, 0.8).commission, 2616);
  });

  it("5 L 180,000 at 80%", () => {
    const r = commission("L", 180000, 0.8);
    cent(r.G, 3600);
    cent(r.T, 9130);
    cent(r.commission, 8024);
  });

  it("6 L 60,000 any achievement", () => {
    const r = commission("L", 60000, 0.2);
    cent(r.G, 1200);
    cent(r.T, 1200);
    cent(r.commission, 1200);
  });

  it("brand achievement caps at 100% and ignores a zero target", () => {
    const overall = overallAchievement([
      { target: 50000, actual: 50000 },
      { target: 30000, actual: 15000 },
      { target: 20000, actual: 30000 },
      { target: 0, actual: 99999 },
    ]);
    cent(overall, 0.85);
    cent(overallAchievement([{ target: 100, actual: 0 }]), 0);
  });
});

describe("section 8.2 duty record", () => {
  function run(statuses: DutyStatus[], ach: number) {
    return calculateMonth({
      month: MONTH,
      aeon: false,
      shopIds: ["shop"],
      dailySales: flatSales("shop", DAY),
      duty: duty(statuses),
      shopActuals: null,
      tiers: DEFAULT_TIERS_L,
      brandTargets: [{ brandId: "A", target: 100 }],
      brandSales: [{ brandId: "A", amount: ach * 100 }],
      brandActuals: null,
    });
  }

  it("7 six separate rest days", () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    for (const i of [1, 4, 7, 10, 13, 16]) statuses[i] = "REST";
    const r = run(statuses, 0.8);
    cent(r.countedSales, 90000);
    cent(r.commission, 2064);
    expect(r.basis).toBe("provisional");
  });

  it("8 five consecutive annual leave plus one rest, 100%", () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    for (let i = 9; i < 14; i++) statuses[i] = "ANNUAL_LEAVE";
    statuses[20] = "REST";
    const r = run(statuses, 1);
    cent(r.countedSales, 88333.333333);
    cent(r.G, 1766.666666);
    cent(r.T, 2063.333333);
    cent(r.commission, 2063.333333);
  });

  it("9 same duty at 80%", () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    for (let i = 9; i < 14; i++) statuses[i] = "ANNUAL_LEAVE";
    statuses[20] = "REST";
    const r = run(statuses, 0.8);
    cent(r.commission, 2004);
  });

  it("10 five sick days plus one rest", () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    for (let i = 9; i < 14; i++) statuses[i] = "SICK_LEAVE";
    statuses[20] = "REST";
    const r = run(statuses, 1);
    cent(r.countedSales, 81666.666666);
    cent(r.G, 1633.333333);
    cent(r.T, 1796.666666);
    cent(r.commission, 1796.666666);
  });

  it("11 one unpaid leave day", () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    statuses[0] = "UNPAID_LEAVE";
    const r = run(statuses, 1);
    cent(r.countedSales, 96666.666666);
    cent(r.commission, 2396.666666);
  });

  it("12 exactly four annual leave days count as a long run", () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    for (let i = 0; i < 4; i++) statuses[i] = "ANNUAL_LEAVE";
    const shares = assignShares(duty(statuses));
    expect(shares.slice(0, 4).every(d => d.share === 0.4)).toBe(true);
    const r = run(statuses, 1);
    cent(r.countedSales, 92000);
    cent(r.commission, 2210);
  });

  it("leave that crosses a month end does not join into one run", () => {
    const april = assignShares([
      { date: "2026-04-30", status: "ANNUAL_LEAVE" as DutyStatus },
    ]);
    const may = assignShares([
      { date: "2026-05-01", status: "ANNUAL_LEAVE" as DutyStatus },
      { date: "2026-05-02", status: "ANNUAL_LEAVE" as DutyStatus },
      { date: "2026-05-03", status: "ANNUAL_LEAVE" as DutyStatus },
    ]);
    expect(april[0].share).toBe(0.5);
    expect(may[0].runLength).toBe(3);
    expect(may[0].share).toBe(0.5);
  });
});

describe("section 8.3 part-timer cost", () => {
  it("13 planned rest day", () => {
    cent(partTimerDayCost(DAY, "planned"), 563.333333);
  });
  it("14 unexpected substitution", () => {
    cent(partTimerDayCost(DAY, "unexpected"), 580);
  });
  it("15 six planned days", () => {
    cent(partTimerDayCost(DAY, "planned") * 6, 3380);
  });
});

describe("section 8.4 provisional versus actual", () => {
  const rest = () => {
    const statuses = monthDates(MONTH).map(() => "WORKED" as DutyStatus);
    for (const i of [1, 4, 7, 10, 13, 16]) statuses[i] = "REST";
    return statuses;
  };

  it("16 channel actual is scaled by the daily share", () => {
    const r = calculateMonth({
      month: MONTH,
      aeon: false,
      shopIds: ["shop"],
      dailySales: flatSales("shop", DAY),
      duty: duty(rest()),
      shopActuals: [{ posId: "shop", amount: 110000 }],
      tiers: DEFAULT_TIERS_L,
      brandTargets: [{ brandId: "A", target: 1 }],
      brandSales: [{ brandId: "A", amount: 1 }],
      brandActuals: null,
    });
    expect(r.basis).toBe("actual");
    cent(r.countedSales, 99000);
    cent(r.commission, 2490);
  });

  it("17 no actual stays provisional", () => {
    const r = calculateMonth({
      month: MONTH,
      aeon: false,
      shopIds: ["shop"],
      dailySales: flatSales("shop", DAY),
      duty: duty(rest()),
      shopActuals: null,
      tiers: DEFAULT_TIERS_L,
      brandTargets: [{ brandId: "A", target: 1 }],
      brandSales: [{ brandId: "A", amount: 1 }],
      brandActuals: null,
    });
    expect(r.basis).toBe("provisional");
    cent(r.countedSales, 90000);
    cent(r.commission, 2130);
  });

  it("18 gap of 10% is flagged at the 5% default", () => {
    const g = reconciliationGap(100000, 110000, 0.05);
    cent(g.gap ?? 0, 10000);
    cent(g.gapPct ?? 0, 0.1);
    expect(g.flagged).toBe(true);
  });

  it("18a promo money-off is not subtracted", () => {
    expect(provisionalAmount(12000, 1500)).toBe(12000);
  });

  it("19 no duty record uses the 6-rest-day estimate", () => {
    const r = calculateMonth({
      month: MONTH,
      aeon: false,
      shopIds: ["shop"],
      dailySales: flatSales("shop", DAY),
      duty: null,
      shopActuals: null,
      tiers: DEFAULT_TIERS_L,
      brandTargets: [],
      brandSales: [],
      brandActuals: null,
    });
    expect(r.basis).toBe("estimated");
    cent(r.countedSales, estimatedCounted(100000, 30, 6));
    cent(r.countedSales, 90000);
  });
});

describe("section 8.5 AEON", () => {
  function aeonDuty() {
    return monthDates(MONTH).map((date, i) => ({
      date,
      posId: i < 15 ? "KH" : "SK",
      status: "WORKED" as DutyStatus,
      substitutionType: null,
    }));
  }

  const sales = [
    ...monthDates(MONTH).map(date => ({ posId: "KH", date, amount: 2000 })),
    ...monthDates(MONTH).map(date => ({ posId: "SK", date, amount: 3000 })),
  ];

  it("20 only the shop she is in that day", () => {
    const r = calculateMonth({
      month: MONTH,
      aeon: true,
      shopIds: ["KH", "SK"],
      dailySales: sales,
      duty: aeonDuty(),
      shopActuals: null,
      tiers: DEFAULT_TIERS_L,
      brandTargets: [{ brandId: "A", target: 100 }],
      brandSales: [{ brandId: "A", amount: 80 }],
      brandActuals: null,
    });
    cent(r.countedSales, 75000);
    cent(r.G, 1500);
    cent(r.T, 1550);
    cent(r.commission, 1540);
    expect(r.basis).toBe("provisional");
  });

  it("21 separate shop actuals that match the daily pattern give the same counted sales", () => {
    const r = calculateMonth({
      month: MONTH,
      aeon: true,
      shopIds: ["KH", "SK"],
      dailySales: sales,
      duty: aeonDuty(),
      shopActuals: [
        { posId: "KH", amount: 60000 },
        { posId: "SK", amount: 90000 },
      ],
      tiers: DEFAULT_TIERS_L,
      brandTargets: [{ brandId: "A", target: 100 }],
      brandSales: [{ brandId: "A", amount: 80 }],
      brandActuals: null,
    });
    expect(r.basis).toBe("actual");
    cent(r.countedSales, 75000);
    cent(r.commission, 1540);
  });
});

describe("section 8.6 targets and access", () => {
  it("22 median is the middle value", () => {
    expect(median([40000, 60000, 50000])).toBe(50000);
  });

  it("23 starting target is the higher of the minimum and the median", () => {
    expect(counterStartingTarget(83086, 70000)).toBe(83086);
  });

  it("24 a final counter target below the minimum warns and still returns a figure", () => {
    const built = buildTargets({
      counterStarting: 80000,
      minTarget: 83086,
      priority: [{ brandId: "A", median: 80000, brandAdjustment: 1 }],
      nonPriorityExpected: 0,
      allBrandsAdjustment: 1,
    });
    expect(built.belowMinimum).toBe(true);
    expect(built.finalCounterTarget).toBe(80000);
    expect(built.poolNegative).toBe(false);
  });

  it("25 a brand manager cannot call a pay route", () => {
    expect(payRouteDecision("brand_manager", "bm", "ba-1")).toBe("forbidden");
  });

  it("26 a BA cannot open another BA's pay", () => {
    expect(payRouteDecision("ba", "ba-1", "ba-2")).toBe("forbidden");
    expect(payRouteDecision("ba", "ba-1", "ba-1")).toBe("ok");
    expect(payRouteDecision("sales_manager", "sm", "ba-2")).toBe("ok");
  });

  it("27 a locked month rejects edits until an admin reopens it", () => {
    expect(monthEditDecision("locked", "sales_manager", "edit")).toBe("forbidden");
    expect(monthEditDecision("locked", "admin", "edit")).toBe("forbidden");
    expect(monthEditDecision("locked", "sales_manager", "reopen")).toBe("forbidden");
    expect(monthEditDecision("locked", "admin", "reopen")).toBe("ok");
    expect(monthEditDecision("open", "sales_manager", "edit")).toBe("ok");
  });

  it("steps FW and LP a third of the way for each of three months", () => {
    cent(stepStartingTarget(70000, 83086, 1), 70000 + (83086 - 70000) / 3);
    expect(stepStartingTarget(70000, 83086, 3)).toBe(83086);
  });
});
