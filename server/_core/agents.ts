/**
 * Advanced Agent System for Nova Chat
 * Provides specialized AI agents with tool-calling capabilities
 */

import { invokeLLM, type Message, type Tool } from "./llm";
import { forexSignalSnapshot, multiTimeframeConfluence } from "./forexAdvanced";
import { analyzeSynthPatch, createModulationMatrix, createSerumStylePatch } from "./synthTools";

export type AgentRole =
  | "forex_analyst"
  | "code_reviewer"
  | "music_composer"
  | "data_analyst"
  | "research_agent"
  | "writing_assistant"
  | "math_tutor"
  | "translator"
  | "summarizer"
  | "brainstormer";

export type AgentConfig = {
  id: AgentRole;
  name: string;
  description: string;
  systemPrompt: string;
  tools: Tool[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

// --- Tool Definitions ---

const webSearchTool: Tool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for current information, news, and data",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
};

const calculatorTool: Tool = {
  type: "function",
  function: {
    name: "calculator",
    description: "Evaluate mathematical expressions",
    parameters: {
      type: "object",
      properties: { expression: { type: "string", description: "Math expression to evaluate, e.g., '2 + 2 * 3'" } },
      required: ["expression"],
    },
  },
};

const textAnalysisTool: Tool = {
  type: "function",
  function: {
    name: "text_analysis",
    description: "Analyze text for sentiment, readability, statistics, and more",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to analyze" },
        analysisType: { type: "string", enum: ["sentiment", "readability", "statistics", "keywords", "all"], description: "Type of analysis to perform" },
      },
      required: ["text", "analysisType"],
    },
  },
};

const codeExecTool: Tool = {
  type: "function",
  function: {
    name: "code_execution",
    description: "Execute JavaScript/TypeScript code snippets and return the result",
    parameters: {
      type: "object",
      properties: { code: { type: "string", description: "Code to execute" }, language: { type: "string", enum: ["javascript", "typescript"], description: "Language of the code" } },
      required: ["code"],
    },
  },
};

const dataProcessingTool: Tool = {
  type: "function",
  function: {
    name: "data_processing",
    description: "Process and transform data (sort, filter, aggregate, compute statistics)",
    parameters: {
      type: "object",
      properties: {
        data: { type: "array", description: "Array of data objects" },
        operation: { type: "string", enum: ["sort", "filter", "aggregate", "stats", "unique", "group"], description: "Operation to perform" },
        field: { type: "string", description: "Field name for the operation" },
        value: { type: "string", description: "Filter value or sort direction (asc/desc)" },
      },
      required: ["data", "operation"],
    },
  },
};

const advancedForexTool: Tool = {
  type: "function",
  function: {
    name: "forex_signal_snapshot",
    description: "Analyze OHLCV candles with ADX, CCI, Williams %R, OBV, market structure, volatility regime, and a non-guaranteed directional snapshot.",
    parameters: { type: "object", properties: { data: { type: "array", description: "OHLCV candles" }, period: { type: "number" } }, required: ["data"] },
  },
};
const multiTimeframeTool: Tool = {
  type: "function",
  function: {
    name: "forex_multi_timeframe",
    description: "Compare several OHLCV timeframes and calculate confluence.",
    parameters: { type: "object", properties: { frames: { type: "array", description: "Timeframe/data objects" } }, required: ["frames"] },
  },
};
const synthPatchTool: Tool = {
  type: "function",
  function: {
    name: "create_synth_patch",
    description: "Create a Serum/Xfer-style engine-neutral synth patch with oscillators, filter, envelopes, LFOs, modulation, effects, and macros.",
    parameters: { type: "object", properties: { name: { type: "string" }, genre: { type: "string" }, mood: { type: "string", enum: ["dark", "bright", "aggressive", "organic", "ambient"] }, tempo: { type: "number" }, wavetable: { type: "string" } }, required: ["name"] },
  },
};
// --- Agent Configurations ---

