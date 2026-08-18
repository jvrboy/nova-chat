# Backend expansion

## New tools

Nova now exposes advanced market-structure analysis through `forex.advancedStructure` and `forex.pivotLevels`. The structure bundle includes Fibonacci levels, Ichimoku cloud state, Supertrend bands, RSI divergence, volume profile, and confluence scoring. These outputs are analytical research artifacts and are not guarantees or execution instructions.

The music backend now includes `music.proScale`, `music.chordExtensions`, `music.quantize`, `music.euclidean`, `music.drumGrid`, and `music.automationShape`. These provide deterministic MIDI-friendly primitives for scales, extended chords, note timing, rhythm cells, drum grids, and automation curves.

## New agents

The specialist catalog now includes `audio_engineer`, `market_microstructure`, `data_engineer`, `automation_orchestrator`, and `qa_engineer`. They inherit the existing tool-permission and circuit-breaker governance model.

## New pipelines

The built-in pipeline catalog now includes:

| Pipeline | Workflow |
| --- | --- |
| `music-production-pipeline` | Production brief → sound design → export QA. |
| `market-structure-pipeline` | Microstructure review → quant challenge → risk review. |
| `data-quality-pipeline` | Dataset profile → quality review → reproducibility plan. |
| `memory-curation-pipeline` | Context classification → privacy and retention review. |
| `release-qa-pipeline` | Test matrix → operations gates and rollback criteria. |

## Skill registry

The protected `skills.list` and `skills.get` procedures provide structured capability metadata for research, trading, music, engineering, memory, and agentic workflows. Each skill records its tools, risk classification, and authentication requirement.

## Supabase and vector memory verification

The repository contains the `memoryEmbeddings` schema and `0002_persistent_memory` migration, including JSON embeddings, model metadata, dimensions, retention days, expiry timestamps, soft deletion, access tracking, and supporting indexes.

The live Supabase verification could not be completed in this execution because the Supabase MCP server was unavailable and `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `DATABASE_URL` were not present in the runtime environment. No live database was mutated. Once a configured Supabase project and authenticated session are available, verify the migration, insert a user-scoped memory through `brain.persistentRemember`, recall it through `brain.persistentRecall`, confirm the embedding and retention fields, and delete it through `brain.persistentForget`.

## Recommended next additions

The next high-value features are provider-backed embeddings with model/version tracking, pgvector or a dedicated vector index, encrypted memory payloads, hybrid lexical/vector retrieval, memory provenance and user export, audio feature extraction, MIDI and DAW project import/export adapters, portfolio-level research, event-aware backtests, dataset snapshots, workflow approvals, streamed pipeline progress, and an auditable tool execution ledger.
