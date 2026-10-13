import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAudioRecorderOptions {
  /**
   * Callback fired every ~chunkIntervalMs with a standalone, header-intact audio slice.
   * Transcribing these 10s chunks directly with Whisper enables reliable real-time
   * dictation across all devices (including iOS Safari and meeting/YouTube audio).
   */
  onChunkReady?: (blob: Blob) => void | Promise<void>;
  /**
   * Interval duration in milliseconds for audio chunks. Defaults to 10,000ms (~10 seconds).
   * 10 seconds is the sweet spot: gentle on API rate limits (~6 requests/min) and high Whisper accuracy.
   */
  chunkIntervalMs?: number;
}

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  recordingDuration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  audioLevel: number;
  captureMode: 'mic' | 'system';
  startRecording: (mode?: 'mic' | 'system') => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
}

export function useAudioRecorder(options?: UseAudioRecorderOptions): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [captureMode, setCaptureMode] = useState<'mic' | 'system'>('mic');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mixAudioContextRef = useRef<AudioContext | null>(null);

  // Sliced interval recording refs
  const isRecordingRef = useRef(false);
  const sliceRecorderRef = useRef<MediaRecorder | null>(null);
  const sliceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChunkReadyRef = useRef(options?.onChunkReady);
  onChunkReadyRef.current = options?.onChunkReady;
  const chunkIntervalMs = options?.chunkIntervalMs ?? 10000;

  const cleanupAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  const startAnalysis = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((acc, val) => acc + val, 0);
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn('Audio analyzer initialization error:', e);
    }
  }, []);

  // Rotates 10-second standalone MediaRecorder slices on the live MediaStream.
  // Stopping each slice writes the full container header (WebM/MP4), producing a 100%
  // valid standalone file that Whisper accepts without corruption.
  const rotateSlice = useCallback((stream: MediaStream, mimeType: string) => {
    if (!isRecordingRef.current) return;

    const sliceChunks: Blob[] = [];
    let nextRecorder: MediaRecorder;
    try {
      nextRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (e) {
      console.warn('[useAudioRecorder] Failed to create slice recorder:', e);
      return;
    }

    const prevRecorder = sliceRecorderRef.current;
    sliceRecorderRef.current = nextRecorder;

    nextRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        sliceChunks.push(e.data);
      }
    };

    nextRecorder.onstop = () => {
      if (sliceChunks.length > 0) {
        const sliceBlob = new Blob(sliceChunks, {
          type: mimeType || nextRecorder.mimeType || 'audio/webm'
        });
        // Whisper requires ~2KB minimum to contain audible speech
        if (sliceBlob.size >= 2048 && onChunkReadyRef.current) {
          onChunkReadyRef.current(sliceBlob);
        }
      }
    };

    // Safely stop previous recorder to emit its chunk
    if (prevRecorder && prevRecorder.state === 'recording') {
      try {
        prevRecorder.stop();
      } catch (err) {
        console.warn('Error stopping previous slice recorder:', err);
      }
    }

    try {
      nextRecorder.start();
    } catch (err) {
      console.warn('Failed to start next slice recorder:', err);
      return;
    }

    // Schedule next slice rotation in chunkIntervalMs (~10 seconds)
    sliceTimerRef.current = setTimeout(() => {
      if (isRecordingRef.current) {
        rotateSlice(stream, mimeType);
      }
    }, chunkIntervalMs);
  }, [chunkIntervalMs]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;

    if (sliceTimerRef.current) {
      clearTimeout(sliceTimerRef.current);
      sliceTimerRef.current = null;
    }

    // Stop active slice recorder so its trailing chunk (e.g. 3-7s) is emitted
    if (sliceRecorderRef.current && sliceRecorderRef.current.state === 'recording') {
      try {
        sliceRecorderRef.current.stop();
      } catch {}
    }
    sliceRecorderRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (mixAudioContextRef.current && mixAudioContextRef.current.state !== 'closed') {
      mixAudioContextRef.current.close().catch(() => {});
      mixAudioContextRef.current = null;
    }

    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((track) => track.stop());
      displayStreamRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async (mode: 'mic' | 'system' = 'mic') => {
    try {
      setCaptureMode(mode);
      audioChunksRef.current = [];
      setAudioBlob(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      let audioStreamToRecord: MediaStream;

      if (mode === 'system') {
        // Tab / System audio via getDisplayMedia
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        displayStreamRef.current = displayStream;

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          // Attempt to mix microphone with tab audio so both meeting attendees
          // and user's microphone speech are cleanly recorded
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
            micStreamRef.current = micStream;

            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) throw new Error('AudioContext unsupported');
            const mixContext = new AudioCtx();
            mixAudioContextRef.current = mixContext;
            const destination = mixContext.createMediaStreamDestination();

            const tabSource = mixContext.createMediaStreamSource(new MediaStream(audioTracks));
            const micSource = mixContext.createMediaStreamSource(micStream);
            tabSource.connect(destination);
            micSource.connect(destination);

            audioStreamToRecord = destination.stream;
          } catch {
            // If mic access denied or busy, capture tab audio alone
            audioStreamToRecord = new MediaStream(audioTracks);
          }
        } else {
          // Graceful fallback to microphone if user didn't check audio share
          try {
            const micFallback = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
            audioStreamToRecord = micFallback;
          } catch (err) {
            displayStream.getTracks().forEach((t) => t.stop());
            displayStreamRef.current = null;
            throw new Error(
              'No audio stream found. Please check "Share audio" in the sharing dialog, or click "In-Room Mic".',
              { cause: err }
            );
          }
        }

        displayStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            console.log('[AudioRecorder] Video share stream track ended; audio capture continues until user stops.');
          };
        });
      } else {
        // Microphone audio (iOS Safari, Android Chrome, Desktop)
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        audioStreamToRecord = micStream;
      }

      streamRef.current = audioStreamToRecord;
      startAnalysis(audioStreamToRecord);

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus'
      ];
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};

      const mediaRecorder = new MediaRecorder(audioStreamToRecord, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const finalType = mimeType || mediaRecorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: finalType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Stop all tracks
        audioStreamToRecord.getTracks().forEach((track) => track.stop());
        if (displayStreamRef.current) {
          displayStreamRef.current.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
        }
        cleanupAudioAnalysis();
      };

      try {
        mediaRecorder.start(1000);
      } catch {
        mediaRecorder.start();
      }

      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingDuration(0);

      // Start the 10-second slice rotation if chunk consumer is present
      if (onChunkReadyRef.current) {
        rotateSlice(audioStreamToRecord, mimeType);
      }

      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Failed to start audio recording:', err);
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((t) => t.stop());
        displayStreamRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      cleanupAudioAnalysis();
      isRecordingRef.current = false;
      setIsRecording(false);
      throw err;
    }
  }, [audioUrl, startAnalysis, cleanupAudioAnalysis, rotateSlice]);

  const resetRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (sliceTimerRef.current) {
      clearTimeout(sliceTimerRef.current);
      sliceTimerRef.current = null;
    }
    if (sliceRecorderRef.current) {
      sliceRecorderRef.current.onstop = null;
      if (sliceRecorderRef.current.state === 'recording') {
        try {
          sliceRecorderRef.current.stop();
        } catch {}
      }
      sliceRecorderRef.current = null;
    }

    stopRecording();
    cleanupAudioAnalysis();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setRecordingDuration(0);
  }, [stopRecording, cleanupAudioAnalysis, audioUrl]);

  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      if (sliceTimerRef.current) clearTimeout(sliceTimerRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      cleanupAudioAnalysis();
    };
  }, [cleanupAudioAnalysis]);

  return {
    isRecording,
    recordingDuration,
    audioBlob,
    audioUrl,
    audioLevel,
    captureMode,
    startRecording,
    stopRecording,
    resetRecording
  };
}
