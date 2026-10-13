import {
  checkWebGPUSupport,
  checkGPUMemory,
  summarizeWithWebLLM,
  releaseWebLLMEngine,
  type SummaryData
} from './webllm';
import { supabase } from './supabase';
import { getGroqApiKey } from './transcription';

export interface SummarizeOptions {
  transcript: string;
  title?: string;
  audioBlob?: Blob;
  audioDurationSeconds?: number;
  /** Called throughout the pipeline with human-readable status strings */
  onProgress?: (progressText: string, percent?: number) => void;
  /** Called with each streaming token from WebLLM (local fallback only) */
  onStreamToken?: (token: string, accumulated: string) => void;
}

export interface SummarizeResult {
  summary: SummaryData;
  /** cloud = Gemini / Groq / OpenRouter succeeded; local = fell back to WebGPU; heuristic = offline fallback */
  tierUsed: 'cloud' | 'local-webgpu' | 'heuristic';
  audioUrl?: string;
  provider?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';
const MAX_SERVER_RETRIES = 2;

/** HTTP status codes that indicate quota/rate-limit exhaustion on the cloud side */
const QUOTA_STATUSES = new Set([429, 503]);

export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('gemini_api_key');
    if (stored?.trim()) return stored.trim();
  }
  const env = import.meta.env as Record<string, string | undefined>;
  return (env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '').trim();
}

export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem('gemini_api_key', key.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  }
}

// ── Upload audio to Supabase Storage (non-blocking) ──────────────────────────

async function uploadAudio(blob: Blob, title: string): Promise<string | undefined> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const uid = user?.id ?? 'anon';
    const ts = Date.now();
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
    const filename = `${uid}/${ts}-${title.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}.${ext}`;

    const { error } = await supabase.storage
      .from('meeting-recordings')
      .upload(filename, blob, { contentType: blob.type, upsert: false });

    if (error) { console.warn('[Audio Upload] Storage error:', error.message); return undefined; }

    const { data: urlData } = supabase.storage.from('meeting-recordings').getPublicUrl(filename);
    return urlData?.publicUrl;
  } catch (err) {
    console.warn('[Audio Upload] Unexpected error:', err);
    return undefined;
  }
}

// ── Strict Prompt Builder ───────────────────────────────────────────────────

function buildExecutivePrompt(transcript: string, title: string): string {
  return `You are a world-class executive meeting intelligence analyst.
Analyze the following meeting transcript and produce a structured, high-value, and 100% ACCURATE executive summary.

STRICT ACCURACY & LOGIC RULES:
1. Executive Overview: Synthesize a cohesive 2-4 sentence summary of the session's core purpose, context, and key takeaway.
2. Key Discussion Points: Provide clear, coherent bullet points of the substantive topics discussed. Do NOT output raw transcript fragments or sentence splices.
3. Decisions Concluded: Output ONLY decisions that were explicitly agreed upon, resolved, or approved. IF NO EXPLICIT DECISIONS WERE CONCLUDED, RETURN AN EMPTY ARRAY []. NEVER fabricate generic decisions.
4. Assigned Action Items & Deliverables: Extract real tasks and identify the actual person or organization responsible. The assignee must be an actual entity, NOT filler words like "The" or "Meanwhile". If no assignee is mentioned, use "Unassigned". If no action items exist in the transcript, return an empty array [].

Respond ONLY with a valid JSON object matching this schema:
{
  "overview": "Concise executive overview",
  "key_points": ["Substantive discussion point 1", "Substantive discussion point 2"],
  "decisions": ["Specific decision concluded (or leave array empty [] if none)"],
  "action_items": [
    {
      "task": "Concrete actionable deliverable",
      "assignee": "Responsible person or organization (or 'Unassigned')",
      "due_date": "Target timeframe if mentioned"
    }
  ]
}

Meeting Title: "${title}"
Transcript:
"""
${transcript.slice(0, 100_000)}
"""`;
}

