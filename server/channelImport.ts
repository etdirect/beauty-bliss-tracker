import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { isPostgres, storage, PgStorage } from "./storage";

export type Channel = "AEON" | "LOGON" | "SOGO";
export type UploadKind = "aeon" | "cashier" | "split";

export interface SkuLine {
  siteCode: string;
  brandCode: string;
  sku: string;
  name: string;
  qty: number;
  amount: number;
  /** net = till amount. before-invoice-discount = product line before the invoice discount is shared. */
  amountBasis: "net" | "before-invoice-discount";
  source: "aeon" | "cashier" | "split";
}

export interface BrandDoor {
  siteCode: string;
  brandCode: string;
  qty: number;
  amount: number;
}

export interface MotherDoor {
  siteCode: string;
  qty: number;
  amount: number;
  label: string;
}

export interface ParsedUpload {
  channel: Channel;
  kind: UploadKind;
  skuLines: SkuLine[];
  brandDoors: BrandDoor[];
  motherDoors: MotherDoor[];
  warnings: string[];
}

export interface StoredUpload extends ParsedUpload {
  id: string;
  month: string;
  filename: string;
  uploadedAt: string;
}

const BRAND_ALIAS: Record<string, string> = {
  AD: "AD",
  ASD: "ASD",
  AS: "ASD",
  AT: "AT",
  ATHE: "AT",
  EM: "EM",
  LA: "LA",
  NE: "NE",
  NO: "NOVE",
  NOVE: "NOVE",
  PH: "PH",
  PE: "PE",
  TA: "TA",
  GD: "GD",
  GD11: "GD",
  GE: "GE",
  RF: "RF",
  SAM: "SAM",
  BG: "BG",
  BH: "BH",
  BS: "BS",
  CP: "CP",
  KL: "KL",
  BB: "BB",
  XP: "XP",
  EE: "EE",
  A18: "A18",
};

export const BRAND_NAMES: Record<string, string> = {
  AD: "Adopt",
  ASD: "ASDceuticals",
  AT: "Athe",
  EM: "Embryolisse",
  LA: "Lador",
  NE: "Neutraderm",
  NOVE: "Novexpert",
  PH: "Phyto",
  PE: "Pestlo",
  TA: "Talika",
  GD: "GD11",
  GE: "Geske",
  RF: "Rene Furterer",
  SAM: "SAMPAR",
  BG: "BG",
  BH: "BH",
  BS: "BS",
  CP: "CP",
  KL: "Klorane",
  BB: "Beauty Bliss",
  XP: "Xposome",
  EE: "elvis+elvin",
  A18: "Addmino18",
};

/** Site code in the file -> initials and name, when Settings has not matched it yet. */
export const DOOR_FALLBACK: Record<string, { initials: string; name: string }> = {
  "001": { initials: "KH", name: "Kornhill" },
  "002": { initials: "SK", name: "Skyline" },
  "006": { initials: "KB", name: "Kowloon Bay" },
  "007": { initials: "WP", name: "Whampoa" },
  "210": { initials: "YT", name: "Yau Tong" },
  "1106": { initials: "TS", name: "Times Square" },
  "1108": { initials: "FW", name: "Festival Walk" },
  "1112": { initials: "LP", name: "Langham Place" },
  "1128": { initials: "HC", name: "Harbour City" },
  "1131": { initials: "NTP", name: "New Town Plaza" },
  CWB: { initials: "CWB", name: "Causeway Bay" },
  KTK: { initials: "KTK", name: "Kai Tak" },
};

