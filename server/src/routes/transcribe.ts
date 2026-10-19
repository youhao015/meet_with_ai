import { Router, Request, Response } from 'express';
import multer from 'multer';

const router = Router();

// Configure memory storage for in-memory buffer handling (clean & stateless)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

interface TranscribeRequestBody {
  prompt?: string;
  language?: string;
}

router.post('/', upload.single('audio'), async (req: Request, res: Response) => {
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!groqApiKey) {
    return res.status(500).json({
      error: 'GROQ_API_KEY is not configured on the server. Please check server/.env.'
    });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({
      error: 'No audio file provided in the request (expected field: audio).'
    });
  }

  try {
    const { prompt, language } = req.body as TranscribeRequestBody;

    // Build standard multipart FormData for Groq / OpenAI-compatible API
    const formData = new FormData();
    const mimeType = file.mimetype || 'audio/webm';
    
    // Choose appropriate file extension from mimetype
    let filename = file.originalname || 'meeting_recording.webm';
    if (!filename.includes('.')) {
      if (mimeType.includes('mp4') || mimeType.includes('m4a')) filename += '.mp4';
      else if (mimeType.includes('ogg')) filename += '.ogg';
      else if (mimeType.includes('wav')) filename += '.wav';
      else filename += '.webm';
    }

    const uint8 = new Uint8Array(file.buffer);
    const audioBlob = new Blob([uint8], { type: mimeType });
    formData.append('file', audioBlob, filename);
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json');
    formData.append('temperature', '0');

    if (language) {
      formData.append('language', language);
    }

    if (prompt) {
      formData.append('prompt', prompt);
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqApiKey}`
      },
      body: formData
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('[Groq Whisper Error]:', groqResponse.status, errText);
      return res.status(groqResponse.status).json({
        error: `Groq Whisper API returned ${groqResponse.status}: ${errText}`
      });
    }

    const data = (await groqResponse.json()) as {
      text: string;
      language?: string;
      duration?: number;
      segments?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
        no_speech_prob?: number;
        compression_ratio?: number;
      }>;
    };

    let text = data.text?.trim() || '';
    const segments = data.segments;

    if (segments && segments.length > 0) {
      const isCompletelySilent = segments.every((s) => (s.no_speech_prob ?? 0) > 0.65);
      const avgNoSpeechProb = segments.reduce((sum, s) => sum + (s.no_speech_prob ?? 0), 0) / segments.length;

      if (isCompletelySilent || (segments.length > 1 && avgNoSpeechProb > 0.7)) {
        return res.json({
          success: true,
          text: '',
          language: data.language,
          duration: data.duration,
          segments: []
        });
      }

      const speechSegments = segments.filter((s) => (s.no_speech_prob ?? 0) <= 0.75);
      if (speechSegments.length === 0) {
        return res.json({
          success: true,
          text: '',
          language: data.language,
          duration: data.duration,
          segments: []
        });
      }

      if (speechSegments.length < segments.length) {
        text = speechSegments.map((s) => s.text).join(' ').trim();
      }
    }

    return res.json({
      success: true,
      text,
      language: data.language,
      duration: data.duration,
      segments: data.segments
    });
  } catch (error: any) {
    console.error('[Transcription Controller Exception]:', error);
    return res.status(500).json({
      error: error.message || 'Internal server error while transcribing audio'
    });
  }
});

export default router;
