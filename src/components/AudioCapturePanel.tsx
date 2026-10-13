import React, { useState, useEffect } from 'react';
import {
  Mic,
  MonitorUp,
  Square,
  Sparkles,
  RefreshCw,
  Play,
  RotateCcw,
  FileText
} from 'lucide-react';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { AudioVisualizer } from './AudioVisualizer';
import { PipelineStatus } from './PipelineStatus';
import { summarizeMeeting, type SummarizeResult } from '../services/summarizer';
import { saveMeetingWithItems } from '../services/supabase';
import {
  transcribeAudioWithWhisper,
  cleanWhisperChunk,
  getGroqApiKey
} from '../services/transcription';

interface AudioCapturePanelProps {
  onSummaryGenerated: (result: SummarizeResult, meetingTitle: string, transcript: string, meetingId?: string) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  onSummarizingStateChange?: (isSummarizing: boolean) => void;
}

export const AudioCapturePanel: React.FC<AudioCapturePanelProps> = ({
  onSummaryGenerated,
  onRecordingStateChange,
  onSummarizingStateChange
}) => {
  const [meetingTitle, setMeetingTitle] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [streamingTokens, setStreamingTokens] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<'cloud' | 'local-webgpu' | 'heuristic' | null>(null);
  const [showCaptureHelp, setShowCaptureHelp] = useState(false);

  // Automatic transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isTranscribingChunk, setIsTranscribingChunk] = useState(false);
  const [transcribePercent, setTranscribePercent] = useState<number>(0);
  const wasRecordingRef = React.useRef(false);

  const {
    isListening,
    transcript,
    interimTranscript,
    isSupported: isSpeechSupported,
    speechError,
    hasAudioInput,
    startListening,
    stopListening,
    resetTranscript,
    setTranscript
  } = useSpeechRecognition();

  // Keep transcriptRef synchronized with the latest transcript text
  const transcriptRef = React.useRef(transcript);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Combine committed transcript with real-time interim speech if fallback Web Speech is active
  const liveTranscript = isListening && interimTranscript
    ? (transcript ? `${transcript} ${interimTranscript}` : interimTranscript)
    : transcript;

  // Queue to ensure 10-second audio chunks are processed strictly in chronological FIFO order
  const chunkQueueRef = React.useRef<Blob[]>([]);
  const isProcessingQueueRef = React.useRef(false);

  const processChunkQueue = React.useCallback(async () => {
    if (isProcessingQueueRef.current) return;
    isProcessingQueueRef.current = true;

    while (chunkQueueRef.current.length > 0) {
      const chunkBlob = chunkQueueRef.current.shift()!;
      try {
        setIsTranscribingChunk(true);
        // Provide the trailing 150 characters to Whisper as context prompt for seamless grammatical flow
        const currentText = transcriptRef.current.trim();
        const prompt = currentText.length > 150 ? currentText.slice(-150) : currentText;

        const response = await transcribeAudioWithWhisper(chunkBlob, {
          prompt: prompt || undefined
        });

        if (response.text) {
          const cleaned = cleanWhisperChunk(response.text);
          if (cleaned) {
            const trimmed = transcriptRef.current.trim();
            const updated = trimmed ? `${trimmed} ${cleaned}` : cleaned;
            transcriptRef.current = updated;
            setTranscript(updated);
          }
        }
      } catch (err) {
        console.warn('[10s Whisper Chunk Sync notice]:', err);
      } finally {
        setIsTranscribingChunk(false);
      }
    }

    isProcessingQueueRef.current = false;
  }, [setTranscript]);

  const handleChunkReady = React.useCallback((sliceBlob: Blob) => {
    // If Groq key is present, queue this 10-second chunk for Whisper transcription
    if (getGroqApiKey()) {
      chunkQueueRef.current.push(sliceBlob);
      processChunkQueue();
    }
  }, [processChunkQueue]);

  const {
    isRecording,
    recordingDuration,
    audioUrl,
    audioLevel,
    captureMode,
    audioBlob,
    startRecording,
    stopRecording,
    resetRecording
  } = useAudioRecorder({
    onChunkReady: handleChunkReady,
    chunkIntervalMs: 10000 // 10-second interval: optimal balance of rate-limits (~6 req/min) & Whisper accuracy
  });

  // Synchronize hasStarted whenever recording becomes active
  useEffect(() => {
    if (isRecording) {
      setHasStarted(true);
    }
  }, [isRecording]);

  const showActiveRecording = hasStarted || isRecording;

  // Keep browser tab title updated so background recording is clearly visible
  useEffect(() => {
    onRecordingStateChange?.(isRecording);
    if (isRecording) {
      document.title = '🔴 Recording... · MeetWithAI';
    } else {
      document.title = 'MeetWithAI';
    }
    return () => {
      onRecordingStateChange?.(false);
    };
  }, [isRecording, onRecordingStateChange]);

  // Notify parent of summarization status to lock tabs while AI is generating
  useEffect(() => {
    onSummarizingStateChange?.(isSummarizing);
    return () => {
      onSummarizingStateChange?.(false);
    };
  }, [isSummarizing, onSummarizingStateChange]);

  // Fallback transcription if recording completed without live chunks (e.g. key added afterwards)
  const handleAutoTranscribe = async (blob: Blob) => {
    try {
      setIsTranscribing(true);
      setTranscribePercent(25);

      const progressTimer = setInterval(() => {
        setTranscribePercent((prev) => {
          if (prev >= 85) return prev;
          return prev + 15;
        });
      }, 400);

      const response = await transcribeAudioWithWhisper(blob);
      clearInterval(progressTimer);
      setTranscribePercent(100);

      if (response.text && response.text.trim()) {
        const whisperText = response.text.trim();
        setTranscript(whisperText);
        transcriptRef.current = whisperText;
      }
    } catch (err) {
      console.warn('[Auto-transcribe notice]:', err);
    } finally {
      setTimeout(() => {
        setIsTranscribing(false);
        setTranscribePercent(0);
      }, 700);
    }
  };

  useEffect(() => {
    if (wasRecordingRef.current && !isRecording && audioBlob && audioBlob.size > 0) {
      // If 10-second live chunks already populated the transcript, avoid redundant full re-transcribe
      if (!transcriptRef.current.trim()) {
        handleAutoTranscribe(audioBlob);
      }
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, audioBlob]);

  const handleStartCapture = async (mode: 'mic' | 'system') => {
    try {
      setHasStarted(true);
      setErrorMessage(null);

      // 1. Establish audio capture
      await startRecording(mode);

      // 2. Only start browser SpeechRecognition if Groq Whisper is NOT configured.
      // With Groq Whisper configured, 10s chunks transcribe reliably across all devices
      // (iOS Safari, Android, desktop, YouTube tab audio) without duplicate words.
      if (!getGroqApiKey() && isSpeechSupported) {
        startListening();
      }
    } catch (err: unknown) {
      stopListening();
      const errorObj = err instanceof Error ? err : null;
      const errorMsg = errorObj?.message || String(err || '');
      if (errorObj?.name === 'NotAllowedError' || errorMsg.toLowerCase().includes('permission denied')) {
        setErrorMessage('Microphone access was blocked. Please click the permissions icon in your browser address bar to allow Microphone, or type/paste notes below.');
      } else {
        setErrorMessage(`Failed to start recording: ${errorMsg || 'Permission denied'}`);
      }
    }
  };

  const handleStopCapture = () => {
    stopRecording();
    if (isListening) {
      stopListening();
    }
  };

  const handleReset = () => {
    resetRecording();
    resetTranscript();
    setHasStarted(false);
    setShowCaptureHelp(false);
    setErrorMessage(null);
    setProgressText('');
    setProgressPercent(0);
    setStreamingTokens('');
    setActiveTier(null);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSummarize = async () => {
    const textToSummarize = transcript.trim();
    if (!textToSummarize) {
      setErrorMessage('Please record speech or type/paste meeting notes in the transcript box below before generating a summary.');
      return;
    }

    try {
      setIsSummarizing(true);
      setErrorMessage(null);
      setStreamingTokens('');
      setProgressPercent(0);
      setProgressText('Initializing hybrid AI pipeline…');
      setActiveTier(null);

      const displayTitle = meetingTitle.trim() || 'Untitled Meeting';
      const result = await summarizeMeeting({
        transcript: textToSummarize,
        title: displayTitle,
        audioBlob: audioBlob ?? undefined,
        audioDurationSeconds: recordingDuration,
        onProgress: (text, pct) => {
          setProgressText(text);
          if (pct !== undefined) setProgressPercent(pct);
          if (text.toLowerCase().includes('local ai') || text.toLowerCase().includes('webgpu')) {
            setActiveTier('local-webgpu');
          } else if (text.toLowerCase().includes('cloud')) {
            setActiveTier('cloud');
          }
        },
        onStreamToken: (_token, accumulated) => {
          setStreamingTokens(accumulated);
        }
      });

      setActiveTier(result.tierUsed as 'cloud' | 'local-webgpu' | 'heuristic');

      let savedMeetingId: string | undefined;
      // Automatically persist to Supabase database
      try {
        const saved = await saveMeetingWithItems({
          title: displayTitle,
          duration_seconds: recordingDuration,
          source: 'live',
          transcript: textToSummarize,
          summary: result.summary,
          audio_url: result.audioUrl
        }, result.summary.action_items);
        if (saved?.id) {
          savedMeetingId = saved.id;
        }
      } catch (saveErr) {
        console.warn('Note: Summarization succeeded; Supabase sync error:', saveErr);
      }

      onSummaryGenerated(result, displayTitle, textToSummarize, savedMeetingId);
    } catch (err: unknown) {
      console.error('Summarization failure:', err);
      const errMsg = err instanceof Error ? err.message : String(err || '');
      setErrorMessage(`Summarization failed: ${errMsg || 'Unknown error'}`);
    } finally {
      setIsSummarizing(false);
      onSummarizingStateChange?.(false);
    }
  };

  return (
    <div className="page-container">

      {/* Top Header Card */}
      <div className="glass-panel" style={{ padding: '24px 28px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Meeting Title
            </label>
            <input
              id="meeting-title-input"
              type="text"
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="write a title"
              style={{
                width: '100%',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '12px',
                padding: '12px 16px',
                color: 'var(--text-primary)',
                fontSize: '17px',
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                marginTop: '6px',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            />
          </div>

          {/* Recording Timer & Audio Wave - hidden before recording */}
          {showActiveRecording && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              background: 'var(--glass-surface-subtle)',
              padding: '10px 18px',
              borderRadius: '14px',
              border: '1px solid var(--glass-border)',
              alignSelf: 'flex-end',
              minHeight: '76px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isRecording ? (
                  <div style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: 'var(--accent-rose)', animation: 'pulse 1s infinite'
                  }} />
                ) : (
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                )}
                <span style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: isRecording ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>
                  {formatDuration(recordingDuration)}
                </span>
              </div>

              <div style={{ width: '1px', height: '24px', background: 'var(--glass-border)' }} />

              <AudioVisualizer isRecording={isRecording} audioLevel={audioLevel} />
            </div>
          )}
        </div>

        {/* Action Controls Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginTop: '24px',
          paddingTop: '20px',
          borderTop: '1px solid var(--border-subtle)'
        }}>
          <div className="capture-actions" style={{ flexWrap: 'wrap' }}>
            {!isRecording ? (
              <>
                <button
                  id="btn-record-mic"
                  onClick={() => handleStartCapture('mic')}
                  className="btn-primary"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' }}
                >
                  <Mic size={16} />
                  In-Room Mic
                </button>
                <button
                  id="btn-record-screen"
                  onClick={() => handleStartCapture('system')}
                  className="btn-secondary"
                  title="Capture audio from browser tabs or system audio"
                >
                  <MonitorUp size={16} />
                  Record Meeting Audio
                </button>
              </>
            ) : (
              <button
                id="btn-stop-recording"
                onClick={handleStopCapture}
                className="btn-recording"
              >
                <Square size={16} />
                Stop Recording ({captureMode === 'mic' ? 'Mic' : 'Screen Audio'})
              </button>
            )}

            {(transcript || audioUrl) && !isRecording && !isTranscribing && (
              <button
                id="btn-reset-recording"
                onClick={handleReset}
                className="btn-secondary"
                title="Clear current recording and start fresh"
              >
                <RotateCcw size={15} />
                Reset
              </button>
            )}
          </div>

          {/* Summarize Button - hidden before recording */}
          {showActiveRecording && (
            <button
              id="btn-generate-summary"
              onClick={handleSummarize}
              disabled={isSummarizing || !transcript.trim()}
              className="btn-primary"
              style={{
                background: isSummarizing
                  ? 'rgba(99, 102, 241, 0.4)'
                  : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                cursor: isSummarizing ? 'not-allowed' : 'pointer',
                opacity: !transcript.trim() && !isSummarizing ? 0.55 : 1
              }}
              title={!transcript.trim() ? 'Record speech or transcribe before generating a summary.' : undefined}
            >
              {isSummarizing ? (
                <>
                  <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Processing…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Summary
                </>
              )}
            </button>
          )}
        </div>



        {/* Automatic Whisper Transcription Progress */}
        {isTranscribing && (
          <div style={{
            marginTop: '16px',
            padding: '12px 18px',
            borderRadius: '12px',
            background: 'var(--glass-surface-subtle)',
            border: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={14} color="var(--accent-primary)" style={{ animation: 'spin 1.2s linear infinite' }} />
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  Processing…
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
                {Math.round(transcribePercent)}%
              </span>
            </div>
            <div style={{
              height: '6px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: '999px',
              overflow: 'hidden',
              width: '100%'
            }}>
              <div style={{
                height: '100%',
                width: `${Math.max(5, Math.min(100, transcribePercent))}%`,
                background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
                borderRadius: '999px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>
        )}

        {/* How it works guidance - shown before recording, hidden after starting recording */}
        {!showActiveRecording && (
          <div style={{
            marginTop: '16px',
            padding: '10px 16px',
            borderRadius: '12px',
            background: 'rgba(99, 102, 241, 0.06)',
            border: '1px solid rgba(99, 102, 241, 0.18)',
            fontSize: '12.5px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            lineHeight: 1.5
          }}>
            <span style={{ fontSize: '16px' }}>🎧</span>
            <span style={{ flex: 1 }}>
              <strong>For Zoom, Meet, or Teams:</strong> choose <strong>Record Meeting Audio</strong>, select the meeting tab, and enable tab audio.
            </span>
            <button
              type="button"
              onClick={() => setShowCaptureHelp((value) => !value)}
              aria-expanded={showCaptureHelp}
              className="btn-secondary"
              style={{ padding: '5px 9px', fontSize: '11.5px', flexShrink: 0 }}
            >
              {showCaptureHelp ? 'Hide steps' : 'How it works'}
            </button>
          </div>
        )}

        {!showActiveRecording && showCaptureHelp && (
          <ol style={{ margin: '10px 0 0 20px', color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: 1.7 }}>
            <li>Use <strong>Record Meeting Audio</strong> for calls in your browser.</li>
            <li>In the share dialog, choose the meeting tab and turn on its audio.</li>
            <li>Stop recording then generate your summary.</li>
          </ol>
        )}

        {/* Tab/Screen Audio Guidance Notice when recording system audio */}
        {isRecording && captureMode === 'system' && (
          <div style={{
            marginTop: '16px',
            padding: '10px 16px',
            borderRadius: '12px',
            background: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.25)',
            fontSize: '12.5px',
            color: 'var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>🎙 Tab & screen audio is actively recorded into the audio file. Any microphone comments will stream into the transcript.</span>
          </div>
        )}

        {/* Audio Playback Bar if audio exists */}
        {audioUrl && !isRecording && (
          <div style={{
            marginTop: '16px',
            padding: '12px 16px',
            background: 'var(--glass-surface-subtle)',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
              <Play size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Session Audio:</span>
              <audio src={audioUrl} controls style={{ height: '32px', flex: 1, minWidth: '180px', outline: 'none' }} />
            </div>
          </div>
        )}

        {/* Pipeline Status Component */}
        <PipelineStatus
          isActive={isSummarizing}
          progressText={progressText}
          progressPercent={progressPercent}
          streamingTokens={streamingTokens || undefined}
          tier={activeTier}
          error={errorMessage}
        />
      </div>

      {/* Live Dictation & Transcript Box */}
      <div className="glass-panel" style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <FileText size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Real-Time Meeting Transcript
            </h3>
            {isRecording && (
              <span className="badge" style={{
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isTranscribingChunk ? '#a855f7' : (audioLevel > 5 ? '#22c55e' : '#10b981'),
                  animation: 'pulse 1s infinite',
                  display: 'inline-block'
                }} />
                {isTranscribingChunk ? 'Audio Stream Active (Syncing…)' : 'Audio Stream Active'}
              </span>
            )}
            {!isRecording && isListening && hasAudioInput && (
              <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1s infinite', display: 'inline-block' }} />
                Listening
              </span>
            )}
            {!isRecording && isListening && !hasAudioInput && (
              <span className="badge" style={{ background: 'rgba(99, 102, 241, 0.15)', color: 'var(--accent-primary)' }}>
                Live Dictation Active
              </span>
            )}
            {speechError && (
              <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', fontSize: '11px' }}>
                ⚠ {speechError}
              </span>
            )}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Editable text area
          </span>
        </div>

        {/* Fallback Real-time Voice Stream Bar if Web Speech is active without recording */}
        {!isRecording && isListening && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 16px',
            marginBottom: '12px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.22)',
            borderRadius: '12px'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: hasAudioInput ? '#10b981' : '#6366f1',
              boxShadow: hasAudioInput ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
              animation: 'pulse 1s infinite',
              flexShrink: 0
            }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-primary)', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Hearing:
            </span>
            <span style={{
              fontSize: '13.5px',
              color: interimTranscript ? 'var(--text-primary)' : 'var(--text-muted)',
              fontStyle: interimTranscript ? 'normal' : 'italic',
              fontWeight: interimTranscript ? 500 : 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {interimTranscript ? `"${interimTranscript}"` : 'Listening to your voice… speak into microphone'}
            </span>
          </div>
        )}

        <textarea
          id="transcript-textarea"
          aria-label="Meeting transcript or notes"
          value={liveTranscript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder={
            isSpeechSupported
              ? "Spoken words stream here in real-time, or you can type/paste meeting notes directly..."
              : "Speech recognition not supported in this browser. You can type or paste meeting transcripts here for AI summarization."
          }
          style={{
            width: '100%',
            minHeight: '260px',
            background: 'var(--input-bg)',
            border: '1px solid var(--input-border)',
            borderRadius: '14px',
            padding: '16px',
            color: 'var(--text-primary)',
            fontSize: '14px',
            lineHeight: '1.7',
            fontFamily: 'var(--font-body)',
            resize: 'vertical',
            outline: 'none',
            transition: 'all 0.2s ease'
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>Word count: {liveTranscript ? liveTranscript.split(/\s+/).filter(Boolean).length : 0} words</span>
        </div>
      </div>
    </div>
  );
};
