# Counter Sales Tracker — reply to Alfred

From: the Cursor agent that maintains the Counter Sales Tracker.
To: Alfred.
About: the information request in `Directives/App-info-request_for-Cursor-agent.md`.
Date: 18 November 2026.

The app can track daily sales, promotions, and product bonuses. It cannot yet do the December commission scheme: there is no monthly brand target, no salary, no rest-day record, and no split of a day’s sales between the regular BA and a part-timer.

Live sales dates, row counts, and sample rows are **not in this reply**. This computer has no database connection (`DATABASE_URL` is not set, and there is no `.env` file), so those figures were not guessed.

The table list is saved beside this file as `Directives/schema-runtime.sql`. An OpenAPI file does not exist.

No passwords, API keys, tokens, or connection strings are included. Environment names only.

---

## 1. Walkthrough

The app records **daily sales by brand at each beauty counter**, plus promotions and a separate **product-bonus** scheme. It is used by three roles, stored as text on the user:

| Role | Who | What they can open |
|---|---|---|
| `ba` | Regular beauty advisor | Daily entry, and her own dashboard |
| `part_time` | Part-time advisor | Same screens as a BA, but a shorter history |
| `management` | Office / management | Entry, plus the full management dashboard |

There is **no Brand Manager role** and **no Sales Manager role**. Anyone who needs those screens today would have to be `management`, and every `management` user sees the same things.

Addresses use a hash (the `#` in the URL), for example `https://<host>/#/dashboard`.

| Screen | Address | What it shows | What the user can do |
|---|---|---|---|
| Sign in | shown when logged out | Username and PIN | Sign in |
| Daily Sales Entry | `/#/` | Today’s brands for one shop: orders, units, HK$ amount, gifts, money-off promos, and the POS till figure (對數紙) | Enter or correct that day. BAs only see shops assigned to them |
| My Dashboard | `/#/my-dashboard` | That person’s shops: sales, orders, a chart, gross vs net, a simple month-end projection | Filter by date. Part-timers and BAs marked “probation” only see days they themselves submitted |
| Management | `/#/dashboard` | All shops: daily totals, by channel, by counter, month-end projection, Excel export | Filter and export |
| Brand Analytics | `/#/dashboard/brands` | Sales by brand over a range, a month, or a year, plus a projection | Filter and export |
| Promotions | `/#/dashboard/promotions` | Promotion list | Create, edit, delete. Also receives promotions pushed from the pricing simulator |
| Incentive Tracking | `/#/dashboard/incentives` | This month’s product/promo bonuses and estimated HK$ payout | Management creates schemes. BAs type daily counts on the entry screen |
| POS Reconciliation | `/#/dashboard/reconciliation` | BA-entered total vs the POS till figure | Review gaps |
| Settings | `/#/dashboard/settings` | Counters, brands, categories, shops (POS), users, which brands are at which shop | Add or deactivate. Management only |
| Not found | any other path | “Page not found” | Nothing |

Screenshots were not taken. The table above is the screen list.

### How a day’s sales gets in

1. A BA (or management) opens Daily Sales Entry, picks the shop and the date, types orders / units / amount per brand, plus promo redemptions.
2. Save calls `POST /api/sales/batch`. One row is stored per shop + brand + day. Saving again **overwrites** that row. Clearing a brand **deletes** that day’s row.
3. Management can also import a monthly Excel daily report (`POST /api/import/daily-report`) or a JSON list (`POST /api/sales/import`). Import also overwrites the same shop + brand + day. Imported rows have no person attached (`submitted_by` is empty).

### How a promotion is set up

Management creates it on the Promotions screen, or the pricing simulator pushes it to `POST /api/promotions/push`. The BA then records gifts and money-off counts on the daily entry screen.

### How analytics are viewed

Management uses the dashboard pages. A BA uses My Dashboard, which only looks at her assigned shops in the browser. The API itself still returns all sales to any logged-in user (see section 5).

---

## 2. Tech stack and hosting

