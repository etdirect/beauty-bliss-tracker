/** Counters in the December 2026 commission scheme. Shops are not created here. */

export interface SchemeSeed {
  code: string;
  name: string;
  channel: string;
  tierTable: "L" | "S";
  tradeMargin: number;
  minTarget: number;
  shops: string[];
}

export const SCHEME_COUNTERS: SchemeSeed[] = [
  { code: "HC", name: "LOGON Harbour City", channel: "LOGON", tierTable: "L", tradeMargin: 0.37, minTarget: 83086, shops: ["HC"] },
  { code: "FW", name: "LOGON Fashion Walk", channel: "LOGON", tierTable: "L", tradeMargin: 0.37, minTarget: 83086, shops: ["FW"] },
  { code: "LP", name: "LOGON Langham Place", channel: "LOGON", tierTable: "L", tradeMargin: 0.37, minTarget: 83086, shops: ["LP"] },
  { code: "NTP", name: "LOGON New Town Plaza", channel: "LOGON", tierTable: "L", tradeMargin: 0.37, minTarget: 83086, shops: ["NTP"] },
  { code: "TS", name: "LOGON Tsim Sha Tsui", channel: "LOGON", tierTable: "L", tradeMargin: 0.37, minTarget: 83086, shops: ["TS"] },
  { code: "CWB", name: "SOGO Causeway Bay", channel: "SOGO", tierTable: "S", tradeMargin: 0.28, minTarget: 57031, shops: ["CWB"] },
  { code: "KTK", name: "SOGO Kai Tak", channel: "SOGO", tierTable: "S", tradeMargin: 0.16, minTarget: 40216, shops: ["KTK"] },
  { code: "AEON", name: "AEON", channel: "AEON", tierTable: "L", tradeMargin: 0.35, minTarget: 75429, shops: ["KH", "SK"] },
];

export const PRIORITY_CODES: Record<string, string[]> = {
  LOGON: ["AD", "ATHE", "EM", "GD11", "TA", "PH", "PE", "LA", "NOVE", "NE"],
  SOGO: ["AD", "ATHE", "EM", "GD11", "TA", "PH", "PE", "LA", "NOVE", "NE"],
  AEON: ["AD", "EM", "LA", "PH", "NE", "NOVE"],
};

const BRAND_ALIASES: Record<string, string[]> = {
  AD: ["adopt"],
  ATHE: ["athe"],
  EM: ["embryolisse"],
  GD11: ["gd11"],
  TA: ["talika"],
  PH: ["phyto"],
  PE: ["pestlo"],
  LA: ["lador"],
  NOVE: ["novexpert"],
  NE: ["neutraderm"],
};

export function normToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function brandMatchesCode(brandName: string, code: string): boolean {
  const name = normToken(brandName);
  const aliases = BRAND_ALIASES[code] ?? [code.toLowerCase()];
  return aliases.some(alias => name === normToken(alias));
}

export interface PosLike {
  id: string;
  salesChannel: string;
  storeCode: string;
  storeName?: string;
}

/** Match a live shop. Does not create shops. HC matches store code HC or LOG/HC, not a longer code. */
export function matchPos(locations: PosLike[], channel: string, shopCode: string): PosLike | undefined {
  const wantChannel = channel.toUpperCase();
  const wantShop = shopCode.toUpperCase();
  return locations.find(pos => {
    const ch = pos.salesChannel.toUpperCase();
    if (ch !== wantChannel && !ch.includes(wantChannel)) return false;
    const code = pos.storeCode.toUpperCase().trim();
    const last = code.split(/[/_\s-]+/).filter(Boolean).pop() ?? code;
    return code === wantShop || last === wantShop;
  });
}

export function isAeonCounter(code: string, shopCount: number): boolean {
  return code === "AEON" || shopCount > 1;
}
