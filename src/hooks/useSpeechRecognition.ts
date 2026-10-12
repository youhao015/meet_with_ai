import { useState, useEffect, useRef, useCallback } from 'react';

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  speechError: string | null;
  hasAudioInput: boolean;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
  setTranscript: (text: string) => void;
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscriptState] = useState('');
  const [interimTranscript, setInterimTranscriptState] = useState('');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [hasAudioInput, setHasAudioInput] = useState(false);

  const [isSupported] = useState(() => {
    if (typeof window === 'undefined') return false;
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  });

  const activeSessionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const transcriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTranscript = useCallback((text: string) => {
    transcriptRef.current = text;
    setTranscriptState(text);
  }, []);

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  // Commit any pending interim transcript into the permanent transcript.
  // This guarantees words spoken before a pause are NEVER lost on session boundary.
  const flushInterimToTranscript = useCallback(() => {
    const pending = interimTranscriptRef.current.trim();
    if (pending) {
      const updated = transcriptRef.current
        ? `${transcriptRef.current} ${pending}`
        : pending;
      transcriptRef.current = updated;
      setTranscriptState(updated);
      interimTranscriptRef.current = '';
      setInterimTranscriptState('');
    }
  }, []);

  const startRecognitionSession = useCallback(() => {
    if (!shouldListenRef.current || typeof window === 'undefined') return;

    const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;

    clearRestartTimer();

    // Clean up any stale active instance
    if (activeSessionRef.current) {
      try {
        activeSessionRef.current.onend = null;
        activeSessionRef.current.onerror = null;
        activeSessionRef.current.onresult = null;
        activeSessionRef.current.abort();
      } catch {
        // ignore
      }
      activeSessionRef.current = null;
    }

    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onaudiostart = () => {
        setHasAudioInput(true);
        setSpeechError(null);
      };

      recognition.onaudioend = () => {
        setHasAudioInput(false);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalChunk += text + ' ';
          } else {
            interimChunk += text;
          }
        }

        // Commit finalized words into accumulated transcript
        if (finalChunk.trim()) {
          const updated = transcriptRef.current
            ? `${transcriptRef.current} ${finalChunk.trim()}`
            : finalChunk.trim();
          transcriptRef.current = updated;
          setTranscriptState(updated);
        }

        // Store live interim text
        const trimmedInterim = interimChunk.trim();
        interimTranscriptRef.current = trimmedInterim;
        setInterimTranscriptState(trimmedInterim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const err = event.error;
        console.warn('[SpeechRecognition] Status:', err);

        // Don't treat transient silences or user aborts as fatal errors
        if (err === 'no-speech' || err === 'aborted') {
          return;
        }

        if (err === 'network') {
          setSpeechError('Network warning: Speech-to-text requires internet connectivity.');
          return;
        }

        if (err === 'not-allowed' || err === 'service-not-allowed') {
          // If browser tab is hidden, Chrome throws not-allowed for background capture.
          // Don't kill shouldListenRef; we will auto-reconnect when tab is focused again!
          if (document.hidden) {
            return;
          }
          setSpeechError('Microphone permission denied for speech recognition.');
          return;
        }

        setSpeechError(`Recognition notice: ${err}`);
      };

      recognition.onend = () => {
        setHasAudioInput(false);

        // ALWAYS flush any pending interim text into the transcript so pauses don't lose words!
        flushInterimToTranscript();

        if (shouldListenRef.current) {
          clearRestartTimer();
          // Resilient restart after 60ms pause
          restartTimerRef.current = setTimeout(() => {
            if (shouldListenRef.current) {
              startRecognitionSession();
            }
          }, 60);
        } else {
          setIsListening(false);
        }
      };

      activeSessionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setSpeechError(null);
    } catch {
      // In case start() fails (e.g. busy state), retry shortly if user still wants to listen
      if (shouldListenRef.current) {
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (shouldListenRef.current) {
            startRecognitionSession();
          }
        }, 250);
      }
    }
  }, [flushInterimToTranscript]);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    setSpeechError(null);
    shouldListenRef.current = true;
    startRecognitionSession();
  }, [isSupported, startRecognitionSession]);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    clearRestartTimer();

    // Flush any pending words immediately before closing
    flushInterimToTranscript();

    if (activeSessionRef.current) {
      try {
        activeSessionRef.current.onend = null;
        activeSessionRef.current.onerror = null;
        activeSessionRef.current.stop();
      } catch {
        // ignore
      }
      activeSessionRef.current = null;
    }

    setIsListening(false);
    setHasAudioInput(false);
    setInterimTranscriptState('');
  }, [flushInterimToTranscript]);

  const resetTranscript = useCallback(() => {
    transcriptRef.current = '';
    interimTranscriptRef.current = '';
    setTranscriptState('');
    setInterimTranscriptState('');
    setSpeechError(null);
  }, []);

  // Handle tab switching / visibility changes gracefully
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && shouldListenRef.current) {
        // Tab is back in focus: cleanly resume recognition session
        clearRestartTimer();
        flushInterimToTranscript();
        startRecognitionSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushInterimToTranscript, startRecognitionSession]);

  // Teardown only on complete unmount of the hook
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      clearRestartTimer();
      if (activeSessionRef.current) {
        try {
          activeSessionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    speechError,
    hasAudioInput,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript
  };
}
