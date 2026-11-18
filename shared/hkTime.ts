/** Hong Kong has no daylight saving. Shift UTC by +8 hours and read UTC fields. */

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

export function hkToday(now = new Date()): string {
  const hk = new Date(now.getTime() + HK_OFFSET_MS);
  const y = hk.getUTCFullYear();
  const m = String(hk.getUTCMonth() + 1).padStart(2, "0");
  const d = String(hk.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function hkMonth(now = new Date()): string {
  return hkToday(now).slice(0, 7);
}

export function hkTimestamp(now = new Date()): string {
  return `${hkToday(now)}T${hkClock(now)}`;
}

function hkClock(now: Date): string {
  const hk = new Date(now.getTime() + HK_OFFSET_MS);
  const h = String(hk.getUTCHours()).padStart(2, "0");
  const min = String(hk.getUTCMinutes()).padStart(2, "0");
  const s = String(hk.getUTCSeconds()).padStart(2, "0");
  return `${h}:${min}:${s}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDates(month: string): string[] {
  const n = daysInMonth(month);
  const [y, m] = month.split("-");
  return Array.from({ length: n }, (_, i) => `${y}-${m}-${String(i + 1).padStart(2, "0")}`);
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

/** The `count` calendar months before `month`, oldest first. */
export function previousMonths(month: string, count = 3): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStepIndex(startMonth: string, month: string): number {
  const [sy, sm] = startMonth.split("-").map(Number);
  const [y, m] = month.split("-").map(Number);
  return (y - sy) * 12 + (m - sm) + 1;
}

export function nextCalendarDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Whole Hong Kong dollars for display. Calculations stay unrounded. */
export function formatHk(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const rounded = Math.round(n);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}HK$${Math.abs(rounded).toLocaleString("en-HK")}`;
}
