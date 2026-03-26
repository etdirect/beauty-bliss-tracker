# Beauty Bliss Sales Tracker — Build Spec

## Overview
A sales tracking web app for Beauty Bliss (a Hong Kong beauty distributor). Two main views:
1. **BA Entry** — Mobile-friendly daily sales entry for Beauty Advisors at department store counters
2. **Management Dashboard** — Desktop dashboard with charts, filters, and admin settings

## Data Model (shared/schema.ts)

### Counters
- id (auto-generated)
- name (e.g. "FACESSS Admiralty")
- isActive (boolean, for soft delete)

### Brands
- id (auto-generated)
- name (e.g. "Embryolisse")
- category ("Skincare" | "Haircare" | "Body Care" | "Others")
- isActive (boolean)

### CounterBrands (which brands are available at which counter)
- id
- counterId
- brandId

### SalesEntries
- id
- counterId
- brandId
- date (YYYY-MM-DD string)
- units (integer)
- amount (number, HKD)
- gwpCount (integer, number of GWPs given out — only relevant if a promotion is active)
- createdAt (timestamp)

### Promotions
- id
- name (e.g. "Embryolisse April GWP")
- brandId (nullable — null means cross-brand)
- type ("GWP" | "Discount" | "Bundle" | "Other")
- description (e.g. "Free gift with purchase of $300+")
- startDate (YYYY-MM-DD)
- endDate (YYYY-MM-DD)
- isActive (boolean)

### PromotionResults (daily tracking per counter per promotion)
- id
- promotionId
- counterId
- date (YYYY-MM-DD)
- gwpGiven (integer)
- notes (text, optional)

## Initial Seed Data

### Counters (7 real + 1 flexible):
1. FACESSS Admiralty
2. LOG-ON Causeway Bay
3. LOG-ON TST Harbour City
4. LOG-ON Mong Kok
5. LOG-ON Kowloon Tong
6. LOG-ON Sha Tin
7. SOGO Kai Tak

### Brands (from website):
1. Embryolisse (Skincare)
2. PHYTO (Haircare)
3. Novexpert (Skincare)
4. TALIKA (Skincare)
5. SAMPAR (Skincare)
6. Klorane (Haircare)
7. LADOR (Haircare)
8. PESTLO (Skincare)
9. Neutraderm (Skincare)
10. GESKE (Others)
11. ASDceuticals (Skincare)
12. elvis+elvin (Skincare)
13. Adopt (Body Care)
14. XPOSOME (Skincare)

All counters should have all brands enabled initially.

## Pages & Routes

### 1. BA Sales Entry (`/`)
- Mobile-first design
- Step 1: Select counter from dropdown
- Step 2: Select date (default today, allow picking previous dates)
- Step 3: For each brand available at that counter, show a row with:
  - Brand name
  - Units sold (number input)
  - Amount in HKD (number input)
  - If there's an active promotion for this brand on the selected date, show a "GWP Given" field
- Step 4: Submit button saves all entries
- Show confirmation toast on success
- Show any active promotions at the top as an info banner

### 2. Management Dashboard (`/dashboard`)
This is the main analytics view. Use sidebar navigation with these sections:

#### 2a. Daily Sales (`/dashboard`)
- Date picker (default today)
- KPI cards: Total Sales (HKD), Total Units, Number of Counters Reporting
- Table: Sales by counter showing each brand's units and amount
- Bar chart: Sales by brand for the day

#### 2b. Brand Analytics (`/dashboard/brands`)
- Date range picker
- Select brand(s) to compare
- Line chart: Daily sales trend for selected brands
- Table: Brand performance summary (total units, total amount, avg daily)

#### 2c. Counter Analytics (`/dashboard/counters`)
- Date range picker
- Select counter(s)
- Bar chart: Sales by brand per counter
- Table: Counter performance summary

#### 2d. Monthly Comparison (`/dashboard/monthly`)
- Month selector (compare 2 months)
- Side-by-side bar chart: Total sales by brand, month A vs month B
- Table with delta/change percentage

#### 2e. Promotions (`/dashboard/promotions`)
- List active and past promotions
- Create new promotion form (name, brand, type, description, start/end date)
- For each promotion: show performance card with total GWPs given, by counter breakdown
- Edit/deactivate promotion

#### 2f. Settings (`/dashboard/settings`)
- Manage counters: Add new counter, deactivate existing
- Manage brands: Add new brand (name + category), deactivate existing
- Manage counter-brand assignments: Toggle which brands are available at which counter (checkbox matrix)

## Design

### Color Palette
Beauty/cosmetics feel — soft rose-pink accent on clean white. NOT the default blue.
- Primary: Rose/blush pink (`340 65% 47%` light, `340 50% 65%` dark)
- Background: Clean white with slight warm tint
- Cards: Soft off-white
- Charts use a palette of rose, teal, gold, lavender, coral for brand differentiation

### Fonts
Use Inter for the body (already system-friendly). Sans-serif only for the dashboard.

### Key UX Points
- BA entry must be extremely simple — BAs are not tech-savvy, using phones
- Large touch targets on mobile (min 44px)
- Clear brand logos/colors would be nice but text labels are fine
- Dashboard should be information-dense but organized
- Use `font-variant-numeric: tabular-nums` for all number columns
