# Build handoff: BA commission scheme in the Counter Sales Tracker

From: Alfred (for Gordon Cheng, Supergo). To: the Cursor agent that maintains the Counter Sales Tracker.
Date: 18 November 2026. All dates and times are Hong Kong time (UTC+8).
Read first: `BA-commission-scheme_spec_v16.md` (the rules), `App-info-reply_for-Alfred.md` and `schema-runtime.sql` (your own reply). This file does not repeat the tier tables or the leave table; it says what to build on top of your app and how. If this file and the spec disagree, stop and ask Gordon.

Go-live: December 2026 sales (the scheme starts 1 Dec 2026). Targets for December are set in late November.

## 0. Decisions from Gordon (final)

1. **Two sales figures.**
   - `sales_entries` (what the BA types each day) is **provisional**. BAs cannot reliably record sales made before they arrive, during lunch, or after they leave.
   - The **actual** monthly sales come from each sales channel's own monthly report (LOGON, SOGO, AEON), uploaded after month-end.
   - When an actual exists for a counter, brand and month, **the commission uses the actual**. Until then the commission uses provisional sales and every screen shows a "Provisional" label.
2. **Duty record.** A new page, for Sales Manager and Admin only, records who worked each day (regular BA, or part-timer covering) and the leave type. It also serves as the BA roster for month-end commission.
3. **Roles.** Today there are `ba`, `part_time`, `management`. Add `admin`, `sales_manager`, `brand_manager`. Details in section 2.
4. **Salary.** Basic salary default is 12,000. The BA may edit her own basic salary. Admin and Sales Manager can see salary and commission for all BAs. Brand Managers cannot.
5. **AEON.** The app must let the user combine sales from two shops by choosing the shops and a date range for each. The app does the combining and the calculation.
6. **Month lock.** Once a month is locked, nothing for that month can change except by Admin reopening it. Every change is logged.
7. **Product bonuses** (`incentive_*`) stay as they are. Leave them out of the commission and income screens for now.
8. **Brands and shops.** ATHE and GD11 exist in the app. The live shop list is up to date; do not reseed it. Counters in use: LOGON `HC, FW, LP, NTP, TS`; SOGO `CWB, KTK`; AEON `KH, SK`. Other shops (APM, FAW and so on) are not part of this scheme and get no targets.
9. **One BA, one counter.** Exception: the AEON BA, who works two shops. Part-timers rotate across counters.
10. **History for December targets.** Use August, September and October provisional sales from `sales_entries`. November actuals will not exist when December targets are finalised; targets are set on provisional data. Actual sales data is not in the app yet.

## 1. Design principles

- Do not change `sales_entries` or its unique key. Add new tables beside it, `CREATE TABLE IF NOT EXISTS` in `server/storage.ts`, with the model in `shared/schema.ts`.
- **One commission engine**, a pure TypeScript function in `shared/commission.ts`, used by both server and browser. No rounding inside; round only when displaying (HK$, whole dollars). Do not reuse the product-bonus code.
- **Add a test runner** (Vitest or similar, dev only) and implement the section 8 test table as automated tests for that function. The app has none today; this is the one exception to "no new tooling" because pay depends on it. Add `npm test`.
- All "month" boundaries and "today" use `Asia/Hong_Kong`, not UTC and not the browser clock. Dates stay `YYYY-MM-DD` text, months `YYYY-MM`.
- Server routes enforce access. Hiding a menu item is not enough. Pay and commission data must never come from `GET /api/users`, `GET /api/sales` or any management dashboard endpoint.
- Money in `REAL` is acceptable as in the existing app, but compute in JS numbers and do not round before the final display.

## 2. Roles and access