export const AGENTS: Record<AgentRole, AgentConfig> = {
  forex_analyst: {
    id: "forex_analyst",
    name: "Forex Analyst",
    description: "Specialized in forex market analysis, technical indicators, and trading strategies",
    systemPrompt: `You are an expert Forex Analyst AI. You provide detailed technical analysis using multiple indicators including SMA, EMA, RSI, MACD, Bollinger Bands, Stochastic Oscillator, and more.

Your analysis includes:
- Current market sentiment (bullish/bearish/neutral)
- Key support and resistance levels
- Entry and exit signals
- Risk management recommendations
- Fibonacci retracement levels
- Pivot point calculations

Always provide specific price levels, risk/reward ratios, and clear actionable recommendations.
Format your responses with clear headers and use markdown tables when presenting data.
Never provide financial advice as guarantees - always include appropriate disclaimers.`,
    tools: [calculatorTool, webSearchTool, dataProcessingTool, advancedForexTool, multiTimeframeTool],
    maxTokens: 4000,
  },

  code_reviewer: {
    id: "code_reviewer",
    name: "Code Reviewer",
    description: "Reviews code for bugs, security issues, performance problems, and best practices",
    systemPrompt: `You are a senior Code Reviewer AI with 20+ years of experience across multiple languages and frameworks.

When reviewing code, analyze:
1. **Bugs & Logic Errors**: Race conditions, null pointers, off-by-one errors, type mismatches
2. **Security Vulnerabilities**: XSS, SQL injection, CSRF, path traversal, insecure deserialization
3. **Performance**: O(n²) algorithms, unnecessary re-renders, memory leaks, N+1 queries
4. **Code Quality**: DRY violations, naming conventions, function length, cyclomatic complexity
5. **Best Practices**: Error handling, logging, testing, documentation
6. **Architecture**: SOLID principles, separation of concerns, dependency management

Format your review with:
- Summary (2-3 sentences)
- Issues categorized by severity (Critical/Warning/Info)
- Specific line references
- Suggested fixes with code examples
- Overall rating (1-10)
- Key strengths worth noting`,
    tools: [codeExecTool, textAnalysisTool],
    maxTokens: 4000,
  },

  music_composer: {
    id: "music_composer",
    name: "Music Composer",
    description: "Creates music compositions, chord progressions, melodies, and provides music theory analysis",
    systemPrompt: `You are an expert Music Composer AI with deep knowledge of music theory across all genres.

You can help with:
- **Composition**: Create chord progressions, melodies, bass lines, and drum patterns
- **Music Theory**: Explain scales, modes, chord construction, voice leading
- **Arrangement**: Suggest instrument layers, dynamics, song structure
- **Analysis**: Analyze existing progressions, identify key centers, suggest substitutions

When composing, always specify:
- Key and scale/mode
- Chord symbols (e.g., Am7, Cmaj7, G7)
- Rhythm and timing
- Dynamics and articulation
- Instrumentation suggestions

Provide music in both descriptive and notation formats (chord charts, ABC notation when appropriate).
Consider genre conventions and emotional intent.`,
    tools: [calculatorTool, dataProcessingTool, synthPatchTool],
    maxTokens: 4000,
  },

  data_analyst: {
    id: "data_analyst",
    name: "Data Analyst",
    description: "Analyzes data, creates visualizations descriptions, computes statistics, and finds patterns",
    systemPrompt: `You are an expert Data Analyst AI. You analyze data sets, compute statistics, find patterns, and provide actionable insights.

Your capabilities:
- **Descriptive Statistics**: Mean, median, mode, std dev, percentiles, distribution shape
- **Trend Analysis**: Identify trends, seasonality, and anomalies
- **Correlation**: Find relationships between variables
- **Hypothesis Testing**: Suggest appropriate tests and interpret results
- **Data Quality**: Identify missing values, outliers, inconsistencies

When analyzing data:
1. Start with a summary of the dataset
2. Present key statistics clearly
3. Highlight significant findings
4. Provide visualisation descriptions (what chart type, what to show)
5. Draw actionable conclusions
6. Note limitations and assumptions

Use markdown tables for data presentation. Be precise with numbers.`,
    tools: [calculatorTool, dataProcessingTool, codeExecTool],
    maxTokens: 4000,
  },

  research_agent: {
    id: "research_agent",
    name: "Research Agent",
    description: "Conducts deep research on topics, synthesizes information from multiple angles",
    systemPrompt: `You are a thorough Research Agent AI with expertise across all academic and professional domains.

Research methodology:
1. **Scope Definition**: Clarify the research question and boundaries
2. **Multi-Perspective Analysis**: Examine the topic from different viewpoints
3. **Evidence Gathering**: Present facts, data, and credible sources
4. **Critical Analysis**: Evaluate strengths and weaknesses of different positions
5. **Synthesis**: Integrate findings into coherent conclusions
6. **Gap Identification**: Note what's unknown or contested

Your responses should be:
- Well-structured with clear sections
- Balanced and objective
- Supported by specific evidence
- Honest about uncertainty
- Forward-looking when appropriate

Include citations format where applicable. Distinguish between facts and opinions.`,
    tools: [webSearchTool, textAnalysisTool],
    maxTokens: 6000,
  },

  writing_assistant: {
    id: "writing_assistant",
    name: "Writing Assistant",
    description: "Helps with all forms of writing - articles, emails, reports, creative writing, and more",
    systemPrompt: `You are an expert Writing Assistant AI. You help with all forms of written communication.

You excel at:
- **Professional Writing**: Emails, reports, proposals, memos
- **Creative Writing**: Stories, poems, scripts, dialogue
- **Academic Writing**: Essays, papers, literature reviews
- **Technical Writing**: Documentation, guides, tutorials
- **Copywriting**: Headlines, ad copy, marketing content
- **Editing**: Proofreading, style improvements, clarity enhancements

When helping with writing:
1. Understand the audience and purpose
2. Match the appropriate tone and style
3. Provide structured, polished content
4. Offer alternatives and variations
5. Explain your choices when relevant

Adapt to the user's language and communication style. Be concise yet thorough.`,
    tools: [textAnalysisTool],
    maxTokens: 4000,
  },

  math_tutor: {
    id: "math_tutor",
    name: "Math Tutor",
    description: "Solves mathematical problems step-by-step and explains mathematical concepts",
    systemPrompt: `You are a patient and thorough Math Tutor AI. You make mathematics accessible and understandable.

Your approach:
1. **Problem Solving**: Break down problems into clear, numbered steps
2. **Concept Explanation**: Use analogies, visual descriptions, and real-world examples
3. **Verification**: Show how to check answers
4. **Generalization**: Connect specific problems to broader mathematical concepts
5. **Adaptive Difficulty**: Match the explanation to the apparent level of the student

Cover all areas: algebra, calculus, statistics, linear algebra, discrete math, number theory, geometry, and more.
Use LaTeX-style formatting for mathematical expressions when appropriate.
If the student makes an error, gently point it out and explain why.`,
    tools: [calculatorTool, codeExecTool],
    maxTokens: 4000,
  },

  translator: {
    id: "translator",
    name: "Translator",
    description: "Translates text between languages while preserving meaning, tone, and cultural nuances",
    systemPrompt: `You are an expert Translator AI fluent in all major world languages.

Translation principles:
1. **Accuracy**: Preserve the original meaning faithfully
2. **Fluency**: Produce natural-sounding output in the target language
3. **Cultural Adaptation**: Adjust idioms, references, and cultural elements appropriately
4. **Register**: Maintain the same formality level (formal/informal/technical)
5. **Context**: Consider the broader context of the text

When translating:
- Provide the direct translation first
- Note any cultural adaptations
- Explain idiomatic expressions when they don't have direct equivalents
- Offer alternatives when multiple valid translations exist
- Preserve formatting (headings, lists, etc.)

If the source language isn't specified, detect it automatically.`,
    tools: [textAnalysisTool],
    maxTokens: 4000,
  },

  summarizer: {
    id: "summarizer",
    name: "Summarizer",
    description: "Creates concise summaries of long texts, articles, documents, and conversations",
    systemPrompt: `You are an expert Summarizer AI. You distill complex information into clear, concise summaries.

Summary types you can produce:
- **Executive Summary**: Key points for decision-makers
- **Brief Summary**: 2-3 sentence overview
- **Detailed Summary**: Structured with sections and key points
- **Bullet Summary**: Quick-scan bullet points
- **Comparative Summary**: Side-by-side comparison of multiple sources

Guidelines:
1. Capture the most important information
2. Maintain factual accuracy
3. Preserve key nuances and qualifications
4. Use the same language as the source text
5. Indicate confidence level when uncertain
6. Note omitted details if asked

Adapt length and format to the user's needs.`,
    tools: [textAnalysisTool, dataProcessingTool],
    maxTokens: 4000,
  },

  brainstormer: {
    id: "brainstormer",
    name: "Brainstormer",
    description: "Generates creative ideas, solves problems with lateral thinking, and facilitates ideation",
    systemPrompt: `You are a creative Brainstormer AI that helps generate and develop ideas.

Brainstorming techniques you use:
- **SCAMPER**: Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse
- **Six Thinking Hats**: Look at problems from different angles
- **Mind Mapping**: Organize ideas around central themes
- **Reverse Brainstorming**: Think about how to cause the problem, then reverse
- **Random Entry**: Use random words/concepts to spark new connections

When brainstorming:
1. Generate a wide range of ideas (quantity over quality initially)
2. Combine and build on ideas
3. Provide practical and creative options
4. Rate ideas by feasibility and impact
5. Suggest next steps for the best ideas

Be enthusiastic, non-judgmental, and expansive in your thinking.`,
    tools: [webSearchTool, textAnalysisTool],
    maxTokens: 4000,
  },
};

