# Nova Chat Backend Upgrade — Multi-Agent Worklog

This file tracks all changes made during the backend power-up sprint.

---
Task ID: 1
Agent: main (Super Z)
Task: Full audit + power-up of the Nova Chat backend. Add advanced reasoning, long-running task engine, continuous brain training, advanced tools, and push to GitHub.

Work Log:
- Cloned the user's `jvrboy/nova-chat` repo into `/home/z/my-project/nova-chat/`
- Audited the backend architecture:
  - 55-tool registry (Utilities/Cognition/Productivity/Data/Ops/Content)
  - 10-agent system with multi-agent delegation
  - Brain engine (memory/skills/knowledge/reasoning/reflection/training) ported from brain-project, persisted to D1
  - Orchestration pipeline (prompt evolution → research → UX → architecture → adversarial critique → optimization)
  - Multi-LLM provider (OpenAI + Z.AI + AI free-tier pool)
  - Multi-provider integrations: Kaggle, E2B, Firecrawl, Hugging Face, Supabase (with pooling)
  - RAG via Workers AI / HuggingFace / pseudo-embedding fallback
  - Streaming chat (SSE), tool-calling loop (max 4 iterations)
  - Cron-driven scheduled workflows + alert evaluation + job queue drain
- Identified gaps:
  1. Brain ↔ Chat NOT integrated (brain learns in isolation; chat doesn't use it)
  2. Reasoning is basic — only a 4-iter tool-calling loop, no ReAct/ToT/Plan-Execute/Self-Critique
  3. No "never stops until done" — chat just returns whatever the LLM emitted first
  4. No persistent long-running tasks (a complex goal times out)
  5. No continuous training — brain only trains when invoked explicitly
  6. No multi-agent debate for controversial questions
  7. No code-review / prompt-optimize / synthesis tools
  8. Artifacts system is limited (only 10 types, no validation, no titles)

- Implemented the following NEW backend modules:
  - `server/src/lib/reasoning.ts` — Advanced reasoning engine with 7 strategies:
    • direct (baseline)
    • react (Reason+Act+Observe loop, explicit reasoning traces)
    • tree_of_thought (3 branches → score → refine best)
    • plan_execute (decompose → execute → synthesize)
    • self_critique (draft → adversarial critique → revise)
    • multi_debate (Analyst + Skeptic + Synthesizer)
    • reflect_refine (answer → reflect → improve)
    Plus an auto-router (pickStrategy) that picks the best strategy per query,
    and an isTaskComplete() verifier for the "never stops until done" loop.

  - `server/src/lib/chatEngine.ts` — Brain-integrated advanced chat engine:
    • Pulls memory + skills + knowledge via the brain
    • Runs the chosen reasoning strategy with streaming steps
    • "Never stops until done": auto-continues up to 3 times if isTaskComplete() says no
    • Persists reasoning traces to the new `reasoning_traces` table
    • Stores every chat as episodic memory in the brain
    • Reinforces skills on high-confidence answers (online learning)

  - `server/src/lib/longTask.ts` — Persistent long-running task engine:
    • Lifecycle: pending → planning → working → verifying → needs_more → completed/failed
    • Each task has a goal, LLM-generated plan (subtasks), accumulated state, and a steps log
    • `tickLongTask()` advances a task by one phase — idempotent + resumable
    • `drainPendingLongTasks()` is called by the cron handler every 5 min
    • Tasks survive across Worker invocations (D1-persisted)
    • Cancels after `maxAttempts` retries; verified against goal before completion

  - `server/src/lib/tools-advanced.ts` — 13 NEW advanced tools, registered into the tool registry:
    1. `reason-react` — Run a ReAct loop on a sub-question
    2. `tree-of-thought` — Explore 3 candidate reasoning paths
    3. `plan-execute` — Decompose + execute + synthesize
    4. `self-critique` — Draft → critique → revise
    5. `multi-debate` — 3-agent debate
    6. `long-task-start` — Start a persistent background task
    7. `long-task-status` — Check task status
    8. `long-task-list` — List long tasks
    9. `code-review` — Adversarial code review
    10. `prompt-optimize` — Evolve a prompt into a maximally clear version
    11. `synthesize-research` — Combine multiple sources with citations
    12. `strategy-recommend` — Suggest the best reasoning strategy for a query
    13. `chain-tools` — Pipeline tools together (output of step N feeds step N+1)

  - `server/src/routes/advanced.ts` — New REST API surface:
    • POST /api/advanced/reason — recommend a strategy for a query
    • POST /api/advanced/chat/:chatId — non-streaming advanced chat
    • POST /api/advanced/chat/:chatId/stream — SSE streaming advanced chat (real-time reasoning visibility)
    • POST /api/advanced/tasks — create a long-running task
    • GET  /api/advanced/tasks — list tasks (filter by status)
    • GET  /api/advanced/tasks/:id — get task status
    • POST /api/advanced/tasks/:id/tick — manually advance a task
    • POST /api/advanced/tasks/:id/cancel — cancel a task
    • POST /api/advanced/tasks/:id/stream — SSE stream that keeps ticking until done
    • POST /api/advanced/train — run a brain training session
    • POST /api/advanced/reflect — trigger a periodic reflection
    • GET  /api/advanced/capabilities — current brain capability snapshot

  - `server/migrations/0008_advanced_reasoning.sql` — New tables:
    • `reasoning_traces` — every advanced chat reply's full trace (strategy, steps, confidence, etc.)
    • `long_tasks` — persistent background tasks
    • `capability_history` — capability values over time
    • `tool_executions` — per-tool execution log for analytics & feedback loops
    • `training_schedule` — configurable continuous training schedule (interval, rounds, difficulty, categories)
      Seeded with a global_default (every 6 hours, 2 rounds, difficulty 1-5).

- Upgraded the existing cron handler in `server/src/index.tsx`:
  • Drains pending long tasks every tick (up to 10 per tick)
  • Runs a brain training session when due (per `training_schedule` table)
  • Triggers a periodic reflection after each training session
  • All best-effort; never blocks the cron handler

- Upgraded the chat system prompt in `server/src/routes/chat.ts`:
  • Tells the model about its reasoning capabilities and how to use them
  • Documents the long-task endpoint for complex multi-step requests
  • Adds artifact-format guidance

- Enhanced the artifacts system (`src/lib/artifacts/index.ts`):
  • 6 new artifact types: react, python, sql, latex, dotenv, shell
  • Categories added (document/code/data/media/diagram/config)
  • `parseArtifactsFromMarkdown` now supports `title="..."` modifier on the fence
  • New `validateArtifact()` — checks structure for each type (JSON parses, SVG has <svg>, Mermaid has valid keyword, React exports a component, CSV has ≥2 cols, etc.)
  • New `isRenderable()` and `isDownloadable()` helpers

- Enhanced the chat route (`src/app/api/chat/route.ts`):
  • Calls `validateArtifact()` before saving — emits `artifact_warning` SSE events on issues
  • Honors the new `title="..."` fence modifier
  • Passes `issues` array in the `artifact` SSE event so the UI can show validation state

- Wrote `server/tests/advanced.test.ts` — 14 new tests covering:
  • All 13 advanced tools are registered with unique IDs
  • No regressions on the original 55 tools
  • `strategy-recommend` returns a valid strategy + reason + available list
  • `chain-tools` correctly pipes output and refuses non-safe tools
  • `pickStrategy` heuristics for 6 representative query shapes
  • Sandbox still validates correctly (accepts clean, rejects dangerous)

Stage Summary:
- 7 new backend source files (reasoning, chatEngine, longTask, tools-advanced, routes/advanced, tests/advanced, migration 0008)
- 4 modified existing files (tools.ts adds advancedTools to registry; index.tsx wires advanced routes + enhanced cron; chat.ts upgraded system prompt; artifacts/index.ts + chat/route.ts enhanced)
- Tool registry grew from 55 → 68 tools (13 advanced)
- New API surface: /api/advanced/* (12 endpoints)
- Tests: 35 passing (was 21, added 14)
- TypeScript: clean compile (no new errors introduced)
- Build: vite build succeeds (1.94 MB bundle)
- Migrations: 0008_advanced_reasoning.sql adds 5 new tables + 1 default schedule row

Next steps for the user (out of this PR's scope but recommended):
- Wire the mobile app to consume /api/advanced/* (currently uses legacy /api/chats)
- Deploy migration 0008 to Cloudflare D1 (wrangler d1 migrations apply)
- Set up Cloudflare Cron Triggers via the dashboard (Pages doesn't support `triggers` in wrangler.jsonc)
- Add a UI panel to visualize reasoning traces (already streamed via SSE)
