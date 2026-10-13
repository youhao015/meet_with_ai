import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ListTodo,
  FileText,
  Copy,
  Check,
  ArrowLeft,
  Calendar,
  User
} from 'lucide-react';
import type { SummarizeResult } from '../services/summarizer';
import { fetchActionItems, updateMeetingActionItems } from '../services/supabase';

interface ActionItemWithStatus {
  task: string;
  assignee: string;
  due_date?: string;
  status?: 'pending' | 'completed';
}

interface MeetingSummaryViewProps {
  meetingId?: string;
  result: SummarizeResult;
  title: string;
  transcript: string;
  onBack: () => void;
  backLabel?: string;
  onMeetingUpdated?: (updatedSummary: SummarizeResult['summary']) => void;
}

export const MeetingSummaryView: React.FC<MeetingSummaryViewProps> = ({
  meetingId,
  result,
  title,
  transcript,
  onBack,
  backLabel = 'Back to Studio',
  onMeetingUpdated
}) => {
  const [copied, setCopied] = useState(false);
  const [actionItems, setActionItems] = useState<ActionItemWithStatus[]>(() => {
    const initial = result.summary.action_items || [];
    if (meetingId) {
      try {
        const cached = localStorage.getItem(`meetwithai_action_items_${meetingId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      } catch {}
    }
    return initial;
  });

  // Sync action items with Supabase action_items table if meetingId is provided
  useEffect(() => {
    if (!meetingId) return;

    fetchActionItems(meetingId).then((dbItems) => {
      if (dbItems && dbItems.length > 0) {
        setActionItems((prev) => {
          const merged = prev.map((item) => {
            const match = dbItems.find(
              (d) => d.task?.trim().toLowerCase() === item.task?.trim().toLowerCase()
            );
            if (match) {
              return {
                ...item,
                status: (match.status === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed'
              };
            }
            return item;
          });
          try {
            localStorage.setItem(`meetwithai_action_items_${meetingId}`, JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
    }).catch((err) => {
      console.warn('Could not sync action items from Supabase:', err);
    });
  }, [meetingId]);

  const toggleTaskStatus = async (index: number) => {
    const updated = actionItems.map((item, i) =>
      i === index
        ? {
            ...item,
            status: (item.status === 'completed' ? 'pending' : 'completed') as 'pending' | 'completed'
          }
        : item
    );

    // 1. Optimistic UI update
    setActionItems(updated);

    // 2. Persist to localStorage immediately
    if (meetingId) {
      try {
        localStorage.setItem(`meetwithai_action_items_${meetingId}`, JSON.stringify(updated));
      } catch {}
    }

    // 3. Notify parent component
    const updatedSummary = {
      ...result.summary,
      action_items: updated
    };
    onMeetingUpdated?.(updatedSummary);

    // 4. Persist to Supabase database (both meetings and action_items tables)
    if (meetingId) {
      try {
        await updateMeetingActionItems(meetingId, updated);
      } catch (err) {
        console.warn('Failed to update action items in Supabase:', err);
      }
    }
  };

  const copyToClipboard = () => {
    const markdown = `# Meeting Summary: ${title}
Generated via MeetWithAI

## Executive Overview
${result.summary.overview}

## Key Discussion Points
${(result.summary.key_points || []).map((p) => `- ${p}`).join('\n')}

## Decisions Made
${(result.summary.decisions || []).map((d) => `- ${d}`).join('\n')}

## Action Items
${actionItems.map((a) => `- [ ] **${a.task}** (Assignee: ${a.assignee || 'Unassigned'}, Due: ${a.due_date || 'N/A'})`).join('\n')}
${transcript ? `\n## Transcript\n${transcript}\n` : ''}`;
    navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-container">
      {/* Top Bar Navigation */}
      <div className="summary-topbar" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
        <button onClick={onBack} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '13px' }}>
          <ArrowLeft size={16} />
          {backLabel}
        </button>

        <button onClick={copyToClipboard} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px' }}>
          {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
          {copied ? 'Copied Summary' : 'Copy Summary'}
        </button>
      </div>

      {/* Main Title Banner Card */}
      <div className="glass-panel" style={{ padding: '28px', marginBottom: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '180px',
          height: '180px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
            {new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '28px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: '12px'
        }}>
          {title}
        </h1>

        <div style={{
          background: 'var(--glass-surface-subtle)',
          padding: '18px 22px',
          borderRadius: '16px',
          border: '1px solid var(--glass-border)',
          fontSize: '15px',
          lineHeight: '1.7',
          color: 'var(--text-primary)'
        }}>
          <strong style={{ color: 'var(--accent-primary)', display: 'block', marginBottom: '6px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Executive Overview
          </strong>
          {result.summary.overview || 'Meeting completed with action items recorded.'}
        </div>
      </div>

      {/* Two Column Grid: Key Points & Decisions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Key Points */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Key Discussion Points
            </h3>
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(result.summary.key_points || []).map((point, idx) => (
              <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', marginTop: '8px', flexShrink: 0 }} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Decisions */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <CheckCircle2 size={18} color="var(--accent-emerald)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Decisions Concluded
            </h3>
          </div>
          {(!result.summary.decisions || result.summary.decisions.length === 0) ? (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              No explicit decisions concluded in this session.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {result.summary.decisions.map((dec, idx) => (
                <li key={idx} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  fontSize: '14px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                  background: 'rgba(16, 185, 129, 0.08)',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(16, 185, 129, 0.2)'
                }}>
                  <CheckCircle2 size={16} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: '3px' }} />
                  <span>{dec}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Action Items Section */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
          <ListTodo size={18} color="var(--accent-purple)" />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
            Assigned Action Items & Deliverables ({actionItems.length})
          </h3>
        </div>

        {actionItems.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>No explicit action items detected in this meeting.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {actionItems.map((item, idx) => {
              const isDone = item.status === 'completed';
              return (
                <div
                  key={idx}
                  onClick={() => toggleTaskStatus(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    padding: '14px 18px',
                    background: isDone ? 'rgba(16, 185, 129, 0.08)' : 'var(--input-bg)',
                    border: isDone ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--glass-border)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '240px' }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '6px',
                      border: isDone ? 'none' : '1px solid var(--text-muted)',
                      background: isDone ? 'var(--accent-emerald)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isDone && <Check size={14} color="#ffffff" />}
                    </div>
                    <span style={{
                      fontSize: '14px',
                      color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: isDone ? 'line-through' : 'none'
                    }}>
                      {item.task}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {item.assignee && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12px',
                        background: 'rgba(99, 102, 241, 0.12)',
                        color: 'var(--accent-primary)',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontWeight: 500
                      }}>
                        <User size={12} />
                        {item.assignee}
                      </span>
                    )}

                    {item.due_date && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        fontSize: '12px',
                        background: 'rgba(100, 116, 139, 0.12)',
                        color: 'var(--text-secondary)',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontWeight: 500
                      }}>
                        <Calendar size={12} />
                        {item.due_date}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
