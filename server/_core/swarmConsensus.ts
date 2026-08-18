/**
 * Swarm Consensus System for Nova Chat
 * Multi-agent voting and consensus for trading signals
 * Inspired by deriv-ai-swarm agent architecture
 */

export type SwarmAgentDefinition = {
  id: string;
  name: string;
  category: 'trend' | 'momentum' | 'volatility' | 'volume' | 'cycle' | 'pattern' | 'statistical' | 'order_flow';
  indicator: string;
  params: Record<string, number>;
  weight: number;
};

export type AgentVote = {
  agentId: string;
  agentName: string;
  category: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  strength: number;
  value: number;
};

export type SwarmConsensusResult = {
  timestamp: string;
  finalSignal: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  buyPct: number;
  sellPct: number;
  neutralPct: number;
  totalAgents: number;
  participatingAgents: number;
  votes: AgentVote[];
  categoryBreakdown: Record<string, { buy: number; sell: number; neutral: number; avgStrength: number }>;
  topIndicators: Array<{ agentId: string; signal: string; strength: number }>;
}

// --- Swarm Agent Registry ---

export const SWARM_AGENTS: SwarmAgentDefinition[] = [
  // Trend agents
  { id: 'trend_sma_20', name: 'SMA(20) Trend', category: 'trend', indicator: 'sma', params: { period: 20 }, weight: 1.5 },
  { id: 'trend_sma_50', name: 'SMA(50) Trend', category: 'trend', indicator: 'sma', params: { period: 50 }, weight: 1.2 },
  { id: 'trend_ema_12', name: 'EMA(12) Trend', category: 'trend', indicator: 'ema', params: { period: 12 }, weight: 1.3 },
  { id: 'trend_ema_26', name: 'EMA(26) Trend', category: 'trend', indicator: 'ema', params: { period: 26 }, weight: 1.0 },
  { id: 'trend_ema_cross', name: 'EMA Cross 12/26', category: 'trend', indicator: 'ema_cross', params: { fast: 12, slow: 26 }, weight: 2.0 },
  { id: 'trend_adx', name: 'ADX(14)', category: 'trend', indicator: 'adx', params: { period: 14 }, weight: 1.8 },
  // Momentum agents
  { id: 'mom_rsi_14', name: 'RSI(14)', category: 'momentum', indicator: 'rsi', params: { period: 14 }, weight: 2.0 },
  { id: 'mom_rsi_7', name: 'RSI(7)', category: 'momentum', indicator: 'rsi', params: { period: 7 }, weight: 1.5 },
  { id: 'mom_macd', name: 'MACD(12,26,9)', category: 'momentum', indicator: 'macd', params: { fast: 12, slow: 26, signal: 9 }, weight: 2.0 },
  { id: 'mom_stoch', name: 'Stochastic(14,3)', category: 'momentum', indicator: 'stochastic', params: { kPeriod: 14, dPeriod: 3 }, weight: 1.5 },
  { id: 'mom_cci_20', name: 'CCI(20)', category: 'momentum', indicator: 'cci', params: { period: 20 }, weight: 1.2 },
  { id: 'mom_williams', name: 'Williams %R(14)', category: 'momentum', indicator: 'williams_r', params: { period: 14 }, weight: 1.0 },
  // Volatility agents
  { id: 'vol_atr_14', name: 'ATR(14)', category: 'volatility', indicator: 'atr', params: { period: 14 }, weight: 1.5 },
  { id: 'vol_bb_20', name: 'Bollinger Bands(20,2)', category: 'volatility', indicator: 'bollinger', params: { period: 20, stdDev: 2 }, weight: 2.0 },
  { id: 'vol_bb_width', name: 'BB Width(20)', category: 'volatility', indicator: 'bb_width', params: { period: 20, stdDev: 2 }, weight: 1.0 },
  { id: 'vol_keltner', name: 'Keltner Channel(20)', category: 'volatility', indicator: 'keltner', params: { period: 20 }, weight: 1.2 },
  // Volume agents
  { id: 'vol_obv', name: 'OBV', category: 'volume', indicator: 'obv', params: {}, weight: 1.5 },
  { id: 'vol_vwap', name: 'VWAP', category: 'volume', indicator: 'vwap', params: {}, weight: 1.5 },
  { id: 'vol_mfi', name: 'MFI(14)', category: 'volume', indicator: 'mfi', params: { period: 14 }, weight: 1.2 },
];

// --- Agent Execution Engine ---

import { sma, ema, rsi, atr, bollingerBands, macd as computeMacd, stochastic, adx, williamsR, cci, obv, vwap, type OHLCV } from './tradingStrategy';

type InternalOHLCV = OHLCV;