| Role | Who | Sees | Cannot see |
|---|---|---|---|
| `ba` | Regular BA | Own counter(s): sales, targets, own roster, own salary, commission, income. Can read part-timer sales (as today) | Other BAs' pay |
| `part_time` | Part-timer | Daily entry for assigned shops (may be several). Cannot view regular BA sales (as today) | All targets, pay, roster of others |
| `brand_manager` | Brand Managers | Sales and targets, target-setting screen | Salary, commission, counter profit, part-timer cost, roster pay fields |
| `sales_manager` | Sales Managers | Everything a Brand Manager sees, plus roster entry, plus salary and commission of all BAs and part-timer cost | Reopening a locked month |
| `admin` | Gordon | Everything, including reopening a locked month, audit log, settings | Nothing hidden |
| `management` (existing) | 13 current accounts | Unchanged for existing screens | **No access to any pay data and no new screens** until Gordon assigns them a new role |

Notes:
- Keep `management` working for existing screens so nothing breaks. Gordon's own account becomes `admin`. Gordon will assign the other 12 `management` users to `brand_manager` or `sales_manager` himself. Until then they see no pay data.
- Make the new roles a small shared helper (`isAdmin`, `canSeePay`, `canSetTargets`, `canEditRoster`). `canSeePay` = `admin` or `sales_manager`; also the BA for her own row.
- The BA/part-time visibility rule (BA can see part-timer sales, part-timer cannot see BA sales) applies to the new screens too. `GET /api/sales` currently returns every shop to any logged-in user. Please flag this in your plan; fixing it is a separate task unless it is a small change.
- Use the existing `user_pos_assignments` to decide which counters a BA or part-timer may touch.

## 3. New data

Names are suggestions; keep the app's own style. All new tables have `created_at`, and anything edited carries `updated_by` and `updated_at`.

### 3.1 Counters (a counter can have one or two shops)
- `sales_counters`: `id`, `code` (HC, FW, LP, NTP, TS, CWB, KTK, AEON), `name`, `channel` (LOGON, SOGO, AEON), `tier_table` (`L` or `S`), `trade_margin`, `min_target` (editable), `is_active`.
- `sales_counter_members`: `counter_id`, `pos_id`. HC to `LOG/HC` and so on; AEON has two members, `AEO/KH` and `AEO/SK`.
- Seed `min_target`: LOGON counters 83,086; CWB 57,031; KTK 40,216; AEON 75,429. Seed `tier_table`: LOGON and AEON `L`, SOGO `S`. These values must be editable in Settings by Admin.
- `commission_tiers`: `tier_table`, `lower`, `upper` (null for open-ended), `rate`. Seed from spec section 2 as continuous slices (lower, upper]. Editable by Admin only, with history.
- `commission_settings` (one row, editable by Admin): `guaranteed_rate` 2%, `default_basic_salary` 12,000, `part_time_day_rate` 480 (8 hours x HK$60), `part_time_planned_rate` 2.5%, `part_time_unexpected_rate` 3%, `consecutive_days_threshold` 4.
- Add `is_priority` (boolean) on `brand_pos_availability`. Priority brands per counter are in spec section 1. At AEON a brand is priority if it is priority at the counter level (AD, EM, LA, PH, NE, NOVE); apply to both KH and SK.

### 3.2 Actual sales
- `monthly_actuals`: `id`, `month`, `counter_id`, `brand_id`, `pos_id` (nullable; set for AEON to keep the store split), `actual_amount`, `source` (`upload` or `manual`), `upload_batch_id` (nullable), `entered_by`, `entered_at`, `note`.
- `monthly_actual_edits`: previous value, new value, who, when.
- **Upload scheme: not decided.** Gordon will decide how the channel reports are imported (file layouts differ by channel). For now build a manual grid entry (counter x brand for one month, AEON per store) and keep `source` and `upload_batch_id` so an importer can be added later. Do not guess the file format. Gordon will send sample channel files later.
- Reconciliation: a screen showing, per counter and month, provisional total (sum of `sales_entries.amount`), actual total, gap in HK$ and %. Flag when the gap is above a setting (default 5%, editable).

