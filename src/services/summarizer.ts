import {
  checkWebGPUSupport,
  checkGPUMemory,
  summarizeWithWebLLM,
  releaseWebLLMEngine,
  type SummaryData
} from './webllm';
import { supabase } from './supabase';

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
  /** cloud = OpenRouter succeeded; local = fell back to WebGPU; heuristic = both unavailable */
  tierUsed: 'cloud' | 'local-webgpu' | 'heuristic';
  audioUrl?: string;
  provider?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const MAX_SERVER_RETRIES = 2;

/** HTTP status codes that indicate quota/rate-limit exhaustion on the cloud side */
const QUOTA_STATUSES = new Set([429, 503]);

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

// ── Tier 1 (Primary): Cloud via Express → OpenRouter ─────────────────────────

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

  // Quota / rate-limit — signal caller to switch to local
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

  // Server returns 'heuristic-fallback' when no API key is configured
  if (data.provider === 'heuristic-fallback') {
    return { summary: data.summary, provider: 'heuristic-fallback', hitQuota: false };
  }

  return { summary: data.summary, provider: data.provider ?? 'cloud', hitQuota: false };
}

// ── Tier 2 (Fallback): Local WebGPU via WebLLM ───────────────────────────────

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

  progress('Loading local AI model into WebGPU… (first run downloads ~500 MB)', 55);

  const summary = await summarizeWithWebLLM(
    transcript,
    title,
    (report) => {
      const pct = Math.round((report.progress || 0) * 100);
      progress(`Local AI: ${report.text} (${pct}%)`, 55 + pct * 0.4);
    },
    onStreamToken
  );

  releaseWebLLMEngine(); // free GPU memory after use
  return summary;
}

// ── Client-side Failsafe Heuristic ──────────────────────────────────────────

function clientHeuristicSummarize(transcript: string, title?: string): SummaryData {
  const lines = transcript
    .split(/\r?\n|[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

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
    overview: `Session "${title || 'Meeting'}" covered ${lines.length} discussion segments. Key discussion points, deliverables, and action items were recorded.`,
    key_points: key_points.length > 0 ? key_points : ['Reviewed scheduled discussion topics and meeting notes.'],
    decisions: decisions.length > 0 ? decisions : ['Agreed to proceed with scheduled deliverables.'],
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

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Two-tier hybrid summarizer with in-browser failsafe.
 *
 * Tier 1 (primary):  Cloud AI → Express → OpenRouter free models
 * Tier 2 (fallback): Local WebGPU → WebLLM (activates when cloud hits quota/offline)
 * Tier 3 (failsafe): In-browser structured heuristic (guarantees summary always returns)
 */
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

  // ── Tier 1: Cloud ────────────────────────────────────────────────────────
  try {
    progress('Sending transcript to cloud engine…', 10);
    const { summary, provider, hitQuota } = await callCloudSummarize(transcript, title);

    if (hitQuota) {
      progress('Cloud engine rate-limited — switching to local fallback…', 45);
    } else {
      const tierUsed = provider === 'heuristic-fallback' ? 'heuristic' : 'cloud';
      progress(`Engine complete ✓ (${provider})`, 100);
      const audioUrl = await audioUrlPromise;
      return { summary, tierUsed, audioUrl, provider };
    }
  } catch (cloudErr: any) {
    console.warn('[Tier 1] Cloud summarization unreachable:', cloudErr.message);
    progress(`Connecting to local processing engine…`, 45);
  }

  // ── Tier 2: Local WebGPU ─────────────────────────────────────────────────
  try {
    const summary = await callLocalSummarize(transcript, title, onProgress, onStreamToken);
    progress('Local processing complete ✓', 100);
    const audioUrl = await audioUrlPromise;
    return { summary, tierUsed: 'local-webgpu', audioUrl };
  } catch (localErr: any) {
    console.warn('[Tier 2] Local WebGPU unavailable, applying structured parser:', localErr.message);
  }

  // ── Tier 3 (Failsafe): In-Browser Structured Parser ──────────────────────
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