function executeAgent(agent: SwarmAgentDefinition, data: InternalOHLCV[]): AgentVote {
  const closes = data.map(d => d.close);
  const lastPrice = closes[closes.length - 1];
  let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let strength = 0;
  let value = 0;

  switch (agent.indicator) {
    case 'sma': {
      const vals = sma(closes, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.min(Math.abs(lastPrice - value) / value * 100, 1); signal = lastPrice > value ? 'BUY' : 'SELL'; }
      break;
    }
    case 'ema': {
      const vals = ema(closes, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.min(Math.abs(lastPrice - value) / value * 100, 1); signal = lastPrice > value ? 'BUY' : 'SELL'; }
      break;
    }
    case 'ema_cross': {
      const fast = ema(closes, agent.params.fast);
      const slow = ema(closes, agent.params.slow);
      const offset = agent.params.slow - agent.params.fast;
      if (fast.length > offset + 1 && slow.length > 1) {
        const fastVal = fast[fast.length - 1]; const prevFast = fast[fast.length - 2];
        const slowVal = slow[slow.length - 1]; const prevSlow = slow[slow.length - 2];
        value = fastVal - slowVal; strength = Math.min(Math.abs(value) / lastPrice * 100, 1);
        if (prevFast <= prevSlow && fastVal > slowVal) signal = 'BUY';
        else if (prevFast >= prevSlow && fastVal < slowVal) signal = 'SELL';
      }
      break;
    }
    case 'rsi': {
      const vals = rsi(closes, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.abs(value - 50) / 50;
        if (value < 30) signal = 'BUY'; else if (value > 70) signal = 'SELL'; }
      break;
    }
    case 'macd': {
      const { histogram } = computeMacd(closes, agent.params.fast, agent.params.slow, agent.params.signal);
      if (histogram.length > 1) { value = histogram[histogram.length - 1]; strength = Math.min(Math.abs(value) / lastPrice * 100, 1);
        signal = value > 0 ? 'BUY' : 'SELL'; }
      break;
    }
    case 'stochastic': {
      const { k, d } = stochastic(data, agent.params.kPeriod, agent.params.dPeriod);
      if (k.length > 0 && d.length > 0) { value = k[k.length - 1]; strength = Math.abs(value - 50) / 50;
        signal = k[k.length-1] > d[d.length-1] && value < 80 ? 'BUY' : k[k.length-1] < d[d.length-1] && value > 20 ? 'SELL' : 'NEUTRAL'; }
      break;
    }
    case 'cci': {
      const vals = cci(data, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.min(Math.abs(value) / 200, 1);
        if (value < -100) signal = 'BUY'; else if (value > 100) signal = 'SELL'; }
      break;
    }
    case 'williams_r': {
      const vals = williamsR(data, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.abs(value + 50) / 50;
        if (value < -80) signal = 'BUY'; else if (value > -20) signal = 'SELL'; }
      break;
    }
    case 'adx': {
      const { adx: adxVals, plusDI, minusDI } = adx(data, agent.params.period);
      if (adxVals.length > 0 && plusDI.length > 0 && minusDI.length > 0) {
        const aIdx = adxVals.length - 1;
        const pDI = plusDI[plusDI.length - 1]; const mDI = minusDI[minusDI.length - 1];
        value = adxVals[aIdx]; strength = value / 50;
        signal = pDI > mDI && value > 20 ? 'BUY' : mDI > pDI && value > 20 ? 'SELL' : 'NEUTRAL';
      }
      break;
    }
    case 'atr': {
      const vals = atr(data, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        strength = Math.min(value / (avg || 1), 1); signal = value > avg ? 'SELL' : 'BUY'; }
      break;
    }
    case 'bollinger': {
      const bb = bollingerBands(closes, agent.params.period, agent.params.stdDev);
      if (bb.upper.length > 0 && bb.lower.length > 0) {
        const u = bb.upper[bb.upper.length - 1]; const l = bb.lower[bb.lower.length - 1];
        value = bb.pctB[bb.pctB.length - 1]; strength = Math.abs(value - 0.5) * 2;
        if (lastPrice <= l) signal = 'BUY'; else if (lastPrice >= u) signal = 'SELL';
      }
      break;
    }
    case 'bb_width': {
      const bb = bollingerBands(closes, agent.params.period, agent.params.stdDev);
      if (bb.bandwidth.length > 0) { value = bb.bandwidth[bb.bandwidth.length - 1];
        const avg = bb.bandwidth.reduce((a, b) => a + b, 0) / bb.bandwidth.length;
        strength = Math.min(value / (avg || 1) / 2, 1); signal = 'NEUTRAL'; }
      break;
    }
    case 'keltner': {
      const bb = bollingerBands(closes, agent.params.period, 1.5);
      if (bb.upper.length > 0 && bb.lower.length > 0) {
        value = bb.pctB[bb.pctB.length - 1]; strength = Math.abs(value - 0.5) * 2;
        if (lastPrice <= bb.lower[bb.lower.length - 1]) signal = 'BUY';
        else if (lastPrice >= bb.upper[bb.upper.length - 1]) signal = 'SELL';
      }
      break;
    }
    case 'obv': {
      const vals = obv(data);
      if (vals.length > 1) { value = vals[vals.length - 1] - vals[vals.length - 2];
        strength = Math.min(Math.abs(value) / (Math.abs(vals[vals.length-1]) || 1) * 10, 1);
        signal = value > 0 ? 'BUY' : 'SELL'; }
      break;
    }
    case 'vwap': {
      const vals = vwap(data);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.abs(lastPrice - value) / value * 100;
        signal = lastPrice > value ? 'BUY' : 'SELL'; }
      break;
    }
    case 'mfi': {
      const tp = data.map(d => (d.high + d.low + d.close) / 3);
      const vals = rsi(tp, agent.params.period);
      if (vals.length > 0) { value = vals[vals.length - 1]; strength = Math.abs(value - 50) / 50;
        if (value < 20) signal = 'BUY'; else if (value > 80) signal = 'SELL'; }
      break;
    }
    default: break;
  }

  return { agentId: agent.id, agentName: agent.name, category: agent.category, signal, strength: Math.min(strength, 1), value };
}

