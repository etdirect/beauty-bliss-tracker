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
  { code: "TS", name: "LOGON Times Square", channel: "LOGON", tierTable: "L", tradeMargin: 0.37, minTarget: 83086, shops: ["TS"] },
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

/** LOG and LOGON are the same channel. The settings screen shows the first three letters (SOG/CWB). */
export function channelKey(value: string): string {
  const letters = value.toUpperCase().replace(/[^A-Z]/g, "");
  if (letters.startsWith("LOG")) return "LOGON";
  if (letters.startsWith("SOG")) return "SOGO";
  if (letters.startsWith("AEO")) return "AEON";
  return letters;
}

const SHOP_NAME_HINTS: Record<string, RegExp> = {
  TS: /times?\s*square/i,
  HC: /harbour\s*city|harbor\s*city/i,
  FW: /fashion\s*walk/i,
  LP: /langham/i,
  NTP: /new\s*town\s*plaza/i,
  CWB: /causeway/i,
  KTK: /kai\s*tak/i,
};

function shopCodeOf(storeCode: string): string {
  const code = storeCode.toUpperCase().trim();
  return code.split(/[/_\s-]+/).filter(Boolean).pop() ?? code;
}

/** Match a live shop. Does not create shops. */
export function matchPos(locations: PosLike[], channel: string, shopCode: string): PosLike | undefined {
  const wantChannel = channelKey(channel);
  const wantShop = shopCode.toUpperCase();
  const inChannel = locations.filter(pos => channelKey(pos.salesChannel) === wantChannel);
  const byCode = inChannel.find(pos => shopCodeOf(pos.storeCode) === wantShop || pos.storeCode.toUpperCase().trim() === wantShop);
  if (byCode) return byCode;
  const hint = SHOP_NAME_HINTS[wantShop];
  if (!hint) return undefined;
  return inChannel.find(pos => hint.test(pos.storeName ?? ""));
}

export function counterLabel(channel: string, storeName: string | null | undefined, fallback: string): string {
  const name = (storeName ?? "").trim();
  if (!name) return fallback;
  if (channelKey(name) === channelKey(channel)) return name;
  return `${channel} ${name}`;
}

export function isAeonCounter(code: string, shopCount: number): boolean {
  return code === "AEON" || shopCount > 1;
}
