import { Cpu, Cloud, RefreshCw, AlertCircle } from 'lucide-react';

interface PipelineStatusProps {
  isActive: boolean;
  progressText: string;
  progressPercent: number;
  streamingTokens?: string;
  tier: 'cloud' | 'local-webgpu' | 'heuristic' | null;
  error: string | null;
}

export function PipelineStatus({
  isActive,
  progressText,
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
  const tierBg = isCloud ? 'rgba(56, 189, 248, 0.12)' : isLocal ? 'rgba(99, 102, 241, 0.12)' : 'rgba(148, 163, 184, 0.08)';
  const tierBorder = isCloud ? 'rgba(56, 189, 248, 0.3)' : isLocal ? 'rgba(99, 102, 241, 0.3)' : 'rgba(148, 163, 184, 0.2)';

  return (
    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Status Row */}
      <div style={{
        padding: '12px 16px',
        borderRadius: '10px',
        background: tierBg,
        border: `1px solid ${tierBorder}`,
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
      }}>
        {/* Tier Icon */}
        {tier ? (
          isCloud ? (
            <Cloud size={16} color={tierColor} style={{ flexShrink: 0, animation: 'pulse-soft 2s ease-in-out infinite' }} />
          ) : (
            <Cpu size={16} color={tierColor} style={{ flexShrink: 0, animation: 'pulse-soft 2s ease-in-out infinite' }} />
          )
        ) : (
          <RefreshCw size={16} color={tierColor} style={{ flexShrink: 0, animation: 'spin 1.2s linear infinite' }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: progressPercent > 0 ? '8px' : 0 }}>
            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
              {progressText || (isCloud ? 'Calling cloud AI (OpenRouter)…' : isLocal ? 'Running local WebGPU AI…' : 'Initializing AI pipeline…')}
            </span>
            {tier && (
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
                color: tierColor,
                flexShrink: 0,
                marginLeft: '10px'
              }}>
                {isCloud ? 'Cloud AI' : isLocal ? 'Local WebGPU' : 'Heuristic'}
              </span>
            )}
          </div>

          {/* Progress bar */}
          {progressPercent > 0 && (
            <div style={{
              height: '4px',
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, progressPercent)}%`,
                background: `linear-gradient(90deg, ${tierColor}, ${isLocal ? '#c084fc' : '#a5f3fc'})`,
                borderRadius: '2px',
                transition: 'width 0.4s ease'
              }} />
            </div>
          )}
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
