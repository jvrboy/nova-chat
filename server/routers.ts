import { z } from "zod";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { generateImage, listImageModels } from "./_core/imageGeneration";
import { transcribeAudio } from "./_core/voiceTranscription";
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
import {
  runBacktest, BUILT_IN_STRATEGIES, generateRSIBBSignal, generateMACDCrossSignal,
  type StrategyDefinition,
  generateStochasticCrossSignal, generateEMACrossSignal, detectCandlePatterns,
  DERIV_SYMBOLS, parseDerivCandles, buildDerivWebSocketURL, buildDerivCandleRequest,
  sma as tsSma, ema as tsEma, rsi as tsRsi, atr as tsAtr, bollingerBands as tsBB,
  macd as tsMacd, stochastic as tsStochastic, adx as tsAdx, williamsR as tsWilliamsR,
  cci as tsCci, obv as tsObv, vwap as tsVwap,
} from "./_core/tradingStrategy";
import { runSwarmConsensus, listSwarmAgents, SWARM_AGENTS } from "./_core/swarmConsensus";
import { executeSandboxedCode } from "./_core/performanceTools";
import { e2bRunCode, firecrawlScrape, invokeWithProviderFailover, kaggleListDatasets, listConnectionStatus, listProviderStatus, type ProviderId } from "./_core/providerGateway";
import {
  createConversation,
  createMessage,
  createProject,
  getConversation,
  listConversations,
  listProjects,
  updateConversation,
  updateProject,
} from "./db";

const projectInput = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(10000).optional(),
});
const conversationInput = z.object({
  title: z.string().min(1).max(240),
  projectId: z.number().int().positive().optional(),
  model: z.string().max(64).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
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
    connections: protectedProcedure.query(() => listConnectionStatus()),
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
  agents: router({
    list: protectedProcedure.query(() => listAgents()),
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
  trading: router({
    strategies: protectedProcedure.query(() => BUILT_IN_STRATEGIES),
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
    signals: protectedProcedure.input(z.object({
      candles: z.array(z.object({ timestamp: z.number(), open: z.number(), high: z.number(), low: z.number(), close: z.number(), volume: z.number() })).min(30),
      strategyType: z.enum(['rsi_bb_reversal', 'macd_cross', 'stochastic_cross', 'ema_cross']),
      params: z.record(z.string(), z.number()).optional(),
    })).mutation(({ input }) => {
      switch (input.strategyType) {
        case 'rsi_bb_reversal': return { signals: generateRSIBBSignal(input.candles, input.params as any) };
        case 'macd_cross': return { signals: generateMACDCrossSignal(input.candles, input.params as any) };
        case 'stochastic_cross': return { signals: generateStochasticCrossSignal(input.candles, input.params as any) };
        case 'ema_cross': return { signals: generateEMACrossSignal(input.candles, input.params as any) };
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
      timeoutMs: z.number().int().min(100).max(30000).default(5000),
      allowImports: z.boolean().default(false),
    })).mutation(async ({ input }) => {
      return executeSandboxedCode(input.code, { timeoutMs: input.timeoutMs, allowImports: input.allowImports });
    }),
  }),
});

export type AppRouter = typeof appRouter;
