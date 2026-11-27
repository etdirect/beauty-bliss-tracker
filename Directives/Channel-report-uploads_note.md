# Channel report uploads — note

Date: 27 November 2026. Owner: Gordon Cheng.

## Mother code

Lines headed **HAIR CARE PROMOTION** are what the company calls a **mother code**.

A mother code is a promotion the counter offers the customer. The cashier records one amount and does not record the products. The real products are on the MOSES invoices. The term **mother code** may be used again for the same kind of line. Do not treat a mother-code line as a brand or a product. Do not add it on top of the invoice split, or those sales are counted twice.

## What each upload is for

Three results, used later as follows:

| Result | Used for |
|---|---|
| Sales by brand | Sales manager and brand managers set next month’s brand target |
| Sales by door | Same people set next month’s target, and the app works out each brand’s share of the door |
| SKU units and amount | Later check of monthly incentive targets. Not built yet |

A door total in dollars can come from the cashier file alone. A **brand** target cannot, when a mother code is in the file.

## AEON — one file

One upload. From that file take sales by brand, sales by door, and each SKU’s units and amount. Match the shop number to Settings by site code (001 Kornhill, 002 Skyline, 006 Kowloon Bay, 007 Whampoa, 210 Yau Tong). The amount column is the same basis as the figure a BA types.

## LOGON — two files, two upload tabs

Each tab tells the user which file to choose.

1. **Sales report.** Product lines give brand, door, units, and amount. Mother-code lines (HAIR CARE PROMOTION) are kept as a lump and are not treated as a brand.
2. **Mother-code split** (the adjusted brand workbook). Real products that were inside the mother code, for the doors that use it. October 2026 doors: 1106 Times Square, 1108 Festival Walk (又一城), 1112 Langham Place, 1128 Harbour City, 1131 New Town Plaza. The other LOGON doors are only in the sales report.

Combined brand and SKU figures = cashier lines where the product is named + the split file. The mother-code lump stays out of that sum.

The split workbook’s result matched the October mother-code lump by door (HK$425,862). The invoice lines themselves were HK$2,795.30 lower. Use the result that matches the cashier lump for brand targets. Discount on a split invoice is shared across the brands on that invoice, so the brand total is fit for targets. The dollar amount on a single SKU in that file is before that share-out.

## SOGO — two files, same pattern as LOGON

October 2026 sample. The mother code is the line **90699773 - BEAUTY BLISS-N1**, brand `0`, not the words HAIR CARE PROMOTION.

1. Sales report. This sample has Causeway Bay only. Named products are HK$17,749.50. The mother code is HK$338,564.60. No dates on the lines. Kai Tak is not in the line sheet.
2. Adjusted brand workbook. Causeway Bay matches that mother code to the cent. Kai Tak, HK$130,914, is only in this file.

The before-adjustment workbooks (SOGO and LOGON) use the same invoices. Their result equals the invoice total, before the small tie-out to the cashier lump (SOGO Causeway Bay HK$2,613.50, LOGON HK$2,795.30). Do not add an upload tab for them. Upload the adjusted file.
