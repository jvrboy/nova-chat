import { getSymbol } from "./symbols";
import type { Action, Bias, Timeframe } from "./types";

export function formatPrice(symbol: string, price: number): string {
  const info = getSymbol(symbol);
  return price.toFixed(info.digits);
}

export function formatPct(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function formatSigned(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
}

export function formatTime(ts: number, tf: Timeframe): string {
  const d = new Date(ts);
  if (tf === "1d" || tf === "1w") {
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
  }
  if (tf === "1h" || tf === "2h" || tf === "4h" || tf === "8h") {
    return d.toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function biasFromAction(action: Action): Bias {
  if (action === "BUY") return "BULLISH";
  if (action === "SELL") return "BEARISH";
  return "NEUTRAL";
}

export function actionFromBias(bias: Bias): Action {
  if (bias === "BULLISH") return "BUY";
  if (bias === "BEARISH") return "SELL";
  return "WAIT";
}

export function classLabel(cls: string): string {
  if (cls === "fx") return "FX";
  if (cls === "metal") return "Metal";
  if (cls === "index") return "Index";
  return "Synthetic";
}
