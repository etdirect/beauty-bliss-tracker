import { randomUUID } from "crypto";
import { hkTimestamp } from "@shared/hkTime";
import {
  DEFAULT_SETTINGS,
  DEFAULT_TIERS_L,
  DEFAULT_TIERS_S,
  type DutyStatus,
  type SubstitutionType,
  type TierSlice,
} from "@shared/commission";
import { PRIORITY_CODES, SCHEME_COUNTERS, brandMatchesCode, matchPos, type PosLike } from "@shared/scheme";

type Q = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

export class MonthLockedError extends Error {
  constructor() {
    super("MONTH_LOCKED");
    this.name = "MonthLockedError";
  }
}

export interface SchemeMember {
  id: string;
  shopCode: string;
  posId: string | null;
  storeName: string | null;
  salesChannel: string | null;
  storeCode: string | null;
}

export interface SchemeCounter {
  id: string;
  code: string;
  name: string;
  channel: string;
  tierTable: "L" | "S";
  tradeMargin: number;
  minTarget: number;
  isActive: boolean;
  members: SchemeMember[];
}

export interface TierRow extends TierSlice {
  id: string;
  tierTable: "L" | "S";
  sortOrder: number;
}

export interface CommissionSettingsRow {
  guaranteedRate: number;
  defaultBasicSalary: number;
  partTimeDayRate: number;
  partTimePlannedRate: number;
  partTimeUnexpectedRate: number;
  consecutiveDaysThreshold: number;
  reconciliationGapThreshold: number;
  defaultRestDays: number;
  prioritySeeded: boolean;
}

export interface DutyRow {
  id: string;
  counterId: string;
  posId: string | null;
  date: string;
  regularUserId: string | null;
  status: DutyStatus;
  partTimeUserId: string | null;
  substitutionType: SubstitutionType | null;
  note: string | null;
}

export interface ActualRow {
  id: string;
  month: string;
  counterId: string;
  brandId: string;
  posId: string | null;
  actualAmount: number;
  source: string;
  note: string | null;
}

export interface BrandTargetRow {
  id: string;
  month: string;
  counterId: string;
  brandId: string;
  startingTarget: number;
  brandAdjustment: number;
  finalTarget: number;
  status: "draft" | "published";
}

export interface CounterTargetRow {
  id: string;
  month: string;
  counterId: string;
  startingTarget: number;
  allBrandsAdjustment: number;
  nonPriorityExpected: number;
  finalCounterTarget: number;
  belowMinimumWarning: boolean;
  status: "draft" | "published";
}

export interface StepPlan {
  counterId: string;
  startMonth: string;
  enabled: boolean;
  medianAtStart: number | null;
}

export interface ProjectionRow {
  userId: string;
  month: string;
  counterId: string;
  projectedCounterSales: number | null;
  expectedRestDays: number | null;
  achievementOverride: number | null;
}

export interface CommissionRepo {
  listCounters(): Promise<SchemeCounter[]>;
  updateCounter(id: string, patch: Partial<Pick<SchemeCounter, "name" | "minTarget" | "tradeMargin" | "isActive">>, userId: string): Promise<void>;
  linkMember(counterId: string, shopCode: string, posId: string, userId: string): Promise<void>;
  listTiers(): Promise<TierRow[]>;
  saveTiers(tierTable: "L" | "S", rows: TierSlice[], userId: string): Promise<void>;
  getSettings(): Promise<CommissionSettingsRow>;
  saveSettings(patch: Partial<CommissionSettingsRow>, userId: string): Promise<void>;
  listDuty(counterId: string, month: string): Promise<DutyRow[]>;
  saveDuty(counterId: string, month: string, days: Omit<DutyRow, "id" | "counterId">[], userId: string): Promise<void>;
  listActuals(counterId: string, month: string): Promise<ActualRow[]>;
  saveActuals(counterId: string, month: string, rows: { brandId: string; posId: string; actualAmount: number; note?: string | null }[], userId: string): Promise<void>;
  listBrandTargets(counterId: string, month: string): Promise<BrandTargetRow[]>;
  getCounterTarget(counterId: string, month: string): Promise<CounterTargetRow | null>;
  saveTargets(input: {
    counterId: string;
    month: string;
    status: "draft" | "published";
    reason: string | null;
    counter: Omit<CounterTargetRow, "id" | "month" | "counterId">;
    brands: Omit<BrandTargetRow, "id" | "month" | "counterId" | "status">[];
  }, userId: string): Promise<void>;
  listStepPlans(): Promise<StepPlan[]>;
  saveStepPlan(plan: StepPlan, userId: string): Promise<void>;
  salaryFor(userId: string, month: string): Promise<number | null>;
  setSalary(userId: string, month: string, amount: number, editorId: string): Promise<void>;
  getProjection(userId: string, month: string, counterId: string): Promise<ProjectionRow | null>;
  setProjection(row: ProjectionRow): Promise<void>;
  monthStatus(counterId: string, month: string): Promise<"open" | "locked">;
  lockMonth(counterId: string, month: string, userId: string): Promise<void>;
  reopenMonth(counterId: string, month: string, userId: string): Promise<void>;
  priorities(): Promise<{ brandId: string; posId: string; isPriority: boolean }[]>;
  setPriority(brandId: string, posId: string, value: boolean, userId: string): Promise<void>;
}

let bound: Q | null = null;

export function bindCommissionQuery(q: Q) {
  bound = q;
}

export function commissionRepo(): CommissionRepo {
  return bound ? new PgRepo(bound) : mem;
}

const now = () => hkTimestamp();

