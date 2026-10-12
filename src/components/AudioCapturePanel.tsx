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

interface AudioCapturePanelProps {
  onSummaryGenerated: (result: SummarizeResult, meetingTitle: string, transcript: string) => void;
}

export const AudioCapturePanel: React.FC<AudioCapturePanelProps> = ({ onSummaryGenerated }) => {
  const [meetingTitle, setMeetingTitle] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [progressText, setProgressText] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [streamingTokens, setStreamingTokens] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTier, setActiveTier] = useState<'cloud' | 'local-webgpu' | 'heuristic' | null>(null);

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
  } = useAudioRecorder();

  // Keep browser tab title updated so background recording is clearly visible
  useEffect(() => {
    if (isRecording) {
      document.title = '🔴 Recording... · MeetWithAI';
    } else {
      document.title = 'MeetWithAI';
    }
  }, [isRecording]);

  const handleStartCapture = async (mode: 'mic' | 'system') => {
    try {
      setErrorMessage(null);
      // 1. Establish audio capture first to ensure microphone/tab hardware is active
      await startRecording(mode);

      // 2. Start speech recognition once audio device is ready
      if (isSpeechSupported) {
        startListening();
      }
    } catch (err: any) {
      stopListening();
      if (err.name === 'NotAllowedError' || err.message?.toLowerCase().includes('permission denied')) {
        setErrorMessage('Microphone access was blocked. Please click the permissions icon in your browser address bar to allow Microphone, or type/paste notes below.');
      } else {
        setErrorMessage(`Failed to start recording: ${err.message || 'Permission denied'}`);
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

      // Automatically persist to Supabase database
      try {
        await saveMeetingWithItems({
          title: displayTitle,
          duration_seconds: recordingDuration,
          source: 'live',
          transcript: textToSummarize,
          summary: result.summary,
          audio_url: result.audioUrl
        }, result.summary.action_items);
      } catch (saveErr) {
        console.warn('Note: Summarization succeeded; Supabase sync error:', saveErr);
      }

      onSummaryGenerated(result, displayTitle, textToSummarize);
    } catch (err: any) {
      console.error('Summarization failure:', err);
      setErrorMessage(`Summarization failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>

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

          {/* Recording Timer & Audio Wave */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: 'var(--glass-surface-subtle)',
            padding: '10px 18px',
            borderRadius: '14px',
            border: '1px solid var(--glass-border)'
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {!isRecording ? (
              <>
                <button
                  id="btn-record-mic"
                  onClick={() => handleStartCapture('mic')}
                  className="btn-primary"
                  style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' }}
                >
                  <Mic size={16} />
                  Record In-Room Mic
                </button>
                <button
                  id="btn-record-screen"
                  onClick={() => handleStartCapture('system')}
                  className="btn-secondary"
                  title="Capture audio from browser tabs or system audio"
                >
                  <MonitorUp size={16} />
                  Record Screen / Tab Audio
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

            {(transcript || audioUrl) && !isRecording && (
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

          {/* Summarize Button */}
          <button
            id="btn-generate-summary"
            onClick={handleSummarize}
            disabled={isSummarizing}
            className="btn-primary"
            style={{
              background: isSummarizing
                ? 'rgba(99, 102, 241, 0.4)'
                : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              cursor: isSummarizing ? 'not-allowed' : 'pointer',
              opacity: !transcript.trim() && !isSummarizing ? 0.75 : 1
            }}
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
        </div>

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
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <Play size={16} color="var(--accent-primary)" />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Session Audio:</span>
            <audio src={audioUrl} controls style={{ height: '32px', flex: 1, minWidth: '220px', outline: 'none' }} />
          </div>
        )}

        {/* Notice if audio was recorded but no microphone text was transcribed */}
        {!isRecording && audioUrl && !transcript.trim() && (
          <div style={{
            marginTop: '14px',
            padding: '12px 16px',
            borderRadius: '12px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.22)',
            fontSize: '13px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span>Audio session recorded successfully! You can type or paste meeting notes below, then click <strong>Generate Summary</strong> to process.</span>
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
            {isListening && hasAudioInput && (
              <span className="badge" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1s infinite', display: 'inline-block' }} />
                Listening
              </span>
            )}
            {isListening && !hasAudioInput && (
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

        {/* Real-time Voice Stream Bar */}
        {isListening && (
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
          value={transcript}
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
          <span>Word count: {transcript ? transcript.split(/\s+/).filter(Boolean).length : 0} words</span>
        </div>
      </div>
    </div>
  );
};
