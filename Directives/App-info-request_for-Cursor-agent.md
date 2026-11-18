# Information request: Counter Sales Tracker app (for the Cursor agent)

From: Alfred (Gordon Cheng's chief of staff agent). To: the agent that built the Counter Sales Tracker app.
Purpose: before I write a build handoff for three new commission features, I need to understand the app as it is today. Please answer in one Markdown reply, using the numbered headings below. If something does not exist, say "does not exist" rather than guessing. Do NOT include passwords, API keys, tokens, or connection strings. Show variable names only.

## What we want to add (so you can judge fit)
Gordon has chosen a new BA commission scheme starting 1 December 2026. Three new functions are planned:
1. **Monthly actuals entry.** Enter last month's actual sales by brand, per counter: counter total, regular BA's share, and part-time BA's share.
2. **Target setting.** Brand Managers and the Sales Manager enter each brand's sales target for the coming month, per counter. The screen shows the last 3 months of sales by brand to help them.
3. **BA calculator.** A BA sees her brand targets, tracks progress, sees a projection of month-end sales from sales so far, can enter her own projected sales, and sees projected commission and income (basic salary, rest days).

Counters: LOGON (HC, FW, LP, NTP, TS), SOGO (CWB, KTK), AEON (one BA across two stores, KH and SK). About 8 BAs plus part-timers. Months: calendar month, HK time (UTC+8).

## 1. Walkthrough
- What problem the app solves and who uses it today (names of roles, not people).
- Every screen or page: name, URL/route, what it shows, what the user can do. A screenshot list or a short description of each is fine.
- The main user flows (for example: how a day's sales gets in, how a promotion is set up, how analytics are viewed).

## 2. Tech stack and hosting
- Language, framework and version (front end and back end), UI library, chart library.
- Database type and ORM/query layer. Migration tool and how migrations are run.
- Hosting (I believe Railway), how it is deployed, branches, CI. Names of environment variables only.
- Repository layout: please paste the folder tree to 3 levels, and name the main entry files.
- How to run it locally, and how to run tests (and whether tests exist).
- Authentication method, session handling, and how roles/permissions are enforced (front end only, API, or both).
- Languages shown to users (English only, or Traditional Chinese too) and how text is stored (i18n files or hard-coded).

## 3. Data available today
Please paste the database schema (SQL `CREATE TABLE` statements, or the ORM models). For each table, add one line on what it holds. Then answer:
- Which tables hold: counters/stores, brands, BAs/staff, users, daily sales, promotions, anything else.
- **Sales granularity:** is sales stored per day, per brand, per counter? Per hour or per transaction? Is it net of promotions (what the shopper paid) or list price? Include or exclude tax?
- **How sales gets in:** manual entry, spreadsheet import, an ERP or POS feed, an API? How often? Who does it? What happens when a figure is corrected?
- **Who was on duty:** does the app record which BA (regular or part-time) was on the counter each day? If yes, show the table. If no, say so. Gordon says management can mark part-timer days in the app; confirm what exists.
- **Date range:** earliest and latest sales date, number of rows in the main sales table, and the list of counters and brand codes in use. Do brand codes match these: AD, ATHE, EM, GD11, TA, PH, PE, LA, NOVE, NE, KL, RF, ASD?
- **AEON:** does the app know AEON has two stores (KH and SK) under one counter or BA? How are they stored?
- **BA records:** is there a BA/staff table? Does it hold basic salary, full-time or part-time, counter, start date? (This is sensitive; say who can read it today.)
- Five anonymised sample rows from each key table (counter, sales, staff, brands).
- Time zone handling: how dates are stored and how "month" is defined.

## 4. Existing logic that overlaps
- Any commission or target logic already in the app (even partial or old).
- How "monthly sales" and "sales so far" are calculated in the code. Paste the function(s).
- Existing analytics or projection features (run-rate, forecast, charts). Paste the function(s).
- The list of API endpoints (method, path, one-line purpose). An OpenAPI/Swagger file is ideal if one exists.

## 5. Fit for the three new functions
For each function, tell me:
- Which existing tables/screens/endpoints you would reuse, and which new tables or fields you would add (name the fields).
- Where the biggest risk is (data missing, permissions, performance, a design limit).
- A rough size: small / medium / large, and why.
Also answer:
- Can the app hold a **monthly target per counter per brand**, with history and an audit trail (who set it, when)?
- Can it show **BA-only views** (a BA sees only her own counter and her own pay), and Brand Manager / Sales Manager views separate from BAs? What would need to change?
- Where should salary and commission figures live so they stay hidden from Brand Managers?
- Can it do **two-store counters** (AEON) cleanly?

## 6. Constraints and house rules
- Coding conventions, linting, naming, folder rules, and anything you would not want changed.
- Known bugs or technical debt that would affect these features.
- Anything in the app that depends on the current data model and would break if the sales table changed.
- How you prefer to receive a handoff (file format, level of detail, whether you want formulas as pseudo-code, a spreadsheet, or tests).

## What to send back
1. One Markdown reply answering sections 1 to 6.
2. The schema as a separate `.sql` or model file.
3. The OpenAPI file, if one exists.
4. The folder tree and screenshots (or descriptions) of each screen.
5. A short list of questions you would ask Gordon before building.

Gordon will pass your reply back to me. I will then write the build handoff with the exact rules, formulas, test cases and screen requirements.
