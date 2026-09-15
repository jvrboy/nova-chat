export type AssetClass = "fx" | "metal" | "index" | "synthetic";

export type Timeframe =
  | "1m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "8h"
  | "1d"
  | "1w";

export type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
export type Action = "BUY" | "SELL" | "WAIT" | "HOLD";
export type Direction = "BUY" | "SELL";

export type Bar = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SymbolInfo = {
  id: string;
  name: string;
  class: AssetClass;
  base: number;
  digits: number;
  pip: number;
  vol: number;
  drift: number;
};

export type Vote = {
  voter: string;
  direction: Action;
  confidence: number;
  weight: number;
  reason: string;
};

export type Zone = { level: number; touches: number };
export type Block = { index: number; open: number; close: number; high: number; low: number };
export type Gap = { startIndex: number; endIndex: number; gapLow: number; gapHigh: number };
export type Swing = { index: number; price: number };

export type TradePlan = {
  direction: Action;
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  riskReward: number;
  atr: number;
  calibrationTier: "atr_fallback";
};

export type JournalEntry = {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: Direction;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  note: string;
  createdAt: number;
  status: "open" | "closed";
  exit?: number;
  pnlR?: number;
};

export const TIMEFRAMES: Timeframe[] = [
  "1m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "8h",
  "1d",
  "1w",
];

export const TF_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "8h": 28_800_000,
  "1d": 86_400_000,
  "1w": 604_800_000,
};

export const TF_ORDER: Record<Timeframe, number> = {
  "1w": 0,
  "1d": 1,
  "8h": 2,
  "4h": 3,
  "2h": 4,
  "1h": 5,
  "30m": 6,
  "15m": 7,
  "5m": 8,
  "1m": 9,
};