// --- Consensus Algorithm ---

export function runSwarmConsensus(data: InternalOHLCV[], agents?: SwarmAgentDefinition[]): SwarmConsensusResult {
  const agentList = agents ?? SWARM_AGENTS;
  const votes = agentList.map(agent => executeAgent(agent, data));

  // Weighted voting
  let weightedBuyScore = 0; let weightedSellScore = 0; let weightedNeutralScore = 0;
  let totalWeight = 0;

  for (const vote of votes) {
    const agent = agentList.find(a => a.id === vote.agentId);
    const weight = agent?.weight ?? 1;
    totalWeight += weight;
    const weightedStrength = vote.strength * weight;
    switch (vote.signal) {
      case 'BUY': weightedBuyScore += weightedStrength; break;
      case 'SELL': weightedSellScore += weightedStrength; break;
      case 'NEUTRAL': weightedNeutralScore += weight; break;
    }
  }

  const buyPct = totalWeight > 0 ? weightedBuyScore / (weightedBuyScore + weightedSellScore + weightedNeutralScore) * 100 : 0;
  const sellPct = totalWeight > 0 ? weightedSellScore / (weightedBuyScore + weightedSellScore + weightedNeutralScore) * 100 : 0;
  const neutralPct = 100 - buyPct - sellPct;

  // Determine final signal
  let finalSignal: SwarmConsensusResult['finalSignal'] = 'NEUTRAL';
  let confidence = 0;
  if (buyPct > sellPct + 15) { finalSignal = 'STRONG_BUY'; confidence = buyPct - sellPct; }
  else if (buyPct > sellPct + 5) { finalSignal = 'BUY'; confidence = buyPct - sellPct; }
  else if (sellPct > buyPct + 15) { finalSignal = 'STRONG_SELL'; confidence = sellPct - buyPct; }
  else if (sellPct > buyPct + 5) { finalSignal = 'SELL'; confidence = sellPct - buyPct; }

  // Category breakdown
  const categoryBreakdown: Record<string, { buy: number; sell: number; neutral: number; avgStrength: number }> = {};
  for (const vote of votes) {
    if (!categoryBreakdown[vote.category]) categoryBreakdown[vote.category] = { buy: 0, sell: 0, neutral: 0, avgStrength: 0 };
    const cat = categoryBreakdown[vote.category];
    if (vote.signal === 'BUY') cat.buy++;
    else if (vote.signal === 'SELL') cat.sell++;
    else cat.neutral++;
  }
  // Recompute avgStrength per category
  for (const [cat, breakdown] of Object.entries(categoryBreakdown)) {
    const catVotes = votes.filter(v => v.category === cat);
    breakdown.avgStrength = catVotes.length > 0 ? catVotes.reduce((s, v) => s + v.strength, 0) / catVotes.length : 0;
  }

  const topIndicators = [...votes].sort((a, b) => b.strength - a.strength).slice(0, 10).map(v => ({ agentId: v.agentId, signal: v.signal, strength: v.strength }));

  return {
    timestamp: new Date().toISOString(), finalSignal, confidence: Math.round(confidence * 10) / 10,
    buyPct: Math.round(buyPct * 10) / 10, sellPct: Math.round(sellPct * 10) / 10,
    neutralPct: Math.round(neutralPct * 10) / 10,
    totalAgents: agentList.length, participatingAgents: votes.filter(v => v.signal !== 'NEUTRAL').length,
    votes, categoryBreakdown, topIndicators,
  };
}

export function listSwarmAgents(): SwarmAgentDefinition[] { return SWARM_AGENTS; }