| Layer | What it is | Version in `package.json` |
|---|---|---|
| Language | TypeScript, strict | 5.6.3 |
| Front end | React | 18.3.1 |
| Build | Vite | 7.3.0 |
| Routing | wouter, hash addresses | 3.3.5 |
| Back end | Express on Node | Express 5.0.1. README asks for Node 20+, prefers 22 |
| UI | Tailwind + shadcn/ui (Radix) | Tailwind 3.4.17 |
| Charts | Recharts | 2.15.4 |
| Forms / checks | react-hook-form, Zod | Zod 3.24.2 |
| Database | PostgreSQL, via `pg` | 8.16.3 |
| Model | Drizzle ORM | 0.39.3 |

**If `DATABASE_URL` is missing, the server uses memory and forgets everything on restart.** Production is expected to set `DATABASE_URL`. The README still says “in-memory only”; that note is out of date.

**Migrations.** There is no `migrations/` folder and no migration history. On every startup, `server/storage.ts` runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. A second command, `npm run db:push`, uses Drizzle Kit, but only if `DATABASE_URL` is set. Both paths exist; they can drift. The TypeScript model is `shared/schema.ts`. The SQL file written with this reply is `Directives/schema-runtime.sql`.

**Hosting.** README says Railway: push to GitHub, Railway runs `npm run build` then `npm start`. This repo has **no** `railway.toml`, **no** Dockerfile, and **no** GitHub Actions (no CI). Remote is `github.com/etdirect/beauty-bliss-tracker`, local branch `main`. The Railway project was not confirmed from this machine.

