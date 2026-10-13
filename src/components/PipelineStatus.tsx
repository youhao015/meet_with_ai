import { RefreshCw, AlertCircle } from 'lucide-react';

interface PipelineStatusProps {
  isActive: boolean;
  progressText?: string;
  progressPercent: number;
  streamingTokens?: string;
  tier: 'cloud' | 'local-webgpu' | 'heuristic' | null;
  error: string | null;
}

export function PipelineStatus({
  isActive,
  progressPercent,
  streamingTokens,
  tier,
  error
}: PipelineStatusProps) {
  if (!isActive && !error && !streamingTokens) return null;

  // ── Error state ────────────────────────────────────────────────────
  if (!isActive && error) {
    return (
      <div style={{
        marginTop: '16px',
        padding: '12px 16px',
        borderRadius: '10px',
        background: 'rgba(244, 63, 94, 0.1)',
        border: '1px solid rgba(244, 63, 94, 0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        fontSize: '13px',
        color: '#fca5a5'
      }}>
        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>{error}</span>
      </div>
    );
  }

  // ── Active pipeline state ──────────────────────────────────────────
  const isCloud = tier === 'cloud';
  const isLocal = tier === 'local-webgpu';
  const tierColor = isCloud ? '#38bdf8' : isLocal ? '#818cf8' : '#94a3b8';

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Progress Row */}
      <div style={{
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
            {Math.round(Math.max(0, Math.min(100, progressPercent || 0)))}%
          </span>
        </div>

        {/* 0 to 100% Bar */}
        <div style={{
          height: '6px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '999px',
          overflow: 'hidden',
          width: '100%'
        }}>
          <div style={{
            height: '100%',
            width: `${Math.max(2, Math.min(100, progressPercent || 0))}%`,
            background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
            borderRadius: '999px',
            transition: 'width 0.3s ease'
          }} />
        </div>
      </div>

      {/* Streaming token preview */}
      {streamingTokens && streamingTokens.trim().length > 0 && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '12px',
          background: 'var(--glass-surface-subtle)',
          border: '1px solid var(--glass-border)',
          fontSize: '13px',
          lineHeight: '1.65',
          color: 'var(--text-secondary)',
          maxHeight: '120px',
          overflowY: 'auto',
          fontFamily: 'var(--font-body)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
            AI Output Preview
          </div>
          <span style={{ color: 'var(--text-primary)' }}>{streamingTokens}</span>
          <span style={{ display: 'inline-block', width: '2px', height: '13px', background: tierColor, marginLeft: '2px', animation: 'blink 0.9s step-end infinite', verticalAlign: 'text-bottom' }} />
        </div>
      )}
    </div>
  );
}