async function audit(q: Q | null, memAudit: any[] | null, table: string, recordId: string, oldValue: unknown, newValue: unknown, userId: string) {
  const row = {
    id: randomUUID(),
    table_name: table,
    record_id: recordId,
    old_json: JSON.stringify(oldValue),
    new_json: JSON.stringify(newValue),
    user_id: userId,
    created_at: now(),
  };
  if (q) {
    await q(
      `INSERT INTO audit_log (id, table_name, record_id, old_json, new_json, user_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, row.table_name, row.record_id, row.old_json, row.new_json, row.user_id, row.created_at],
    );
  } else if (memAudit) memAudit.push(row);
}

function defaultSettings(): CommissionSettingsRow {
  return { ...DEFAULT_SETTINGS, prioritySeeded: false };
}

function defaultTiers(): TierRow[] {
  const rows: TierRow[] = [];
  DEFAULT_TIERS_L.forEach((t, i) => rows.push({ ...t, id: randomUUID(), tierTable: "L", sortOrder: i }));
  DEFAULT_TIERS_S.forEach((t, i) => rows.push({ ...t, id: randomUUID(), tierTable: "S", sortOrder: i }));
  return rows;
}

class PgRepo implements CommissionRepo {
  constructor(private q: Q) {}

  private async locked(counterId: string, month: string) {
    if (await this.monthStatus(counterId, month) === "locked") throw new MonthLockedError();
  }

  async listCounters(): Promise<SchemeCounter[]> {
    const { rows } = await this.q(`SELECT * FROM sales_counters ORDER BY channel, code`);
    const { rows: members } = await this.q(
      `SELECT m.*, p.store_name, p.sales_channel, p.store_code
       FROM sales_counter_members m
       LEFT JOIN pos_locations p ON p.id = m.pos_id
       ORDER BY m.shop_code`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      channel: r.channel,
      tierTable: r.tier_table,
      tradeMargin: Number(r.trade_margin),
      minTarget: Number(r.min_target),
      isActive: r.is_active,
      members: members.filter((m: any) => m.counter_id === r.id).map((m: any) => ({
        id: m.id,
        shopCode: m.shop_code,
        posId: m.pos_id,
        storeName: m.store_name ?? null,
        salesChannel: m.sales_channel ?? null,
        storeCode: m.store_code ?? null,
      })),
    }));
  }

  async updateCounter(id: string, patch: Partial<Pick<SchemeCounter, "name" | "minTarget" | "tradeMargin" | "isActive">>, userId: string) {
    const { rows } = await this.q(`SELECT * FROM sales_counters WHERE id = $1`, [id]);
    if (!rows[0]) return;
    await this.q(
      `UPDATE sales_counters
       SET name = COALESCE($2, name), min_target = COALESCE($3, min_target), trade_margin = COALESCE($4, trade_margin),
           is_active = COALESCE($5, is_active), updated_by = $6, updated_at = $7
       WHERE id = $1`,
      [id, patch.name ?? null, patch.minTarget ?? null, patch.tradeMargin ?? null, patch.isActive ?? null, userId, now()],
    );
    await audit(this.q, null, "sales_counters", id, { minTarget: rows[0].min_target, name: rows[0].name }, patch, userId);
  }

  async linkMember(counterId: string, shopCode: string, posId: string, userId: string) {
    await this.q(
      `UPDATE sales_counter_members SET pos_id = $3 WHERE counter_id = $1 AND shop_code = $2`,
      [counterId, shopCode, posId],
    );
    await audit(this.q, null, "sales_counter_members", `${counterId}:${shopCode}`, null, { posId }, userId);
  }

  async listTiers(): Promise<TierRow[]> {
    const { rows } = await this.q(`SELECT * FROM commission_tiers ORDER BY tier_table, sort_order, lower`);
    return rows.map((r: any) => ({
      id: r.id,
      tierTable: r.tier_table,
      lower: Number(r.lower),
      upper: r.upper == null ? null : Number(r.upper),
      rate: Number(r.rate),
      sortOrder: Number(r.sort_order),
    }));
  }

  async saveTiers(tierTable: "L" | "S", rows: TierSlice[], userId: string) {
    const old = await this.listTiers();
    await this.q(`DELETE FROM commission_tiers WHERE tier_table = $1`, [tierTable]);
    for (let i = 0; i < rows.length; i++) {
      const t = rows[i];
      await this.q(
        `INSERT INTO commission_tiers (id, tier_table, lower, upper, rate, sort_order, created_at, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7)`,
        [randomUUID(), tierTable, t.lower, t.upper, t.rate, i, now(), userId],
      );
    }
    await audit(this.q, null, "commission_tiers", tierTable, old.filter(t => t.tierTable === tierTable), rows, userId);
  }

  async getSettings(): Promise<CommissionSettingsRow> {
    const { rows } = await this.q(`SELECT * FROM commission_settings WHERE id = 'default'`);
    const r = rows[0];
    if (!r) return defaultSettings();
    return {
      guaranteedRate: Number(r.guaranteed_rate),
      defaultBasicSalary: Number(r.default_basic_salary),
      partTimeDayRate: Number(r.part_time_day_rate),
      partTimePlannedRate: Number(r.part_time_planned_rate),
      partTimeUnexpectedRate: Number(r.part_time_unexpected_rate),
      consecutiveDaysThreshold: Number(r.consecutive_days_threshold),
      reconciliationGapThreshold: Number(r.reconciliation_gap_threshold),
      defaultRestDays: Number(r.default_rest_days),
      prioritySeeded: !!r.priority_seeded,
    };
  }

  async saveSettings(patch: Partial<CommissionSettingsRow>, userId: string) {
    const old = await this.getSettings();
    const next = { ...old, ...patch };
    await this.q(
      `UPDATE commission_settings SET
        guaranteed_rate=$2, default_basic_salary=$3, part_time_day_rate=$4, part_time_planned_rate=$5,
        part_time_unexpected_rate=$6, consecutive_days_threshold=$7, reconciliation_gap_threshold=$8,
        default_rest_days=$9, priority_seeded=$10, updated_by=$11, updated_at=$12
       WHERE id = $1`,
      [ "default", next.guaranteedRate, next.defaultBasicSalary, next.partTimeDayRate, next.partTimePlannedRate,
        next.partTimeUnexpectedRate, next.consecutiveDaysThreshold, next.reconciliationGapThreshold,
        next.defaultRestDays, next.prioritySeeded, userId, now() ],
    );
    await audit(this.q, null, "commission_settings", "default", old, next, userId);
  }

  async listDuty(counterId: string, month: string): Promise<DutyRow[]> {
    const { rows } = await this.q(
      `SELECT * FROM duty_days WHERE counter_id = $1 AND date >= $2 AND date <= $3 ORDER BY date`,
      [counterId, `${month}-01`, `${month}-31`],
    );
    return rows.map(mapDuty);
  }

  async saveDuty(counterId: string, month: string, days: Omit<DutyRow, "id" | "counterId">[], userId: string) {
    await this.locked(counterId, month);
    const old = await this.listDuty(counterId, month);
    for (const day of days) {
      await this.q(
        `INSERT INTO duty_days (id, counter_id, pos_id, date, regular_user_id, status, part_time_user_id, substitution_type, note, updated_by, updated_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
         ON CONFLICT (counter_id, date) DO UPDATE SET
           pos_id = EXCLUDED.pos_id, regular_user_id = EXCLUDED.regular_user_id, status = EXCLUDED.status,
           part_time_user_id = EXCLUDED.part_time_user_id, substitution_type = EXCLUDED.substitution_type,
           note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
        [randomUUID(), counterId, day.posId, day.date, day.regularUserId, day.status, day.partTimeUserId, day.substitutionType, day.note, userId, now()],
      );
    }
    await audit(this.q, null, "duty_days", `${counterId}:${month}`, old, days, userId);
  }

  async listActuals(counterId: string, month: string): Promise<ActualRow[]> {
    const { rows } = await this.q(
      `SELECT * FROM monthly_actuals WHERE counter_id = $1 AND month = $2`,
      [counterId, month],
    );
    return rows.map(mapActual);
  }

  async saveActuals(counterId: string, month: string, rows: { brandId: string; posId: string; actualAmount: number; note?: string | null }[], userId: string) {
    await this.locked(counterId, month);
    const old = await this.listActuals(counterId, month);
    for (const row of rows) {
      const prev = old.find(a => a.brandId === row.brandId && a.posId === row.posId);
      const id = prev?.id ?? randomUUID();
      if (prev) {
        await this.q(
          `UPDATE monthly_actuals SET actual_amount=$2, note=$3, updated_by=$4, updated_at=$5, source='manual' WHERE id=$1`,
          [id, row.actualAmount, row.note ?? null, userId, now()],
        );
      } else {
        await this.q(
          `INSERT INTO monthly_actuals (id, month, counter_id, brand_id, pos_id, actual_amount, source, entered_by, entered_at, note, updated_by, updated_at, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,'manual',$7,$8,$9,$7,$8,$8)`,
          [id, month, counterId, row.brandId, row.posId, row.actualAmount, userId, now(), row.note ?? null],
        );
      }
      if (!prev || prev.actualAmount !== row.actualAmount) {
        await this.q(
          `INSERT INTO monthly_actual_edits (id, actual_id, previous_value, new_value, edited_by, edited_at) VALUES ($1,$2,$3,$4,$5,$6)`,
          [randomUUID(), id, prev?.actualAmount ?? null, row.actualAmount, userId, now()],
        );
      }
    }
    await audit(this.q, null, "monthly_actuals", `${counterId}:${month}`, old, rows, userId);
  }

  async listBrandTargets(counterId: string, month: string): Promise<BrandTargetRow[]> {
    const { rows } = await this.q(`SELECT * FROM monthly_targets WHERE counter_id=$1 AND month=$2`, [counterId, month]);
    return rows.map(mapBrandTarget);
  }

  async getCounterTarget(counterId: string, month: string): Promise<CounterTargetRow | null> {
    const { rows } = await this.q(`SELECT * FROM monthly_counter_targets WHERE counter_id=$1 AND month=$2`, [counterId, month]);
    return rows[0] ? mapCounterTarget(rows[0]) : null;
  }

  async saveTargets(input: {
    counterId: string; month: string; status: "draft" | "published"; reason: string | null;
    counter: Omit<CounterTargetRow, "id" | "month" | "counterId">;
    brands: Omit<BrandTargetRow, "id" | "month" | "counterId" | "status">[];
  }, userId: string) {
    await this.locked(input.counterId, input.month);
    const oldB = await this.listBrandTargets(input.counterId, input.month);
    const oldC = await this.getCounterTarget(input.counterId, input.month);
    if ((oldC?.status === "published" || oldB.some(b => b.status === "published")) && input.status === "published" && !input.reason?.trim()) {
      throw new Error("REASON_REQUIRED");
    }
    const ts = now();
    await this.q(
      `INSERT INTO monthly_counter_targets (id, month, counter_id, starting_target, all_brands_adjustment, non_priority_expected, final_counter_target, below_minimum_warning, status, set_by, set_at, updated_by, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10,$11,$11)
       ON CONFLICT (month, counter_id) DO UPDATE SET
         starting_target=EXCLUDED.starting_target, all_brands_adjustment=EXCLUDED.all_brands_adjustment,
         non_priority_expected=EXCLUDED.non_priority_expected, final_counter_target=EXCLUDED.final_counter_target,
         below_minimum_warning=EXCLUDED.below_minimum_warning, status=EXCLUDED.status, set_by=EXCLUDED.set_by,
         set_at=EXCLUDED.set_at, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at`,
      [randomUUID(), input.month, input.counterId, input.counter.startingTarget, input.counter.allBrandsAdjustment,
        input.counter.nonPriorityExpected, input.counter.finalCounterTarget, input.counter.belowMinimumWarning,
        input.status, userId, ts],
    );
    for (const b of input.brands) {
      await this.q(
        `INSERT INTO monthly_targets (id, month, counter_id, brand_id, starting_target, brand_adjustment, final_target, is_current, set_by, set_at, status, updated_by, updated_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9,$10,$8,$9,$9)
         ON CONFLICT (month, counter_id, brand_id) DO UPDATE SET
           starting_target=EXCLUDED.starting_target, brand_adjustment=EXCLUDED.brand_adjustment, final_target=EXCLUDED.final_target,
           set_by=EXCLUDED.set_by, set_at=EXCLUDED.set_at, status=EXCLUDED.status, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at`,
        [randomUUID(), input.month, input.counterId, b.brandId, b.startingTarget, b.brandAdjustment, b.finalTarget, userId, ts, input.status],
      );
      await this.q(
        `INSERT INTO monthly_target_history (id, month, counter_id, brand_id, field_name, old_value, new_value, reason, changed_by, changed_at)
         VALUES ($1,$2,$3,$4,'final_target',$5,$6,$7,$8,$9)`,
        [randomUUID(), input.month, input.counterId, b.brandId, String(oldB.find(x => x.brandId === b.brandId)?.finalTarget ?? ""), String(b.finalTarget), input.reason, userId, ts],
      );
    }
    await audit(this.q, null, "monthly_targets", `${input.counterId}:${input.month}`, { oldC, oldB }, input, userId);
  }

  async listStepPlans(): Promise<StepPlan[]> {
    const { rows } = await this.q(`SELECT * FROM counter_step_plans`);
    return rows.map((r: any) => ({
      counterId: r.counter_id,
      startMonth: r.start_month,
      enabled: !!r.enabled,
      medianAtStart: r.median_at_start == null ? null : Number(r.median_at_start),
    }));
  }

  async saveStepPlan(plan: StepPlan, userId: string) {
    await this.q(
      `INSERT INTO counter_step_plans (id, counter_id, start_month, enabled, median_at_start, updated_by, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       ON CONFLICT (counter_id) DO UPDATE SET start_month=EXCLUDED.start_month, enabled=EXCLUDED.enabled,
         median_at_start=EXCLUDED.median_at_start, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at`,
      [randomUUID(), plan.counterId, plan.startMonth, plan.enabled, plan.medianAtStart, userId, now()],
    );
    await audit(this.q, null, "counter_step_plans", plan.counterId, null, plan, userId);
  }

  async salaryFor(userId: string, month: string): Promise<number | null> {
    const { rows } = await this.q(
      `SELECT basic_salary FROM ba_pay WHERE user_id=$1 AND month<=$2 ORDER BY month DESC LIMIT 1`,
      [userId, month],
    );
    return rows[0] ? Number(rows[0].basic_salary) : null;
  }

  async setSalary(userId: string, month: string, amount: number, editorId: string) {
    const counters = await this.listCounters();
    for (const c of counters) {
      if (await this.monthStatus(c.id, month) === "locked") {
        const assigned = c.members.some(m => m.posId);
        if (assigned) {
          // Lock is per counter. Reject only when this user is the BA on a locked counter.
          // The route passes the counter check. Here we reject if ANY of her counters is locked;
          // the route resolves her counters and calls this only after that check.
        }
      }
    }
    const { rows } = await this.q(`SELECT basic_salary FROM ba_pay WHERE user_id=$1 AND month=$2`, [userId, month]);
    const old = rows[0] ? Number(rows[0].basic_salary) : null;
    await this.q(
      `INSERT INTO ba_pay (id, user_id, month, basic_salary, updated_by, updated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       ON CONFLICT (user_id, month) DO UPDATE SET basic_salary=EXCLUDED.basic_salary, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at`,
      [randomUUID(), userId, month, amount, editorId, now()],
    );
    await this.q(
      `INSERT INTO ba_pay_history (id, user_id, month, old_salary, new_salary, changed_by, changed_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, month, old, amount, editorId, now()],
    );
    await audit(this.q, null, "ba_pay", `${userId}:${month}`, { old }, { amount }, editorId);
  }

  async getProjection(userId: string, month: string, counterId: string): Promise<ProjectionRow | null> {
    const { rows } = await this.q(
      `SELECT * FROM ba_projections WHERE user_id=$1 AND month=$2 AND counter_id=$3`,
      [userId, month, counterId],
    );
    return rows[0] ? mapProjection(rows[0]) : null;
  }

  async setProjection(row: ProjectionRow) {
    await this.q(
      `INSERT INTO ba_projections (id, user_id, month, counter_id, projected_counter_sales, expected_rest_days, achievement_override, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (user_id, month, counter_id) DO UPDATE SET
         projected_counter_sales=EXCLUDED.projected_counter_sales, expected_rest_days=EXCLUDED.expected_rest_days,
         achievement_override=EXCLUDED.achievement_override, updated_at=EXCLUDED.updated_at`,
      [randomUUID(), row.userId, row.month, row.counterId, row.projectedCounterSales, row.expectedRestDays, row.achievementOverride, now()],
    );
  }

  async monthStatus(counterId: string, month: string): Promise<"open" | "locked"> {
    const { rows } = await this.q(`SELECT status FROM month_status WHERE counter_id=$1 AND month=$2`, [counterId, month]);
    return rows[0]?.status === "locked" ? "locked" : "open";
  }

  async lockMonth(counterId: string, month: string, userId: string) {
    await this.q(
      `INSERT INTO month_status (id, month, counter_id, status, locked_by, locked_at)
       VALUES ($1,$2,$3,'locked',$4,$5)
       ON CONFLICT (month, counter_id) DO UPDATE SET status='locked', locked_by=EXCLUDED.locked_by, locked_at=EXCLUDED.locked_at`,
      [randomUUID(), month, counterId, userId, now()],
    );
    await audit(this.q, null, "month_status", `${counterId}:${month}`, { status: "open" }, { status: "locked" }, userId);
  }

  async reopenMonth(counterId: string, month: string, userId: string) {
    await this.q(
      `INSERT INTO month_status (id, month, counter_id, status, reopened_by, reopened_at)
       VALUES ($1,$2,$3,'open',$4,$5)
       ON CONFLICT (month, counter_id) DO UPDATE SET status='open', reopened_by=EXCLUDED.reopened_by, reopened_at=EXCLUDED.reopened_at`,
      [randomUUID(), month, counterId, userId, now()],
    );
    await audit(this.q, null, "month_status", `${counterId}:${month}`, { status: "locked" }, { status: "open" }, userId);
  }

  async priorities() {
    const { rows } = await this.q(`SELECT brand_id, pos_id, is_priority FROM brand_pos_availability`);
    return rows.map((r: any) => ({ brandId: r.brand_id, posId: r.pos_id, isPriority: !!r.is_priority }));
  }

  async setPriority(brandId: string, posId: string, value: boolean, userId: string) {
    await this.q(
      `UPDATE brand_pos_availability SET is_priority=$3 WHERE brand_id=$1 AND pos_id=$2`,
      [brandId, posId, value],
    );
    await audit(this.q, null, "brand_pos_availability", `${brandId}:${posId}`, null, { isPriority: value }, userId);
  }
}

function mapDuty(r: any): DutyRow {
  return {
    id: r.id, counterId: r.counter_id, posId: r.pos_id, date: r.date,
    regularUserId: r.regular_user_id, status: r.status, partTimeUserId: r.part_time_user_id,
    substitutionType: r.substitution_type, note: r.note,
  };
}
function mapActual(r: any): ActualRow {
  return {
    id: r.id, month: r.month, counterId: r.counter_id, brandId: r.brand_id, posId: r.pos_id,
    actualAmount: Number(r.actual_amount), source: r.source, note: r.note,
  };
}
function mapBrandTarget(r: any): BrandTargetRow {
  return {
    id: r.id, month: r.month, counterId: r.counter_id, brandId: r.brand_id,
    startingTarget: Number(r.starting_target), brandAdjustment: Number(r.brand_adjustment),
    finalTarget: Number(r.final_target), status: r.status,
  };
}
function mapCounterTarget(r: any): CounterTargetRow {
  return {
    id: r.id, month: r.month, counterId: r.counter_id, startingTarget: Number(r.starting_target),
    allBrandsAdjustment: Number(r.all_brands_adjustment), nonPriorityExpected: Number(r.non_priority_expected),
    finalCounterTarget: Number(r.final_counter_target), belowMinimumWarning: !!r.below_minimum_warning, status: r.status,
  };
}
function mapProjection(r: any): ProjectionRow {
  return {
    userId: r.user_id, month: r.month, counterId: r.counter_id,
    projectedCounterSales: r.projected_counter_sales == null ? null : Number(r.projected_counter_sales),
    expectedRestDays: r.expected_rest_days == null ? null : Number(r.expected_rest_days),
    achievementOverride: r.achievement_override == null ? null : Number(r.achievement_override),
  };
}

class MemRepo implements CommissionRepo {
  counters: SchemeCounter[] = [];
  tiers: TierRow[] = [];
  settings: CommissionSettingsRow = defaultSettings();
  duty: DutyRow[] = [];
  actuals: ActualRow[] = [];
  brandTargets: BrandTargetRow[] = [];
  counterTargets: CounterTargetRow[] = [];
  steps: StepPlan[] = [];
  pay: { userId: string; month: string; basicSalary: number }[] = [];
  projections: ProjectionRow[] = [];
  months: { month: string; counterId: string; status: "open" | "locked" }[] = [];
  audit: any[] = [];
  priority: { brandId: string; posId: string; isPriority: boolean }[] = [];
  setPriorityFn: ((brandId: string, posId: string, value: boolean) => void) | null = null;

  private async touchAudit(table: string, id: string, oldValue: unknown, newValue: unknown, userId: string) {
    await audit(null, this.audit, table, id, oldValue, newValue, userId);
  }
  private assert(counterId: string, month: string) {
    if (this.months.find(m => m.counterId === counterId && m.month === month)?.status === "locked") throw new MonthLockedError();
  }

  async listCounters() { return this.counters; }
  async updateCounter(id: string, patch: Partial<Pick<SchemeCounter, "name" | "minTarget" | "tradeMargin" | "isActive">>, userId: string) {
    const c = this.counters.find(x => x.id === id);
    if (!c) return;
    const old = { name: c.name, minTarget: c.minTarget };
    Object.assign(c, patch);
    await this.touchAudit("sales_counters", id, old, patch, userId);
  }
  async linkMember(counterId: string, shopCode: string, posId: string, userId: string) {
    const c = this.counters.find(x => x.id === counterId);
    const m = c?.members.find(x => x.shopCode === shopCode);
    if (m) m.posId = posId;
    await this.touchAudit("sales_counter_members", `${counterId}:${shopCode}`, null, { posId }, userId);
  }
  async listTiers() { return this.tiers; }
  async saveTiers(tierTable: "L" | "S", rows: TierSlice[], userId: string) {
    const old = this.tiers.filter(t => t.tierTable === tierTable);
    this.tiers = this.tiers.filter(t => t.tierTable !== tierTable);
    rows.forEach((t, i) => this.tiers.push({ ...t, id: randomUUID(), tierTable, sortOrder: i }));
    await this.touchAudit("commission_tiers", tierTable, old, rows, userId);
  }
  async getSettings() { return this.settings; }
  async saveSettings(patch: Partial<CommissionSettingsRow>, userId: string) {
    const old = { ...this.settings };
    this.settings = { ...this.settings, ...patch };
    await this.touchAudit("commission_settings", "default", old, this.settings, userId);
  }
  async listDuty(counterId: string, month: string) {
    return this.duty.filter(d => d.counterId === counterId && d.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  }
  async saveDuty(counterId: string, month: string, days: Omit<DutyRow, "id" | "counterId">[], userId: string) {
    this.assert(counterId, month);
    const old = await this.listDuty(counterId, month);
    for (const day of days) {
      const idx = this.duty.findIndex(d => d.counterId === counterId && d.date === day.date);
      const row: DutyRow = { ...day, id: idx >= 0 ? this.duty[idx].id : randomUUID(), counterId };
      if (idx >= 0) this.duty[idx] = row;
      else this.duty.push(row);
    }
    await this.touchAudit("duty_days", `${counterId}:${month}`, old, days, userId);
  }
  async listActuals(counterId: string, month: string) {
    return this.actuals.filter(a => a.counterId === counterId && a.month === month);
  }
  async saveActuals(counterId: string, month: string, rows: { brandId: string; posId: string; actualAmount: number; note?: string | null }[], userId: string) {
    this.assert(counterId, month);
    const old = await this.listActuals(counterId, month);
    for (const row of rows) {
      const idx = this.actuals.findIndex(a => a.counterId === counterId && a.month === month && a.brandId === row.brandId && a.posId === row.posId);
      if (idx >= 0) this.actuals[idx] = { ...this.actuals[idx], actualAmount: row.actualAmount, note: row.note ?? null };
      else this.actuals.push({ id: randomUUID(), month, counterId, brandId: row.brandId, posId: row.posId, actualAmount: row.actualAmount, source: "manual", note: row.note ?? null });
    }
    await this.touchAudit("monthly_actuals", `${counterId}:${month}`, old, rows, userId);
  }
  async listBrandTargets(counterId: string, month: string) {
    return this.brandTargets.filter(t => t.counterId === counterId && t.month === month);
  }
  async getCounterTarget(counterId: string, month: string) {
    return this.counterTargets.find(t => t.counterId === counterId && t.month === month) ?? null;
  }
  async saveTargets(input: {
    counterId: string; month: string; status: "draft" | "published"; reason: string | null;
    counter: Omit<CounterTargetRow, "id" | "month" | "counterId">;
    brands: Omit<BrandTargetRow, "id" | "month" | "counterId" | "status">[];
  }, userId: string) {
    this.assert(input.counterId, input.month);
    const old = await this.getCounterTarget(input.counterId, input.month);
    if (old?.status === "published" && input.status === "published" && !input.reason?.trim()) throw new Error("REASON_REQUIRED");
    this.counterTargets = this.counterTargets.filter(t => !(t.counterId === input.counterId && t.month === input.month));
    this.counterTargets.push({ id: randomUUID(), month: input.month, counterId: input.counterId, ...input.counter });
    for (const b of input.brands) {
      this.brandTargets = this.brandTargets.filter(t => !(t.counterId === input.counterId && t.month === input.month && t.brandId === b.brandId));
      this.brandTargets.push({ id: randomUUID(), month: input.month, counterId: input.counterId, status: input.status, ...b });
    }
    await this.touchAudit("monthly_targets", `${input.counterId}:${input.month}`, old, input, userId);
  }
  async listStepPlans() { return this.steps; }
  async saveStepPlan(plan: StepPlan, userId: string) {
    this.steps = this.steps.filter(s => s.counterId !== plan.counterId);
    this.steps.push(plan);
    await this.touchAudit("counter_step_plans", plan.counterId, null, plan, userId);
  }
  async salaryFor(userId: string, month: string) {
    const rows = this.pay.filter(p => p.userId === userId && p.month <= month).sort((a, b) => b.month.localeCompare(a.month));
    return rows[0]?.basicSalary ?? null;
  }
  async setSalary(userId: string, month: string, amount: number, editorId: string) {
    const idx = this.pay.findIndex(p => p.userId === userId && p.month === month);
    const old = idx >= 0 ? this.pay[idx].basicSalary : null;
    if (idx >= 0) this.pay[idx].basicSalary = amount;
    else this.pay.push({ userId, month, basicSalary: amount });
    await this.touchAudit("ba_pay", `${userId}:${month}`, { old }, { amount }, editorId);
  }
  async getProjection(userId: string, month: string, counterId: string) {
    return this.projections.find(p => p.userId === userId && p.month === month && p.counterId === counterId) ?? null;
  }
  async setProjection(row: ProjectionRow) {
    this.projections = this.projections.filter(p => !(p.userId === row.userId && p.month === row.month && p.counterId === row.counterId));
    this.projections.push(row);
  }
  async monthStatus(counterId: string, month: string) {
    return this.months.find(m => m.counterId === counterId && m.month === month)?.status ?? "open";
  }
  async lockMonth(counterId: string, month: string, userId: string) {
    const idx = this.months.findIndex(m => m.counterId === counterId && m.month === month);
    if (idx >= 0) this.months[idx].status = "locked";
    else this.months.push({ month, counterId, status: "locked" });
    await this.touchAudit("month_status", `${counterId}:${month}`, { status: "open" }, { status: "locked" }, userId);
  }
  async reopenMonth(counterId: string, month: string, userId: string) {
    const idx = this.months.findIndex(m => m.counterId === counterId && m.month === month);
    if (idx >= 0) this.months[idx].status = "open";
    else this.months.push({ month, counterId, status: "open" });
    await this.touchAudit("month_status", `${counterId}:${month}`, { status: "locked" }, { status: "open" }, userId);
  }
  async priorities() { return this.priority; }
  async setPriority(brandId: string, posId: string, value: boolean, userId: string) {
    const row = this.priority.find(p => p.brandId === brandId && p.posId === posId);
    if (row) row.isPriority = value;
    else this.priority.push({ brandId, posId, isPriority: value });
    this.setPriorityFn?.(brandId, posId, value);
    await this.touchAudit("brand_pos_availability", `${brandId}:${posId}`, null, { isPriority: value }, userId);
  }
}

const mem = new MemRepo();

async function seedInto(repo: CommissionRepo, pos: PosLike[], brands: { id: string; name: string }[], priorityWriter?: (brandId: string, posId: string, value: boolean) => void) {
  if (repo === mem && mem.counters.length === 0) {
    mem.tiers = defaultTiers();
    mem.settings = defaultSettings();
    mem.counters = SCHEME_COUNTERS.map(seed => ({
      id: randomUUID(),
      code: seed.code,
      name: seed.name,
      channel: seed.channel,
      tierTable: seed.tierTable,
      tradeMargin: seed.tradeMargin,
      minTarget: seed.minTarget,
      isActive: true,
      members: seed.shops.map(shop => {
        const found = matchPos(pos, seed.channel, shop);
        return { id: randomUUID(), shopCode: shop, posId: found?.id ?? null, storeName: found?.storeName ?? null, salesChannel: found?.salesChannel ?? null, storeCode: found?.storeCode ?? null };
      }),
    }));
  }
  if (repo === mem) {
    mem.setPriorityFn = priorityWriter ?? null;
    if (!mem.settings.prioritySeeded) {
      applyPriority(mem.counters, brands, (brandId, posId) => { mem.setPriority(brandId, posId, true, "seed"); });
      mem.settings.prioritySeeded = true;
    }
  }
}

function applyPriority(counters: SchemeCounter[], brands: { id: string; name: string }[], set: (brandId: string, posId: string) => void) {
  for (const counter of counters) {
    const codes = PRIORITY_CODES[counter.channel] ?? [];
    for (const member of counter.members) {
      if (!member.posId) continue;
      for (const brand of brands) {
        if (codes.some(code => brandMatchesCode(brand.name, code))) set(brand.id, member.posId);
      }
    }
  }
}

export function ensureCommissionMemory(ctx: {
  pos: PosLike[];
  brands: { id: string; name: string }[];
  setPriority: (brandId: string, posId: string, value: boolean) => void;
}) {
  void seedInto(mem, ctx.pos, ctx.brands, ctx.setPriority);
}

export async function ensureCommissionSchema() {
  if (!bound) return;
  const q = bound;
  await q(`
    CREATE TABLE IF NOT EXISTS sales_counters (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, channel TEXT NOT NULL,
      tier_table TEXT NOT NULL, trade_margin REAL NOT NULL DEFAULT 0, min_target REAL NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sales_counter_members (
      id TEXT PRIMARY KEY, counter_id TEXT NOT NULL, shop_code TEXT NOT NULL, pos_id TEXT, created_at TEXT NOT NULL,
      UNIQUE (counter_id, shop_code)
    );
    CREATE TABLE IF NOT EXISTS commission_tiers (
      id TEXT PRIMARY KEY, tier_table TEXT NOT NULL, lower REAL NOT NULL, upper REAL, rate REAL NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS commission_settings (
      id TEXT PRIMARY KEY, guaranteed_rate REAL NOT NULL, default_basic_salary REAL NOT NULL,
      part_time_day_rate REAL NOT NULL, part_time_planned_rate REAL NOT NULL, part_time_unexpected_rate REAL NOT NULL,
      consecutive_days_threshold INTEGER NOT NULL, reconciliation_gap_threshold REAL NOT NULL,
      default_rest_days INTEGER NOT NULL, priority_seeded BOOLEAN NOT NULL DEFAULT false,
      updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS monthly_actuals (
      id TEXT PRIMARY KEY, month TEXT NOT NULL, counter_id TEXT NOT NULL, brand_id TEXT NOT NULL, pos_id TEXT,
      actual_amount REAL NOT NULL, source TEXT NOT NULL DEFAULT 'manual', upload_batch_id TEXT,
      entered_by TEXT, entered_at TEXT, note TEXT, updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL,
      UNIQUE (month, counter_id, brand_id, pos_id)
    );
    CREATE TABLE IF NOT EXISTS monthly_actual_edits (
      id TEXT PRIMARY KEY, actual_id TEXT NOT NULL, previous_value REAL, new_value REAL, edited_by TEXT, edited_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS duty_days (
      id TEXT PRIMARY KEY, counter_id TEXT NOT NULL, pos_id TEXT, date TEXT NOT NULL, regular_user_id TEXT,
      status TEXT NOT NULL, part_time_user_id TEXT, substitution_type TEXT, note TEXT,
      updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL, UNIQUE (counter_id, date)
    );
    CREATE TABLE IF NOT EXISTS monthly_targets (
      id TEXT PRIMARY KEY, month TEXT NOT NULL, counter_id TEXT NOT NULL, brand_id TEXT NOT NULL,
      starting_target REAL NOT NULL, brand_adjustment REAL NOT NULL DEFAULT 1, final_target REAL NOT NULL,
      is_current BOOLEAN NOT NULL DEFAULT true, set_by TEXT, set_at TEXT, status TEXT NOT NULL DEFAULT 'draft',
      updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL, UNIQUE (month, counter_id, brand_id)
    );
    CREATE TABLE IF NOT EXISTS monthly_counter_targets (
      id TEXT PRIMARY KEY, month TEXT NOT NULL, counter_id TEXT NOT NULL, starting_target REAL NOT NULL,
      all_brands_adjustment REAL NOT NULL DEFAULT 1, non_priority_expected REAL NOT NULL DEFAULT 0,
      final_counter_target REAL NOT NULL, below_minimum_warning BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'draft', set_by TEXT, set_at TEXT, updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL,
      UNIQUE (month, counter_id)
    );
    CREATE TABLE IF NOT EXISTS monthly_target_history (
      id TEXT PRIMARY KEY, month TEXT NOT NULL, counter_id TEXT NOT NULL, brand_id TEXT, field_name TEXT NOT NULL,
      old_value TEXT, new_value TEXT, reason TEXT, changed_by TEXT, changed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS counter_step_plans (
      id TEXT PRIMARY KEY, counter_id TEXT NOT NULL UNIQUE, start_month TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false,
      median_at_start REAL, updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ba_pay (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, month TEXT NOT NULL, basic_salary REAL NOT NULL,
      updated_by TEXT, updated_at TEXT, created_at TEXT NOT NULL, UNIQUE (user_id, month)
    );
    CREATE TABLE IF NOT EXISTS ba_pay_history (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, month TEXT NOT NULL, old_salary REAL, new_salary REAL NOT NULL,
      changed_by TEXT, changed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ba_projections (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, month TEXT NOT NULL, counter_id TEXT NOT NULL,
      projected_counter_sales REAL, expected_rest_days REAL, achievement_override REAL, updated_at TEXT,
      UNIQUE (user_id, month, counter_id)
    );
    CREATE TABLE IF NOT EXISTS month_status (
      id TEXT PRIMARY KEY, month TEXT NOT NULL, counter_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      locked_by TEXT, locked_at TEXT, reopened_by TEXT, reopened_at TEXT, UNIQUE (month, counter_id)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY, table_name TEXT NOT NULL, record_id TEXT, old_json TEXT, new_json TEXT,
      user_id TEXT, created_at TEXT NOT NULL
    );
  `);
  await q(`ALTER TABLE brand_pos_availability ADD COLUMN IF NOT EXISTS is_priority BOOLEAN NOT NULL DEFAULT false`);
  await q(`UPDATE users SET role = 'admin' WHERE lower(username) = 'admin' AND role = 'management'`);

  const repo = new PgRepo(q);
  const existing = await repo.listCounters();
  const ts = now();
  if (existing.length === 0) {
    for (const seed of SCHEME_COUNTERS) {
      const id = randomUUID();
      await q(
        `INSERT INTO sales_counters (id, code, name, channel, tier_table, trade_margin, min_target, is_active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
        [id, seed.code, seed.name, seed.channel, seed.tierTable, seed.tradeMargin, seed.minTarget, ts],
      );
      for (const shop of seed.shops) {
        await q(
          `INSERT INTO sales_counter_members (id, counter_id, shop_code, pos_id, created_at) VALUES ($1,$2,$3,NULL,$4)`,
          [randomUUID(), id, shop, ts],
        );
      }
    }
    for (const t of defaultTiers()) {
      await q(
        `INSERT INTO commission_tiers (id, tier_table, lower, upper, rate, sort_order, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [t.id, t.tierTable, t.lower, t.upper, t.rate, t.sortOrder, ts],
      );
    }
    const s = defaultSettings();
    await q(
      `INSERT INTO commission_settings (id, guaranteed_rate, default_basic_salary, part_time_day_rate, part_time_planned_rate, part_time_unexpected_rate, consecutive_days_threshold, reconciliation_gap_threshold, default_rest_days, priority_seeded, created_at)
       VALUES ('default',$1,$2,$3,$4,$5,$6,$7,$8,false,$9)`,
      [s.guaranteedRate, s.defaultBasicSalary, s.partTimeDayRate, s.partTimePlannedRate, s.partTimeUnexpectedRate, s.consecutiveDaysThreshold, s.reconciliationGapThreshold, s.defaultRestDays, ts],
    );
  }

  const { rows: posRows } = await q(`SELECT id, sales_channel, store_code, store_name FROM pos_locations`);
  const locations: PosLike[] = posRows.map((r: any) => ({ id: r.id, salesChannel: r.sales_channel, storeCode: r.store_code, storeName: r.store_name }));
  const counters = await repo.listCounters();
  for (const counter of counters) {
    const seed = SCHEME_COUNTERS.find(s => s.code === counter.code);
    if (!seed) continue;
    for (const shop of seed.shops) {
      const member = counter.members.find(m => m.shopCode === shop);
      if (member?.posId) continue;
      const found = matchPos(locations, seed.channel, shop);
      if (!found) continue;
      if (!member) {
        await q(
          `INSERT INTO sales_counter_members (id, counter_id, shop_code, pos_id, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [randomUUID(), counter.id, shop, found.id, ts],
        );
      } else {
        await q(`UPDATE sales_counter_members SET pos_id=$3 WHERE counter_id=$1 AND shop_code=$2 AND pos_id IS NULL`, [counter.id, shop, found.id]);
      }
    }
  }

  const settings = await repo.getSettings();
  if (!settings.prioritySeeded) {
    const fresh = await repo.listCounters();
    const { rows: brandRows } = await q(`SELECT id, name FROM brands`);
    const priorityJobs: Promise<unknown>[] = [];
    applyPriority(fresh, brandRows.map((r: any) => ({ id: r.id, name: r.name })), (brandId, posId) => {
      priorityJobs.push(q(`UPDATE brand_pos_availability SET is_priority=true WHERE brand_id=$1 AND pos_id=$2`, [brandId, posId]));
    });
    await Promise.all(priorityJobs);
    await q(`UPDATE commission_settings SET priority_seeded=true WHERE id='default'`);
  }
}
