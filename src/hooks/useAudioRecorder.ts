import { useState, useRef, useCallback, useEffect } from 'react';

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

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [captureMode, setCaptureMode] = useState<'mic' | 'system'>('mic');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mixAudioContextRef = useRef<AudioContext | null>(null);

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
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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

  const stopRecording = useCallback(() => {
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
          // Attempt to mix microphone with tab audio so both meeting attendees (in earphones)
          // and user's microphone speech are cleanly recorded into one session
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
            micStreamRef.current = micStream;

            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
          // If the user selected a screen or window without checking audio,
          // gracefully fallback to microphone audio so recording succeeds
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
              'No audio stream found. Please check "Share audio" in the sharing dialog, or click "Record In-Room Mic".',
              { cause: err }
            );
          }
        }

        // Note: Do not automatically kill the entire recording session if screen sharing ends.
        // The user must explicitly click "Stop Recording" to end their session.
        displayStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            console.log('[AudioRecorder] Video share stream track ended; audio capture continues until user stops.');
          };
        });
      } else {
        // Microphone audio
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
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac'
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

        // Stop all tracks (screen display tracks and audio tracks)
        audioStreamToRecord.getTracks().forEach((track) => track.stop());
        if (displayStreamRef.current) {
          displayStreamRef.current.getTracks().forEach((track) => track.stop());
          displayStreamRef.current = null;
        }
        cleanupAudioAnalysis();
      };

      try {
        mediaRecorder.start(1000); // 1-second chunks
      } catch {
        mediaRecorder.start();
      }

      setIsRecording(true);
      setRecordingDuration(0);

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
      setIsRecording(false);
      throw err;
    }
  }, [audioUrl, startAnalysis, cleanupAudioAnalysis, stopRecording]);

  const resetRecording = useCallback(() => {
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
