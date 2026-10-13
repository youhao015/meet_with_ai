const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface TranscribeResponse {
  success: boolean;
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
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
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');

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
    return {
      success: true,
      text: data.text?.trim() || '',
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
