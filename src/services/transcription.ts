const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export interface TranscribeResponse {
  success: boolean;
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
}

export async function transcribeAudioWithWhisper(
  audioBlob: Blob,
  options?: { language?: string; prompt?: string }
): Promise<TranscribeResponse> {
  const formData = new FormData();
  
  // Name the file properly based on blob type
  const extension = audioBlob.type.includes('mp4')
    ? 'mp4'
    : audioBlob.type.includes('ogg')
    ? 'ogg'
    : audioBlob.type.includes('wav')
    ? 'wav'
    : 'webm';

  formData.append('audio', audioBlob, `meeting_recording.${extension}`);

  if (options?.language) {
    formData.append('language', options.language);
  }
  if (options?.prompt) {
    formData.append('prompt', options.prompt);
  }

  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `Transcription failed with HTTP ${response.status}`);
  }

  return response.json();
}