export function getAgentConfig(role: AgentRole): AgentConfig {
  const config = AGENTS[role];
  if (!config) throw new Error(`Unknown agent role: ${role}`);
  return config;
}

export function listAgents(): Array<Pick<AgentConfig, 'id' | 'name' | 'description'>> {
  return Object.values(AGENTS).map(({ id, name, description }) => ({ id, name, description }));
}

// --- Tool Execution Engine ---

export type ToolResult = {
  toolCallId: string;
  toolName: string;
  result: string;
};

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "forex_signal_snapshot": {
      const data = Array.isArray(args.data) ? args.data as Parameters<typeof forexSignalSnapshot>[0] : [];
      return JSON.stringify(forexSignalSnapshot(data, Number(args.period ?? 14)));
    }
    case "forex_multi_timeframe": {
      const frames = Array.isArray(args.frames) ? args.frames as Parameters<typeof multiTimeframeConfluence>[0] : [];
      return JSON.stringify(multiTimeframeConfluence(frames));
    }
    case "create_synth_patch": {
      const patch = createSerumStylePatch({ name: String(args.name ?? "Nova Patch"), genre: args.genre ? String(args.genre) : undefined, mood: args.mood as "dark" | "bright" | "aggressive" | "organic" | "ambient" | undefined, tempo: args.tempo ? Number(args.tempo) : undefined, wavetable: args.wavetable ? String(args.wavetable) : undefined });
      return JSON.stringify({ patch, analysis: analyzeSynthPatch(patch), modulationMatrix: createModulationMatrix(patch) });
    }
    case "calculator": {
      const expr = String(args.expression ?? "");
      // Safe math evaluation (only numbers and operators)
      const sanitized = expr.replace(/[^0-9+\-*/().%^\s]/g, "");
      if (!sanitized) return "Error: Invalid expression";
      try {
        const fn = new Function(`"use strict"; return (${sanitized});`);
        const result = fn();
        return `Result: ${result}`;
      } catch {
        return `Error: Could not evaluate expression: ${expr}`;
      }
    }
    case "text_analysis": {
      const text = String(args.text ?? "");
      const analysisType = String(args.analysisType ?? "all");
      const words = text.split(/\s+/).filter(Boolean);
      const sentences = text.split(/[.!?]+/).filter(Boolean);
      const chars = text.length;
      const avgWordLength = words.length > 0 ? words.reduce((s, w) => s + w.length, 0) / words.length : 0;
      const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : 0;
      // Simple sentiment (positive/negative word lists)
      const positiveWords = ["good", "great", "excellent", "amazing", "love", "happy", "best", "perfect", "wonderful", "fantastic", "beautiful", "brilliant", "outstanding", "awesome", "superb"];
      const negativeWords = ["bad", "terrible", "horrible", "awful", "hate", "worst", "poor", "disappointing", "ugly", "disgusting", "dreadful", "miserable", "pathetic", "useless", "failure"];
      const lowerWords = words.map(w => w.toLowerCase());
      const posCount = lowerWords.filter(w => positiveWords.includes(w)).length;
      const negCount = lowerWords.filter(w => negativeWords.includes(w)).length;
      const sentimentScore = lowerWords.length > 0 ? (posCount - negCount) / lowerWords.length : 0;
      const sentimentLabel = sentimentScore > 0.05 ? "positive" : sentimentScore < -0.05 ? "negative" : "neutral";
      // Flesch Reading Ease
      const syllables = words.reduce((s, w) => s + (w.match(/[aeiouy]{1,2}/gi) || []).length, 0);
      const flesch = 206.835 - 1.015 * avgSentenceLength - 84.6 * (syllables / (words.length || 1));
      if (analysisType === "sentiment") {
        return JSON.stringify({ sentiment: sentimentLabel, score: Math.round(sentimentScore * 100) / 100, positiveWords: posCount, negativeWords: negCount });
      }
      if (analysisType === "readability") {
        return JSON.stringify({ fleschReadingEase: Math.round(flesch), gradeLevel: flesch > 90 ? "5th grade" : flesch > 70 ? "7th grade" : flesch > 50 ? "10th grade" : flesch > 30 ? "College" : "Graduate" });
      }
      if (analysisType === "statistics") {
        return JSON.stringify({ characters: chars, words: words.length, sentences: sentences.length, avgWordLength: Math.round(avgWordLength * 100) / 100, avgSentenceLength: Math.round(avgSentenceLength * 100) / 100 });
      }
      if (analysisType === "keywords") {
        const freq: Record<string, number> = {};
        const stopWords = new Set(["the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "can", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "as", "into", "about", "it", "this", "that", "and", "but", "or", "not", "no", "if", "then", "than", "so", "just", "very", "too", "also"]);
        for (const w of lowerWords) { if (w.length > 2 && !stopWords.has(w)) freq[w] = (freq[w] || 0) + 1; }
        const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word, count }));
        return JSON.stringify({ keywords });
      }
      return JSON.stringify({ sentiment: { label: sentimentLabel, score: Math.round(sentimentScore * 100) / 100 }, readability: { fleschReadingEase: Math.round(flesch) }, statistics: { characters: chars, words: words.length, sentences: sentences.length, avgWordLength: Math.round(avgWordLength * 100) / 100 }, keywords: Object.entries(lowerWords.reduce((freq, w) => { if (w.length > 2) freq[w] = (freq[w] || 0) + 1; return freq; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 10) });
    }
    case "code_execution": {
      const code = String(args.code ?? "");
      try {
        const result = await new Function(`"use strict"; return (async () => { ${code} })()`)();
        return String(result);
      } catch (error) {
        return `Error: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    case "data_processing": {
      const data = args.data as unknown[];
      const operation = String(args.operation ?? "");
      const field = String(args.field ?? "");
      const value = String(args.value ?? "");
      if (!Array.isArray(data)) return "Error: data must be an array";
      switch (operation) {
        case "sort":
          return JSON.stringify([...data].sort((a, b) => {
            const va = (a as Record<string, unknown>)[field]; const vb = (b as Record<string, unknown>)[field];
            if (typeof va === 'number' && typeof vb === 'number') return value === 'desc' ? vb - va : va - vb;
            return String(va).localeCompare(String(vb));
          }));
        case "filter":
          return JSON.stringify(data.filter(item => String((item as Record<string, unknown>)[field]) === value));
        case "unique":
          return JSON.stringify([...new Set(data.map(item => String((item as Record<string, unknown>)[field])))]);
        case "stats": {
          const nums = data.map(item => Number((item as Record<string, unknown>)[field])).filter(n => !isNaN(n));
          if (nums.length === 0) return "No numeric data found";
          const sorted = [...nums].sort((a, b) => a - b);
          const sum = nums.reduce((a, b) => a + b, 0);
          const mean = sum / nums.length;
          const median = nums.length % 2 === 0 ? (sorted[nums.length / 2 - 1] + sorted[nums.length / 2]) / 2 : sorted[Math.floor(nums.length / 2)];
          const variance = nums.reduce((s, n) => s + (n - mean) ** 2, 0) / nums.length;
          const stdDev = Math.sqrt(variance);
          return JSON.stringify({ count: nums.length, sum: Math.round(sum * 100) / 100, mean: Math.round(mean * 100) / 100, median: Math.round(median * 100) / 100, stdDev: Math.round(stdDev * 100) / 100, min: sorted[0], max: sorted[sorted.length - 1] });
        }
        case "group": {
          const groups: Record<string, unknown[]> = {};
          for (const item of data) {
            const key = String((item as Record<string, unknown>)[field] ?? "undefined");
            (groups[key] = groups[key] || []).push(item);
          }
          const result = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
          return JSON.stringify(result);
        }
        case "aggregate": {
          const nums = data.map(item => Number((item as Record<string, unknown>)[field])).filter(n => !isNaN(n));
          return JSON.stringify({ count: nums.length, sum: Math.round(nums.reduce((a, b) => a + b, 0) * 100) / 100, avg: Math.round(nums.reduce((a, b) => a + b, 0) / (nums.length || 1) * 100) / 100 });
        }
        default:
          return `Error: Unknown operation: ${operation}`;
      }
    }
    case "web_search":
      // This is handled at a higher level - return a placeholder
      return JSON.stringify({ status: "search_requested", query: args.query });
    default:
      return `Error: Unknown tool: ${toolName}`;
  }
}

// --- Agent Execution ---

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
  toolCalls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
};

export type AgentResponse = {
  agentId: AgentRole;
  agentName: string;
  messages: AgentMessage[];
  toolResults: ToolResult[];
  finalResponse: string;
  stepsUsed: number;
};

/**
 * Run an agent with automatic tool execution loop
 */
export async function runAgent(
  role: AgentRole,
  userMessages: Array<{ role: "user" | "assistant"; content: string }>,
  options?: { maxSteps?: number; model?: string; context?: string }
): Promise<AgentResponse> {
  const config = getAgentConfig(role);
  const maxSteps = options?.maxSteps ?? 5;

  const systemMessage: Message = {
    role: "system",
    content: options?.context
      ? `${config.systemPrompt}\n\nAdditional context:\n${options.context}`
      : config.systemPrompt,
  };

  const messages: Message[] = [
    systemMessage,
    ...userMessages.map(m => ({ role: m.role as Message['role'], content: m.content })),
  ];

  const agentMessages: AgentMessage[] = [];
  const toolResults: ToolResult[] = [];
  let stepsUsed = 0;
  let finalResponse = "";

  for (let step = 0; step < maxSteps; step++) {
    stepsUsed++;
    const response = await invokeLLM({
      model: options?.model ?? config.model,
      messages,
      tools: config.tools.length > 0 ? config.tools : undefined,
      toolChoice: config.tools.length > 0 ? "auto" : undefined,
      maxTokens: config.maxTokens ?? 2000,
    });

    const choice = response.choices[0];
    if (!choice) break;

    const assistantMsg: AgentMessage = {
      role: "assistant",
      content: typeof choice.message.content === "string"
        ? choice.message.content
        : choice.message.content.map(p => p.type === "text" ? p.text : "").join(""),
    };

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      assistantMsg.toolCalls = choice.message.tool_calls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      }));
      agentMessages.push(assistantMsg);
      messages.push({
        role: "assistant",
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      });

      for (const tc of choice.message.tool_calls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
        const result = await executeToolCall(tc.function.name, args);
        toolResults.push({ toolCallId: tc.id, toolName: tc.function.name, result });
        messages.push({ role: "tool", name: tc.function.name, tool_call_id: tc.id, content: result });
      }
    } else {
      finalResponse = assistantMsg.content;
      agentMessages.push(assistantMsg);
      break;
    }
  }

  return {
    agentId: role,
    agentName: config.name,
    messages: agentMessages,
    toolResults,
    finalResponse,
    stepsUsed,
  };
}
