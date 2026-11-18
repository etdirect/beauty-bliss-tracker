# BA Commission Scheme - one-page spec (v16) for the Counter Sales Tracker build

Owner: Gordon Cheng (Supergo). Source of truth: `BA_commission_scheme_v16.xlsx` (internal, contains profit figures). Starts 1 Dec 2026, applies to December sales. Dates and times in HKT (UTC+8). Do not round targets or commission in calculations; round only for display (HK$, whole dollars).

## 1. Counters
| Channel | Counters | Trade margin | Tier table |
|---|---|---|---|
| LOGON | HC, FW, LP, NTP, TS | 37% | Table L |
| SOGO | CWB (28%), KTK (16%) | per counter | Table S |
| AEON | one counter = two stores, KH + SK, one BA (15 days in each) | 35% (consignment) | Table L |
One regular BA per counter, plus part-timers who cover her rest days. Priority brands (get targets): AD, ATHE, EM, GD11, TA, PH, PE, LA, NOVE, NE at LOGON and SOGO counters; AD, EM, LA, PH, NE, NOVE at AEON. All other brands count towards sales but have no target.

## 2. Commission tiers (each slice paid at its own rate, read on the regular BA's counted sales, section 3)
| Table L (LOGON, AEON) | Table S (SOGO) |
|---|---|
| 0 to 70,000: 2% | 0 to 53,000: 2% |
| 70,000 to 77,000: 3% | 53,000 to 76,000: 4% |
| 77,000 to 100,000: 4% | 76,000 to 106,000: 6% |
| 100,000 to 130,000: 6% | 106,000 to 146,000: 9% |
| 130,000 to 170,000: 9% | 146,000 to 196,000: 12% |
| 170,000 to 220,000: 12% | above 196,000: 15% |
| above 220,000: 15% | |
(The letters show bands as 70,001 to 77,000 and so on. In code use continuous slices: amount in (lower, upper].)

## 3. Counted sales (the amount the table is read on)
Counted sales = sales on days she works (100%) + her share of the sales on days a part-timer covers. Counter sales come from the channel's POS records (AEON: KH + SK added).
| Covered-day situation | Regular BA share | Part-timer share |
|---|---|---|
| Annual leave, rest days, irregular rest days (under 4 consecutive days) | 50% | 50% |
| Same, 4+ consecutive days | 40% | 60% |
| Sick / maternity leave (under 4 consecutive days) | 50% | 50% |
| Sick / maternity leave, 4+ consecutive days | 0% (in basic salary calculation) | 50% |
| Unpaid leave | 0% | 50% |
Standard month: 6 planned rest days, so counted = counter sales x (1 - 6/days x 50%), about 90%. The app should work from daily sales plus a per-day record of who was on duty (regular / part-timer / leave type). If only monthly totals exist, use the formula above as an estimate and flag it.

## 4. Brand target achievement
- Brand target achievement % = min(brand actual / brand target, 100%). Brand with zero target: ignore. Brand with zero sales: 0%.
- Overall % = sum over priority brands of (brand's final target / total priority final target) x its achievement %.
- Brand actuals are the whole counter's sales (including part-timer days).

## 5. Monthly commission (regular BA)
1. Tier amount T = table applied to counted sales.
2. Guaranteed part G = 2% x counted sales.
3. Extra part E = T - G.
4. Commission = G + E x overall achievement %.
Below the first tier (70,000 L / 53,000 S) E = 0, so commission is 2% whatever the brand results.
Income = basic salary + commission. Basic salary is per BA (the model assumes 12,000).
Part-timer (company cost, management view only): 8 hrs x HK$60 = 480 per day + 2.5% of that day's total counter sales (planned rest day) or 3% (unexpected substitution).

## 6. Test cases (counter sales 100,000, 30-day month, 6 rest days, so counted = 90,000)
| Table | Achievement | G | T | Commission |
|---|---|---|---|---|
| L | 100% | 1,800 | 2,130 (1,400 + 210 + 520) | 2,130 |
| L | 80% | 1,800 | 2,130 | 1,800 + 330 x 80% = 2,064 |
| S | 100% | 1,800 | 2,820 (1,060 + 920 + 840) | 2,820 |
| S | 80% | 1,800 | 2,820 | 1,800 + 1,020 x 80% = 2,616 |
| L, counted 180,000 | 80% | 3,600 | 9,130 (1,400+210+920+1,800+3,600+1,200) | 3,600 + 5,530 x 80% = 8,024 |
| L, counted 60,000 | any | 1,200 | 1,200 | 1,200 |
Brand check: targets A 50,000 / B 30,000 / C 20,000, actuals 50,000 / 15,000 / 30,000 give 100% / 50% / 100% (capped); overall = 0.5 + 0.15 + 0.2 = 85%.

## 7. Monthly targets (for the target-setting screen)
- Reference for each brand: median of the last 3 months' sales (middle value, not the average).
- Counter starting target = higher of (minimum target, median of last 3 months' counter sales). Minimum target = breakeven x 110%. Current minimums (assume basic 12,000 and part-time cover 2,880): LOGON counters 83,086; CWB 57,031; KTK 40,216; AEON 75,429. These change if salary or margins change; store as editable values.
- Priority pool = starting target - median of non-priority brands. Brand starting target = brand median / sum of priority brand medians x pool.
- Managers (Brand Managers + Sales Manager) can apply one adjustment for all brands (big sale day, holiday) and one per brand (launch, promotion). Final brand target = starting x both adjustments. Final counter target = sum of final brand targets + non-priority expected sales. Warn if it falls below the minimum target.
- Targets are set monthly, per counter per brand, and are visible to the BA.

## 8. BA calculator (what the BA sees)
Her brand targets, progress to date per brand, and a projection. Suggested projection = sales so far / days elapsed x days in month (the tracker's own model is fine if better). She can overwrite the projected counter sales and see projected commission and income using sections 3 to 5, with her rest days entered (counted share = 1 - rest days/days x 50%).

## 9. Access rules
- BA: own counter, own targets, own commission and income only.
- Brand Managers and Sales Manager: targets and sales. They must NOT see salary, commission or counter profit.
- Gordon / management: everything, including part-timer cost.

## 10. Open points (confirm with Gordon before relying on them)
- Real basic salary per BA (model uses 12,000 for all).
- AEON history: the sales file gives full-month sales of each store; the model counts 50% of each. The app should record the days she is in each store, or daily sales by store, to replace this.
- Exactly 4 consecutive days falls in both leave brackets in the HR notice (4 days or fewer / 4 or more). Treat 4 as "4 or more consecutive" until Gordon says otherwise.
- Unexpected substitution days (annual or sick leave) are 0 in the model; the app should record them.
