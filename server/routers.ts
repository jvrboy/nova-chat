import { z } from "zod";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { generateImage, listImageModels } from "./_core/imageGeneration";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { runAgent, listAgents, type AgentRole } from "./_core/agents";
import { executePipeline, listPipelines, getPipeline } from "./_core/pipelines";
import {
  analyzeDependencyRisk,
  buildAuditEvent,
  buildCachePolicy,
  chunkText,
  createIdempotencyKey,
  createRunbook,
  buildRetryPolicy,
  compareApiVersions,
  evaluateAccessPolicy,
  evaluateCircuitBreaker,
  evaluateFeatureFlag,
  evaluateServiceHealth,
  evaluateSlo,
  evaluateTokenBucket,
  forecastUsageCost,
  generateFeatureCatalog,
  planCapacity,
  planMaintenanceWindow,
  planPagination,
  planWorkflowExecution,
  redactSensitiveText,
  scanSecrets,
  scoreDataQuality,
  summarizeEventStream,
} from "./_core/backendTools";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  fullAnalysis,
  calculatePips,
  calculateRisk,
  fibonacciRetracement,
  pivotPoints,
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  stochastic,
  atr,
  correlation,
  analyzeSentiment,
} from "./_core/forex";
import {
  getScaleNotes,
  getChordNotes,
  getScaleChords,
  generateChordProgression,
  generateMelody,
  generateDrumPattern,
  melodyToABC,
  generateSong,
  SCALES,
  CHORD_TYPES,
} from "./_core/music";
import { analyzeSynthPatch, createModulationMatrix, createSerumStylePatch, type SynthPatch } from "./_core/synthTools";
import { exportDawBundle, exportMidiCcMap, exportSerumStylePreset } from "./_core/dawExport";
import { listToolPolicies, listToolRuntime, resetToolCircuit } from "./_core/toolRegistry";
import { adx, cci, forexSignalSnapshot, marketStructure, multiTimeframeConfluence, obv, volatilityRegime, williamsR } from "./_core/forexAdvanced";
import {
  analyzeMetrics,
  detectIssues,
  suggestRefactors,
  convertCode,
  generateDocumentation,
  generateTestStubs,
  regexHelper,
} from "./_core/codeTools";
import { runBacktest, BUILT_IN_STRATEGIES, generateRSIBBSignal, generateMACDCrossSignal,
  type StrategyDefinition,
  generateStochasticCrossSignal, generateEMACrossSignal, generateIchimokuSuperTrendSignal, generateFibonacciBreakoutSignal, generateConfluenceSignal, detectCandlePatterns,
  DERIV_SYMBOLS, parseDerivCandles, buildDerivWebSocketURL, buildDerivCandleRequest,
  sma as tsSma, ema as tsEma, rsi as tsRsi, atr as tsAtr, bollingerBands as tsBB,
  macd as tsMacd, stochastic as tsStochastic, adx as tsAdx, williamsR as tsWilliamsR,
  cci as tsCci, obv as tsObv, vwap as tsVwap,
} from "./_core/tradingStrategy";
import { runAutomatedBacktest } from "./_core/automatedBacktest";
import { buildCoinbaseSubscription, buildMassiveSubscription, listMarketStreams } from "./_core/marketStreams";
import { runtimeConfigurationStatus } from "./_core/runtimeConfig";
import { runSwarmConsensus, listSwarmAgents, SWARM_AGENTS } from "./_core/swarmConsensus";
import { executeSandboxedCode } from "./_core/performanceTools";
import { cloudflareWorker } from "./_core/cloudflareWorker";
import { listBackendConnections, probeBackendConnections } from "./_core/backendConnections";
import { e2bRunCode, firecrawlScrape, invokeWithProviderFailover, kaggleListDatasets, listConnectionStatus, listProviderStatus, type ProviderId } from "./_core/providerGateway";
import { computeIndicator, computeIndicators, indicatorSnapshot, listIndicators, type IndicatorCategory } from "./_core/indicatorEngine";
import { runBacktest as runResearchBacktest, runForwardTest, walkForwardAnalysis, type ResearchConfig } from "./_core/researchEngine";
import { conv1d, ensembleForward, listMemories, neuralFeatureVector, neuralForward, recallMemories, recurrentSequenceForward, softmax, storeMemory, forgetMemory, runAgentSwarm, type DenseLayer, type MemoryKind } from "./_core/brainSystem";
import { forgetPersistentMemory, listPersistentMemories, purgeExpiredMemories, recallPersistentMemories, retentionPolicy, storePersistentMemory } from "./_core/persistentMemory";
import { generateArpeggio, generateGroove, generateMidiAutomation, reharmonize, voiceChord, voiceLeadProgression, type ChordEvent } from "./_core/musicAdvanced";
import { chordExtensions, drumGrid, euclideanRhythm, quantizeNotes, scaleNotes, shapeAutomation, type NoteEvent } from "./_core/musicPro";
import { confluenceSnapshot, fibonacciLevels, ichimoku, pivotPoints as advancedPivotPoints, rsiDivergence, supertrend, volumeProfile, type AdvancedCandle } from "./_core/technicalAdvanced";
import { getSkill, listSkills } from "./_core/skillRegistry";
import {
  createConversation,
  createMessage,
  createProject,
  getConversation,
  listConversations,
  listProjects,
  updateConversation,
  updateProject,
  upsertUser,
  getUserByOpenId,
  createUserSession,
  revokeUserSession,
  getActiveUserSession,
  createRealtimeConnection,
  heartbeatRealtimeConnection,
  disconnectRealtimeConnection,
  listActiveRealtimeConnections,
} from "./db";