const ACCOUNT_SITE: Record<string, string> = {
  A256: "1112",
  A259: "1106",
  A260: "1128",
  A261: "1131",
  A284: "1108",
  A577: "CWB",
  A578: "KTK",
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function num(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(text(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normHeader(value: unknown): string {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function findHeaderRow(rows: unknown[][], required: string[]): number {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const headers = (rows[i] ?? []).map(normHeader);
    if (required.every(name => headers.some(h => h.includes(name)))) return i;
  }
  return -1;
}

function col(header: unknown[], ...names: string[]): number {
  const headers = header.map(normHeader);
  for (const name of names) {
    const exact = headers.findIndex(h => h === name);
    if (exact >= 0) return exact;
  }
  for (const name of names) {
    const loose = headers.findIndex(h => h.includes(name));
    if (loose >= 0) return loose;
  }
  return -1;
}

export function brandCodeOf(value: unknown): string {
  const raw = text(value).toUpperCase().replace(/\s+/g, "");
  if (!raw || raw === "0") return "";
  return BRAND_ALIAS[raw] ?? raw;
}

export function isMotherCode(brand: unknown, description: unknown): boolean {
  const b = text(brand).toUpperCase();
  const d = text(description).toUpperCase();
  if (b === "HA" || b === "0") return true;
  if (d.includes("HAIR CARE PROMOTION")) return true;
  if (d.includes("BEAUTY BLISS-N1")) return true;
  return false;
}

export function motherLabel(description: unknown): string {
  const d = text(description).toUpperCase();
  if (d.includes("BEAUTY BLISS-N1")) return "BEAUTY BLISS-N1";
  if (d.includes("HAIR CARE PROMOTION")) return "HAIR CARE PROMOTION";
  return "Mother code";
}

function siteCodeOf(value: unknown): string {
  const raw = text(value).toUpperCase();
  if (!raw || raw === "#N/A") return "";
  if (/^\d+$/.test(raw)) {
    if (raw.length <= 3) return raw.padStart(3, "0");
    return raw;
  }
  return raw;
}

function sheetRows(wb: XLSX.WorkBook, name: string): unknown[][] {
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
}

function pickSheet(wb: XLSX.WorkBook, preferred: string[], headerNeedles: string[]): { name: string; rows: unknown[][] } | null {
  const names = [...preferred.filter(n => wb.SheetNames.includes(n)), ...wb.SheetNames];
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const rows = sheetRows(wb, name);
    if (findHeaderRow(rows, headerNeedles) >= 0) return { name, rows };
  }
  return null;
}

function addBrand(map: Map<string, BrandDoor>, siteCode: string, brandCode: string, qty: number, amount: number) {
  if (!siteCode || !brandCode) return;
  if (qty === 0 && amount === 0) return;
  const key = `${siteCode}|${brandCode}`;
  const row = map.get(key) ?? { siteCode, brandCode, qty: 0, amount: 0 };
  row.qty += qty;
  row.amount += amount;
  map.set(key, row);
}

function finishBrands(map: Map<string, BrandDoor>): BrandDoor[] {
  return Array.from(map.values()).map(row => ({ ...row, qty: round2(row.qty), amount: round2(row.amount) }));
}

export function parseAeon(buffer: Buffer): ParsedUpload {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const found = pickSheet(wb, ["工作表1"], ["store", "brand", "sales quantity"]);
  if (!found) throw new Error("This does not look like an AEON sales report. The sheet needs Store, Brand, and Sales Quantity columns.");
  const headerAt = findHeaderRow(found.rows, ["store", "brand", "sales quantity"]);
  const header = found.rows[headerAt] ?? [];
  const iStore = col(header, "store");
  const iItem = col(header, "item");
  const iName = col(header, "item name");
  const iQty = col(header, "sales quantity");
  const iAmt = col(header, "sales amount(w/o vat)", "sales amount");
  const iBrand = col(header, "brand");
  const iSg = col(header, "sg_code", "sg code");
  const iDesc = col(header, "sg desc");
  const brands = new Map<string, BrandDoor>();
  const skuLines: SkuLine[] = [];
  for (const row of found.rows.slice(headerAt + 1)) {
    const siteCode = siteCodeOf(row[iStore]);
    const brandCode = brandCodeOf(row[iBrand]);
    if (!siteCode || !brandCode) continue;
    const qty = num(row[iQty]);
    const amount = num(row[iAmt]);
    if (qty === 0 && amount === 0) continue;
    const name = text(row[iName]) || text(row[iDesc]);
    skuLines.push({
      siteCode, brandCode, sku: text(row[iSg]) || text(row[iItem]), name,
      qty, amount: round2(amount), amountBasis: "net", source: "aeon",
    });
    addBrand(brands, siteCode, brandCode, qty, amount);
  }
  if (skuLines.length === 0) throw new Error("No product lines were found in the AEON report.");
  return { channel: "AEON", kind: "aeon", skuLines, brandDoors: finishBrands(brands), motherDoors: [], warnings: [] };
}

export function parseCashier(buffer: Buffer, channel: "LOGON" | "SOGO"): ParsedUpload {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const found = pickSheet(wb, ["Sheet1"], ["site", "sales qty", "sales amt", "brand"]);
  if (!found) throw new Error(`This does not look like a ${channel} cashier report. It needs Site, Sales Qty, Sales Amt, and Brand columns.`);
  const headerAt = findHeaderRow(found.rows, ["site", "sales qty", "brand"]);
  const header = found.rows[headerAt] ?? [];
  const iSite = col(header, "site");
  const iDesc = col(header, "article description");
  const iQty = col(header, "sales qty");
  const iAmt = col(header, "sales amt");
  const iBrand = col(header, "brand");
  const iSg = col(header, "sg code");
  const brands = new Map<string, BrandDoor>();
  const mothers = new Map<string, MotherDoor>();
  const skuLines: SkuLine[] = [];
  for (const row of found.rows.slice(headerAt + 1)) {
    const siteCode = siteCodeOf(row[iSite]);
    if (!siteCode) continue;
    const description = text(row[iDesc]);
    const qty = num(row[iQty]);
    const amount = num(row[iAmt]);
    if (qty === 0 && amount === 0 && !description) continue;
    if (isMotherCode(row[iBrand], description)) {
      const label = motherLabel(description);
      const existing = mothers.get(siteCode) ?? { siteCode, qty: 0, amount: 0, label };
      existing.qty += qty;
      existing.amount += amount;
      mothers.set(siteCode, existing);
      continue;
    }
    const brandCode = brandCodeOf(row[iBrand]);
    if (!brandCode) continue;
    skuLines.push({
      siteCode, brandCode, sku: text(row[iSg]), name: description,
      qty, amount: round2(amount), amountBasis: "net", source: "cashier",
    });
    addBrand(brands, siteCode, brandCode, qty, amount);
  }
  const motherDoors = Array.from(mothers.values()).map(row => ({ ...row, qty: round2(row.qty), amount: round2(row.amount) }));
  if (skuLines.length === 0 && motherDoors.length === 0) throw new Error("No sales lines were found in the cashier report.");
  return { channel, kind: "cashier", skuLines, brandDoors: finishBrands(brands), motherDoors, warnings: [] };
}

function doorFromResultName(account: string, name: string): string {
  const accountCode = text(account).toUpperCase();
  if (ACCOUNT_SITE[accountCode]) return ACCOUNT_SITE[accountCode];
  const four = name.match(/\b(\d{4})\b/);
  if (four) return four[1];
  const letters = name.toUpperCase().match(/\b(CWB|KTK)\b/);
  if (letters) return letters[1];
  return accountCode;
}

export function parseSplit(buffer: Buffer, channel: "LOGON" | "SOGO"): ParsedUpload {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (!wb.SheetNames.includes("Sales") || !wb.SheetNames.includes("result")) {
    throw new Error("This does not look like the adjusted brand workbook. It needs a Sales sheet and a result sheet.");
  }
  const sales = sheetRows(wb, "Sales");
  const salesHeaderAt = findHeaderRow(sales, ["inv num", "brand", "sales amount"]);
  if (salesHeaderAt < 0) throw new Error("The Sales sheet is missing Inv Num, Brand, or Sales Amount.");
  const header = sales[salesHeaderAt] ?? [];
  const iAccount = col(header, "account num");
  const iName = col(header, "name of company/individual");
  const iBrand = col(header, "brand");
  const iSku = col(header, "item code");
  const iItem = col(header, "item name for internal reference");
  const iQty = col(header, "qty");
  const iAmt = col(header, "sales amount");
  const skuLines: SkuLine[] = [];
  for (const row of sales.slice(salesHeaderAt + 1)) {
    if (!text(row[1]) && !text(row[iBrand])) continue;
    if (!text(row[iBrand])) continue;
    const brandCode = brandCodeOf(row[iBrand]);
    if (!brandCode) continue;
    const siteCode = doorFromResultName(text(row[iAccount]), text(row[iName]));
    const qty = num(row[iQty]);
    const amount = num(row[iAmt]);
    if (qty === 0 && amount === 0) continue;
    skuLines.push({
      siteCode, brandCode, sku: text(row[iSku]), name: text(row[iItem]),
      qty, amount: round2(amount), amountBasis: "before-invoice-discount", source: "split",
    });
  }

  const result = sheetRows(wb, "result");
  const resultHeaderAt = findHeaderRow(result, ["account num"]);
  if (resultHeaderAt < 0) throw new Error("The result sheet has no Account Num column.");
  const resultHeader = result[resultHeaderAt] ?? [];
  const brandCols: { index: number; code: string }[] = [];
  resultHeader.forEach((cell, index) => {
    if (index < 2) return;
    const code = brandCodeOf(cell);
    if (code) brandCols.push({ index, code });
  });
  const brands = new Map<string, BrandDoor>();
  for (const row of result.slice(resultHeaderAt + 1)) {
    const account = text(row[0]);
    const name = text(row[1]);
    if (!account && !name) continue;
    const siteCode = doorFromResultName(account, name);
    for (const { index, code } of brandCols) {
      const amount = num(row[index]);
      addBrand(brands, siteCode, code, 0, amount);
    }
  }
  const warnings: string[] = [];
  if (skuLines.length === 0) warnings.push("No product lines were read from the Sales sheet.");
  if (brands.size === 0) throw new Error("The result sheet has no brand totals.");
  return { channel, kind: "split", skuLines, brandDoors: finishBrands(brands), motherDoors: [], warnings };
}

export function parseUpload(buffer: Buffer, channel: Channel, kind: UploadKind): ParsedUpload {
  if (channel === "AEON") {
    if (kind !== "aeon") throw new Error("AEON uses a single sales report.");
    return parseAeon(buffer);
  }
  if (kind === "cashier") return parseCashier(buffer, channel);
  if (kind === "split") return parseSplit(buffer, channel);
  throw new Error("Choose the cashier report or the adjusted brand workbook.");
}

const memory: StoredUpload[] = [];
let tableReady = false;

async function query(sql: string, params: unknown[] = []): Promise<{ rows: any[] }> {
  if (isPostgres && storage instanceof PgStorage) {
    const result = await storage.query(sql, params as any[]);
    return { rows: result.rows };
  }
  return { rows: [] };
}

async function ensureTable() {
  if (!isPostgres || tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS channel_uploads (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      month TEXT NOT NULL,
      kind TEXT NOT NULL,
      filename TEXT,
      uploaded_at TEXT NOT NULL,
      payload TEXT NOT NULL,
      UNIQUE (channel, month, kind)
    )
  `);
  tableReady = true;
}

function payloadOf(row: StoredUpload): ParsedUpload {
  return {
    channel: row.channel,
    kind: row.kind,
    skuLines: row.skuLines,
    brandDoors: row.brandDoors,
    motherDoors: row.motherDoors,
    warnings: row.warnings,
  };
}

export async function saveUpload(month: string, filename: string, parsed: ParsedUpload): Promise<StoredUpload> {
  const stored: StoredUpload = {
    ...parsed,
    id: randomUUID(),
    month,
    filename,
    uploadedAt: new Date().toISOString(),
  };
  const idx = memory.findIndex(row => row.channel === parsed.channel && row.month === month && row.kind === parsed.kind);
  if (idx >= 0) memory[idx] = stored;
  else memory.push(stored);
  if (isPostgres) {
    await ensureTable();
    await query(
      `INSERT INTO channel_uploads (id, channel, month, kind, filename, uploaded_at, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (channel, month, kind)
       DO UPDATE SET id = EXCLUDED.id, filename = EXCLUDED.filename, uploaded_at = EXCLUDED.uploaded_at, payload = EXCLUDED.payload`,
      [stored.id, stored.channel, stored.month, stored.kind, stored.filename, stored.uploadedAt, JSON.stringify(payloadOf(stored))],
    );
  }
  return stored;
}

export async function listUploads(channel: Channel, month: string): Promise<StoredUpload[]> {
  if (isPostgres) {
    await ensureTable();
    const { rows } = await query(
      `SELECT id, channel, month, kind, filename, uploaded_at, payload FROM channel_uploads WHERE channel = $1 AND month = $2`,
      [channel, month],
    );
    return rows.map((row: any) => {
      const payload = JSON.parse(row.payload) as ParsedUpload;
      return {
        ...payload,
        id: row.id,
        month: row.month,
        filename: row.filename ?? "",
        uploadedAt: row.uploaded_at,
      };
    });
  }
  return memory.filter(row => row.channel === channel && row.month === month);
}

export interface CombinedReport {
  channel: Channel;
  month: string;
  uploads: { kind: UploadKind; filename: string; uploadedAt: string }[];
  brandDoors: BrandDoor[];
  skuLines: SkuLine[];
  motherDoors: MotherDoor[];
  splitDoors: { siteCode: string; amount: number }[];
  warnings: string[];
}

export function combineUploads(channel: Channel, month: string, uploads: StoredUpload[]): CombinedReport {
  const cashier = uploads.find(row => row.kind === "cashier" || row.kind === "aeon");
  const split = uploads.find(row => row.kind === "split");
  const brands = new Map<string, BrandDoor>();
  for (const row of cashier?.brandDoors ?? []) addBrand(brands, row.siteCode, row.brandCode, row.qty, row.amount);
  for (const row of split?.brandDoors ?? []) addBrand(brands, row.siteCode, row.brandCode, row.qty, row.amount);
  const skuLines = [...(cashier?.skuLines ?? []), ...(split?.skuLines ?? [])];
  const splitByDoor = new Map<string, number>();
  for (const row of split?.brandDoors ?? []) splitByDoor.set(row.siteCode, (splitByDoor.get(row.siteCode) ?? 0) + row.amount);
  const warnings = uploads.flatMap(row => row.warnings);
  if ((channel === "LOGON" || channel === "SOGO") && cashier && !split && (cashier.motherDoors?.length ?? 0) > 0) {
    warnings.push("A mother code is in the cashier report. Upload the adjusted brand workbook before using these figures for brand targets.");
  }
  if (split) {
    for (const mother of cashier?.motherDoors ?? []) {
      if (!splitByDoor.has(mother.siteCode)) {
        warnings.push(`${mother.siteCode} has a mother code of HK$${mother.amount.toLocaleString("en-HK")} and that door is not in the adjusted file.`);
      }
    }
  }
  return {
    channel,
    month,
    uploads: uploads.map(row => ({ kind: row.kind, filename: row.filename, uploadedAt: row.uploadedAt })),
    brandDoors: finishBrands(brands),
    skuLines,
    motherDoors: cashier?.motherDoors ?? [],
    splitDoors: Array.from(splitByDoor.entries()).map(([siteCode, amount]) => ({ siteCode, amount: round2(amount) })),
    warnings,
  };
}
