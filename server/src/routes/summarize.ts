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

const FREE_MODELS = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free'
] as const;

const SITE_URL = process.env.SITE_URL || process.env.CLIENT_URL || '';

// ── Heuristic fallback ────────────────────────────────────────────────────────

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

// ── Build prompt ──────────────────────────────────────────────────────────────

function buildPrompt(transcript: string, title: string): string {
  return `You are an expert executive meeting assistant.
Analyze the following meeting transcript and produce a structured, high-value executive summary.
Respond ONLY with a valid JSON object matching this schema exactly:
{
  "overview": "Concise executive overview (2-4 clear sentences highlighting the main purpose, tone, and final conclusion)",
  "key_points": ["Key discussion point 1", "Key discussion point 2"],
  "decisions": ["Final decision or agreement 1", "Final decision 2"],
  "action_items": [
    {
      "task": "Concrete actionable task description",
      "assignee": "Person, role, or team responsible",
      "due_date": "Target date or timeframe if mentioned, otherwise leave as Ongoing or Soon"
    }
  ]
}

Meeting Title: "${title}"
Transcript:
"""
${transcript.slice(0, 100_000)}
"""`;
}

// ── Call Gemini AI ────────────────────────────────────────────────────────────

async function callGemini(
  apiKey: string,
  transcript: string,
  title: string
): Promise<{ summary: SummaryResult; modelUsed: string }> {
  const GEMINI_MODELS = [
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash'
  ];

  const prompt = buildPrompt(transcript, title);
  let lastError = '';

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2
          }
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[Gemini] ${model} returned ${res.status}: ${errText}. Trying next model…`);
        lastError = `Gemini API error ${res.status}: ${errText}`;
        continue;
      }

      const data = (await res.json()) as any;
      const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      const clean = rawText
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      const parsed = JSON.parse(clean) as SummaryResult;
      return { summary: parsed, modelUsed: model };
    } catch (err: any) {
      lastError = err.message;
      console.warn(`[Gemini] Model ${model} failed:`, err.message);
    }
  }

  throw new Error(`All Gemini models failed: ${lastError}`);
}

// ── Try OpenRouter with fallback ──────────────────────────────────────────────

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

      if (res.status === 429 || res.status >= 500) {
        console.warn(`[OpenRouter] Model ${model} returned ${res.status}, trying next…`);
        continue;
      }

      if (!res.ok) {
        continue;
      }

      const data = (await res.json()) as any;
      const content: string = data.choices?.[0]?.message?.content ?? '';

      const clean = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();

      try {
        const parsed = JSON.parse(clean) as SummaryResult;
        return { summary: parsed, modelUsed: model };
      } catch {
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
          return { summary: JSON.parse(match[0]) as SummaryResult, modelUsed: model };
        }
      }
    } catch {
      // try next
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
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  // 1. Primary: Gemini AI (Fast, 1M+ tokens, structured JSON mode)
  if (geminiApiKey) {
    try {
      const { summary, modelUsed } = await callGemini(geminiApiKey, transcript, meetingTitle);
      return res.json({ provider: `gemini/${modelUsed}`, summary });
    } catch (err: any) {
      console.warn('[Summarize] Gemini AI encountered an error, falling back to secondary:', err.message);
    }
  }

  // 2. Secondary: OpenRouter
  if (openRouterApiKey) {
    try {
      const { summary, modelUsed } = await callOpenRouter(openRouterApiKey, transcript, meetingTitle);
      return res.json({ provider: `openrouter/${modelUsed}`, summary });
    } catch (err: any) {
      console.warn('[Summarize] OpenRouter failed, falling back to heuristic:', err.message);
    }
  }

  // 3. Graceful offline heuristic fallback
  console.info('[Summarize] Using heuristic fallback.');
  const summary = heuristicSummarize(transcript, meetingTitle);
  return res.json({ provider: 'heuristic-fallback', summary });
});

export default router;
