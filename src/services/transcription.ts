const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export interface TranscribeResponse {
  success: boolean;
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
}

export function removeWhisperHallucinationLoops(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();

  // 1. Phrase loop collapse: detect repeated sequences of 2 to 8 words repeating consecutively 2+ times
  // Example: "of the episode of the episode of the episode" -> "of the episode"
  cleaned = cleaned.replace(/\b(\w+(?:\s+\w+){1,7})\b(?:\s+\1\b){2,}/gi, '$1');

  // 2. Sentence / clause repetition collapse:
  const parts = cleaned.split(/(?<=[.?!])\s+/);
  if (parts.length >= 2) {
    const uniqueParts: string[] = [];
    const seenCount = new Map<string, number>();

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const normKey = trimmed.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
      if (!normKey) continue;

      const count = seenCount.get(normKey) || 0;
      const lastPart = uniqueParts[uniqueParts.length - 1];
      const lastNorm = lastPart ? lastPart.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '') : '';

      // Skip consecutive duplicates
      if (normKey === lastNorm) {
        continue;
      }

      // If a sentence appears 3+ times in a 10s chunk, it's a hallucination loop
      if (count >= 2) {
        continue;
      }

      seenCount.set(normKey, count + 1);
      uniqueParts.push(trimmed);
    }

    cleaned = uniqueParts.join(' ');
  }

  return cleaned.trim();
}

export function cleanWhisperChunk(raw: string): string {
  let text = raw.trim();
  if (!text) return '';

  // Remove bracketed or parenthesized sound tags
  text = text.replace(/\[(?:music|applause|laughter|silence|blank_audio|inaudible|cheering|noise|sound|background noise)\]/gi, '').trim();
  text = text.replace(/\((?:music|applause|laughter|silence|blank_audio|inaudible|cheering|noise|sound|background noise)\)/gi, '').trim();

  if (!text || text === '.' || text === '...' || text === '!') return '';

  // Collapse internal repetition loops (e.g. phrase loops caused by audio pauses)
  text = removeWhisperHallucinationLoops(text);
  if (!text) return '';

  const lower = text.toLowerCase().replace(/[.,!?;:]/g, '').trim();
  const hallucinations = new Set([
    'thank you',
    'thank you.',
    'thanks for watching',
    'thank you for watching',
    'thanks for watching.',
    'thank you for watching.',
    'thank you for listening',
    'thanks for listening',
    'please subscribe',
    'subscribe to my channel',
    'subtitles by the amaraorg community',
    'subtitles by the amara.org community',
    'subtitles by',
    'you',
    'bye',
    'goodbye',
    'see you next time',
    'see you in the next video',
    'the end',
    'silence',
    'blank audio',
    'watching',
    '谢谢大家',
    '谢谢观看',
    '感谢观看',
    '请订阅',
    '欢迎订阅'
  ]);

  if (hallucinations.has(lower)) {
    return '';
  }

  return text;
}

export function getGroqApiKey(): string {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('groq_api_key');
    if (stored?.trim()) return stored.trim();
  }
  const env = import.meta.env as Record<string, string | undefined>;
  return (env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || '').trim();
}

export function setGroqApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    if (key.trim()) {
      localStorage.setItem('groq_api_key', key.trim());
    } else {
      localStorage.removeItem('groq_api_key');
    }
  }
}

export async function transcribeAudioWithWhisper(
  audioBlob: Blob,
  options?: { language?: string; prompt?: string }
): Promise<TranscribeResponse> {
  const groqApiKey = getGroqApiKey();

  // Primary Path for Vercel/Client: Call Groq's Whisper API directly from browser
  // Groq fully supports browser CORS (Access-Control-Allow-Origin: *)
  if (groqApiKey) {
    const extension = audioBlob.type.includes('mp4')
      ? 'mp4'
      : audioBlob.type.includes('ogg')
      ? 'ogg'
      : audioBlob.type.includes('wav')
      ? 'wav'
      : 'webm';

    const formData = new FormData();
    formData.append('file', audioBlob, `meeting_recording.${extension}`);
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0');

    if (options?.language) {
      formData.append('language', options.language);
    }
    if (options?.prompt) {
      formData.append('prompt', options.prompt);
    }

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Groq Whisper API error (${response.status}): ${errText || response.statusText}`);
    }

    const data = await response.json();
    let text = data.text?.trim() || '';
    const segments = data.segments as Array<{
      id: number;
      start: number;
      end: number;
      text: string;
      no_speech_prob?: number;
      compression_ratio?: number;
    }> | undefined;

    // Check silence probability from Whisper segments
    if (segments && segments.length > 0) {
      const isCompletelySilent = segments.every((s) => (s.no_speech_prob ?? 0) > 0.65);
      const avgNoSpeechProb = segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length;

      if (isCompletelySilent || (segments.length > 1 && avgNoSpeechProb > 0.7)) {
        return {
          success: true,
          text: '',
          language: data.language,
          duration: data.duration,
          segments: []
        };
      }

      // Filter out individual segments that are pure silence (no_speech_prob > 0.75)
      const speechSegments = segments.filter((s) => (s.no_speech_prob ?? 0) <= 0.75);
      if (speechSegments.length === 0) {
        return {
          success: true,
          text: '',
          language: data.language,
          duration: data.duration,
          segments: []
        };
      }

      // If silence segments were pruned, update text accordingly
      if (speechSegments.length < segments.length) {
        text = speechSegments.map((s) => s.text).join(' ').trim();
      }
    }

    return {
      success: true,
      text,
      language: data.language,
      duration: data.duration,
      segments: data.segments
    };
  }

  // Fallback: If no client Groq key, attempt local Express server
  try {
    const formData = new FormData();
    const extension = audioBlob.type.includes('mp4')
      ? 'mp4'
      : audioBlob.type.includes('ogg')
      ? 'ogg'
      : audioBlob.type.includes('wav')
      ? 'wav'
      : 'webm';

    formData.append('audio', audioBlob, `meeting_recording.${extension}`);

    if (options?.language) formData.append('language', options.language);
    if (options?.prompt) formData.append('prompt', options.prompt);

    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      throw new Error(errorJson.error || `Transcription failed with HTTP ${response.status}`);
    }

    return response.json();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error(
        'Transcription server offline. To transcribe on Vercel without a local server, please add your Groq API key in Settings (or set VITE_GROQ_API_KEY in Vercel).'
      );
    }
    throw err;
  }
}