### 3.3 Duty record (roster)
- `duty_days`: `id`, `counter_id`, `pos_id` (the shop the BA works that day; matters for AEON), `date`, `regular_user_id`, `status`, `part_time_user_id` (nullable), `substitution_type` (`planned` or `unexpected`, nullable), `note`, `updated_by`, `updated_at`. Unique on (`counter_id`, `date`).
- `status` values: `WORKED`, `REST` (planned rest day), `IRREGULAR_REST`, `ANNUAL_LEAVE`, `SICK_LEAVE`, `MATERNITY_LEAVE`, `UNPAID_LEAVE`.
- Page (Sales Manager and Admin): month grid, one row per counter, one column per day. Default is `WORKED` for every day, so the manager only records exceptions. Selecting an exception asks for the part-timer and `planned` or `unexpected`. A bulk action "mark these dates" (for example 5 days of annual leave) saves typing. For AEON show two lines of days: KH and SK, so each day shows which shop she is in.
- The app, not the user, works out whether a leave run is 4 or more consecutive days (see section 4.2).

### 3.4 Targets
- `monthly_targets`: `id`, `month`, `counter_id`, `brand_id`, `starting_target`, `brand_adjustment`, `final_target`, `is_current`, `set_by`, `set_at`, `status` (`draft` or `published`).
- `monthly_counter_targets`: `month`, `counter_id`, `starting_target`, `all_brands_adjustment` (default 1.0), `non_priority_expected`, `final_counter_target`, `below_minimum_warning`.
- `monthly_target_history`: old and new values, who, when, reason (free text, required when changing a published target).
- BAs only see targets with `status = published`.

### 3.5 BA pay
- `ba_pay`: `user_id`, `month` (or an effective-from month), `basic_salary` (default from `commission_settings`), `updated_by`, `updated_at`.
- `ba_pay_history`: every change to salary, who, when. Gordon wants the BA to be able to edit **her own** basic salary. Allow it for her own row only and log every change (who, old, new, when). **Confirmed by Gordon: no Admin approval is needed**; the change takes effect at once. Admin and Sales Manager can still see the history.
- `ba_projections`: `user_id`, `month`, `counter_id`, `projected_counter_sales`, `expected_rest_days`, `updated_at`. This is the BA's own calculator input.
- Pay routes are separate (`/api/pay/...`), allowed only for `admin`, `sales_manager`, and the BA for her own data.

### 3.6 Month lock and audit
- `month_status`: `month`, `counter_id`, `status` (`open`, `locked`), `locked_by`, `locked_at`, `reopened_by`, `reopened_at`.
- Locked means no edits to actuals, duty record, targets and salary for that counter-month. Lock: Sales Manager or Admin. **Reopen: Admin only.** Every edit to actuals, targets, duty record and pay is written to an audit log (`audit_log`: table, record, old, new, user, time).

## 4. Calculation rules

All formulas, tier tables and leave shares are in the spec (sections 2 to 5). This section says how the app obtains the inputs.

### 4.1 Sales basis per counter-month
1. **Provisional day figures** `p(d)` = counter total from `sales_entries.amount` for day `d`, exactly as the BA entered it (AEON: sum over the two shops, by day). **Confirmed by Gordon: the amount a BA types is already after promo discounts**, the same basis as the channel's monthly figure. Your reply said the stored amount is gross; that is wrong for how the BAs enter it. **Do not subtract `promotion_deductions`** and do not use the app's "net sales" calculation (`allocateDeductions`) for anything in this scheme; that would take the discount off twice. Before building, check the daily entry screen labels and help text, and if they say or imply "before discount", tell Gordon so the wording can be fixed.
2. **Actual month total** `A` = sum of `monthly_actuals` for the counter, if present.
3. **Share factor** `f` = (sum over days of `p(d)` x regular BA share for that day) / (sum of `p(d)`). The regular share per day comes from the duty record and the spec section 3 table: 100% for `WORKED`; 50% or 40% for rest and annual leave; 50% or 0% for sick and maternity; 0% for unpaid leave.
4. **Counted sales** = `A x f` when an actual exists, otherwise sum of `p(d) x share(d)`. Show "Provisional" or "Actual" on every result.
5. If there is no duty record at all for the month, use the spec estimate: counted = counter sales x (1 - rest days/days x 50%), and flag the result "estimated, no duty record".
6. If there are no daily figures but there is an actual, use the spec estimate formula as in step 5.

