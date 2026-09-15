import type { Bar } from "./types";

export type SeriesMap = Record<string, number[]>;

function closes(bars: Bar[]) {
  return bars.map((b) => b.close);
}
function highs(bars: Bar[]) {
  return bars.map((b) => b.high);
}
function lows(bars: Bar[]) {
  return bars.map((b) => b.low);
}
function opens(bars: Bar[]) {
  return bars.map((b) => b.open);
}
function vols(bars: Bar[]) {
  return bars.map((b) => b.volume);
}

export function ema(data: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out = new Array<number>(data.length);
  out[0] = data[0] ?? 0;
  for (let i = 1; i < data.length; i++) out[i] = data[i] * k + out[i - 1] * (1 - k);
  return out;
}

export function sma(data: number[], n: number): number[] {
  const out = new Array<number>(data.length);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= n) sum -= data[i - n];
    out[i] = sum / Math.min(i + 1, n);
  }
  return out;
}

export function stdev(data: number[], n: number): number[] {
  const out = new Array<number>(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - n + 1);
    const slice = data.slice(start, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
    out[i] = Math.sqrt(v);
  }
  return out;
}

export function trueRange(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const prev = i > 0 ? bars[i - 1].close : bars[i].close;
    out[i] = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - prev),
      Math.abs(bars[i].low - prev),
    );
  }
  return out;
}

export function atr(bars: Bar[], n = 14): number[] {
  return ema(trueRange(bars), n);
}

export function rsi(data: number[], n = 14): number[] {
  const out = new Array<number>(data.length).fill(50);
  if (data.length < 2) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= Math.min(n, data.length - 1); i++) {
    const d = data[i] - data[i - 1];
    if (d >= 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= n;
  avgLoss /= n;
  out[Math.min(n, data.length - 1)] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = n + 1; i < data.length; i++) {
    const d = data[i] - data[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (n - 1) + gain) / n;
    avgLoss = (avgLoss * (n - 1) + loss) / n;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function macdLine(data: number[]): number[] {
  const e12 = ema(data, 12);
  const e26 = ema(data, 26);
  return e12.map((v, i) => v - e26[i]);
}

export function rollingMin(data: number[], n: number): number[] {
  const out = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) {
    let m = data[i];
    for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.min(m, data[j]);
    out[i] = m;
  }
  return out;
}

export function rollingMax(data: number[], n: number): number[] {
  const out = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) {
    let m = data[i];
    for (let j = Math.max(0, i - n + 1); j <= i; j++) m = Math.max(m, data[j]);
    out[i] = m;
  }
  return out;
}

function stoch(bars: Bar[], n = 14): number[] {
  const c = closes(bars);
  const h = rollingMax(highs(bars), n);
  const l = rollingMin(lows(bars), n);
  return c.map((v, i) => {
    const den = h[i] - l[i];
    return den === 0 ? 50 : (100 * (v - l[i])) / den;
  });
}

function adxBundle(bars: Bar[], n = 14) {
  const h = highs(bars);
  const l = lows(bars);
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      plusDM.push(0);
      minusDM.push(0);
      continue;
    }
    const up = h[i] - h[i - 1];
    const down = l[i - 1] - l[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const atrs = atr(bars, n);
  const pdi = ema(plusDM, n).map((v, i) => (atrs[i] ? (100 * v) / atrs[i] : 0));
  const mdi = ema(minusDM, n).map((v, i) => (atrs[i] ? (100 * v) / atrs[i] : 0));
  const dx = pdi.map((p, i) => {
    const s = p + mdi[i];
    return s === 0 ? 0 : (100 * Math.abs(p - mdi[i])) / s;
  });
  return { adx: ema(dx, n), pdi, mdi };
}

function linregSlopeSeries(data: number[], n = 20): number[] {
  const out = new Array<number>(data.length).fill(0);
  for (let i = 1; i < data.length; i++) {
    const start = Math.max(0, i - n + 1);
    const slice = data.slice(start, i + 1);
    const m = slice.length;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;
    for (let k = 0; k < m; k++) {
      sumX += k;
      sumY += slice[k];
      sumXY += k * slice[k];
      sumXX += k * k;
    }
    const den = m * sumXX - sumX * sumX;
    out[i] = den === 0 ? 0 : (m * sumXY - sumX * sumY) / den;
  }
  return out;
}

function wma(data: number[], n: number): number[] {
  const out = new Array<number>(data.length);
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - n + 1);
    let num = 0;
    let den = 0;
    let w = 1;
    for (let j = start; j <= i; j++, w++) {
      num += data[j] * w;
      den += w;
    }
    out[i] = den ? num / den : data[i];
  }
  return out;
}

