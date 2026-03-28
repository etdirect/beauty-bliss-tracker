import * as XLSX from "xlsx";

/** Column definition for typed export */
export interface ExcelCol<T> {
  header: string;
  key: keyof T | ((row: T) => string | number);
  width?: number;
  format?: "currency" | "number" | "percent" | "text";
}

/** Create and download an Excel workbook with multiple sheets */
export function downloadExcel(
  filename: string,
  sheets: { name: string; data: Record<string, any>[]; colWidths?: number[] }[],
) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data);

    // Auto-size columns
    if (sheet.colWidths) {
      ws["!cols"] = sheet.colWidths.map((w) => ({ wch: w }));
    } else if (sheet.data.length > 0) {
      const keys = Object.keys(sheet.data[0]);
      ws["!cols"] = keys.map((k) => ({
        wch: Math.max(
          k.length + 2,
          ...sheet.data.slice(0, 50).map((r) => String(r[k] ?? "").length + 2),
        ),
      }));
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31)); // Sheet name max 31 chars
  }

  XLSX.writeFile(wb, filename);
}

/** Format a date range for filenames */
export function dateRangeFilename(prefix: string, start: string, end: string) {
  return `${prefix}_${start}_to_${end}.xlsx`;
}

/** Format currency for export cells */
export function fmtCurrencyExport(v: number) {
  return Math.round(v * 100) / 100;
}

/** Format ATV/UPT — returns number or "—" */
export function fmtRatio(numerator: number, denominator: number, decimals = 1): string | number {
  if (denominator === 0) return "—";
  return Math.round((numerator / denominator) * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