Why `f` is applied to the actual: the actual is a monthly total without day detail. The daily sales tell us how the month was spread across rest days. This is the best method until the channels give daily actuals; if they do, replace `f` with an exact day-by-day calculation.

Brand achievement uses the whole counter's brand sales (including part-timer days). Use the actual brand amount when present, else the sum of provisional brand sales.

### 4.2 Consecutive-day rule (app derives it)
- A "run" is consecutive calendar days with the same leave group: (rest, irregular rest, annual leave) is one group; (sick, maternity) is another; unpaid leave has no bracket (always 0% for the regular BA, 50% for the part-timer).
- A run of 4 or more days uses the long-run shares (40/60; sick 0/50). Exactly 4 counts as "4 or more" until Gordon says otherwise.
- Runs are counted inside the calendar month only. **Confirmed by Gordon:** leave that continues across a month end counts as two separate short runs, one in each month.
- If two groups touch (annual leave then sick), treat them as separate runs.

### 4.3 Part-timer cost (Admin and Sales Manager only)
Per covered day: `480 + rate x total counter sales that day`, rate 2.5% for `planned`, 3% for `unexpected`. Use that day's provisional counter total. Show a month total per counter. Never in any BA, Brand Manager or `management` response.

### 4.4 AEON
- One counter, two shops. The user can combine shops: pick the shops and, for each, a date range, and the app adds the daily sales. The duty record records which shop she is in each day. Targets, brand achievement and commission are on the combined figure.
- **Confirmed by Gordon:** only a shop's sales on the days the BA is in that shop count towards her counter sales. This replaces the old model (50% of each shop's full-month sales). No one covers a shop on the days she is in the other one; the channel's own staff handle those days, and those sales are not counted for her or anyone.
- Store the shop split in `monthly_actuals.pos_id` so the split is never lost. Do not merge KH and SK into one `sales_entries` row.

