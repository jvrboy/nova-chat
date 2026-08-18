# Durable memory, analysis, music, and neural roadmap

## Implemented

| Area | Backend capability |
| --- | --- |
| Durable memory | Drizzle `memoryEmbeddings` table with JSON vector storage, embedding model/version, dimensions, importance, retention days, expiry, last access, soft deletion, and indexes. |
| Vector recall | Deterministic hashed embeddings with cosine similarity and importance weighting. The storage interface can later be swapped for a hosted embedding provider or native vector column. |
| Retention | Kind-specific defaults: preferences 730 days, facts 365 days, goals 180 days, conversations 90 days, and tool results 30 days. Admin purge and user forget operations are available. |
| Technical analysis | Expanded catalog with more than 400 indicator variants spanning trend, momentum, volatility, volume, price, flow, and candle microstructure. |
| Music production | Chord voicing, voice leading, arpeggios, reharmonization, groove generation, and DAW automation curves. |
| Neural utilities | Dense inference, softmax, 1D convolution, recurrent sequence forwarding, ensemble inference, and feature-vector extraction. |
| Agents | Memory Architect, ML Engineer, and Music Producer specialist agents. |

## Recommended next additions

A production memory system should add provider-backed embeddings, vector indexes where supported by the database, encryption at rest for sensitive memories, tenant-level quotas, provenance links to conversations and tool calls, user-visible retention controls, and scheduled compaction of near-duplicate memories. Retrieval should also support hybrid lexical-plus-vector ranking, recency decay, and explicit “do not remember” controls.

The next neural layer should be a model registry with immutable versions, feature schemas, evaluation datasets, calibration reports, drift monitoring, and separate research versus production deployment modes. For financial research, every model result should preserve the dataset snapshot, feature windows, training period, holdout period, and transaction-cost assumptions.

The next technical-analysis layer should add indicator dependency graphs, incremental streaming updates, multi-symbol portfolio features, event-aware windows, regime clustering, Monte Carlo trade-sequence analysis, and a feature cache keyed by symbol, timeframe, data revision, and indicator configuration.

The next music layer should add MIDI file rendering, DAW project adapters, audio-file feature extraction, preset mutation search, loudness and spectral diagnostics, and safe export validation for Serum-style manifests, Vital mappings, and generic MIDI CC automation.

All neural, financial, memory, and external-tool outputs should remain auditable, permission-scoped, rate-limited, and clearly separated from automated execution or guaranteed predictions.
