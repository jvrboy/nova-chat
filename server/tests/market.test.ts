import { describe, it, expect } from 'vitest'
import {
  SYMBOLS,
  getSymbol,
  generateBars,
  lastBar,
  computeSeries,
  lastValues,
  analyzeSymbol,
  cascadingBias,
  runSymbol,
  smtScan,
  runDebate,
  sessionFor,
  hourlyProfile,
  STRATEGIES,
  runBacktest,
  ema,
  rsi,
  type Bar,
} from '../src/lib/market'

describe('market engine (ported from nexus-analysis)', () => {
  it('exposes a non-empty symbol catalog with required fields', () => {
    expect(SYMBOLS.length).toBeGreaterThan(0)
    const eurusd = getSymbol('EURUSD')
    expect(eurusd.id).toBe('EURUSD')
    expect(eurusd.base).toBeGreaterThan(0)
    expect(eurusd.pip).toBeGreaterThan(0)
  })

  it('generates deterministic, well-formed OHLCV bars', () => {
    const a = generateBars('EURUSD', '1h', 120)
    const b = generateBars('EURUSD', '1h', 120)
    expect(a.length).toBe(120)
    for (const bar of a) {
      expect(bar.high).toBeGreaterThanOrEqual(Math.max(bar.open, bar.close) - 1e-9)
      expect(bar.low).toBeLessThanOrEqual(Math.min(bar.open, bar.close) + 1e-9)
      expect(bar.close).toBeGreaterThan(0)
    }
    // deterministic: same symbol/timeframe -> same closes
    expect(a.map((x) => x.close)).toEqual(b.map((x) => x.close))
  })

  it('computes indicator series and latest values', () => {
    const bars = generateBars('XAUUSD', '4h', 200)
    const series = computeSeries(bars)
    expect(Object.keys(series).length).toBeGreaterThan(5)
    const latest = lastValues(bars)
    for (const v of Object.values(latest)) expect(typeof v).toBe('number')
    // sanity: RSI bounded 0..100
    const closes = bars.map((b) => b.close)
    const r = rsi(closes, 14)
    const lastR = r[r.length - 1]
    expect(lastR).toBeGreaterThanOrEqual(0)
    expect(lastR).toBeLessThanOrEqual(100)
    // EMA tracks same length
    expect(ema(closes, 20).length).toBe(closes.length)
  })

  it('runs unified analysis with bias, confidence and commentary', () => {
    const bars = generateBars('EURUSD', '1h', 240)
    const result = analyzeSymbol(bars, 'EURUSD', '1h', 20)
    expect(['BULLISH', 'BEARISH', 'NEUTRAL']).toContain(result.overallBias)
    expect(result.overallConfidence).toBeGreaterThanOrEqual(0)
    expect(result.overallConfidence).toBeLessThanOrEqual(1)
    expect(typeof result.commentary).toBe('string')
    expect(result.commentary.length).toBeGreaterThan(20)
    expect(result.tradePlan).toBeDefined()
    expect(result.supportResistance).toBeDefined()
  })

  it('rejects unified analysis with too few bars', () => {
    const bars = generateBars('EURUSD', '1h', 60).slice(0, 10)
    expect(() => analyzeSymbol(bars, 'EURUSD', '1h')).toThrow()
  })

  it('produces cascading multi-timeframe bias', () => {
    const rowsByTf: Partial<Record<'1d' | '4h' | '1h', Bar[]>> = {
      '1d': generateBars('EURUSD', '1d', 200),
      '4h': generateBars('EURUSD', '4h', 200),
      '1h': generateBars('EURUSD', '1h', 200),
    }
    const out = cascadingBias(rowsByTf, ['1d', '4h', '1h'])
    expect(out).toBeDefined()
    expect(JSON.stringify(out).length).toBeGreaterThan(2)
  })

  it('aggregates a multi-timeframe signal', () => {
    const barsByTf: Partial<Record<'15m' | '1h' | '4h' | '1d', Bar[]>> = {
      '15m': generateBars('GBPUSD', '15m', 200),
      '1h': generateBars('GBPUSD', '1h', 200),
      '4h': generateBars('GBPUSD', '4h', 200),
      '1d': generateBars('GBPUSD', '1d', 200),
    }
    const out = runSymbol(barsByTf, 'GBPUSD', '1h')
    expect(out.symbol).toBe('GBPUSD')
    expect(['BUY', 'SELL', 'WAIT', 'HOLD']).toContain(out.direction)
  })

  it('scans SMT pairs, runs a debate, and profiles sessions', () => {
    const smt = smtScan('1h')
    expect(Array.isArray(smt)).toBe(true)
    const bars = generateBars('EURUSD', '1h', 200)
    const debate = runDebate(bars)
    expect(debate).toBeDefined()
    const session = sessionFor()
    expect(session).toBeDefined()
    const profile = hourlyProfile(bars)
    expect(profile).toBeDefined()
  })

  it('backtests every built-in strategy without throwing', () => {
    expect(STRATEGIES.length).toBeGreaterThan(0)
    const bars = generateBars('EURUSD', '1h', 300)
    for (const strategy of STRATEGIES) {
      const res = runBacktest(bars, strategy, 10_000)
      expect(res).toBeDefined()
      expect(typeof JSON.stringify(res)).toBe('string')
    }
  })
})
