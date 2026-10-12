import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

interface SummaryResult {
  overview: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{
    task: string;
    assignee: string;
    due_date?: string;
  }>;
}

/**
 * Ordered list of free OpenRouter models to try.
 * Falls back to the next model if rate-limited or context-length exceeded.
 */
const FREE_MODELS = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free'
] as const;

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const SITE_URL = process.env.SITE_URL || 'http://localhost:5173';
const SITE_NAME = 'MeetWithAI';

// ── Heuristic fallback (zero external deps) ──────────────────────────────────

function heuristicSummarize(transcript: string, title?: string): SummaryResult {
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

  const action_items: SummaryResult['action_items'] = [];
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
          assignee: assigneeMatch ? assigneeMatch[1] : 'Unassigned',
          due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
        });
      }
    } else if (key_points.length < 6 && line.length > 25) {
      key_points.push(line);
    }
  }

  return {
    overview: `Meeting "${title || 'Session'}" covered ${lines.length} discussion segments. Key priorities and action items were identified and recorded for the team.`,
    key_points: key_points.length > 0 ? key_points : ['Reviewed project roadmap and upcoming milestones.'],
    decisions: decisions.length > 0 ? decisions : ['Agreed to proceed with scheduled deliverables.'],
    action_items:
      action_items.length > 0
        ? action_items
        : [
            {
              task: 'Follow up on meeting deliverables',
              assignee: 'Team Lead',
              due_date: new Date().toISOString().split('T')[0]
            }
          ]
  };
}

// ── Build the summarize prompt ────────────────────────────────────────────────

function buildPrompt(transcript: string, title: string): string {
  return `You are an expert AI executive meeting summarizer.
Analyze the following transcript and output ONLY valid JSON (no markdown, no code fences) matching this structure exactly:
{
  "overview": "Concise executive overview (2-3 sentences)",
  "key_points": ["Discussion point 1", "Discussion point 2"],
  "decisions": ["Decision 1", "Decision 2"],
  "action_items": [
    { "task": "Actionable task", "assignee": "Person or Team", "due_date": "YYYY-MM-DD or timeframe" }
  ]
}

Meeting Title: "${title}"
Transcript:
"""
${transcript.slice(0, 15_000)}
"""`;
}

// ── Try OpenRouter with model fallbacks ──────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  transcript: string,
  title: string
): Promise<{ summary: SummaryResult; modelUsed: string }> {
  const prompt = buildPrompt(transcript, title);

  for (const model of FREE_MODELS) {
    try {
      const res = await fetch(OPENROUTER_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': SITE_NAME
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' }
        })
      });

      // Rate limited or server error — try next model
      if (res.status === 429 || res.status >= 500) {
        console.warn(`[OpenRouter] Model ${model} returned ${res.status}, trying next…`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[OpenRouter] Model ${model} error:`, errText);
        continue;
      }

      const data = (await res.json()) as any;
      const content: string = data.choices?.[0]?.message?.content ?? '';

      // Strip markdown fences if model ignored the instruction
      const clean = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      try {
        const parsed = JSON.parse(clean) as SummaryResult;
        return { summary: parsed, modelUsed: model };
      } catch {
        // JSON parse failed — try extracting JSON block
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
          return { summary: JSON.parse(match[0]) as SummaryResult, modelUsed: model };
        }
        console.warn(`[OpenRouter] Model ${model} returned invalid JSON, trying next…`);
      }
    } catch (fetchErr) {
      console.warn(`[OpenRouter] Network error with model ${model}:`, fetchErr);
    }
  }

  throw new Error('All OpenRouter free models failed or returned invalid JSON.');
}

// ── Route handler ─────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const { transcript, title } = req.body as { transcript?: string; title?: string };

  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    return res.status(400).json({ error: 'A non-empty transcript string is required.' });
  }

  const meetingTitle = (title ?? 'Meeting').slice(0, 200);
  const apiKey = process.env.OPENROUTER_API_KEY;

  // No API key → graceful offline heuristic fallback
  if (!apiKey) {
    console.info('[Summarize] No OPENROUTER_API_KEY — using heuristic fallback.');
    const summary = heuristicSummarize(transcript, meetingTitle);
    return res.json({ provider: 'heuristic-fallback', summary });
  }

  try {
    const { summary, modelUsed } = await callOpenRouter(apiKey, transcript, meetingTitle);
    return res.json({ provider: `openrouter/${modelUsed}`, summary });
  } catch (err: any) {
    console.error('[Summarize] OpenRouter failed, falling back to heuristic:', err.message);
    const summary = heuristicSummarize(transcript, meetingTitle);
    return res.json({ provider: 'heuristic-fallback', summary });
  }
});

export default router;
