// Additional advanced backend tools, registered into the shared registry.
// These add data/ops/cognition capabilities on top of the existing 55 tools.
import type { ToolDefinition, ToolContext } from './tools'
import { validateProjectFiles, type FileInput } from './sandbox'
import { cleanOutput, detectAnomalies, stripHtml, wordCount } from './parse'
import { realtimeQuote } from './realtime'

function need(input: Record<string, unknown>, key: string): string {
  const v = input[key]
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Missing required string field "${key}".`)
  return v
}

const cleanTextTool: ToolDefinition = {
  id: 'clean-text',
  name: 'Output Cleaner',
  description: 'Clean and format text: remove unwanted characters/symbols, normalize line breaks and spacing.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  run: async (input) => ({ cleaned: cleanOutput(need(input, 'text')) }),
}

const stripHtmlTool: ToolDefinition = {
  id: 'strip-html',
  name: 'HTML Stripper',
  description: 'Remove HTML tags and produce clean plain text.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { html: { type: 'string' } }, required: ['html'] },
  run: async (input) => ({ text: stripHtml(need(input, 'html')) }),
}

const wordStatsTool: ToolDefinition = {
  id: 'word-stats',
  name: 'Word Statistics',
  description: 'Word count, sentence estimate, and readability metrics for a block of text.',
  category: 'Content',
  risk: 'safe',
  parameters: { type: 'object', properties: { text: { type: 'string' }, required: ['text'] } } as never,
  run: async (input) => {
    const text = need(input, 'text')
    const cleaned = cleanOutput(text)
    const sentences = cleaned.split(/[.!?]+\s*/).filter((s) => s.trim()).length
    const words = wordCount(cleaned)
    return { words, sentences, characters: cleaned.length, readingTimeMin: Number((words / 200).toFixed(2)), avgSentenceWords: sentences ? Number((words / sentences).toFixed(1)) : 0 }
  },
}

const validateFilesTool: ToolDefinition = {
  id: 'validate-files',
  name: 'Project Sandbox Validator',
  description: 'Securely validate generated project files (no execution): extension allowlist, size limits, dangerous-pattern and secret-leak detection.',
  category: 'Ops',
  risk: 'review',
  parameters: { type: 'object', properties: { files: { type: 'array' } }, required: ['files'] },
  run: async (input) => {
    const files = Array.isArray(input.files) ? (input.files as FileInput[]) : []
    if (!files.length) throw new Error('Provide a non-empty "files" array.')
    return validateProjectFiles(files)
  },
}

const anomalyTool: ToolDefinition = {
  id: 'anomaly-detect',
  name: 'Anomaly Detector',
  description: 'Flag anomalous points in a numeric series (z-score >= 2.5).',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { series: { type: 'array' } }, required: ['series'] },
  run: async (input) => {
    const series = Array.isArray(input.series) ? (input.series as unknown[]).map(Number).filter((n) => isFinite(n)) : []
    if (series.length < 4) throw new Error('Provide a numeric "series" array with at least 4 values.')
    const anomalies = detectAnomalies(series)
    return { count: anomalies.length, anomalies, seriesLength: series.length }
  },
}

const liveQuoteTool: ToolDefinition = {
  id: 'live-quote',
  name: 'Live Market Quote',
  description: 'Fetch a real-time market quote (Finnhub / Alpha Vantage / Deriv with key rotation).',
  category: 'Data',
  risk: 'safe',
  parameters: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] },
  run: async (input, ctx: ToolContext) => realtimeQuote(ctx.env, need(input, 'symbol'), ctx.db),
}

export const extraTools: ToolDefinition[] = [
  cleanTextTool,
  stripHtmlTool,
  wordStatsTool,
  validateFilesTool,
  anomalyTool,
  liveQuoteTool,
]
