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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
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

// ── Prompt Builder: Executive 4-Section Intelligence ──────────────────────────

function buildExecutivePrompt(transcript: string, title: string): string {
  return `You are a world-class executive meeting intelligence analyst and chief of staff.
Analyze the following meeting transcript and synthesize a highly articulate, coherent, and deeply logical executive summary.

Transform raw, fragmented spoken sentences, audio artifacts, or presentation remarks into high-value professional takeaways. Filter out filler words, transcript noise, and casual chatter.

Respond ONLY with a valid JSON object matching this exact schema:
{
  "overview": "3-5 concise, highly logical sentences synthesizing the meeting's primary objective, operational context, core arguments analyzed, and ultimate takeaway.",
  "key_points": [
    "Key Discussion Point: In-depth substantive synthesis of topic discussed with supporting rationale or evidence",
    "Key Discussion Point: Next significant topic analyzed with context and findings",
    "Key Discussion Point: Additional major theme or strategic analysis from the session"
  ],
  "decisions": [
    "Decision Concluded: Clear policy, technical choice, agreement, or consensus reached",
    "Decision Concluded: Additional finalized direction or resolution"
  ],
  "action_items": [
    {
      "task": "Specific actionable deliverable with clear scope and objective",
      "assignee": "Designated individual, role, or team responsible (infer from discussion, or 'Team')",
      "due_date": "Target completion timeframe, deadline mentioned, or 'Upcoming'"
    }
  ]
}

STRICT QUALITY RULES:
1. Section 1 (Executive Overview): Must be logically cohesive, high-level, and easy for an executive to read in 30 seconds.
2. Section 2 (Key Discussion Points): Focus on the core insights and substance, not fragmented raw quotes. Provide at least 3-6 clear bullet points.
3. Section 3 (Decisions Concluded): State specific agreements, conclusions, or finalized paths forward.
4. Section 4 (Assigned Action Items & Deliverables): Ensure deliverables are concrete tasks with assigned owners and deadlines.
5. Do NOT include markdown code blocks (\`\`\`json), conversational commentary, or any text outside the valid JSON object.

Meeting Title: "${title}"
Transcript:
"""
${transcript.slice(0, 100_000)}
"""`;
}

function validateSummaryData(parsed: Partial<SummaryData>): SummaryData {
  const key_points = Array.isArray(parsed.key_points) && parsed.key_points.length > 0
    ? parsed.key_points.filter((k) => typeof k === 'string' && k.trim().length > 0)
    : ['Reviewed scheduled meeting topics, operational objectives, and project deliverables.'];

  const decisions = Array.isArray(parsed.decisions) && parsed.decisions.length > 0
    ? parsed.decisions.filter((d) => typeof d === 'string' && d.trim().length > 0)
    : ['Consensus reached on key priorities and strategic roadmap.'];

  const action_items = Array.isArray(parsed.action_items) && parsed.action_items.length > 0
    ? parsed.action_items.map((item) => ({
        task: item.task?.trim() || 'Follow up on discussion items and deliverable milestones',
        assignee: item.assignee?.trim() || 'Team',
        due_date: item.due_date?.trim() || 'Upcoming'
      }))
    : [
        {
          task: 'Coordinate next steps and follow up on discussed milestones',
          assignee: 'Team',
          due_date: 'Upcoming'
        }
      ];

  return {
    overview: parsed.overview?.trim() || 'Executive meeting overview synthesized by AI.',
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
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];
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
            temperature: 0.2,
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

// ── Groq LLaMA 3.3 70B AI Direct Call ────────────────────────────────────────

async function callGroqSummarize(
  apiKey: string,
  transcript: string,
  title: string
): Promise<SummaryData> {
  const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
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
              content: 'You are an elite executive chief of staff and intelligence analyst. You output ONLY valid JSON matching the requested schema.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
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
  const lines = transcript
    .split(/\r?\n|[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const actionKeywords = [
    'will', 'need to', 'must', 'action', 'todo', 'follow up',
    'assign', 'by tomorrow', 'by friday', 'schedule', 'review', 'please'
  ];
  const decisionKeywords = [
    'decided', 'agreed', 'decision', 'concluded', 'approved', 'chosen', 'finalized', 'resolved'
  ];

  const action_items: SummaryData['action_items'] = [];
  const decisions: string[] = [];
  const key_points: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (decisionKeywords.some((k) => lower.includes(k))) {
      if (decisions.length < 8) decisions.push(line);
    } else if (actionKeywords.some((k) => lower.includes(k))) {
      if (action_items.length < 10) {
        const assigneeMatch = line.match(/\b([A-Z][a-z]{2,})\b/);
        action_items.push({
          task: line,
          assignee: assigneeMatch ? assigneeMatch[1] : 'Team',
          due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
        });
      }
    } else if (key_points.length < 6 && line.length > 20) {
      key_points.push(line);
    }
  }

  return {
    overview: `Session "${title || 'Meeting'}" covered ${lines.length} recorded discussion segments. Key operational themes and action items were reviewed.`,
    key_points: key_points.length > 0 ? key_points : ['Reviewed scheduled meeting topics and project deliverables.'],
    decisions: decisions.length > 0 ? decisions : ['Agreed to proceed with scheduled deliverables and project roadmap.'],
    action_items:
      action_items.length > 0
        ? action_items
        : [
            {
              task: 'Follow up on discussion items and deliverable milestones',
              assignee: 'Team Lead',
              due_date: new Date().toISOString().split('T')[0]
            }
          ]
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

  // ── Tier 1A: Google Gemini AI ───────────────────────────────────────────────
  if (geminiApiKey) {
    try {
      progress('Analyzing transcript with Google Gemini AI…', 30);
      const summary = await callGeminiSummarize(geminiApiKey, transcript, title);
      progress('Executive summary generated ✓ (Gemini)', 100);
      const audioUrl = await audioUrlPromise;
      return {
        summary,
        tierUsed: 'cloud',
        audioUrl,
        provider: 'gemini'
      };
    } catch (geminiErr) {
      console.warn('[Gemini AI failed, attempting Groq fallback]:', geminiErr);
    }
  }

  // ── Tier 1B: Groq LLaMA 3.3 70B AI ──────────────────────────────────────────
  if (groqApiKey) {
    try {
      progress('Analyzing transcript with Groq LLaMA 3.3 70B AI…', 40);
      const summary = await callGroqSummarize(groqApiKey, transcript, title);
      progress('Executive summary generated ✓ (Groq LLaMA 3.3 70B)', 100);
      const audioUrl = await audioUrlPromise;
      return {
        summary,
        tierUsed: 'cloud',
        audioUrl,
        provider: 'groq (llama-3.3-70b)'
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