**Environment variable names only:** `NODE_ENV`, `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `INTERNAL_API_KEY`, `SIMULATOR_URL`.

### Folder tree (3 levels)

```
beauty-bliss-tracker/
├── client/
│   ├── index.html
│   └── src/
│       ├── components/     (ui/ is shadcn; do not hand-edit)
│       ├── hooks/
│       ├── lib/
│       ├── pages/          (ba-entry, ba-dashboard, login, dashboard/)
│       ├── App.tsx
│       └── main.tsx        ← front-end entry
├── server/
│   ├── index.ts            ← back-end entry
│   ├── routes.ts           ← all API routes
│   ├── storage.ts          ← database access + startup SQL
│   ├── static.ts
│   └── vite.ts
├── shared/
│   ├── schema.ts           ← table model
│   └── deductionAllocation.ts
├── script/
│   └── build.ts
├── Directives/
├── Migration-doc/
├── package.json
├── drizzle.config.ts
├── vite.config.ts
└── dist/                   (built output, generated)
```

**Main entry files:** `client/src/main.tsx` (front end), `server/index.ts` (back end), `shared/schema.ts` (data model).

**Run locally:** Node 20+, then `npm install` and `npm run dev`. The app listens on port 5000. On Windows PowerShell the `dev` script can fail because it sets `NODE_ENV` in Unix style. `npm run check` only type-checks. **Tests do not exist** (no test files, no test script).

**Login.** Username + PIN. The PIN is stored as a bcrypt hash. The session is a cookie (`express-session`): 7 days, `httpOnly`, `secure` in production. In production the session is stored in the Postgres `session` table. The role is checked in two places: the browser hides management pages from `ba` and `part_time`, and the API uses `requireAuth` (any logged-in user) or `requireManagement` (role must be `management`). Some routes are open with no login: public shop list, simulator push, and internal routes that check `INTERNAL_API_KEY`. The `passport` package is installed but not used.

**Languages.** Screens are English, hard-coded in the page files. There is no translation file. Two promotion fields, `description_zh` and `mechanics_zh`, hold Traditional Chinese for the BA entry screen. Brand and shop names are data, not translations.

---

## 3. Data available today

Full `CREATE TABLE` statements are in `Directives/schema-runtime.sql`. One line each:

| Table | Holds |
|---|---|
| `session` | Login session |
| `counters` | Old counter list. Live shops are `pos_locations` |
| `categories` | Brand categories |
| `brands` | Brand display name and category. **No brand code** |
| `counter_brands` | Old brand-to-counter links |
| `sales_entries` | Daily sales: one row per shop + brand + day |
| `promotions` | Promotion rules |
| `promotion_results` | Gifts given, per shop per day |
| `promotion_deductions` | HK$ money-off, per shop per day |
| `pos_locations` | Shops: channel + store code + name |
| `users` | Login, name, role. **No salary, no start date** |
| `user_pos_assignments` | Which shops a user may use |
| `brand_pos_availability` | Which brands are sold at which shop |
| `incentive_schemes` | Monthly product/promo bonus rules |
| `incentive_entries` | A user’s daily count toward a bonus |
| `pos_daily_figures` | POS till total for one shop for one day |

### What sits where

- Counters/stores: `pos_locations`. `counters` is legacy.
- Brands: `brands` (name only).
- BAs/staff and users: the same `users` table. There is no separate staff table.
- Daily sales: `sales_entries`.
- Promotions: `promotions`, `promotion_results`, `promotion_deductions`.
- Bonuses: `incentive_schemes`, `incentive_entries`.
- POS till total: `pos_daily_figures`.

**Sales grain.** Per **day**, per **brand**, per **shop**. Not per hour and not per transaction. Columns are orders, units, and amount. Amount is the figure typed or imported. Money-off promos are stored beside it and subtracted only when a screen asks for “net”. The app does **not** record tax. It does not say whether the typed amount is shelf price or what the shopper paid.

**How sales gets in.** Three ways: BA typing, management JSON import, management Excel daily-report import. No ERP or POS feed. Excel sheets are named `StoreCode_POS_Channel`; brand rows use a code that is mapped in code (`BRAND_CODE_MAP` in `server/routes.ts`), then saved under the brand’s name. A correction overwrites the same shop + brand + day. There is **no history** of the old figure and no “who changed it” log, except `submitted_by` on a BA save (Excel import leaves that empty, and the bulk import does not update it).

**Who was on duty.** **Does not exist.** There is no roster table. The “mark part-timer days” feature is not in the app. What does exist:

- A user can have role `part_time`.
- A user can be assigned to shops.
- `sales_entries.submitted_by` is who **typed** the row, not who worked the counter, and not a split of the money.
- `can_view_history` hides older days from a BA. The Settings screen labels that “Probation”. It is not a part-timer calendar.

**Date range, row count, live counters.** **Does not exist in this workspace.** Not queried. Do not treat the seed list below as the live list.

**Brand codes.** Brands are stored by name. Codes exist only in the Excel import map: `A18, AD, ASD, BB, EE, EM, GE, KL, LA, NE, NOVE, PE, PH, SAM, TA, XP, RF`. Against the requested list: **AD, EM, TA, PH, PE, LA, NOVE, NE, KL, RF, ASD** are in that map. **ATHE and GD11 are not.** The map also has names that are not in that list (Addmino18, Beauty Bliss, elvis+elvin, Geske, SAMPAR, Xposome).

**AEON.** **Does not exist** in the seed data, and there is no “one counter, two stores” idea. Each shop is one `pos_locations` row, unique on channel + store code. Seed shops (used only when the shop table is empty) are FACESSS/AD, LOGON CWB, TS, MK, KT, ST, and SOGO/KT. That does **not** match the December list (LOGON HC, FW, LP, NTP, TS; SOGO CWB, KTK; AEON KH and SK). A person can be assigned to two shops, but sales stay as two separate shops.

**BA records.** `users` holds username, PIN hash, name, role (`ba` / `part_time` / `management`), active flag, and `can_view_history`. It does **not** hold basic salary, start date, or a home counter (the counter is a separate assignment row). Who can read it: `GET /api/users` is management-only and returns name, username, role, active, history flag. It does not return the PIN. BAs cannot call it. A server-to-server route can list the same safe fields if `INTERNAL_API_KEY` matches.

**Five sample rows.** **Not available.** No database connection from this machine. Rows were not invented.

**Time zone.** Dates are text `YYYY-MM-DD`, not timestamps. A “month” is the first 7 characters, for example `2026-12`, or a calendar month built with the **browser’s local date**. The server’s “which promos are active today” uses UTC (`toISOString`), which is **not** Hong Kong time. There is no `Asia/Hong_Kong` setting. Incentive months are a `YYYY-MM` string.

---

## 4. Existing logic that overlaps

**Commission.** There is no brand-sales commission, no basic salary, no rest days, and no “BA’s own forecast” box. There **is** a monthly **product bonus** (`incentive_schemes`): units or amount of named products, with a flat or stepped HK$ reward, sometimes a different minimum per shop. That payout is calculated in the browser (`computeTieredPayout` and `computeStorePayoutForScheme` in `client/src/pages/dashboard/incentive-tracking.tsx`). It is a different scheme from the December commission. Do not reuse it as the commission engine.

**Monthly sales and sales so far.** There is no server function. Each dashboard adds up `sales_entries.amount` for rows whose date falls in the selected range. “This month so far” on the BA dashboard defaults to the 1st of the month through today, in the browser’s local date. Net sales subtract promo deductions in proportion to each brand’s gross that day (`allocateDeductions` in `shared/deductionAllocation.ts`). The raw sales row is never changed.

**Projection.** Same idea on Management, Brand Analytics, and the BA dashboard. It only appears when the chosen dates sit inside **one** calendar month. It is a straight run-rate, not a forecast model. The BA dashboard copy is:

```ts
const projection = useMemo(() => {
  if (!isProjectionEligible) return null;
  const s = new Date(drStart + "T00:00:00");
  const e = new Date(drEnd + "T00:00:00");
  if (s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth()) return null;
  const year = s.getFullYear();
  const month = s.getMonth() + 1;
  const daysElapsed = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const monthDays = daysInMonth(year, month);
  const dailyRate = daysElapsed > 0 ? totalSales / daysElapsed : 0;
  const projected = Math.round(dailyRate * monthDays);
  const vsLM = lmTotalSales > 0 ? projected - lmTotalSales : null;
  const vsLMPct = lmTotalSales > 0 ? ((projected - lmTotalSales) / lmTotalSales) * 100 : null;
  return { year, month, daysElapsed, monthDays, dailyRate, projected, vsLM, vsLMPct, lmTotalSales };
}, [isProjectionEligible, drStart, drEnd, totalSales, lmTotalSales]);
```

Location: `client/src/pages/ba-dashboard.tsx` (around the `projection` useMemo). The same formula is in `client/src/pages/dashboard/management-dashboard.tsx` and `client/src/pages/dashboard/brand-dashboard.tsx`.

Meaning: `projected = round((sales in the selected days / number of selected days) × days in that month)`. It compares that with the whole previous calendar month. Part-timers do not see it. It does not know rest days, and it does not let the BA type her own projection.

**OpenAPI / Swagger.** Does not exist.

### API list

Unless noted, GET needs login; writes need `management`.

- `POST /api/auth/login` — sign in
- `POST /api/auth/logout` — sign out
- `POST /api/auth/change-pin` — change own PIN
- `GET /api/auth/me` — current user and assigned shops
- `GET /api/public/pos-locations` — shop list, **no login**
- `GET /api/internal/users` — user list, shared secret, no PIN
- `GET /api/internal/brands` — active brands, shared secret
- `GET/POST /api/pos-locations`, `PATCH /api/pos-locations/:id` — shops
- `GET/POST /api/users`, `PATCH /api/users/:id` — users (management)
- `GET/POST /api/user-pos-assignments` — shop assignments
- `GET/POST /api/brand-pos-availability` — brands at a shop
- `GET/POST /api/counters`, `PATCH /api/counters/:id` — legacy counters
- `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`
- `GET/POST /api/brands`, `PATCH /api/brands/:id`
- `GET /api/counter-brands`, `GET /api/counter-brands/:counterId`, `POST /api/counter-brands`
- `GET /api/sales` — sales, optional date/shop/brand filters. **Any logged-in user**
- `POST /api/sales/batch` — save one day’s entry. Any logged-in user
- `DELETE /api/sales` — delete a date range (management)
- `POST /api/sales/import` — JSON import (management)
- `POST /api/sales/update-units` — patch units only (management)
- `POST /api/import/daily-report` — Excel import (management)
- `GET /api/pos-daily-figures` — till totals
- `GET/POST /api/promotions`, `PATCH/DELETE /api/promotions/:id`
- `GET /api/promotions/active` — promos active on a date
- `POST /api/promotions/push` — simulator push, **no login**
- `DELETE /api/promotions/by-source/:sourceId` — **no login**
- `POST /api/promotions/link-simulator-number` — **no login**
- `GET /api/public/promotion-redemption-stats` — **no login**
- `GET /api/promotion-results`, `GET /api/promotion-deductions`
- `GET/POST /api/incentive-schemes`, `GET /api/incentive-schemes/month/:month`, `GET/PATCH/DELETE /api/incentive-schemes/:id`
- `GET /api/incentive-progress`, `GET /api/incentive-progress-daily`, `GET /api/incentive-progress-by-store`
- `GET /api/incentive-progress-by-store-bulk` — management
- `GET/POST /api/incentive-entry`, `GET /api/incentive-entries`, `GET /api/incentive-entries-daily`, `GET /api/incentive-entries-total`
- `GET /api/simulator-products` — management, reads the simulator

---

## 5. Fit for the three new functions

### 1. Monthly actuals entry — medium

Reuse shops (`pos_locations`), brands, and users. Do **not** squeeze this into `sales_entries`. Daily rows are per day and are not split between regular and part-time.

Add a new table, for example `monthly_actuals`: `id`, `month` (`YYYY-MM`), `pos_id`, `brand_id`, `counter_total`, `regular_ba_amount`, `part_time_amount`, `entered_by`, `entered_at`, `note`. Plus `monthly_actual_edits` if the previous figure must be kept.

Biggest risk: the daily sales already exist, so two “official” totals can disagree, and nothing in the app can calculate the part-time share. Also confirm whether AEON is one row or two.

### 2. Target setting — medium

Reuse shops, brands, and a sum of the last three months from `sales_entries` (that sum can be built). There is no target table and no audit trail today. `incentive_schemes.store_thresholds` is a bonus minimum, not a sales target.

Add `monthly_targets`: `id`, `month`, `pos_id`, `brand_id`, `target_amount`, `set_by`, `set_at`, `is_current`. Add `monthly_target_history` with the old amount, who changed it, and when. Do not overwrite in place if history is required.

Biggest risk: **permissions**. A Brand Manager must not be role `management`, or they see every shop and, later, pay.

### 3. BA calculator — large

Reuse the BA dashboard shell, assigned shops, the run-rate idea, and targets/actuals from the two new tables. Add fields the app does not have: the BA’s own projected sales, basic salary, rest days, and the commission result.

Suggested new tables, not columns on `users`:

- `ba_pay`: `user_id`, `month`, `basic_salary`, `employment_type`, `rest_days`, `updated_by`, `updated_at`
- `ba_projections`: `user_id`, `month`, `pos_id`, `brand_id`, `projected_amount`, `updated_at`

Commission should be calculated, not typed, once the formula is fixed.

Biggest risk: the formula is not in the app, rest days do not exist, and the current projection ignores days off. Pay must not leak through the management APIs.

### Direct answers

**Can it hold a monthly target per counter per brand, with history?** Not today. The shape above can. Nothing already there does.

**Can a BA see only her counter and her pay, with Brand Manager and Sales Manager separate?** Partly. The browser already hides management pages from `ba` and `part_time`, and My Dashboard filters to assigned shops. The API does **not**: any logged-in user can `GET /api/sales` for every shop. There is no pay to hide yet. Brand Manager and Sales Manager would be **new roles**, checked on the API, not only hidden in the menu.

**Where should salary and commission live so Brand Managers cannot see them?** In `ba_pay` (and a calculated commission response), served by their own route. Allowed callers: a new payroll/sales-manager role, and the BA reading **her own** row. Do not put salary on `users`. Do not return it from `GET /api/users` or the brand dashboard. Brand Manager should not use the `management` role.

**Can it do two-store counters (AEON) cleanly?** No. KH and SK would be two shops. One BA can be assigned to both, but targets, actuals, and the calculator would still be per shop unless a parent is added, for example `pos_groups` (`id`, `name`) and `pos_group_members` (`group_id`, `pos_id`). Do not merge KH and SK into one sales row; the store split would be lost.

---

## 6. Constraints and house rules

- `shared/schema.ts` is the model both sides import. New fields go there first, then the startup SQL in `server/storage.ts` (that is what actually changes production).
- New API routes go in `server/routes.ts`. Data access goes through `storage`, not raw SQL in the route.
- Do not hand-edit `client/src/components/ui/`. Use Tailwind and the existing rose theme.
- Pages are React functions. Server data uses TanStack Query. Routing stays wouter with hash addresses.
- Do not add Redux or Zustand. Do not change the sales grain (one row per shop + brand + day).
- `Migration-doc/cursor-project-rules-handout.md` says there is no login. That is stale. Login exists; keep it.
- No ESLint config. The check that exists is `npm run check` (TypeScript).
- No automated tests and no CI.

### Debt that would affect this work

- README still says data is memory-only.
- Two ways to change the database (startup SQL and `db:push`) with no migration history.
- `GET /api/sales` is not limited to the user’s shops.
- “Today” on the server is UTC, not Hong Kong.
- Dates are text, so a bad string sorts as text.
- Bulk Excel import overwrites sales and does not record who imported them.
- No audit log on any figure.
- Several promotion routes have no login.
- Seed shop codes do not match the December counter list. Live shops may already have been renamed in Settings; this machine cannot see them.

**What breaks if `sales_entries` changes.** Daily entry, all three dashboards, Excel import, POS reconciliation, deduction allocation, and the unique key `(counter_id, brand_id, date)`. Add new tables beside it.

### How to send the build handoff

One Markdown file in `Directives/`. For each of the three functions: who may open it, the fields, and the formula as a worked HK$ example (one counter, one brand, one month). Then a small test table: inputs in, expected commission out, including a part-timer day and the AEON two-store case. Name the new roles. Say whether daily sales or the monthly actual is the commission base when they disagree. A spreadsheet may hold the examples; the rules should be in the Markdown.

---

## Questions for Gordon before building

1. When the monthly actual and the sum of daily sales disagree, which number is the commission based on?
2. How is the part-timer share decided — a percentage typed in, hours, or something else? The app cannot work it out from today’s data.
3. Is the December shop list (HC, FW, LP, NTP, TS, CWB, KTK, KH, SK) the list to add, or have shops already been renamed in the live app?
4. For AEON, do KH and SK each have a target and a sales total, with one BA seeing both, or is there one combined total?
5. Who may see salary: the Sales Manager, the BA herself, or both? Confirm a Brand Manager must not, even if that person also helps with targets.
6. What is the commission formula? Percent of brand sales, percent above target, different rates per brand, and what happens below target?
7. Do rest days change the month-end projection, the salary, or both? Is basic salary a monthly lump sum or a daily rate?
8. Can one BA cover two counters in the same month?
9. Do the existing product bonuses keep running next to this commission after 1 December 2026?
10. Should November 2026 be entered as the first “last month”, so December targets have history?

---

## Files sent with this reply

| File | What it is |
|---|---|
| `Directives/App-info-reply_for-Alfred.md` | This reply |
| `Directives/schema-runtime.sql` | Tables the server creates on startup |
| OpenAPI | Does not exist |
| Screenshots | Not taken. Screen list is in section 1 |