function validateSummaryData(parsed: Partial<SummaryData>): SummaryData {
  const key_points = Array.isArray(parsed.key_points) && parsed.key_points.length > 0
    ? parsed.key_points.filter((k) => typeof k === 'string' && k.trim().length > 0)
    : [];

  // Super accurate: never fabricate decisions if none exist
  const decisions = Array.isArray(parsed.decisions) && parsed.decisions.length > 0
    ? parsed.decisions.filter((d) => typeof d === 'string' && d.trim().length > 0)
    : [];

  const action_items = Array.isArray(parsed.action_items) && parsed.action_items.length > 0
    ? parsed.action_items
        .filter((item) => item && typeof item.task === 'string' && item.task.trim().length > 0)
        .map((item) => {
          let assignee = (item.assignee || '').trim();
          // Remove filler grammatical words wrongly parsed as names
          if (/^(the|meanwhile|then|and|also|a|an|in|on|at|by|for|with)$/i.test(assignee)) {
            assignee = 'Unassigned';
          }
          return {
            task: item.task.trim(),
            assignee: assignee || 'Unassigned',
            due_date: (item.due_date || '').trim() || undefined
          };
        })
    : [];

  return {
    overview: parsed.overview?.trim() || 'Summary synthesized from meeting transcript.',
    key_points,
    decisions,
    action_items
  };
}

// ── Google Gemini AI Direct Call ─────────────────────────────────────────────

