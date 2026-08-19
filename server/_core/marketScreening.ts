import { indicatorSuite } from "./technicalIndicators";
import type { AdvancedCandle } from "./technicalAdvanced";

export type ScreeningAsset = { symbol: string; assetClass: "crypto" | "stock"; candles: AdvancedCandle[]; asOf?: string };
export type ScreeningResult = { symbol: string; assetClass: string; asOf: string; score: number; bias: "bullish" | "bearish" | "neutral"; factors: Record<string, number>; caveats: string[] };

export function screenMarketAssets(assets: ScreeningAsset[], requestedIndicators?: string[]): ScreeningResult[] {
  return assets.slice(0, 100).map(asset => {
    if (!asset.candles.length) return { symbol: asset.symbol, assetClass: asset.assetClass, asOf: asset.asOf ?? new Date().toISOString(), score: 0, bias: "neutral" as const, factors: {} as Record<string, number>, caveats: ["No OHLCV candles were supplied"] };
    const indicators = indicatorSuite(asset.candles, requestedIndicators ?? ["sma", "ema", "rsi", "adx", "vwap", "volatility", "zscore"]);
    const close = asset.candles.at(-1)?.close ?? 0;
    const sma = Number((indicators.sma as { value?: number })?.value ?? close);
    const ema = Number((indicators.ema as { value?: number })?.value ?? close);
    const rsi = Number((indicators.rsi as { value?: number })?.value ?? 50);
    const adx = Number((indicators.adx as { adx?: number })?.adx ?? 0);
    const vwap = Number((indicators.vwap as { value?: number })?.value ?? close);
    const zscore = Number((indicators.zscore as { value?: number })?.value ?? 0);
    const trend = close >= sma && close >= ema ? 1 : close <= sma && close <= ema ? -1 : 0;
    const momentum = rsi >= 55 ? 1 : rsi <= 45 ? -1 : 0;
    const participation = close >= vwap ? 1 : -1;
    const score = Math.max(-1, Math.min(1, (trend * .35 + momentum * .3 + participation * .2 + Math.sign(zscore) * .15) * Math.min(1, .35 + adx / 100)));
    const bias: ScreeningResult["bias"] = score > .2 ? "bullish" : score < -.2 ? "bearish" : "neutral";
    return { symbol: asset.symbol, assetClass: asset.assetClass, asOf: asset.asOf ?? new Date().toISOString(), score, bias, factors: { trend, momentum, participation, adx, rsi, zscore }, caveats: ["Screening is descriptive, not a forecast", "Results depend on candle quality, timeframe, fees, liquidity, and regime", asset.assetClass === "crypto" ? "Crypto markets can trade continuously and exhibit elevated gap/liquidity risk" : "Equity data may be exchange-session dependent"] };
  }).sort((a, b) => b.score - a.score);
}

export function marketScreenSummary(results: ScreeningResult[]) { const bullish = results.filter(r => r.bias === "bullish").length; const bearish = results.filter(r => r.bias === "bearish").length; return { count: results.length, bullish, bearish, neutral: results.length - bullish - bearish, leaders: results.slice(0, 5).map(r => ({ symbol: r.symbol, score: r.score, bias: r.bias })), generatedAt: new Date().toISOString(), disclaimer: "This is a research screen, not investment advice or an execution signal." }; }
