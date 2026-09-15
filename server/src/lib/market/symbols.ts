import type { SymbolInfo } from "./types";

export const SYMBOLS: SymbolInfo[] = [
  { id: "EURUSD", name: "Euro / US Dollar", class: "fx", base: 1.0842, digits: 5, pip: 0.0001, vol: 0.07, drift: 0.01 },
  { id: "GBPUSD", name: "Pound / US Dollar", class: "fx", base: 1.2718, digits: 5, pip: 0.0001, vol: 0.09, drift: -0.005 },
  { id: "USDJPY", name: "US Dollar / Yen", class: "fx", base: 149.62, digits: 3, pip: 0.01, vol: 0.08, drift: 0.02 },
  { id: "USDCHF", name: "US Dollar / Franc", class: "fx", base: 0.8814, digits: 5, pip: 0.0001, vol: 0.07, drift: 0.0 },
  { id: "AUDUSD", name: "Aussie / US Dollar", class: "fx", base: 0.6588, digits: 5, pip: 0.0001, vol: 0.1, drift: -0.01 },
  { id: "USDCAD", name: "US Dollar / Loonie", class: "fx", base: 1.3612, digits: 5, pip: 0.0001, vol: 0.08, drift: 0.005 },
  { id: "AUDCAD", name: "Aussie / Loonie", class: "fx", base: 0.8964, digits: 5, pip: 0.0001, vol: 0.09, drift: 0.0 },
  { id: "XAUUSD", name: "Gold", class: "metal", base: 2386.4, digits: 2, pip: 0.1, vol: 0.16, drift: 0.04 },
  { id: "XAGUSD", name: "Silver", class: "metal", base: 28.42, digits: 3, pip: 0.01, vol: 0.22, drift: 0.03 },
  { id: "US500", name: "S&P 500", class: "index", base: 5482, digits: 1, pip: 0.1, vol: 0.14, drift: 0.06 },
  { id: "US30", name: "Dow Jones", class: "index", base: 39840, digits: 0, pip: 1, vol: 0.13, drift: 0.05 },
  { id: "VOL10", name: "Volatility 10", class: "synthetic", base: 6320, digits: 2, pip: 0.01, vol: 0.1, drift: 0.02 },
  { id: "VOL25", name: "Volatility 25", class: "synthetic", base: 4188, digits: 2, pip: 0.01, vol: 0.25, drift: 0.0 },
  { id: "VOL50", name: "Volatility 50", class: "synthetic", base: 2154, digits: 2, pip: 0.01, vol: 0.5, drift: -0.02 },
  { id: "VOL75", name: "Volatility 75", class: "synthetic", base: 892, digits: 2, pip: 0.01, vol: 0.75, drift: 0.01 },
  { id: "VOL100", name: "Volatility 100", class: "synthetic", base: 1540, digits: 2, pip: 0.01, vol: 1.0, drift: 0.0 },
  { id: "VOLATILITY_5", name: "Volatility 5 (1s)", class: "synthetic", base: 980, digits: 2, pip: 0.01, vol: 0.05, drift: 0.01 },
  { id: "VOLATILITY_10", name: "Volatility 10 (1s)", class: "synthetic", base: 1124, digits: 2, pip: 0.01, vol: 0.1, drift: 0.01 },
  { id: "VOLATILITY_30", name: "Volatility 30 (1s)", class: "synthetic", base: 1640, digits: 2, pip: 0.01, vol: 0.3, drift: 0.0 },
  { id: "VOLATILITY_50", name: "Volatility 50 (1s)", class: "synthetic", base: 2210, digits: 2, pip: 0.01, vol: 0.5, drift: 0.0 },
  { id: "VOLATILITY_75", name: "Volatility 75 (1s)", class: "synthetic", base: 3055, digits: 2, pip: 0.01, vol: 0.75, drift: -0.01 },
  { id: "VOLATILITY_90", name: "Volatility 90 (1s)", class: "synthetic", base: 4470, digits: 2, pip: 0.01, vol: 0.9, drift: 0.0 },
  { id: "DRIFT_SWITCH_10", name: "Drift Switch 10", class: "synthetic", base: 5120, digits: 2, pip: 0.01, vol: 0.12, drift: 0.08 },
  { id: "DRIFT_SWITCH_20", name: "Drift Switch 20", class: "synthetic", base: 3880, digits: 2, pip: 0.01, vol: 0.2, drift: -0.06 },
  { id: "DRIFT_SWITCH_30", name: "Drift Switch 30", class: "synthetic", base: 2740, digits: 2, pip: 0.01, vol: 0.3, drift: 0.04 },
];

export const SYMBOL_MAP = new Map(SYMBOLS.map((s) => [s.id, s]));

export function getSymbol(id: string): SymbolInfo {
  return SYMBOL_MAP.get(id.toUpperCase()) ?? SYMBOLS[0];
}

export const SMT_PAIRS: { a: string; b: string; corr: "pos" | "neg"; label: string }[] = [
  { a: "XAUUSD", b: "XAGUSD", corr: "pos", label: "Gold / Silver" },
  { a: "EURUSD", b: "GBPUSD", corr: "pos", label: "Euro / Pound" },
  { a: "EURUSD", b: "USDCHF", corr: "neg", label: "Euro / Franc" },
  { a: "AUDUSD", b: "USDCAD", corr: "neg", label: "Aussie / Loonie" },
  { a: "US500", b: "US30", corr: "pos", label: "S&P / Dow" },
  { a: "XAUUSD", b: "USDJPY", corr: "neg", label: "Gold / Yen" },
];