### 4.5 Targets (spec section 7, with these data rules)
- Reference per brand: median of the last 3 calendar months. Default source is `sales_entries` as entered (already after discount, section 4.1 step 1), which matches what the channel will report; use `monthly_actuals` for a month that has them. For December 2026 the months are Aug, Sep, Oct 2026 (provisional).
- Counter starting target = max(`min_target`, median of last 3 months' counter totals). Pool, brand targets, the all-brand adjustment, the per-brand adjustment and the warning when the final counter target is below the minimum follow spec section 7 exactly. No rounding of targets.
- The screen shows, per brand: the 3 months, the median, the starting target, the two adjustments, the final target, and what the previous month's final target was. Brand Managers and Sales Manager can edit adjustments; Admin can edit everything. Publishing makes targets visible to the BA.
- **FW and LP step targets** (agreed): for 3 months the counter starting target moves in equal steps from its recent sales (3-month median) to `min_target`. Provide a per-counter "step plan" setting: start month, and the app computes `start + (min_target - start) x step/3`. Month 4 reverts to the standard rule. Treat as an optional setting; default off.

### 4.6 BA calculator (what she sees)
Per spec section 8, plus:
- Counter(s) selector for AEON (combined view with shop and date range).
- Targets, progress to date per brand, and a projection.
- **Suggested projection** improves on the old run-rate: sales so far / days elapsed x days in month is the default. Offer the duty-aware alternative: average daily sales on working days x remaining working days + sales so far. She can overwrite the projected counter sales.
- **Rest days for the projection:** if the duty record has days for the month, use them for past days and show her planned rest days for the future. If not, she enters expected rest days (default 6), and counted share = 1 - rest days/days x 50%.
- Output: counted sales, guaranteed part, extra part, overall brand achievement (from progress to date, or her overwrite), projected commission, basic salary, projected income.
- Add a "next tier" line: HK$ of counted sales needed to reach the next tier and the extra commission it brings. This is in scope; it is cheap and motivating.
- Shows only her own counter. A part-timer has no calculator.

## 5. Screens (all new, none replaces an existing one)

| Screen | Who | Purpose |
|---|---|---|
| Duty Record `/#/dashboard/duty` | `sales_manager`, `admin` | Month grid for the roster, section 3.3 |
| Monthly Actuals `/#/dashboard/actuals` | `sales_manager`, `admin` | Enter or upload actual sales; reconciliation, section 3.2 |
| Target Setting `/#/dashboard/targets` | `brand_manager`, `sales_manager`, `admin` | Section 4.5 |
| Pay Overview `/#/dashboard/pay` | `sales_manager`, `admin` | All BAs: counted sales, achievement, commission, income, part-timer cost, Provisional / Actual label, month lock |
| BA Calculator `/#/my-commission` | `ba` | Section 4.6 |
| Settings additions | `admin` | Tiers, minimum targets, rates, salary default, gap threshold, role assignment for the new roles |

Use the existing rose theme, shadcn components, TanStack Query and wouter hash routing. English labels (as the app is today).

## 6. Build order (each step shippable)

1. Roles, access helpers, `sales_counters` and members, tiers, settings, audit log, `commission.ts` with the section 8 tests passing.
2. Duty record page and tables.
3. Monthly actuals (manual grid) and reconciliation.
4. Target setting.
5. BA calculator and Pay Overview.
6. Month lock.

Please reply with a short plan and any problems before step 1. Anything you could not verify (live data, row counts) say "does not exist" or "not checked".

## 7. Open points to carry (do not block the build)

- Real basic salary per BA (all default to 12,000 until entered).
- Exactly 4 consecutive days is treated as "4 or more" until Gordon says otherwise.
- Unexpected substitution days are recorded by the duty record; the old model used 0.
- Channel report import scheme (section 3.2) is not decided. Gordon will send sample channel files later.
- **Confirmed by Gordon:** both the channel's monthly figure and the daily amount a BA enters are after promo discounts (what the customer actually pays). Use both as they are. The promo money-off tables are not used by this scheme. The POS till figure (`pos_daily_figures`) is available as an extra check per shop per day; show it on the reconciliation screen if it is cheap.

Settled by Gordon (no longer open): AEON counts only the shop's sales on the days she is in it; BA self-edit of salary needs no approval; leave across a month end is two separate runs.

## 7a. Test and demo data

**There are no actual sales figures in the app today.** Do not invent any. To demonstrate or test the formulas, use the provisional `sales_entries` already in the app (Aug to Oct 2026 for targets, and any current-month days). The Provisional label will therefore show on every screen at first. Test the "Actual" path only with the unit tests (section 8.4) and with figures typed in a test or local database, never seeded into production.

## 8. Acceptance tests

Counter sales are for a 30-day month. L = LOGON/AEON table, S = SOGO table. "Ach." is overall brand target achievement.

### 8.1 Spec cases (must match to the cent)

| # | Table | Counted sales | Ach. | G | T | Expected commission |
|---|---|---|---|---|---|---|
| 1 | L | 90,000 | 100% | 1,800 | 2,130 | 2,130 |
| 2 | L | 90,000 | 80% | 1,800 | 2,130 | 2,064 |
| 3 | S | 90,000 | 100% | 1,800 | 2,820 | 2,820 |
| 4 | S | 90,000 | 80% | 1,800 | 2,820 | 2,616 |
| 5 | L | 180,000 | 80% | 3,600 | 9,130 | 8,024 |
| 6 | L | 60,000 | any | 1,200 | 1,200 | 1,200 |

Brand check: targets A 50,000 / B 30,000 / C 20,000, actuals 50,000 / 15,000 / 30,000 give 100% / 50% / 100%; overall = 0.5 + 0.15 + 0.2 = 85%. Zero target is ignored; zero sales gives 0%.

### 8.2 Duty record cases (daily sales flat at 3,333.333 = 100,000 / 30 for 30 days; L table)

| # | Duty record | Counted sales | Ach. | Expected commission |
|---|---|---|---|---|
| 7 | 6 separate planned rest days (each under 4 days) | 80,000 + 6 x 3,333.333 x 50% = 90,000 | 80% | 2,064 (same as case 2) |
| 8 | 5 consecutive annual leave days (40%) + 1 rest day (50%) | 80,000 + 5 x 3,333.333 x 40% + 3,333.333 x 50% = 88,333.333 | 100% | G 1,766.667, T 2,063.333, commission 2,063.333 |
| 9 | Same as 8 | 88,333.333 | 80% | 1,766.667 + 296.667 x 80% = 2,004.000 |
| 10 | 5 consecutive sick-leave days (regular BA 0%) + 1 rest day (50%) | 80,000 + 1,666.667 = 81,666.667 | 100% | G 1,633.333, T 1,796.667, commission 1,796.667 |
| 11 | 1 unpaid leave day (0%), 29 days worked | 29 x 3,333.333 = 96,666.667 | 100% | T = 1,400 + 210 + 19,666.667 x 4% = 2,396.667; commission 2,396.667 |
| 12 | Exactly 4 consecutive annual leave days (treated as "4 or more", 40%), 26 days worked | 26 x 3,333.333 + 4 x 3,333.333 x 40% = 86,666.667 + 5,333.333 = 92,000 | 100% | T = 1,400 + 210 + 15,000 x 4% = 2,210; commission 2,210 |

### 8.3 Part-timer cost (management view only)

| # | Day type | Counter sales that day | Cost |
|---|---|---|---|
| 13 | Planned rest day | 3,333.333 | 480 + 2.5% x 3,333.333 = 563.333 |
| 14 | Unexpected substitution | 3,333.333 | 480 + 3% x 3,333.333 = 580.000 |
| 15 | 6 planned days | 3,333.333 each | 3,380.000 |

### 8.4 Provisional versus actual

| # | Case | Expected |
|---|---|---|
| 16 | Provisional counter total 100,000; 6 separate rest days (f = 90%); channel actual 110,000 | Counted = 99,000. At 100%: 1,400 + 210 + 22,000 x 4% = 2,490. Label "Actual" |
| 17 | Same month, no actual uploaded | Counted = 90,000. Commission as case 1 or 2. Label "Provisional" |
| 18 | Provisional 100,000 vs actual 110,000 | Reconciliation shows gap 10,000 (10.0%), flagged at the 5% default |
| 18a | One day, one counter: `sales_entries` 12,000, promo money-off of 1,500 also recorded in `promotion_deductions` | Provisional for that day = 12,000. The deduction is ignored; commission, targets and reconciliation never subtract it |
| 19 | Month with no duty record | Estimate: counter sales x (1 - 6/30 x 50%) = 90%, flagged "estimated, no duty record" |

### 8.5 AEON two shops

| # | Case | Expected |
|---|---|---|
| 20 | KH flat 2,000 a day, SK flat 3,000 a day. BA in KH days 1 to 15, SK days 16 to 30. No rest days. L table, Ach. 80% | Counter sales = 15 x 2,000 + 15 x 3,000 = 75,000. G 1,500. T = 70,000 x 2% + 5,000 x 3% = 1,550. Commission = 1,500 + 50 x 80% = 1,540 (1,550 at 100%) |
| 21 | Same, user selects KH 1 to 15 and SK 16 to 30 in the calculator | Same result as case 20; AEON actuals keep the KH and SK amounts separately |

### 8.6 Targets

| # | Case | Expected |
|---|---|---|
| 22 | Brand last 3 months 40,000 / 60,000 / 50,000 | Median 50,000 (not the average) |
| 23 | Counter: minimum target 83,086; last 3 months median 70,000 | Starting target 83,086 (the higher one) |
| 24 | Final counter target below the minimum | Warning shown, save allowed |
| 25 | Brand Manager calls a pay route | Rejected with 403; no pay field in any response |
| 26 | BA calls a pay route for another BA | Rejected with 403 |
| 27 | Edit in a locked month | Rejected; Admin reopens and the change is logged |

## 9. Scope boundary

- Out of scope now: product bonuses (`incentive_*`), the importer for channel reports (until Gordon decides the scheme), any change to the daily entry grain, any change to the POS reconciliation page.
- Do not send salary, commission, counter profit or part-timer cost to any `console.log`, error message, export or Excel download that other roles can reach.
