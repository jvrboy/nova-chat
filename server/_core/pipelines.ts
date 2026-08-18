/**
 * Pipeline System for Nova Chat
 * Allows chaining multiple tools and agents into automated workflows
 */

import { runAgent, type AgentRole } from "./agents";
import { invokeLLM } from "./llm";

export type PipelineStep = {
  id: string;
  name: string;
  type: 'agent' | 'llm' | 'transform' | 'condition' | 'loop';
  agentRole?: AgentRole;
  prompt?: string;
  transformFn?: string; // JavaScript expression
  condition?: string; // JavaScript boolean expression
  maxIterations?: number;
  inputKey?: string;
  outputKey?: string;
};

export type Pipeline = {
  id: string;
  name: string;
  description: string;
  steps: PipelineStep[];
  variables: Record<string, unknown>;
};

export type PipelineExecutionResult = {
  pipelineId: string;
  success: boolean;
  steps: Array<{
    stepId: string;
    stepName: string;
    status: 'success' | 'error' | 'skipped';
    output?: unknown;
    error?: string;
    duration: number;
  }>;
  finalOutput: unknown;
  totalDuration: number;
};

// --- Built-in Pipelines ---

export const BUILTIN_PIPELINES: Pipeline[] = [
  {
    id: 'deep-research',
    name: 'Deep Research',
    description: 'Multi-step research pipeline: research → summarize → key findings',
    steps: [
      { id: 'research', name: 'Research', type: 'agent', agentRole: 'research_agent', prompt: '{input}', outputKey: 'research_result' },
      { id: 'summarize', name: 'Summarize', type: 'agent', agentRole: 'summarizer', prompt: 'Summarize the following research: {research_result}', outputKey: 'summary' },
      { id: 'findings', name: 'Key Findings', type: 'agent', agentRole: 'data_analyst', prompt: 'Extract the top 5 key findings and actionable insights from: {summary}', outputKey: 'findings' },
    ],
    variables: {},
  },
  {
    id: 'code-review-pipeline',
    name: 'Code Review Pipeline',
    description: 'Full code review: analyze metrics → detect issues → suggest refactors → generate docs',
    steps: [
      { id: 'review', name: 'Review Code', type: 'agent', agentRole: 'code_reviewer', prompt: '{input}', outputKey: 'review' },
      { id: 'refactor', name: 'Suggest Improvements', type: 'agent', agentRole: 'code_reviewer', prompt: 'Based on this review, provide specific refactoring suggestions with code examples:\n{review}', outputKey: 'refactors' },
    ],
    variables: {},
  },
  {
    id: 'content-creation',
    name: 'Content Creation Pipeline',
    description: 'Brainstorm → Draft → Edit → Final polish',
    steps: [
      { id: 'brainstorm', name: 'Brainstorm Ideas', type: 'agent', agentRole: 'brainstormer', prompt: 'Generate creative ideas for: {input}', outputKey: 'ideas' },
      { id: 'draft', name: 'Draft Content', type: 'agent', agentRole: 'writing_assistant', prompt: 'Write a polished draft based on these ideas:\n{ideas}\n\nTopic: {input}', outputKey: 'draft' },
      { id: 'edit', name: 'Edit & Polish', type: 'agent', agentRole: 'writing_assistant', prompt: 'Review and improve this draft for clarity, flow, and impact:\n{draft}', outputKey: 'final' },
    ],
    variables: {},
  },
  {
    id: 'forex-analysis-pipeline',
    name: 'Forex Analysis Pipeline',
    description: 'Full market analysis: technical analysis → sentiment → strategy',
    steps: [
      { id: 'analyze', name: 'Technical Analysis', type: 'agent', agentRole: 'forex_analyst', prompt: '{input}', outputKey: 'analysis' },
      { id: 'strategy', name: 'Strategy Recommendation', type: 'agent', agentRole: 'forex_analyst', prompt: 'Based on this analysis, provide specific trading strategies with entry/exit points and risk management:\n{analysis}', outputKey: 'strategy' },
    ],
    variables: {},
  },
  {
    id: 'sound-design-pipeline',
    name: 'Sound Design Pipeline',
    description: 'Sound concept → synth patch architecture → production notes',
    steps: [
      { id: 'concept', name: 'Sound Concept', type: 'agent', agentRole: 'sound_designer', prompt: '{input}', outputKey: 'concept' },
      { id: 'patch', name: 'Patch Architecture', type: 'agent', agentRole: 'sound_designer', prompt: 'Turn this sound concept into a structured Serum-style patch and modulation plan:\n{concept}', outputKey: 'patch' },
    ],
    variables: {},
  },
  {
    id: 'quant-research-pipeline',
    name: 'Quantitative Research Pipeline',
    description: 'Market data inspection → multi-timeframe confluence → research caveats',
    steps: [
      { id: 'analysis', name: 'Advanced Analysis', type: 'agent', agentRole: 'quant_researcher', prompt: '{input}', outputKey: 'analysis' },
      { id: 'risk', name: 'Risk Review', type: 'agent', agentRole: 'risk_manager', prompt: 'Review this quantitative analysis for uncertainty, regime risk, drawdown sensitivity, and data limitations:\n{analysis}', outputKey: 'risk_review' },
    ],
    variables: {},
  },
  {
    id: 'risk-review-pipeline',
    name: 'Risk Review Pipeline',
    description: 'Scenario analysis → risk controls → uncertainty summary',
    steps: [
      { id: 'scenario', name: 'Scenario Review', type: 'agent', agentRole: 'risk_manager', prompt: '{input}', outputKey: 'scenario' },
      { id: 'research', name: 'Quantitative Challenge', type: 'agent', agentRole: 'quant_researcher', prompt: 'Challenge the following scenario with quantitative assumptions and failure cases:\n{scenario}', outputKey: 'challenge' },
    ],
    variables: {},
  },
  {
    id: 'music-production-pipeline',
    name: 'Music Production Pipeline',
    description: 'Musical brief → composition architecture → sound design → mix and export checklist',
    steps: [
      { id: 'brief', name: 'Production Brief', type: 'agent', agentRole: 'music_producer', prompt: '{input}', outputKey: 'brief' },
      { id: 'sound', name: 'Sound Design', type: 'agent', agentRole: 'audio_engineer', prompt: 'Turn this production brief into signal-chain, synth, spatial, and automation recommendations:\n{brief}', outputKey: 'sound' },
      { id: 'qa', name: 'Export QA', type: 'agent', agentRole: 'qa_engineer', prompt: 'Create a deterministic DAW export and mix QA checklist for:\n{sound}', outputKey: 'qa' },
    ],
    variables: {},
  },
  {
    id: 'market-structure-pipeline',
    name: 'Market Structure Pipeline',
    description: 'OHLCV brief → microstructure review → confluence → risk challenge',
    steps: [
      { id: 'structure', name: 'Structure Review', type: 'agent', agentRole: 'market_microstructure', prompt: '{input}', outputKey: 'structure' },
      { id: 'quant', name: 'Quant Challenge', type: 'agent', agentRole: 'quant_researcher', prompt: 'Challenge these observations with data-quality, regime, and execution assumptions:\n{structure}', outputKey: 'quant' },
      { id: 'risk', name: 'Risk Review', type: 'agent', agentRole: 'risk_manager', prompt: 'Summarize uncertainty and non-guaranteed risk controls for:\n{quant}', outputKey: 'risk' },
    ],
    variables: {},
  },
  {
    id: 'data-quality-pipeline',
    name: 'Data Quality Pipeline',
    description: 'Dataset intake → schema and quality review → reproducibility plan',
    steps: [
      { id: 'profile', name: 'Dataset Profile', type: 'agent', agentRole: 'data_engineer', prompt: '{input}', outputKey: 'profile' },
      { id: 'review', name: 'Quality Review', type: 'agent', agentRole: 'data_analyst', prompt: 'Identify missingness, outliers, leakage, and measurement risks in:\n{profile}', outputKey: 'review' },
      { id: 'plan', name: 'Reproducibility Plan', type: 'agent', agentRole: 'data_engineer', prompt: 'Create a versioned ingestion and validation plan based on:\n{review}', outputKey: 'plan' },
    ],
    variables: {},
  },
  {
    id: 'memory-curation-pipeline',
    name: 'Memory Curation Pipeline',
    description: 'Candidate context → privacy and retention review → durable-memory proposal',
    steps: [
      { id: 'classify', name: 'Classify Context', type: 'agent', agentRole: 'memory_architect', prompt: '{input}', outputKey: 'classification' },
      { id: 'privacy', name: 'Privacy Review', type: 'agent', agentRole: 'qa_engineer', prompt: 'Review this memory proposal for secrets, over-retention, and testable deletion requirements:\n{classification}', outputKey: 'privacy' },
    ],
    variables: {},
  },
  {
    id: 'release-qa-pipeline',
    name: 'Release QA Pipeline',
    description: 'Release brief → test matrix → deployment smoke checks → rollback criteria',
    steps: [
      { id: 'matrix', name: 'Test Matrix', type: 'agent', agentRole: 'qa_engineer', prompt: '{input}', outputKey: 'matrix' },
      { id: 'ops', name: 'Operations Review', type: 'agent', agentRole: 'automation_orchestrator', prompt: 'Turn this test matrix into deployment gates, observability, rollback, and human approval steps:\n{matrix}', outputKey: 'ops' },
    ],
    variables: {},
  },
  {
    id: 'translation-pipeline',
    name: 'Translation & Localization',
    description: 'Translate → Cultural adaptation → Quality check',
    steps: [
      { id: 'translate', name: 'Translate', type: 'agent', agentRole: 'translator', prompt: '{input}', outputKey: 'translation' },
      { id: 'review', name: 'Quality Check', type: 'agent', agentRole: 'writing_assistant', prompt: 'Review this translation for accuracy, fluency, and cultural appropriateness. Note any issues:\n{translation}', outputKey: 'review' },
    ],
    variables: {},
  },
  {
    id: 'song-creation',
    name: 'Song Creation Pipeline',
    description: 'Concept → Composition → Arrangement',
    steps: [
      { id: 'concept', name: 'Musical Concept', type: 'agent', agentRole: 'music_composer', prompt: 'Create a musical concept and chord progression for: {input}', outputKey: 'concept' },
      { id: 'compose', name: 'Full Composition', type: 'agent', agentRole: 'music_composer', prompt: 'Based on this concept, create a complete composition with melody, bass, and arrangement:\n{concept}', outputKey: 'composition' },
    ],
    variables: {},
  },
  {
    id: 'multimodal-intake',
    name: 'Multimodal Intake Pipeline',
    description: 'Attachment or transcript intake → structured extraction → artifact-ready brief',
    steps: [
      { id: 'extract', name: 'Extract Context', type: 'agent', agentRole: 'data_analyst', prompt: 'Extract entities, claims, decisions, and open questions from this attachment or transcript:\n{input}', outputKey: 'extraction' },
      { id: 'brief', name: 'Create Brief', type: 'agent', agentRole: 'writing_assistant', prompt: 'Turn this extracted context into a clear, source-aware working brief:\n{extraction}', outputKey: 'brief' },
      { id: 'qa', name: 'Quality Review', type: 'agent', agentRole: 'qa_engineer', prompt: 'Check this brief for unsupported claims, missing provenance, privacy risks, and ambiguous next steps:\n{brief}', outputKey: 'qa' },
    ],
    variables: {},
  },
  {
    id: 'model-evaluation-pipeline',
    name: 'Model Evaluation Pipeline',
    description: 'Evaluation prompt → independent review → regression and quality report',
    steps: [
      { id: 'evaluate', name: 'Evaluate Response', type: 'agent', agentRole: 'data_analyst', prompt: 'Evaluate the supplied model response against the requested criteria and identify evidence:\n{input}', outputKey: 'evaluation' },
      { id: 'challenge', name: 'Challenge Findings', type: 'agent', agentRole: 'research_agent', prompt: 'Independently challenge the evaluation for bias, missing counterexamples, and reproducibility:\n{evaluation}', outputKey: 'challenge' },
      { id: 'report', name: 'Quality Report', type: 'agent', agentRole: 'qa_engineer', prompt: 'Produce a concise quality report with scores, limitations, and next tests:\n{evaluation}\n\nChallenge:\n{challenge}', outputKey: 'report' },
    ],
    variables: {},
  },
  {
    id: 'reliability-incident-pipeline',
    name: 'Reliability Incident Pipeline',
    description: 'Incident signal → failure analysis → mitigations → runbook',
    steps: [
      { id: 'triage', name: 'Triage Signal', type: 'agent', agentRole: 'qa_engineer', prompt: 'Triage this incident signal and separate symptoms, impact, and unknowns:\n{input}', outputKey: 'triage' },
      { id: 'root-cause', name: 'Root Cause Review', type: 'agent', agentRole: 'data_engineer', prompt: 'Analyze this triage for likely root causes, observability gaps, and safe reproduction steps:\n{triage}', outputKey: 'root_cause' },
      { id: 'runbook', name: 'Runbook', type: 'agent', agentRole: 'automation_orchestrator', prompt: 'Create a cautious mitigation and rollback runbook based on:\n{root_cause}', outputKey: 'runbook' },
    ],
    variables: {},
  },
];