function hma(data: number[], n = 20): number[] {
  const half = Math.max(1, Math.floor(n / 2));
  const sqrt = Math.max(1, Math.round(Math.sqrt(n)));
  const w1 = wma(data, half);
  const w2 = wma(data, n);
  const diff = w1.map((v, i) => 2 * v - w2[i]);
  return wma(diff, sqrt);
}

function cci(bars: Bar[], n = 20): number[] {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const mid = sma(tp, n);
  const out = new Array<number>(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - n + 1);
    let mad = 0;
    for (let j = start; j <= i; j++) mad += Math.abs(tp[j] - mid[i]);
    mad /= i - start + 1;
    out[i] = mad === 0 ? 0 : (tp[i] - mid[i]) / (0.015 * mad);
  }
  return out;
}

function willr(bars: Bar[], n = 14): number[] {
  const h = rollingMax(highs(bars), n);
  const l = rollingMin(lows(bars), n);
  return bars.map((b, i) => {
    const den = h[i] - l[i];
    return den === 0 ? -50 : (-100 * (h[i] - b.close)) / den;
  });
}

function mfi(bars: Bar[], n = 14): number[] {
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const out = new Array<number>(bars.length).fill(50);
  for (let i = 1; i < bars.length; i++) {
    let pos = 0;
    let neg = 0;
    const start = Math.max(1, i - n + 1);
    for (let j = start; j <= i; j++) {
      const flow = tp[j] * bars[j].volume;
      if (tp[j] > tp[j - 1]) pos += flow;
      else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

function fisher(data: number[], n = 10): number[] {
  const out = new Array<number>(data.length).fill(0);
  let prev = 0;
  let prevF = 0;
  const mn = rollingMin(data, n);
  const mx = rollingMax(data, n);
  for (let i = 0; i < data.length; i++) {
    const den = mx[i] - mn[i];
    let x = den === 0 ? 0 : 0.33 * 2 * ((data[i] - mn[i]) / den - 0.5) + 0.67 * prev;
    x = Math.max(-0.999, Math.min(0.999, x));
    prev = x;
    const f = 0.5 * Math.log((1 + x) / (1 - x)) + 0.5 * prevF;
    prevF = f;
    out[i] = f;
  }
  return out;
}

function choppiness(bars: Bar[], n = 14): number[] {
  const tr = trueRange(bars);
  const h = rollingMax(highs(bars), n);
  const l = rollingMin(lows(bars), n);
  const out = new Array<number>(bars.length).fill(50);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i];
    if (i >= n) sum -= tr[i - n];
    const range = h[i] - l[i];
    out[i] = range <= 0 ? 50 : (100 * Math.log10(sum / range)) / Math.log10(n);
  }
  return out;
}

function supertrendDir(bars: Bar[], n = 10, mult = 3): number[] {
  const atrs = atr(bars, n);
  const out = new Array<number>(bars.length).fill(-1);
  let up = 0;
  let dn = 0;
  let dir = -1;
  for (let i = 0; i < bars.length; i++) {
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const basicUp = hl2 - mult * atrs[i];
    const basicDn = hl2 + mult * atrs[i];
    up = i === 0 ? basicUp : bars[i - 1].close > up ? Math.max(basicUp, up) : basicUp;
    dn = i === 0 ? basicDn : bars[i - 1].close < dn ? Math.min(basicDn, dn) : basicDn;
    if (dir === -1 && bars[i].close > dn) dir = -1;
    if (bars[i].close > dn) dir = -1;
    else if (bars[i].close < up) dir = 1;
    out[i] = dir;
  }
  return out;
}

function obv(bars: Bar[]): number[] {
  const out = new Array<number>(bars.length);
  out[0] = bars[0]?.volume ?? 0;
  for (let i = 1; i < bars.length; i++) {
    const sign = Math.sign(bars[i].close - bars[i - 1].close);
    out[i] = out[i - 1] + sign * bars[i].volume;
  }
  return out;
}

function roc(data: number[], n: number): number[] {
  return data.map((v, i) => (i < n || data[i - n] === 0 ? 0 : ((v - data[i - n]) / data[i - n]) * 100));
}

export function computeSeries(bars: Bar[]): SeriesMap {
  const c = closes(bars);
  const h = highs(bars);
  const l = lows(bars);
  const o = opens(bars);
  const v = vols(bars);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const e12 = ema(c, 12);
  const e26 = ema(c, 26);
  const macd = e12.map((x, i) => x - e26[i]);
  const signal = ema(macd, 9);
  const mid = sma(c, 20);
  const sd = stdev(c, 20);
  const bbUpper = mid.map((m, i) => m + 2 * sd[i]);
  const bbLower = mid.map((m, i) => m - 2 * sd[i]);
  const bbPct = c.map((x, i) => {
    const den = bbUpper[i] - bbLower[i];
    return den === 0 ? 0.5 : (x - bbLower[i]) / den;
  });
  const atrs = atr(bars, 14);
  const volSma = sma(v, 20);
  const { adx, pdi, mdi } = adxBundle(bars, 14);
  const slope = linregSlopeSeries(c, 20);
  const rsi14 = rsi(c, 14);
  const st = stoch(bars, 14);
  const kcMid = ema(
    bars.map((b) => (b.high + b.low + b.close) / 3),
    20,
  );
  const donH = rollingMax(h, 20);
  const donL = rollingMin(l, 20);
  const z = c.map((x, i) => (sd[i] === 0 ? 0 : (x - mid[i]) / sd[i]));
  const vwapNum: number[] = [];
  const vwapDen: number[] = [];
  let n = 0;
  let d = 0;
  for (let i = 0; i < bars.length; i++) {
    const tp = (h[i] + l[i] + c[i]) / 3;
    n += tp * v[i];
    d += v[i];
    vwapNum.push(n);
    vwapDen.push(d);
  }
  const vwap = vwapNum.map((x, i) => (vwapDen[i] ? x / vwapDen[i] : c[i]));
  const stDir = supertrendDir(bars);
  const chop = choppiness(bars);
  const fish = fisher(c);
  const elderBull = h.map((x, i) => x - e20[i]);
  const elderBear = l.map((x, i) => x - e20[i]);
  const vol20 = stdev(
    c.map((x, i) => (i === 0 ? 0 : (x - c[i - 1]) / c[i - 1])),
    20,
  ).map((s) => s * Math.sqrt(252));

  return {
    CLOSE: c,
    OPEN: o,
    HIGH: h,
    LOW: l,
    VOLUME: v,
    EMA_20: e20,
    EMA_50: e50,
    SMA_20: mid,
    RSI_14: rsi14,
    MACD: macd,
    MACD_SIGNAL: signal,
    MACD_HIST: macd.map((x, i) => x - signal[i]),
    ATR_14: atrs,
    ATR_PERCENT: atrs.map((a, i) => (c[i] ? a / c[i] : 0)),
    ADX_14: adx,
    PLUS_DI: pdi,
    MINUS_DI: mdi,
    BB_PERCENT: bbPct,
    BB_UPPER: bbUpper,
    BB_LOWER: bbLower,
    BB_MID: mid,
    STOCH_14: st,
    TREND_STRENGTH: slope,
    VOLUME_RATIO: v.map((x, i) => (volSma[i] ? x / volSma[i] : 1)),
    CCI_20: cci(bars, 20),
    MFI_14: mfi(bars, 14),
    WILLR_14: willr(bars, 14),
    Z_SCORE: z,
    MEAN_REVERSION_Z: z,
    CHOPPINESS_INDEX: chop,
    FISHER_TRANSFORM: fish,
    ELDER_RAY_BULL_POWER: elderBull,
    ELDER_RAY_BEAR_POWER: elderBear,
    SUPERTREND: stDir,
    HMA_20: hma(c, 20),
    VOLATILITY_20: vol20,
    KC_UPPER: kcMid.map((m, i) => m + 1.5 * atrs[i]),
    KC_MIDDLE: kcMid,
    KC_LOWER: kcMid.map((m, i) => m - 1.5 * atrs[i]),
    DONCHIAN_UPPER: donH,
    DONCHIAN_LOWER: donL,
    DONCHIAN_MIDDLE: donH.map((x, i) => (x + donL[i]) / 2),
    VWAP: vwap,
    VWAP_DISTANCE: c.map((x, i) => x - vwap[i]),
    ROC_5: roc(c, 5),
    ROC_10: roc(c, 10),
    ROC_20: roc(c, 20),
    OBV: obv(bars),
    RANGE_POSITION: bars.map((b) => {
      const den = b.high - b.low;
      return den === 0 ? 0.5 : (b.close - b.low) / den;
    }),
  };
}

export function lastValues(bars: Bar[], names?: string[]): Record<string, number> {
  const s = computeSeries(bars);
  const keys = names ?? Object.keys(s);
  const out: Record<string, number> = {};
  for (const k of keys) {
    const arr = s[k];
    out[k] = arr ? arr[arr.length - 1] : 0;
  }
  out.OPEN = bars[bars.length - 1].open;
  out.HIGH = bars[bars.length - 1].high;
  out.LOW = bars[bars.length - 1].low;
  out.CLOSE = bars[bars.length - 1].close;
  return out;
}

export function lastFinite(arr: number[] | undefined): number {
  if (!arr || !arr.length) return 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i])) return arr[i];
  }
  return 0;
}