async function callGeminiSummarize(
  apiKey: string,
  transcript: string,
  title: string
): Promise<SummaryData> {
  const models = ['gemini-3.8-flash', 'gemini-2.5-flash'];
  const prompt = buildExecutivePrompt(transcript, title);
  let lastError = '';

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `Gemini ${model} HTTP ${res.status}: ${errText}`;
        continue;
      }

      const data = await res.json();
      const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const clean = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(clean) as Partial<SummaryData>;
      return validateSummaryData(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Gemini AI summarization failed: ${lastError}`);
}

// ── Groq Direct Call (openai/gpt-oss-120b, qwen/qwen3.8-27b) ────────────────

async function callGroqSummarize(
  apiKey: string,
  transcript: string,
  title: string
): Promise<SummaryData> {
  const models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
  const prompt = buildExecutivePrompt(transcript, title);
  let lastError = '';

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an elite executive intelligence analyst. You output ONLY valid JSON matching the exact schema requested. Never fabricate decisions.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `Groq ${model} HTTP ${res.status}: ${errText}`;
        continue;
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content?.trim();
      if (!rawContent) {
        lastError = 'Empty response from Groq';
        continue;
      }

      const clean = rawContent
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(clean) as Partial<SummaryData>;
      return validateSummaryData(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`Groq AI summarization failed: ${lastError}`);
}

// ── Secondary Cloud: Express Server Fallback ─────────────────────────────────

interface CloudResult {
  summary: SummaryData;
  provider: string;
  hitQuota: boolean;
}

async function callCloudSummarize(
  transcript: string,
  title: string,
  attempt = 0
): Promise<CloudResult> {
  const res = await fetch(`${API_BASE}/api/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ transcript, title })
  });

  if (QUOTA_STATUSES.has(res.status)) {
    return { summary: {} as SummaryData, provider: '', hitQuota: true };
  }

  if (!res.ok) {
    if (attempt < MAX_SERVER_RETRIES) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 600));
      return callCloudSummarize(transcript, title, attempt + 1);
    }
    throw new Error(`Cloud summarization failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (data.provider === 'heuristic-fallback') {
    return { summary: data.summary, provider: 'heuristic-fallback', hitQuota: false };
  }

  return { summary: data.summary, provider: data.provider ?? 'cloud', hitQuota: false };
}

// ── Local WebGPU via WebLLM ──────────────────────────────────────────────────

async function callLocalSummarize(
  transcript: string,
  title: string,
  onProgress?: (text: string, pct?: number) => void,
  onStreamToken?: (token: string, accumulated: string) => void
): Promise<SummaryData> {
  const progress = (text: string, pct?: number) => onProgress?.(text, pct);

  if (!checkWebGPUSupport()) {
    throw new Error('WebGPU not supported in this browser — cannot run local fallback.');
  }

  const hasMemory = await checkGPUMemory();
  if (!hasMemory) throw new Error('Insufficient GPU memory for local inference.');

  progress('Loading local AI model into WebGPU…', 55);

  const summary = await summarizeWithWebLLM(
    transcript,
    title,
    (report) => {
      const pct = Math.round((report.progress || 0) * 100);
      progress(`Local AI: ${report.text} (${pct}%)`, 55 + pct * 0.4);
    },
    onStreamToken
  );

  releaseWebLLMEngine();
  return summary;
}

// ── Client-side Failsafe Heuristic ───────────────────────────────────────────

function clientHeuristicSummarize(transcript: string, title?: string): SummaryData {
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);

  const key_points = sentences.slice(0, 6);

  return {
    overview: `Session "${title || 'Meeting'}" covered ${sentences.length} recorded discussion segments regarding scheduled topics.`,
    key_points: key_points.length > 0 ? key_points : ['Reviewed meeting discussion points.'],
    decisions: [],
    action_items: []
  };
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function summarizeMeeting(options: SummarizeOptions): Promise<SummarizeResult> {
  const {
    transcript,
    title = 'Meeting Recording',
    audioBlob,
    onProgress,
    onStreamToken
  } = options;

  const progress = (text: string, pct?: number) => onProgress?.(text, pct);

  // Upload audio in parallel (fire-and-forget)
  let audioUrlPromise: Promise<string | undefined> | undefined;
  if (audioBlob && audioBlob.size > 0) {
    audioUrlPromise = uploadAudio(audioBlob, title);
  }

  const geminiApiKey = getGeminiApiKey();
  const groqApiKey = getGroqApiKey();

  // ── Tier 1A: Google Gemini 3.8 Flash AI ──────────────────────────────────────
  if (geminiApiKey) {
    try {
      progress('Analyzing transcript with Google Gemini AI…', 30);
      const summary = await callGeminiSummarize(geminiApiKey, transcript, title);
      progress('Executive summary generated ✓ (Gemini 3.8 Flash)', 100);
      const audioUrl = await audioUrlPromise;
      return {
        summary,
        tierUsed: 'cloud',
        audioUrl,
        provider: 'gemini/gemini-3.8-flash'
      };
    } catch (geminiErr) {
      console.warn('[Gemini AI failed, attempting Groq fallback]:', geminiErr);
    }
  }

  // ── Tier 1B: Groq AI (GPT-OSS-120B / Qwen 27B) ──────────────────────────────
  if (groqApiKey) {
    try {
      progress('Analyzing transcript with Groq AI…', 40);
      const summary = await callGroqSummarize(groqApiKey, transcript, title);
      progress('Executive summary generated ✓ (Groq AI)', 100);
      const audioUrl = await audioUrlPromise;
      return {
        summary,
        tierUsed: 'cloud',
        audioUrl,
        provider: 'groq/gpt-oss-120b'
      };
    } catch (groqErr) {
      console.warn('[Groq AI failed]:', groqErr);
    }
  }

  // ── Tier 1.5: Express Server (if running local backend) ─────────────────────
  try {
    progress('Sending transcript to cloud backend…', 55);
    const { summary, provider, hitQuota } = await callCloudSummarize(transcript, title);

    if (!hitQuota && provider !== 'heuristic-fallback') {
      progress(`Engine complete ✓ (${provider})`, 100);
      const audioUrl = await audioUrlPromise;
      return { summary, tierUsed: 'cloud', audioUrl, provider };
    }
  } catch (cloudErr: unknown) {
    console.warn('[Tier 1.5] Express backend unreachable (normal on Vercel):', cloudErr);
  }

  // ── Tier 2: Local WebGPU via WebLLM ─────────────────────────────────────────
  try {
    progress('Checking local AI engine…', 65);
    const summary = await callLocalSummarize(transcript, title, onProgress, onStreamToken);
    progress('Local processing complete ✓', 100);
    const audioUrl = await audioUrlPromise;
    return { summary, tierUsed: 'local-webgpu', audioUrl };
  } catch (localErr: unknown) {
    console.warn('[Tier 2] Local WebGPU unavailable, applying structured fallback:', localErr);
  }

  // ── Tier 3 (Failsafe): In-Browser Structured Parser ─────────────────────────
  progress('Generating structured summary…', 95);
  const fallbackSummary = clientHeuristicSummarize(transcript, title);
  progress('Summary complete ✓', 100);
  const audioUrl = await audioUrlPromise;
  return {
    summary: fallbackSummary,
    tierUsed: 'heuristic',
    audioUrl,
    provider: 'client-heuristic'
  };
}
