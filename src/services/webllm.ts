import { CreateWebWorkerMLCEngine } from '@mlc-ai/web-llm';
import type { MLCEngineInterface, InitProgressReport } from '@mlc-ai/web-llm';

export interface SummaryData {
  overview: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{
    task: string;
    assignee: string;
    due_date?: string;
  }>;
}

export type WebLLMProgressCallback = (report: InitProgressReport) => void;
export type StreamTokenCallback = (token: string, accumulated: string) => void;

// Ordered list of models to try (smallest/fastest first)
export const MODELS = [
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
] as const;

export const DEFAULT_MODEL = MODELS[0];
export const FALLBACK_MODEL = MODELS[1];

let engineInstance: MLCEngineInterface | null = null;
let currentLoadedModel: string | null = null;
let engineWorker: Worker | null = null;

interface NavigatorWithGPU {
  gpu?: {
    requestAdapter: () => Promise<{
      limits?: {
        maxBufferSize?: number;
      };
    } | null>;
  };
}

export function checkWebGPUSupport(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as unknown as NavigatorWithGPU;
  return Boolean('gpu' in nav && nav.gpu);
}

/** Check if system likely has enough VRAM/memory for local inference */
export async function checkGPUMemory(): Promise<boolean> {
  if (!checkWebGPUSupport()) return false;
  try {
    const nav = navigator as unknown as NavigatorWithGPU;
    const adapter = await nav.gpu?.requestAdapter();
    if (!adapter?.limits) return false;
    // Most adapters with limits > 512MB should handle 1B models
    const limits = adapter.limits;
    return (limits.maxBufferSize ?? 0) >= 512 * 1024 * 1024;
  } catch {
    return false;
  }
}

/** Preload the WebLLM engine in the background */
export async function preloadWebLLMEngine(
  modelId: string = DEFAULT_MODEL,
  onProgress?: WebLLMProgressCallback
): Promise<void> {
  if (engineInstance && currentLoadedModel === modelId) return;
  await getWebLLMEngine(modelId, onProgress);
}

/** Get or create a singleton WebWorker engine */
export async function getWebLLMEngine(
  modelId: string = DEFAULT_MODEL,
  onProgress?: WebLLMProgressCallback
): Promise<MLCEngineInterface> {
  if (engineInstance && currentLoadedModel === modelId) {
    return engineInstance;
  }

  // Terminate previous worker if switching models
  if (engineWorker) {
    engineWorker.terminate();
    engineWorker = null;
    engineInstance = null;
    currentLoadedModel = null;
  }

  // Create dedicated web worker using Vite worker syntax
  engineWorker = new Worker(new URL('../worker.ts', import.meta.url), {
    type: 'module'
  });

  engineInstance = await CreateWebWorkerMLCEngine(
    engineWorker,
    modelId,
    {
      initProgressCallback: (report) => {
        if (onProgress) onProgress(report);
      }
    }
  );

  currentLoadedModel = modelId;
  return engineInstance;
}

/** Release the engine and worker to free GPU memory */
export function releaseWebLLMEngine(): void {
  if (engineWorker) {
    engineWorker.terminate();
    engineWorker = null;
  }
  engineInstance = null;
  currentLoadedModel = null;
}

/**
 * Summarize meeting transcript with streaming token output.
 * Tries DEFAULT_MODEL, falls back to FALLBACK_MODEL on OOM errors.
 */
export async function summarizeWithWebLLM(
  transcript: string,
  title: string = 'Meeting',
  onProgress?: WebLLMProgressCallback,
  onStreamToken?: StreamTokenCallback
): Promise<SummaryData> {
  const prompt = buildSummarizePrompt(transcript, title);

  // Try primary model, then fallback
  for (const modelId of [DEFAULT_MODEL, FALLBACK_MODEL]) {
    try {
      const engine = await getWebLLMEngine(modelId, onProgress);

      if (onStreamToken) {
        // Streaming mode
        return await streamCompletion(engine, prompt, onStreamToken);
      } else {
        // Non-streaming mode
        const reply = await engine.chat.completions.create({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' }
        });
        const content = reply.choices[0]?.message?.content || '{}';
        return parseJsonSummary(content);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err || '');
      const isOOM =
        errMsg.toLowerCase().includes('out of memory') ||
        errMsg.toLowerCase().includes('oom') ||
        errMsg.toLowerCase().includes('memory') ||
        errMsg.toLowerCase().includes('webgpu');

      if (isOOM && modelId !== FALLBACK_MODEL) {
        console.warn(`[WebLLM] OOM with ${modelId}, releasing engine and trying ${FALLBACK_MODEL}...`);
        releaseWebLLMEngine();
        continue;
      }
      throw err;
    }
  }

  throw new Error('All WebLLM models failed.');
}

async function streamCompletion(
  engine: MLCEngineInterface,
  prompt: string,
  onStreamToken: StreamTokenCallback
): Promise<SummaryData> {
  const chunks = await engine.chat.completions.create({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 1024,
    stream: true,
    response_format: { type: 'json_object' }
  });

  let accumulated = '';
  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (delta) {
      accumulated += delta;
      onStreamToken(delta, accumulated);
    }
  }

  return parseJsonSummary(accumulated);
}

function buildSummarizePrompt(transcript: string, title: string): string {
  return `You are an expert AI executive meeting summarizer. Analyze this meeting transcript and output ONLY valid JSON matching this exact structure (no markdown, no code fences):
{
  "overview": "Concise executive overview (2-3 sentences)",
  "key_points": ["Key discussion point 1", "Key discussion point 2"],
  "decisions": ["Decision 1", "Decision 2"],
  "action_items": [
    { "task": "Specific actionable task", "assignee": "Person or Team", "due_date": "YYYY-MM-DD or timeframe" }
  ]
}

Meeting Title: "${title}"
Transcript (first 12000 chars):
"""
${transcript.slice(0, 12000)}
"""`;
}

function parseJsonSummary(content: string): SummaryData {
  // Strip markdown code fences if model added them
  const clean = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  try {
    return JSON.parse(clean) as SummaryData;
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as SummaryData;
    }
    throw new Error('WebLLM returned non-JSON response: ' + content.slice(0, 200));
  }
}
