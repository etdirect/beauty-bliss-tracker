"""One-off extract. Regenerates server/aeonUnits202610.ts from the AEON workbook."""
import json
from collections import defaultdict

import openpyxl

SRC = r"c:\Github-Repo\Counter-sales-tracker\beauty-bliss-tracker\artifacts\AEON sales report_202610.xlsx"
OUT = r"c:\Github-Repo\Counter-sales-tracker\beauty-bliss-tracker\server\aeonUnits202610.ts"

wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)
ws = wb["工作表1"]
agg = defaultdict(lambda: [0.0, 0.0])


def clean(value):
    if value is None or value == 0 or value == "0":
        return ""
    return str(value).strip()


for row in ws.iter_rows(min_row=2, values_only=True):
    store, item, name, qty, amt, brand, sg, desc = (
        row[1], row[5], row[6], row[7], row[8], row[9], row[10], row[11],
    )
    if store in (None, "") or brand in (None, "", "0", 0):
        continue
    if not item and not name:
        continue
    key = (str(store).strip(), str(brand).strip(), clean(item), clean(sg), clean(name), clean(desc))
    agg[key][0] += float(qty or 0)
    agg[key][1] += float(amt or 0)

rows = []
for (site, brand, aeon, sg, name, desc), (qty, amt) in sorted(
    agg.items(), key=lambda kv: (kv[0][0], kv[0][1], -kv[1][1], kv[0][4])
):
    rows.append({
        "siteCode": site,
        "brandCode": brand,
        "aeonCode": aeon,
        "sgCode": sg,
        "name": name,
        "nameEn": desc,
        "qty": round(qty, 2),
        "amount": round(amt, 2),
    })

header = """/** October 2026 AEON item lines, summed from the AEON sales report sheet 工作表1. */
export interface AeonUnitLine {
  siteCode: string;
  brandCode: string;
  aeonCode: string;
  sgCode: string;
  name: string;
  nameEn: string;
  qty: number;
  amount: number;
}

export const AEON_UNITS_MONTH = "2026-10";

export const aeonUnitLines: AeonUnitLine[] = """

with open(OUT, "w", encoding="utf-8") as handle:
    handle.write(header)
    handle.write(json.dumps(rows, ensure_ascii=False, indent=2))
    handle.write(";\n")

qty = round(sum(row["qty"] for row in rows), 2)
amt = round(sum(row["amount"] for row in rows), 2)
print(f"lines {len(rows)} qty {qty} amount {amt}")