// --- Pipeline Execution ---

export function listPipelines(): Array<{ id: string; name: string; description: string; stepCount: number }> {
  return BUILTIN_PIPELINES.map(p => ({ id: p.id, name: p.name, description: p.description, stepCount: p.steps.length }));
}

export function getPipeline(id: string): Pipeline | undefined {
  return BUILTIN_PIPELINES.find(p => p.id === id);
}

function substituteVars(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

export async function executePipeline(
  pipelineId: string,
  input: string,
  options?: { model?: string; maxStepsPerAgent?: number }
): Promise<PipelineExecutionResult> {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineId}`);

  const startTime = Date.now();
  const vars: Record<string, unknown> = { ...pipeline.variables, input };
  const stepResults: PipelineExecutionResult['steps'] = [];
  let finalOutput: unknown = input;

  for (const step of pipeline.steps) {
    const stepStart = Date.now();
    try {
      switch (step.type) {
        case 'agent': {
          if (!step.agentRole) throw new Error(`Agent step '${step.id}' missing agentRole`);
          const prompt = substituteVars(step.prompt ?? '{input}', vars);
          const result = await runAgent(step.agentRole, [{ role: 'user', content: prompt }], {
            model: options?.model,
            maxSteps: options?.maxStepsPerAgent ?? 3,
          });
          const output = result.finalResponse;
          if (step.outputKey) vars[step.outputKey] = output;
          finalOutput = output;
          stepResults.push({ stepId: step.id, stepName: step.name, status: 'success', output, duration: Date.now() - stepStart });
          break;
        }
        case 'llm': {
          const prompt = substituteVars(step.prompt ?? '', vars);
          const response = await invokeLLM({
            model: options?.model,
            messages: [{ role: 'user', content: prompt }],
          });
          const content = response.choices[0]?.message.content;
          const output = typeof content === 'string' ? content : content.map(p => p.type === 'text' ? p.text : '').join('');
          if (step.outputKey) vars[step.outputKey] = output;
          finalOutput = output;
          stepResults.push({ stepId: step.id, stepName: step.name, status: 'success', output, duration: Date.now() - stepStart });
          break;
        }
        case 'transform': {
          if (!step.transformFn) throw new Error(`Transform step '${step.id}' missing transformFn`);
          const fn = new Function('vars', `"use strict"; return (${step.transformFn})`);
          const output = fn(vars);
          if (step.outputKey) vars[step.outputKey] = output;
          finalOutput = output;
          stepResults.push({ stepId: step.id, stepName: step.name, status: 'success', output, duration: Date.now() - stepStart });
          break;
        }
        default:
          stepResults.push({ stepId: step.id, stepName: step.name, status: 'skipped', duration: Date.now() - stepStart });
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      stepResults.push({ stepId: step.id, stepName: step.name, status: 'error', error: errorMsg, duration: Date.now() - stepStart });
      return {
        pipelineId,
        success: false,
        steps: stepResults,
        finalOutput: null,
        totalDuration: Date.now() - startTime,
      };
    }
  }

  return {
    pipelineId,
    success: true,
    steps: stepResults,
    finalOutput,
    totalDuration: Date.now() - startTime,
  };
}
