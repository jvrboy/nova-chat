// Ported from the `nexus-analysis` repo (src/lib/nexus) — a pure, dependency-free
// TypeScript market-analysis engine. Only the computation modules were ported;
// the browser-only Deriv WebSocket client / live-market feed were intentionally
// left out because Cloudflare Workers have no `window`/DOM WebSocket client here.
// Synthetic market data comes from `market.ts` (deterministic, seeded) so every
// endpoint works offline and is unit-testable.
export * from "./types";
export * from "./rng";
export * from "./symbols";
export * from "./format";
export * from "./market";
export * from "./indicators";
export * from "./analysis";
export * from "./unified";
export * from "./topdown";
export * from "./confluence";
export * from "./debate";
export * from "./session";
export * from "./smt";
export * from "./strategies";
export * from "./backtest";