const projectInput = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(10000).optional(),
});
const readSessionToken = (req: { headers: Record<string, string | string[] | undefined> }) => {
  const cookieToken = parseCookieHeader(typeof req.headers.cookie === "string" ? req.headers.cookie : "")[COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const authorization = req.headers.authorization;
  return typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice(7) : undefined;
};

const conversationInput = z.object({
  title: z.string().min(1).max(240),
  projectId: z.number().int().positive().optional(),
  model: z.string().max(64).optional(),
});

export const appRouter = router({
  system: systemRouter,
  worker: router({
    health: protectedProcedure.query(() => cloudflareWorker.health()),
    createJob: protectedProcedure.input(z.object({ type: z.string().min(1).max(128), payload: z.unknown().optional() })).mutation(({ input }) => cloudflareWorker.createJob(input.type, input.payload ?? null)),
    getJob: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ input }) => cloudflareWorker.getJob(input.id)),
    cancelJob: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ input }) => cloudflareWorker.deleteJob(input.id)),
  }),
  realtime: router({
    start: protectedProcedure.input(z.object({ transport: z.enum(["websocket", "sse"]), channel: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const token = readSessionToken(ctx.req);
      if (!token) throw new Error("Active session token is required");
      const session = await getActiveUserSession(token);
      if (!session || session.userId !== ctx.user.id) throw new Error("Persistent session is not active");
      const connection = await createRealtimeConnection({ sessionId: session.id, userId: ctx.user.id, transport: input.transport, channel: input.channel });
      if (!connection) throw new Error("Database is not available");
      return { id: connection.id, sessionId: connection.sessionId, connectedAt: connection.connectedAt };
    }),
    heartbeat: protectedProcedure.input(z.object({ connectionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const token = readSessionToken(ctx.req);
      const session = token ? await getActiveUserSession(token) : undefined;
      if (!session || session.userId !== ctx.user.id) throw new Error("Persistent session is not active");
      await heartbeatRealtimeConnection(input.connectionId, session.id);
      return { ok: true, at: new Date() };
    }),
    disconnect: protectedProcedure.input(z.object({ connectionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const token = readSessionToken(ctx.req);
      const session = token ? await getActiveUserSession(token) : undefined;
      if (!session || session.userId !== ctx.user.id) throw new Error("Persistent session is not active");
      await disconnectRealtimeConnection(input.connectionId, session.id);
      return { ok: true };
    }),
    active: protectedProcedure.query(({ ctx }) => listActiveRealtimeConnections(ctx.user.id)),
  }),
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME];
      if (token && ENV.databaseUrl) await revokeUserSession(token);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    passwordLogin: publicProcedure.input(z.object({ password: z.string().min(1).max(256) })).mutation(async ({ ctx, input }) => {
      const configured = ENV.passwordHash;
      if (!configured) throw new Error("Password-only access is not configured. Set NOVA_ACCESS_PASSWORD_HASH in Vercel.");
      const [salt, expectedHex] = configured.split(":");
      if (!salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex)) throw new Error("NOVA_ACCESS_PASSWORD_HASH has an invalid format.");
      const expected = Buffer.from(expectedHex, "hex");
      const actual = scryptSync(input.password, salt, expected.length || 32);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Incorrect password.");
      const openId = `password:${salt}`;
      await upsertUser({ openId, name: "Nova Workspace", email: null, loginMethod: "password" });
      const token = await sdk.createSessionToken(openId, { name: "Nova Workspace" });
      const sessionUser = await getUserByOpenId(openId);
      if (sessionUser && ENV.databaseUrl) await createUserSession({ token, userId: sessionUser.id, userAgent: ctx.req.headers["user-agent"]?.slice(0, 512) ?? null, ipHash: null, expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: 1000 * 60 * 60 * 24 * 30 });
      return { success: true } as const;
    }),
  }),
  projects: router({
    list: protectedProcedure.query(({ ctx }) => listProjects(ctx.user.id)),
    create: protectedProcedure
      .input(projectInput)
      .mutation(({ ctx, input }) =>
        createProject({ ...input, userId: ctx.user.id })
      ),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().min(1).max(160).optional(),
          description: z.string().max(2000).optional(),
          instructions: z.string().max(10000).optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const { id, ...values } = input;
        return updateProject(ctx.user.id, id, values);
      }),
  }),
  web: router({
    search: protectedProcedure
      .input(
        z.object({
          query: z.string().min(2).max(500),
          depth: z.enum(["basic", "advanced"]).default("basic"),
        })
      )
      .mutation(async ({ input }) => {
        // Try DuckDuckGo first
        try {
          const response = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(input.query)}&format=json&no_html=1&skip_disambig=1`
          );
          if (response.ok) {
            const payload = (await response.json()) as {
              Heading?: string;
              AbstractText?: string;
              AbstractURL?: string;
              RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
            };
            if (payload.AbstractText) {
              return {
                heading: payload.Heading ?? input.query,
                abstractText: payload.AbstractText,
                abstractUrl: payload.AbstractURL ?? null,
                relatedTopics: (payload.RelatedTopics ?? [])
                  .filter(topic => topic.Text)
                  .slice(0, 8)
                  .map(topic => ({
                    text: topic.Text!,
                    url: topic.FirstURL ?? null,
                  })),
                source: "duckduckgo" as const,
              };
            }
          }
        } catch {
          /* fallthrough */
        }
        // Fallback: use LLM to synthesize a search-like response
        const response = await invokeLLM({
          model: "nova-2",
          messages: [
            {
              role: "system",
              content:
                "You are a search assistant. Provide a concise, factual answer to the query. If you don't know, say so. Format your response as a brief summary.",
            },
            { role: "user", content: input.query },
          ],
        });
        const content = response.choices[0]?.message.content;
        const text =
          typeof content === "string"
            ? content
            : content
                .map(part => (part.type === "text" ? part.text : ""))
                .join("\n");
        return {
          heading: input.query,
          abstractText: text,
          abstractUrl: null,
          relatedTopics: [],
          source: "ai-fallback" as const,
        };
      }),
    scrape: protectedProcedure
      .input(z.object({ url: z.string().url().max(2000) }))
      .mutation(async ({ input }) => {
        try {
          const response = await fetch(input.url, {
            headers: { "User-Agent": "NovaChat/1.0 (compatible; Bot)" },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          // Strip HTML tags for plain text extraction
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 10000);
          // Extract title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          return {
            title: titleMatch?.[1]?.trim() ?? input.url,
            text,
            url: input.url,
          };
        } catch (error) {
          throw new Error(
            `Failed to scrape URL: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }),
  }),
  ai: router({
    models: protectedProcedure.query(async () => (await listLLMModels()).data),
    providers: protectedProcedure.query(() => listProviderStatus()),
    providerStatus: publicProcedure.query(() => listProviderStatus()),
    runtimeConfigurationStatus: protectedProcedure.query(() => runtimeConfigurationStatus()),
    connections: protectedProcedure.query(() => listConnectionStatus()),
    backendConnections: protectedProcedure.query(() => listBackendConnections()),
    backendHealth: protectedProcedure.mutation(() => probeBackendConnections()),
    complete: protectedProcedure
      .input(
        z.object({
          model: z.string().optional(),
          provider: z.enum(["gemini", "groq", "ollama-cloud", "openrouter"]).optional(),
          system: z.string().optional(),
          messages: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string().min(1),
              })
            )
            .min(1),
        })
      )
      .mutation(async ({ input }) => {
        const response = await invokeWithProviderFailover({
          model: input.model,
          provider: input.provider as ProviderId | undefined,
          messages: [
            {
              role: "system",
              content:
                input.system ??
                "You are Nova, a thoughtful and concise AI assistant. Use markdown when it improves clarity.",
            },
            ...input.messages,
          ],
        });
        const content = response.choices[0]?.message.content;
        return {
          model: response.model,
          provider: response.provider,
          providerLabel: response.providerLabel,
          content:
            typeof content === "string"
              ? content
              : content
                  .map(part => (part.type === "text" ? part.text : ""))
                  .join("\n"),
        };
      }),
    createArtifact: protectedProcedure
      .input(
        z.object({
          model: z.string().optional(),
          kind: z.enum(["document", "plan", "table", "code"]),
          prompt: z.string().min(3).max(6000),
          context: z.string().max(12000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const kindLabel = {
          document: "a polished document",
          plan: "an actionable plan",
          table: "a clear markdown table",
          code: "a focused code artifact",
        }[input.kind];
        const response = await invokeLLM({
          model: input.model,
          messages: [
            {
              role: "system",
              content: `You create ${kindLabel} for Nova. Return only valid JSON matching the requested schema. Make the content useful, self-contained, and formatted as markdown when appropriate.`,
            },
            {
              role: "user",
              content: `Create ${kindLabel} from this request:\n${input.prompt}\n\nConversation context:\n${input.context ?? "No additional context."}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "nova_artifact",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  content: { type: "string" },
                  language: { type: "string" },
                },
                required: ["title", "summary", "content", "language"],
                additionalProperties: false,
              },
            },
          },
        });
        const raw = response.choices[0]?.message.content;
        const parsed = JSON.parse(
          typeof raw === "string"
            ? raw
            : raw.map(part => (part.type === "text" ? part.text : "")).join("")
        );
        return { ...parsed, kind: input.kind, model: response.model };
      }),
  }),
  connections: router({
    scrape: protectedProcedure
      .input(z.object({ url: z.string().url().max(2000) }))
      .mutation(({ input }) => firecrawlScrape(input.url)),
    runCode: protectedProcedure
      .input(z.object({ code: z.string().min(1).max(50000), language: z.string().default("python") }))
      .mutation(({ input }) => e2bRunCode(input.code, input.language)),
    listDatasets: protectedProcedure
      .input(z.object({ search: z.string().min(1).max(200) }))
      .mutation(({ input }) => kaggleListDatasets(input.search)),
  }),
  images: router({
    generate: protectedProcedure
      .input(
        z.object({
          prompt: z.string().min(3).max(2000),
          model: z.string().optional(),
          quality: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await generateImage({
          prompt: input.prompt,
          model: input.model,
          quality: input.quality,
        });
        return { url: result.url };
      }),
    listModels: protectedProcedure.query(async () => {
      const result = await listImageModels();
      return result;
    }),
  }),
  voice: router({
    transcribe: protectedProcedure
      .input(
        z.object({
          audioUrl: z.string().min(1),
          language: z.string().optional(),
          prompt: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await transcribeAudio(input);
        if ("error" in result) throw new Error(result.error);
        return {
          text: result.text,
          language: result.language,
          duration: result.duration,
        };
      }),
    uploadAndTranscribe: protectedProcedure
      .input(z.object({ audioBase64: z.string().min(1).max(24_000_000), mimeType: z.string().min(1).max(100), language: z.string().optional(), prompt: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const audio = Buffer.from(input.audioBase64, "base64");
        if (audio.length > 16 * 1024 * 1024) throw new Error("Audio recording exceeds the 16 MB limit.");
        const stored = await storagePut(`voice/${ctx.user.id}/${Date.now()}.audio`, audio, input.mimeType);
        const result = await transcribeAudio({ audioUrl: stored.url, language: input.language, prompt: input.prompt });
        if ("error" in result) throw new Error(result.error);
        return { text: result.text, language: result.language, duration: result.duration, audioUrl: stored.url };
      }),
  }),
  conversations: router({
    list: protectedProcedure
      .input(
        z
          .object({ projectId: z.number().int().positive().optional() })
          .optional()
      )
      .query(({ ctx, input }) =>
        listConversations(ctx.user.id, input?.projectId)
      ),
    create: protectedProcedure
      .input(conversationInput)
      .mutation(({ ctx, input }) =>
        createConversation({
          ...input,
          userId: ctx.user.id,
          model: input.model ?? "nova-2",
        })
      ),
    get: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ ctx, input }) => getConversation(ctx.user.id, input.id)),
    update: protectedProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          title: z.string().min(1).max(240).optional(),
          model: z.string().max(64).optional(),
          projectId: z.number().int().positive().nullable().optional(),
          isStarred: z.boolean().optional(),
          isArchived: z.boolean().optional(),
        })
      )
      .mutation(({ ctx, input }) => {
        const { id, ...values } = input;
        return updateConversation(ctx.user.id, id, values);
      }),
    addMessage: protectedProcedure
      .input(
        z.object({
          conversationId: z.number().int().positive(),
          role: z.enum(["user", "assistant"]),
          content: z.string().min(1),
        })
      )
      .mutation(({ ctx, input }) => createMessage(input)),
  }),
  forex: router({
    advancedIndicators: protectedProcedure
      .input(z.object({ data: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(30).max(5000), period: z.number().int().min(2).max(100).default(14) }))
      .mutation(({ input }) => ({ adx: adx(input.data, input.period), cci: cci(input.data), williamsR: williamsR(input.data, input.period), obv: obv(input.data), volatility: volatilityRegime(input.data, input.period), structure: marketStructure(input.data) })),
    signalSnapshot: protectedProcedure
      .input(z.object({ data: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(30).max(5000), period: z.number().int().min(2).max(100).default(14) }))
      .mutation(({ input }) => forexSignalSnapshot(input.data, input.period)),
    multiTimeframe: protectedProcedure
      .input(z.object({ frames: z.array(z.object({ timeframe: z.string().min(1).max(20), data: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(20).max(5000) })).min(1).max(10) }))
      .mutation(({ input }) => multiTimeframeConfluence(input.frames)),
    indicatorCatalog: protectedProcedure
      .input(z.object({ category: z.enum(["trend", "momentum", "volatility", "volume", "price"]).optional() }))
      .query(({ input }) => listIndicators(input.category as IndicatorCategory | undefined)),
    batchIndicators: protectedProcedure
      .input(z.object({ ids: z.array(z.string()).min(1).max(240), data: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(5).max(10000) }))
      .mutation(({ input }) => computeIndicators(input.ids, input.data)),
    indicatorSnapshot: protectedProcedure
      .input(z.object({ data: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(5).max(10000), ids: z.array(z.string()).max(240).optional() }))
      .mutation(({ input }) => indicatorSnapshot(input.data, input.ids)),
    advancedStructure: protectedProcedure.input(z.object({ candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(20).max(5000), lookback: z.number().int().min(5).max(500).default(50) })).mutation(({ input }) => ({ fibonacci: fibonacciLevels(input.candles as AdvancedCandle[], input.lookback), ichimoku: ichimoku(input.candles as AdvancedCandle[]), supertrend: supertrend(input.candles as AdvancedCandle[]), divergence: rsiDivergence(input.candles as AdvancedCandle[]), volumeProfile: volumeProfile(input.candles as AdvancedCandle[]), confluence: confluenceSnapshot(input.candles as AdvancedCandle[]) })),
    pivotLevels: protectedProcedure.input(z.object({ candle: z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() }) })).query(({ input }) => advancedPivotPoints(input.candle)),
    analyze: protectedProcedure
      .input(
        z.object({
          pair: z.string().default("EUR/USD"),
          candles: z
            .array(
              z.object({
                timestamp: z.number(),
                open: z.number(),
                high: z.number(),
                low: z.number(),
                close: z.number(),
                volume: z.number(),
              })
            )
            .min(20)
            .max(1000),
        })
      )
      .mutation(({ input }) => {
        return fullAnalysis(input.candles, input.pair);
      }),
    indicators: protectedProcedure
      .input(
        z.object({
          closes: z.array(z.number()).min(2),
          highs: z.array(z.number()).optional(),
          lows: z.array(z.number()).optional(),
          indicator: z.enum([
            "sma",
            "ema",
            "rsi",
            "macd",
            "bollinger",
            "stochastic",
            "atr",
            "vwap",
          ]),
          period: z.number().int().min(2).max(200).default(14),
        })
      )
      .mutation(({ input }) => {
        const { closes, highs, lows, indicator, period } = input;
        switch (indicator) {
          case "sma":
            return { indicator: "SMA", values: sma(closes, period) };
          case "ema":
            return { indicator: "EMA", values: ema(closes, period) };
          case "rsi":
            return { indicator: "RSI", values: rsi(closes, period) };
          case "macd":
            return { indicator: "MACD", values: macd(closes) };
          case "bollinger":
            return {
              indicator: "Bollinger Bands",
              values: bollingerBands(closes, period),
            };
          case "stochastic":
            return {
              indicator: "Stochastic",
              values:
                highs && lows
                  ? stochastic(highs, lows, closes, period, 3)
                  : { k: [], d: [] },
            };
          default:
            throw new Error(`Unknown indicator: ${indicator}`);
        }
      }),
    pips: protectedProcedure
      .input(
        z.object({
          entryPrice: z.number().positive(),
          exitPrice: z.number().positive(),
          lotSize: z.number().positive(),
          pair: z.string().default("EUR/USD"),
          accountCurrency: z.string().default("USD"),
          exchangeRate: z.number().positive().default(1),
        })
      )
      .mutation(({ input }) => {
        return calculatePips(
          input.entryPrice,
          input.exitPrice,
          input.lotSize,
          input.pair,
          input.accountCurrency,
          input.exchangeRate
        );
      }),
    risk: protectedProcedure
      .input(
        z.object({
          accountBalance: z.number().positive(),
          riskPercent: z.number().min(0.1).max(10).default(2),
          entryPrice: z.number().positive(),
          stopLossPrice: z.number().positive(),
          takeProfitPrice: z.number().positive(),
          pair: z.string().default("EUR/USD"),
        })
      )
      .mutation(({ input }) => {
        return calculateRisk(
          input.accountBalance,
          input.riskPercent,
          input.entryPrice,
          input.stopLossPrice,
          input.takeProfitPrice,
          input.pair
        );
      }),
    fibonacci: protectedProcedure
      .input(
        z.object({ high: z.number().positive(), low: z.number().positive() })
      )
      .query(({ input }) => {
        return fibonacciRetracement(input.high, input.low);
      }),
    pivots: protectedProcedure
      .input(
        z.object({
          high: z.number().positive(),
          low: z.number().positive(),
          close: z.number().positive(),
        })
      )
      .query(({ input }) => {
        return pivotPoints(input.high, input.low, input.close);
      }),
    sentiment: protectedProcedure
      .input(
        z.object({
          closes: z.array(z.number()).min(30),
          highs: z.array(z.number()),
          lows: z.array(z.number()),
        })
      )
      .mutation(({ input }) => {
        return analyzeSentiment(input.closes, input.highs, input.lows);
      }),
    correlation: protectedProcedure
      .input(
        z.object({
          seriesA: z.array(z.number()).min(5),
          seriesB: z.array(z.number()).min(5),
        })
      )
      .query(({ input }) => {
        return { correlation: correlation(input.seriesA, input.seriesB) };
      }),
  }),
  soundDesign: router({
    createPatch: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(160), genre: z.string().max(80).optional(), mood: z.enum(["dark", "bright", "aggressive", "organic", "ambient"]).optional(), tempo: z.number().min(20).max(300).optional(), rootNote: z.string().max(4).optional(), wavetable: z.string().max(120).optional() }))
      .mutation(({ input }) => createSerumStylePatch(input)),
    analyzePatch: protectedProcedure
      .input(z.object({ patch: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => analyzeSynthPatch(input.patch as unknown as SynthPatch)),
    modulationMatrix: protectedProcedure
      .input(z.object({ patch: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => createModulationMatrix(input.patch as unknown as SynthPatch)),
    patchCapabilities: protectedProcedure.query(() => ({ formats: ["serum-style-json", "midi-cc-map", "nova-daw-bundle", "modulation-matrix", "macro-map"], categories: ["bass", "lead", "pad", "pluck", "fx", "drum-synth", "atmosphere"], note: "The backend returns an engine-neutral patch specification that can be adapted to Xfer Serum or another synth adapter." })),
    exportPatch: protectedProcedure
      .input(z.object({ format: z.enum(["midi-cc", "serum-style", "daw-bundle"]), patch: z.record(z.string(), z.unknown()) }))
      .mutation(({ input }) => input.format === "midi-cc" ? exportMidiCcMap(input.patch as unknown as SynthPatch) : input.format === "serum-style" ? exportSerumStylePreset(input.patch as unknown as SynthPatch) : exportDawBundle(input.patch as unknown as SynthPatch)),
  }),
  music: router({
    voiceChord: protectedProcedure.input(z.object({ root: z.string(), type: z.string(), octave: z.number().int().min(0).max(8).optional(), spread: z.number().min(0).max(8).optional(), inversion: z.number().int().min(0).max(8).optional() })).query(({ input }) => voiceChord(input as ChordEvent)),
    voiceLead: protectedProcedure.input(z.object({ progression: z.array(z.object({ root: z.string(), type: z.string(), duration: z.number().optional() })).min(1).max(64), octave: z.number().int().min(0).max(8).optional() })).query(({ input }) => voiceLeadProgression(input.progression as ChordEvent[], input)),
    arpeggio: protectedProcedure.input(z.object({ notes: z.array(z.number()).min(1).max(32), pattern: z.enum(["up", "down", "updown", "random"]).optional(), steps: z.number().int().min(1).max(512).optional(), subdivision: z.string().optional() })).query(({ input }) => generateArpeggio(input.notes, input.pattern, input.steps, input.subdivision)),
    reharmonize: protectedProcedure.input(z.object({ progression: z.array(z.object({ root: z.string(), type: z.string(), duration: z.number().optional() })).min(1).max(64), mode: z.enum(["diatonic", "secondary-dominants", "modal-mixture"]).optional() })).query(({ input }) => reharmonize(input.progression as ChordEvent[], input.mode)),
    groove: protectedProcedure.input(z.object({ steps: z.number().int().min(1).max(512).optional(), swing: z.number().min(0).max(.5).optional(), accentEvery: z.number().int().min(1).max(32).optional(), velocityMin: z.number().int().min(1).max(127).optional(), velocityMax: z.number().int().min(1).max(127).optional() })).query(({ input }) => generateGroove(input)),
    midiAutomation: protectedProcedure.input(z.object({ destination: z.string().min(1).max(200), start: z.number(), end: z.number(), bars: z.number().int().min(1).max(256).optional(), resolution: z.number().int().min(1).max(128).optional(), curve: z.enum(["linear", "ease-in", "ease-out", "sine"]).optional() })).query(({ input }) => generateMidiAutomation(input)),
    scales: protectedProcedure
      .input(
        z.object({
          root: z.enum([
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
          ]),
          name: z.string(),
        })
      )
      .query(({ input }) => {
        return {
          notes: getScaleNotes(input.root, input.name),
          availableScales: Object.keys(SCALES),
        };
      }),
    chords: protectedProcedure
      .input(
        z.object({
          root: z.enum([
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
          ]),
          type: z.string(),
        })
      )
      .query(({ input }) => {
        return {
          notes: getChordNotes(input.root, input.type),
          availableTypes: Object.keys(CHORD_TYPES),
        };
      }),
    scaleChords: protectedProcedure
      .input(
        z.object({
          root: z.enum([
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
          ]),
          scale: z.string(),
        })
      )
      .query(({ input }) => {
        return getScaleChords(input.root, input.scale);
      }),
    progression: protectedProcedure
      .input(
        z.object({
          root: z.enum([
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
          ]),
          scale: z.string().default("major"),
          degrees: z.array(z.number()).optional(),
          variations: z.boolean().default(true),
        })
      )
      .mutation(({ input }) => {
        return generateChordProgression(
          input.root,
          input.scale,
          input.degrees,
          input.variations
        );
      }),
    melody: protectedProcedure
      .input(
        z.object({
          root: z.enum([
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
          ]),
          scale: z.string().default("major"),
          length: z.number().int().min(4).max(64).default(16),
        })
      )
      .mutation(({ input }) => {
        return generateMelody(input.root, input.scale, input.length);
      }),
    drums: protectedProcedure
      .input(
        z.object({
          style: z
            .enum(["rock", "jazz", "hiphop", "electronic", "latin"])
            .default("rock"),
          bars: z.number().int().min(1).max(16).default(4),
        })
      )
      .mutation(({ input }) => {
        return generateDrumPattern(input.style, input.bars);
      }),
    song: protectedProcedure
      .input(
        z.object({
          root: z
            .enum([
              "C",
              "C#",
              "D",
              "D#",
              "E",
              "F",
              "F#",
              "G",
              "G#",
              "A",
              "A#",
              "B",
            ])
            .default("C"),
          scale: z.string().default("major"),
          style: z
            .enum(["rock", "jazz", "pop", "electronic", "classical"])
            .default("pop"),
          sections: z.array(z.string()).optional(),
        })
      )
      .mutation(({ input }) => {
        return generateSong(
          input.root,
          input.scale,
          input.style,
          input.sections
        );
      }),
    abc: protectedProcedure
      .input(
        z.object({
          root: z.enum([
            "C",
            "C#",
            "D",
            "D#",
            "E",
            "F",
            "F#",
            "G",
            "G#",
            "A",
            "A#",
            "B",
          ]),
          scale: z.string().default("major"),
          title: z.string().optional(),
          tempo: z.number().default(120),
        })
      )
      .mutation(({ input }) => {
        const melody = generateMelody(input.root, input.scale, 32);
        return { abc: melodyToABC(melody, input.title) };
      }),
    proScale: protectedProcedure.input(z.object({ root: z.number().int().min(0).max(127).default(60), scale: z.enum(["major", "minor", "dorian", "pentatonic", "blues"]).default("major"), octaves: z.number().int().min(1).max(4).default(2) })).query(({ input }) => ({ notes: scaleNotes(input.root, input.scale, input.octaves) })),
    chordExtensions: protectedProcedure.input(z.object({ root: z.number().int().min(0).max(127), quality: z.enum(["major", "minor", "dominant", "diminished"]).default("major"), extensions: z.array(z.number().int()).max(8).default([7, 9]) })).query(({ input }) => ({ notes: chordExtensions(input.root, input.quality, input.extensions) })),
    quantize: protectedProcedure.input(z.object({ events: z.array(z.object({ note: z.number(), start: z.number(), duration: z.number(), velocity: z.number() })).max(20000), grid: z.number().positive().max(64).default(.25), strength: z.number().min(0).max(1).default(1) })).mutation(({ input }) => quantizeNotes(input.events as NoteEvent[], input.grid, input.strength)),
    euclidean: protectedProcedure.input(z.object({ steps: z.number().int().min(1).max(128), pulses: z.number().int().min(0).max(128), rotation: z.number().int().optional() })).query(({ input }) => euclideanRhythm(input.steps, input.pulses, input.rotation)),
    drumGrid: protectedProcedure.input(z.object({ steps: z.number().int().min(1).max(128).default(16), density: z.number().min(0).max(1).default(.5), seed: z.number().int().optional() })).query(({ input }) => drumGrid(input.steps, input.density, input.seed)),
    automationShape: protectedProcedure.input(z.object({ points: z.array(z.number()).min(1).max(512), curve: z.enum(["linear", "ease-in", "ease-out", "sine"]).default("linear"), samples: z.number().int().min(2).max(4096).default(64) })).query(({ input }) => shapeAutomation(input.points, input.curve, input.samples)),
  }),
  codeTools: router({
    metrics: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(50000),
          language: z.string().default("typescript"),
        })
      )
      .mutation(({ input }) => {
        return analyzeMetrics(input.code, input.language);
      }),
    issues: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(50000),
          language: z.string().default("typescript"),
        })
      )
      .mutation(({ input }) => {
        return detectIssues(input.code, input.language);
      }),
    refactors: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(50000),
          language: z.string().default("typescript"),
        })
      )
      .mutation(({ input }) => {
        return suggestRefactors(input.code, input.language);
      }),
    convert: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(50000),
          from: z.string(),
          to: z.string(),
        })
      )
      .mutation(({ input }) => {
        return convertCode(input.code, input.from, input.to);
      }),
    documentation: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(50000),
          language: z.string().default("typescript"),
        })
      )
      .mutation(({ input }) => {
        return {
          documentation: generateDocumentation(input.code, input.language),
        };
      }),
    testStubs: protectedProcedure
      .input(
        z.object({
          code: z.string().min(1).max(50000),
          language: z.string().default("typescript"),
        })
      )
      .mutation(({ input }) => {
        return { tests: generateTestStubs(input.code, input.language) };
      }),
    regex: protectedProcedure
      .input(z.object({ input: z.string() }))
      .query(({ input }) => {
        return regexHelper(input.input);
      }),
  }),

  toolGovernance: router({
    policies: protectedProcedure.query(() => listToolPolicies()),
    runtime: protectedProcedure.query(() => listToolRuntime()),
    resetCircuit: adminProcedure.input(z.object({ toolName: z.string().min(1) })).mutation(({ input }) => resetToolCircuit(input.toolName)),
  }),
  backendTools: router({
    featureCatalog: protectedProcedure
      .input(
        z.object({
          count: z.number().int().min(1).max(20000).default(100),
          offset: z.number().int().min(0).default(0),
        })
      )
      .query(({ input }) => generateFeatureCatalog(input.count, input.offset)),
    advancedFeatureBundles: protectedProcedure.query(() => ({
      firstWave: generateFeatureCatalog(8000),
      secondWave: generateFeatureCatalog(10000, 8000),
      total: 18000,
      productionReadinessNote:
        "Generated as a deterministic, typed backend capability catalog for prioritization, roadmap planning, and implementation tracking.",
    })),
    redactSensitiveText: protectedProcedure
      .input(z.object({ text: z.string().min(1).max(100000) }))
      .mutation(({ input }) => redactSensitiveText(input.text)),
    chunkText: protectedProcedure
      .input(
        z.object({
          text: z.string().min(1).max(500000),
          maxChars: z.number().int().min(100).max(8000).default(1200),
          overlap: z.number().int().min(0).default(120),
        })
      )
      .mutation(({ input }) =>
        chunkText(input.text, input.maxChars, input.overlap)
      ),
    serviceHealth: protectedProcedure
      .input(
        z.object({
          latencyMs: z.number().min(0),
          errorRate: z.number().min(0).max(1),
          saturation: z.number().min(0).max(1),
          queueDepth: z.number().int().min(0).optional(),
        })
      )
      .query(({ input }) => evaluateServiceHealth(input)),
    runbook: protectedProcedure
      .input(
        z.object({
          service: z.string().min(1).max(120),
          symptom: z.string().min(1).max(500),
          severity: z.enum(["low", "normal", "high", "critical"]),
        })
      )
      .mutation(({ input }) => createRunbook(input)),
    tokenBucket: protectedProcedure
      .input(
        z.object({
          capacity: z.number().int().min(1).max(1_000_000),
          refillPerSecond: z.number().positive(),
          currentTokens: z.number().min(0),
          requestedTokens: z.number().int().min(1).optional(),
          elapsedMs: z.number().min(0),
        })
      )
      .query(({ input }) => evaluateTokenBucket(input)),
    cachePolicy: protectedProcedure
      .input(
        z.object({
          resource: z.string().min(1).max(160),
          volatility: z.enum(["static", "daily", "hourly", "realtime"]),
          userScoped: z.boolean().optional(),
          tags: z.array(z.string().min(1).max(80)).max(20).optional(),
        })
      )
      .query(({ input }) => buildCachePolicy(input)),
    circuitBreaker: protectedProcedure
      .input(
        z.object({
          successes: z.number().int().min(0),
          failures: z.number().int().min(0),
          minimumSamples: z.number().int().min(1).optional(),
          failureThreshold: z.number().min(0).max(1).optional(),
          openedAt: z.string().datetime().optional(),
          cooldownMs: z.number().int().min(1).optional(),
        })
      )
      .query(({ input }) => evaluateCircuitBreaker(input)),
    workflowPlan: protectedProcedure
      .input(
        z.object({
          steps: z
            .array(
              z.object({
                id: z.string().min(1).max(120),
                dependsOn: z.array(z.string().min(1).max(120)).optional(),
                durationMs: z.number().int().min(0).optional(),
                retryable: z.boolean().optional(),
              })
            )
            .min(1)
            .max(500),
        })
      )
      .mutation(({ input }) => planWorkflowExecution(input.steps)),
    featureFlag: protectedProcedure
      .input(
        z.object({
          flagKey: z.string().min(1).max(120),
          subjectId: z.string().min(1).max(240),
          rolloutPercent: z.number().min(0).max(100),
          enabled: z.boolean().optional(),
          allowList: z.array(z.string()).max(1000).optional(),
          denyList: z.array(z.string()).max(1000).optional(),
        })
      )
      .query(({ input }) => evaluateFeatureFlag(input)),
    idempotencyKey: protectedProcedure
      .input(
        z.object({
          method: z.string().min(1).max(16),
          path: z.string().min(1).max(2000),
          body: z.unknown(),
          tenantId: z.string().max(120).optional(),
        })
      )
      .mutation(({ input }) => ({ key: createIdempotencyKey(input) })),
    dataQuality: protectedProcedure
      .input(
        z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(5000) })
      )
      .mutation(({ input }) => scoreDataQuality(input.rows)),
    auditEvent: protectedProcedure
      .input(
        z.object({
          actorId: z.string().min(1).max(120),
          action: z.string().min(1).max(160),
          resource: z.string().min(1).max(240),
          metadata: z.record(z.string(), z.unknown()).optional(),
        })
      )
      .mutation(({ input }) => buildAuditEvent(input)),
    capacityPlan: protectedProcedure
      .input(
        z.object({
          currentRps: z.number().min(0),
          peakMultiplier: z.number().min(1),
          targetCpuUtilization: z.number().min(0.01).max(1),
          rpsPerInstance: z.number().positive(),
          minimumInstances: z.number().int().min(1).optional(),
        })
      )
      .query(({ input }) => planCapacity(input)),
    slo: protectedProcedure
      .input(
        z.object({
          target: z.number().min(0.0001).max(0.9999),
          goodEvents: z.number().int().min(0),
          totalEvents: z.number().int().min(0),
          windowDays: z.number().int().min(1).max(366).optional(),
        })
      )
      .query(({ input }) => evaluateSlo(input)),
    retryPolicy: protectedProcedure
      .input(
        z.object({
          maxAttempts: z.number().int().min(1).max(20),
          baseDelayMs: z.number().int().min(1),
          maxDelayMs: z.number().int().min(1),
          jitterRatio: z.number().min(0).max(1).optional(),
        })
      )
      .query(({ input }) => buildRetryPolicy(input)),
    accessPolicy: protectedProcedure
      .input(
        z.object({
          subject: z.object({
            id: z.string().min(1),
            roles: z.array(z.string()).max(100),
            attributes: z
              .record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean()])
              )
              .optional(),
          }),
          action: z.string().min(1).max(160),
          resource: z.object({
            id: z.string().min(1),
            ownerId: z.string().optional(),
            requiredRoles: z.array(z.string()).max(100).optional(),
            attributes: z
              .record(
                z.string(),
                z.union([z.string(), z.number(), z.boolean()])
              )
              .optional(),
          }),
        })
      )
      .query(({ input }) => evaluateAccessPolicy(input)),
    secretScan: protectedProcedure
      .input(z.object({ text: z.string().min(1).max(200000) }))
      .mutation(({ input }) => scanSecrets(input.text)),
    pagination: protectedProcedure
      .input(
        z.object({
          totalItems: z.number().int().min(0),
          page: z.number().int().min(1),
          pageSize: z.number().int().min(1),
          maxPageSize: z.number().int().min(1).max(5000).optional(),
        })
      )
      .query(({ input }) => planPagination(input)),
    apiCompatibility: protectedProcedure
      .input(
        z.object({
          previous: z
            .array(
              z.object({
                path: z.string(),
                method: z.string(),
                responseFields: z.array(z.string()),
              })
            )
            .max(1000),
          next: z
            .array(
              z.object({
                path: z.string(),
                method: z.string(),
                responseFields: z.array(z.string()),
              })
            )
            .max(1000),
        })
      )
      .mutation(({ input }) => compareApiVersions(input)),
    usageCost: protectedProcedure
      .input(
        z.object({
          unitCost: z.number().min(0),
          currentUnits: z.number().min(0),
          growthRate: z.number().min(-0.99).max(10),
          months: z.number().int().min(1).max(60),
        })
      )
      .query(({ input }) => forecastUsageCost(input)),
    dependencyRisk: protectedProcedure
      .input(
        z.object({
          dependencies: z
            .array(
              z.object({
                name: z.string().min(1),
                version: z.string().min(1),
                daysSinceUpdate: z.number().int().min(0),
                criticalVulnerabilities: z.number().int().min(0).optional(),
                direct: z.boolean().optional(),
              })
            )
            .max(5000),
        })
      )
      .mutation(({ input }) => analyzeDependencyRisk(input.dependencies)),
    maintenanceWindow: protectedProcedure
      .input(
        z.object({
          durationMinutes: z.number().int().min(1).max(10080),
          impactedUsers: z.number().int().min(0),
          regions: z.array(z.string().min(1)).min(1).max(100),
          canaryPercent: z.number().min(0).max(100).optional(),
        })
      )
      .query(({ input }) => planMaintenanceWindow(input)),
    eventSummary: protectedProcedure
      .input(
        z.object({
          events: z
            .array(
              z.object({
                type: z.string().min(1),
                timestamp: z.string().datetime(),
                severity: z
                  .enum(["info", "warning", "error", "critical"])
                  .optional(),
              })
            )
            .max(10000),
        })
      )
      .mutation(({ input }) => summarizeEventStream(input.events)),
  }),
  skills: router({
    list: protectedProcedure.input(z.object({ category: z.enum(["research", "trading", "music", "engineering", "memory", "agentic"]).optional() })).query(({ input }) => listSkills(input.category)),
    get: protectedProcedure.input(z.object({ id: z.string().min(1).max(100) })).query(({ input }) => getSkill(input.id) ?? null),
  }),
  agents: router({
    list: protectedProcedure.query(() => listAgents()),
    swarm: protectedProcedure
      .input(z.object({ roles: z.array(z.enum(["forex_analyst", "code_reviewer", "music_composer", "data_analyst", "research_agent", "writing_assistant", "math_tutor", "translator", "summarizer", "brainstormer", "sound_designer", "quant_researcher", "risk_manager", "memory_architect", "ml_engineer", "music_producer", "audio_engineer", "market_microstructure", "data_engineer", "automation_orchestrator", "qa_engineer"])).min(2).max(6), prompt: z.string().min(1).max(12000), model: z.string().optional(), maxSteps: z.number().int().min(1).max(8).default(3) }))
      .mutation(({ input }) => runAgentSwarm(input)),
    run: protectedProcedure
      .input(
        z.object({
          agentId: z.enum([
            "forex_analyst",
            "code_reviewer",
            "music_composer",
            "data_analyst",
            "research_agent",
            "writing_assistant",
            "math_tutor",
            "translator",
            "summarizer",
            "brainstormer",
            "sound_designer",
            "quant_researcher",
            "risk_manager",
            "memory_architect",
            "ml_engineer",
            "music_producer",
          ]),
          messages: z.array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          ),
          model: z.string().optional(),
          context: z.string().optional(),
          maxSteps: z.number().int().min(1).max(10).default(5),
        })
      )
      .mutation(async ({ input }) => {
        return runAgent(input.agentId, input.messages, {
          model: input.model,
          context: input.context,
          maxSteps: input.maxSteps,
        });
      }),
  }),
  pipelines: router({
    list: protectedProcedure.query(() => listPipelines()),
    get: protectedProcedure
      .input(z.object({ id: z.string() }))
      .query(({ input }) => {
        const pipeline = getPipeline(input.id);
        if (!pipeline) throw new Error("Pipeline not found");
        return pipeline;
      }),
    run: protectedProcedure
      .input(
        z.object({
          id: z.string(),
          input: z.string().min(1).max(10000),
          model: z.string().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return executePipeline(input.id, input.input, { model: input.model });
      }),
  }),
  brain: router({
    memories: protectedProcedure.query(({ ctx }) => listMemories(String(ctx.user.id))),
    persistentMemories: protectedProcedure.query(({ ctx }) => listPersistentMemories(ctx.user.id)),
    persistentRecall: protectedProcedure.input(z.object({ query: z.string().min(1).max(2000), limit: z.number().int().min(1).max(25).default(8) })).query(({ ctx, input }) => recallPersistentMemories(ctx.user.id, input.query, input.limit)),
    persistentRemember: protectedProcedure.input(z.object({ kind: z.enum(["preference", "fact", "goal", "conversation", "tool-result"]), content: z.string().min(1).max(10000), tags: z.array(z.string()).max(30).default([]), importance: z.number().min(0).max(1).default(.5), retentionDays: z.number().int().min(1).max(3650).optional() })).mutation(({ ctx, input }) => storePersistentMemory({ userId: ctx.user.id, ...input })),
    persistentForget: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => forgetPersistentMemory(ctx.user.id, input.id)),
    purgeExpired: adminProcedure.input(z.object({ userId: z.number().int().positive().optional() })).mutation(({ input }) => purgeExpiredMemories(input.userId)),
    retentionPolicy: protectedProcedure.query(() => retentionPolicy()),
    recall: protectedProcedure.input(z.object({ query: z.string().min(1).max(2000), limit: z.number().int().min(1).max(25).default(8) })).query(({ ctx, input }) => recallMemories(String(ctx.user.id), input.query, input.limit)),
    remember: protectedProcedure.input(z.object({ kind: z.enum(["preference", "fact", "goal", "conversation", "tool-result"]), text: z.string().min(1).max(5000), tags: z.array(z.string()).max(20).default([]), importance: z.number().min(0).max(1).default(.5) })).mutation(({ ctx, input }) => storeMemory({ userId: String(ctx.user.id), kind: input.kind as MemoryKind, text: input.text, tags: input.tags, importance: input.importance })),
    forget: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => forgetMemory(String(ctx.user.id), input.id)),
    neuralForward: protectedProcedure.input(z.object({ input: z.array(z.number()).max(2048), layers: z.array(z.object({ weights: z.array(z.array(z.number())), bias: z.array(z.number()), activation: z.enum(["relu", "tanh", "sigmoid", "linear"]).optional() })).max(32) })).mutation(({ input }) => neuralForward(input.input, input.layers as DenseLayer[])),
    neuralFeatures: protectedProcedure.input(z.object({ values: z.array(z.number()).max(10000) })).mutation(({ input }) => neuralFeatureVector(input.values)),
    softmax: protectedProcedure.input(z.object({ values: z.array(z.number()).min(1).max(4096) })).mutation(({ input }) => softmax(input.values)),
    convolution1d: protectedProcedure.input(z.object({ values: z.array(z.number()).min(1).max(10000), kernel: z.array(z.number()).min(1).max(128), bias: z.number().optional(), activation: z.enum(["relu", "tanh", "sigmoid", "linear"]).optional() })).mutation(({ input }) => conv1d(input.values, input.kernel, input.bias, input.activation)),
    recurrentSequence: protectedProcedure.input(z.object({ sequence: z.array(z.array(z.number())).min(1).max(512), layers: z.array(z.object({ weights: z.array(z.array(z.number())), bias: z.array(z.number()), activation: z.enum(["relu", "tanh", "sigmoid", "linear"]).optional() })).max(32), carry: z.array(z.number()).optional() })).mutation(({ input }) => recurrentSequenceForward(input.sequence, input.layers as DenseLayer[], input.carry)),
    ensemble: protectedProcedure.input(z.object({ input: z.array(z.number()).max(2048), models: z.array(z.array(z.object({ weights: z.array(z.array(z.number())), bias: z.array(z.number()), activation: z.enum(["relu", "tanh", "sigmoid", "linear"]).optional() }))).min(1).max(16) })).mutation(({ input }) => ensembleForward(input.input, input.models as DenseLayer[][])),
  }),
  trading: router({
    indicatorCatalog: protectedProcedure.input(z.object({ category: z.enum(["trend", "momentum", "volatility", "volume", "price"]).optional() })).query(({ input }) => listIndicators(input.category as IndicatorCategory | undefined)),
    indicator: protectedProcedure.input(z.object({ id: z.string(), candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(5).max(10000) })).mutation(({ input }) => computeIndicator(input.id, input.candles)),
    researchBacktest: protectedProcedure.input(z.object({ candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(60), config: z.record(z.string(), z.number()).optional() })).mutation(({ input }) => runResearchBacktest(input.candles, input.config as ResearchConfig | undefined)),
    forwardTest: protectedProcedure.input(z.object({ candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(70), config: z.record(z.string(), z.number()).optional() })).mutation(({ input }) => runForwardTest(input.candles, input.config as ResearchConfig | undefined)),
    walkForward: protectedProcedure.input(z.object({ candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(100), config: z.record(z.string(), z.number()).optional() })).mutation(({ input }) => walkForwardAnalysis(input.candles, input.config as ResearchConfig | undefined)),
    strategies: protectedProcedure.query(() => BUILT_IN_STRATEGIES),
    streamCatalog: protectedProcedure.query(() => listMarketStreams()),
    coinbaseSubscription: protectedProcedure.input(z.object({ productIds: z.array(z.string()).min(1).max(50), channel: z.enum(["ticker", "market_trades", "level2", "candles"]).default("ticker") })).query(({ input }) => ({ url: "wss://advanced-trade-ws.coinbase.com", payload: buildCoinbaseSubscription(input.productIds, input.channel), authRequired: false })),
    massiveSubscription: protectedProcedure.input(z.object({ symbols: z.array(z.string()).min(1).max(100), channel: z.enum(["trades", "quotes", "bars"]).default("trades") })).query(({ input }) => ({ url: ENV.massiveWsUrl || null, payload: buildMassiveSubscription(input.symbols, input.channel), configured: Boolean(ENV.massiveWsUrl && ENV.massiveApiKey), authRequired: true })),
    backtest: protectedProcedure.input(z.object({
      candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(50),
      strategyName: z.string().optional(),
      customStrategy: z.object({
        name: z.string(), description: z.string(), timeframe: z.string(), marketType: z.string(),
        entryRules: z.array(z.object({ type: z.string(), params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])) })),
        exitRules: z.object({ tpAtrMult: z.number(), slAtrMult: z.number(), trailingStop: z.boolean().optional(), trailingAtrMult: z.number().optional(), maxHoldingBars: z.number() }),
        riskManagement: z.object({ riskPerTrade: z.number(), maxConcurrentPositions: z.number(), minBarsBetweenTrades: z.number() }),
      }).optional(),
    })).mutation(({ input }) => {
      const strategy = input.customStrategy ?? BUILT_IN_STRATEGIES.find(s => s.name === input.strategyName) ?? BUILT_IN_STRATEGIES[0];
      const { trades, equityCurve, drawdownCurve, ...stats } = runBacktest(input.candles, strategy as StrategyDefinition);
      return { ...stats, tradeCount: trades.length, sampleTrades: trades.slice(-10) };
    }),
    automatedBacktest: protectedProcedure.input(z.object({
      candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(60).max(10000),
      strategyName: z.string().optional(),
      commissionBps: z.number().min(0).max(500).default(0),
      slippageBps: z.number().min(0).max(500).default(0),
      walkForwardFolds: z.number().int().min(0).max(8).optional(),
    })).mutation(({ input }) => { const strategy = BUILT_IN_STRATEGIES.find(s => s.name === input.strategyName) ?? BUILT_IN_STRATEGIES[0]; return runAutomatedBacktest(input.candles, strategy, { commissionBps: input.commissionBps, slippageBps: input.slippageBps, walkForwardFolds: input.walkForwardFolds }); }),
    signals: protectedProcedure.input(z.object({
      candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(30),
      strategyType: z.enum(['rsi_bb_reversal', 'macd_cross', 'stochastic_cross', 'ema_cross', 'ichimoku_supertrend', 'fibonacci_breakout', 'multi_indicator_confluence']),
      params: z.record(z.string(), z.number()).optional(),
    })).mutation(({ input }) => {
      switch (input.strategyType) {
        case 'rsi_bb_reversal': return { signals: generateRSIBBSignal(input.candles, input.params as any) };
        case 'macd_cross': return { signals: generateMACDCrossSignal(input.candles, input.params as any) };
        case 'stochastic_cross': return { signals: generateStochasticCrossSignal(input.candles, input.params as any) };
        case 'ema_cross': return { signals: generateEMACrossSignal(input.candles, input.params as any) };
        case 'ichimoku_supertrend': return { signals: generateIchimokuSuperTrendSignal(input.candles, input.params as any) };
        case 'fibonacci_breakout': return { signals: generateFibonacciBreakoutSignal(input.candles, input.params as any) };
        case 'multi_indicator_confluence': return { signals: generateConfluenceSignal(input.candles) };
      }
    }),
    patterns: protectedProcedure.input(z.object({
      candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(5).max(500),
    })).mutation(({ input }) => {
      const allPatterns = detectCandlePatterns(input.candles);
      const detected = allPatterns.map((patterns, i) => ({ bar: i + 1, time: input.candles[i].timestamp, patterns })).filter(p => p.patterns.length > 0);
      return { totalBars: input.candles.length, barsWithPatterns: detected.length, patterns: detected };
    }),
    derivSymbols: protectedProcedure.query(() => DERIV_SYMBOLS),
    derivWsUrl: protectedProcedure.input(z.object({ appId: z.string().default('1089') })).query(({ input }) => ({ url: buildDerivWebSocketURL(input.appId) })),
    indicators: protectedProcedure.input(z.object({
      closes: z.array(z.number()).min(5),
      highs: z.array(z.number()).optional(),
      lows: z.array(z.number()).optional(),
      volumes: z.array(z.number()).optional(),
      indicator: z.enum(['sma', 'ema', 'rsi', 'atr', 'bollinger', 'macd', 'stochastic', 'adx', 'williams_r', 'cci', 'obv', 'vwap']),
      period: z.number().int().min(2).max(200).default(14),
      period2: z.number().int().min(2).max(200).optional(),
      period3: z.number().int().min(2).max(200).optional(),
    })).mutation(({ input }) => {
      const { closes, highs, lows, volumes, indicator, period, period2, period3 } = input;
      switch (indicator) {
        case 'sma': return { indicator: 'SMA', values: tsSma(closes, period) };
        case 'ema': return { indicator: 'EMA', values: tsEma(closes, period) };
        case 'rsi': return { indicator: 'RSI', values: tsRsi(closes, period) };
        case 'macd': { const r = tsMacd(closes, period, period2 ?? 26, period3 ?? 9); return { indicator: 'MACD', values: r }; }
        case 'stochastic': { if (!highs || !lows) throw new Error('highs and lows required'); return { indicator: 'Stochastic', values: tsStochastic(closes.map((c,i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period, period2 ?? 3) }; }
        case 'bollinger': return { indicator: 'Bollinger Bands', values: tsBB(closes, period) };
        case 'atr': { if (!highs || !lows) throw new Error('highs and lows required'); return { indicator: 'ATR', values: tsAtr(closes.map((c,i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) }; }
        case 'adx': { if (!highs || !lows) throw new Error('highs and lows required'); return { indicator: 'ADX', values: tsAdx(closes.map((c,i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) }; }
        case 'williams_r': { if (!highs || !lows) throw new Error('highs and lows required'); return { indicator: 'Williams %R', values: tsWilliamsR(closes.map((c,i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) }; }
        case 'cci': { if (!highs || !lows) throw new Error('highs and lows required'); return { indicator: 'CCI', values: tsCci(closes.map((c,i) => ({ timestamp: i, open: c, high: highs[i], low: lows[i], close: c, volume: 0 })), period) }; }
        case 'obv': { if (!volumes) throw new Error('volumes required'); return { indicator: 'OBV', values: tsObv(closes.map((c,i) => ({ timestamp: i, open: c, high: c, low: c, close: c, volume: volumes[i] }))) }; }
        case 'vwap': { if (!volumes) throw new Error('volumes required'); return { indicator: 'VWAP', values: tsVwap(closes.map((c,i) => ({ timestamp: i, open: c, high: c, low: c, close: c, volume: volumes[i] }))) }; }
      }
    }),
  }),
  swarm: router({
    agents: protectedProcedure.query(() => listSwarmAgents()),
    run: protectedProcedure.input(z.object({
      candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(30),
    })).mutation(({ input }) => {
      return runSwarmConsensus(input.candles);
    }),
  }),
  sandbox: router({
    execute: protectedProcedure.input(z.object({
      code: z.string().min(1).max(10000),
      timeoutMs: z.number().int().min(100).max(60000).default(60000),
      maxOutputLength: z.number().int().min(100).max(50000).default(20000),
      allowImports: z.literal(false).default(false),
      allowNetwork: z.boolean().default(true),
    })).mutation(async ({ input }) => {
      return executeSandboxedCode(input.code, { timeoutMs: input.timeoutMs, maxOutputLength: input.maxOutputLength, allowImports: false, allowedImports: [], allowNetwork: input.allowNetwork });
    }),
    capabilities: protectedProcedure.query(() => ({
      execution: "policy-controlled-in-process",
      imports: false,
      network: "allowlisted-https-get-head",
      maxTimeoutMs: 60000,
      maxOutputLength: 50000,
      blockedCapabilities: ["filesystem", "process", "dynamic-eval", "child-process", "private-network", "non-https", "mutating-network-methods"],
      configuration: "Set SANDBOX_ALLOWED_HOSTS to a comma-separated host allowlist.",
      note: "For arbitrary dependencies or long-running jobs, use an external isolated runner such as E2B; Vercel functions cannot safely provide unrestricted one-hour host control.",
    })),
  }),
});

export type AppRouter = typeof appRouter;
