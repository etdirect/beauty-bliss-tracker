import { readFileSync } from "fs";
import { parseAeon, parseCashier, parseSplit, combineUploads } from "../server/channelImport";

const root = "artifacts/";
function load(name: string) {
  return readFileSync(root + name);
}
function sum(rows: { amount: number }[]) {
  return Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100;
}

const aeon = parseAeon(load("AEON sales report_202610.xlsx"));
console.log("AEON", sum(aeon.brandDoors), aeon.skuLines.reduce((s, r) => s + r.qty, 0), aeon.skuLines.length);

const logon = parseCashier(load("Logon sales report_202610.xlsx"), "LOGON");
console.log("LOGON products", sum(logon.brandDoors), "mother", sum(logon.motherDoors), logon.motherDoors.map(d => d.siteCode + ":" + d.amount).join(", "));

const logonSplit = parseSplit(load("Brand Analysis Calcuator (Logon - adjusted).xlsm"), "LOGON");
console.log("LOGON split result", sum(logonSplit.brandDoors), "sku", logonSplit.skuLines.length);

const sogo = parseCashier(load("Sogo sales report_202610.xlsx"), "SOGO");
console.log("SOGO products", sum(sogo.brandDoors), "mother", sum(sogo.motherDoors), sogo.motherDoors);

const sogoSplit = parseSplit(load("Brand Analysis Calcuator (Sogo adjusted).xlsm"), "SOGO");
console.log("SOGO split", sogoSplit.brandDoors.reduce((m, r) => { m[r.siteCode] = (m[r.siteCode] ?? 0) + r.amount; return m; }, {} as Record<string, number>));

const combined = combineUploads("LOGON", "2026-10", [
  { ...logon, id: "1", month: "2026-10", filename: "a", uploadedAt: "" },
  { ...logonSplit, id: "2", month: "2026-10", filename: "b", uploadedAt: "" },
]);
console.log("LOGON combined brands", sum(combined.brandDoors), "sku", combined.skuLines.length);

const expect = (name: string, got: number, want: number) => {
  if (Math.abs(got - want) > 0.05) {
    console.error("FAIL", name, got, "expected", want);
    process.exitCode = 1;
  } else console.log("ok", name, got);
};
expect("aeon", sum(aeon.brandDoors), 260238.82);
expect("logon products", sum(logon.brandDoors), 108768.9);
expect("logon mother", sum(logon.motherDoors), 426390);
expect("logon split", sum(logonSplit.brandDoors), 425862);
expect("sogo products", sum(sogo.brandDoors), 17749.5);
expect("sogo mother", sum(sogo.motherDoors), 338564.6);
expect("sogo cwb", Math.round((sogoSplit.brandDoors.filter(r => r.siteCode === "CWB").reduce((s, r) => s + r.amount, 0)) * 100) / 100, 338564.6);
expect("sogo ktk", Math.round((sogoSplit.brandDoors.filter(r => r.siteCode === "KTK").reduce((s, r) => s + r.amount, 0)) * 100) / 100, 130914);
