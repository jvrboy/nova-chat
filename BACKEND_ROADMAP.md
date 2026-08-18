# Nova backend tools roadmap

## Implemented in this extension

| Capability | Chat tool or procedure | Purpose |
| --- | --- | --- |
| Serum/Xfer-style patch generation | `soundDesign.createPatch`, `create_synth_patch` | Produces an engine-neutral patch specification covering oscillators, wavetable choice, unison, filter, envelopes, LFOs, modulation, effects, macros, tags, and production notes. |
| Patch analysis | `soundDesign.analyzePatch` | Estimates brightness, movement, density, spectral character, and common mix or CPU risks. |
| Modulation matrix | `soundDesign.modulationMatrix` | Returns normalized source-to-destination modulation routes for a synth adapter or UI graph. |
| Advanced forex indicator bundle | `forex.advancedIndicators` | Adds ADX, +DI/−DI, CCI, Williams %R, OBV, market structure, and volatility regime analysis. |
| Forex signal snapshot | `forex.signalSnapshot`, `forex_signal_snapshot` | Produces a non-guaranteed analytical bias from directional movement, momentum, structure, and volatility. |
| Multi-timeframe confluence | `forex.multiTimeframe`, `forex_multi_timeframe` | Compares timeframe-level moving-average and RSI bias and returns aggregate consensus. |
| Specialist-agent access | `forex_analyst`, `music_composer` | The chat agent loop can call the advanced forex and synth tools rather than only describing them. |

> Forex outputs are analytical indicators, not financial advice, execution instructions, or guarantees. Any future live-trading integration should be isolated behind explicit user confirmation, paper-trading mode, hard risk limits, and audit logs.

## Recommended next additions

### Priority 1: production safety and observability

A **tool permission registry** should define which agents can call which tools, whether a tool is read-only, its maximum input size, its expected cost, and whether user confirmation is required. A **tool execution ledger** should persist request ID, user, agent, tool, latency, provider, status, redacted arguments, and result hash. Add **per-tool quotas**, **timeouts**, **circuit breakers**, and **idempotency keys** to protect upstream services and keep failures isolated.

### Priority 2: sound-production depth

Add a **DAW adapter layer** that exports the engine-neutral patch schema to Serum-style JSON, Vital-compatible mappings, MIDI CC maps, and Ableton/Bitwig automation descriptions. Add **audio feature analysis** for uploaded clips: loudness, peak/RMS, spectral centroid, spectral rolloff, crest factor, zero-crossing rate, onset estimates, and tempo candidates. Add a **preset variation engine** that generates controlled mutations for macros, envelopes, filter movement, and effects while preserving the patch identity. A later step can add rendered preview audio through the project’s media-generation pathway rather than trying to synthesize audio with server-side JavaScript.

### Priority 3: quantitative research tools

Add **walk-forward backtesting** with explicit train/test windows, transaction costs, spread, slippage, maximum drawdown, profit factor, expectancy, Sharpe-like return/risk summaries, and parameter-sensitivity reports. Add **regime classification** using trend, volatility, and correlation states; **session analytics** for Asia/London/New York; **economic-calendar events**; and **cross-asset correlation** for currency baskets, rates, commodities, and risk proxies. These should remain research tools unless a separately authorized execution service is added.

### Priority 4: data and research infrastructure

Add a **market-data normalization layer** for candle schemas, timezone alignment, missing-bar detection, duplicate removal, and symbol metadata. Add **dataset snapshots** and cache keys so the same analysis can be reproduced. Add **Firecrawl document extraction plus citation tracking**, **Kaggle dataset ingestion with schema profiling**, and **E2B notebook jobs** for reproducible research artifacts.

### Priority 5: chat experience

Add a typed **tool catalog query** with descriptions, input schemas, permissions, and availability. Add a **tool activity timeline** beside each response, showing which tools were called, duration, and success state without exposing secrets. Add a **human-confirmation gate** for code execution, external writes, broker actions, and expensive operations. Finally, add **streaming tool progress** so the user sees stages such as “normalizing candles,” “computing indicators,” and “building patch.”
