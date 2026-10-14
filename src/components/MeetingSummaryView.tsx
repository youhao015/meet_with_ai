import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ListTodo,
  FileText,
  Copy,
  Check,
  ArrowLeft,
  Calendar,
  User,
  Pencil,
  X
} from 'lucide-react';
import type { SummarizeResult } from '../services/summarizer';
import { fetchActionItems, updateMeetingActionItems, updateMeetingTitle } from '../services/supabase';
import { useLanguage } from '../context/LanguageContext';

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
  onTitleUpdated?: (newTitle: string) => void;
}

export const MeetingSummaryView: React.FC<MeetingSummaryViewProps> = ({
  meetingId,
  result,
  title,
  transcript,
  onBack,
  backLabel,
  onMeetingUpdated,
  onTitleUpdated
}) => {
  const { t, language } = useLanguage();
  const effectiveBackLabel = backLabel || t.summary.backToStudio;
  const [copied, setCopied] = useState(false);

  // Title editing state
  const [currentTitle, setCurrentTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  useEffect(() => {
    setCurrentTitle(title);
    setEditedTitle(title);
  }, [title]);

  const handleSaveTitle = async () => {
    const trimmed = editedTitle.trim();
    if (!trimmed) return;
    if (trimmed === currentTitle) {
      setIsEditingTitle(false);
      return;
    }

    setIsSavingTitle(true);
    try {
      if (meetingId) {
        await updateMeetingTitle(meetingId, trimmed);
      }
      setCurrentTitle(trimmed);
      onTitleUpdated?.(trimmed);
      setIsEditingTitle(false);
    } catch (err) {
      console.error('[MeetingSummaryView] Error saving title:', err);
    } finally {
      setIsSavingTitle(false);
    }
  };
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

  // Re-sync action items when meetingId or result changes
  useEffect(() => {
    let items = result.summary.action_items || [];
    if (meetingId) {
      try {
        const cached = localStorage.getItem(`meetwithai_action_items_${meetingId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            items = parsed;
          }
        }
      } catch {}
    }
    setActionItems(items);
  }, [meetingId, result]);

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
              const statusVal: 'pending' | 'completed' = (match.status === 'completed' || item.status === 'completed') ? 'completed' : 'pending';
              return {
                ...item,
                status: statusVal
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
        await updateMeetingActionItems(meetingId, updated, result.summary);
      } catch (err) {
        console.warn('Failed to update action items in Supabase:', err);
      }
    }
  };

  const copyToClipboard = () => {
    const markdown = `# Meeting Summary: ${currentTitle}
Generated via MeetWithAI

## Executive Overview
${result.summary.overview}

## Key Discussion Points
${(result.summary.key_points || []).map((p) => `- ${p}`).join('\n')}

## Decisions Made
${(result.summary.decisions || []).map((d) => `- ${d}`).join('\n')}

## Action Items
${actionItems.map((a) => `- [${a.status === 'completed' ? 'x' : ' '}] **${a.task}** (Assignee: ${a.assignee || 'Unassigned'}, Due: ${a.due_date || 'N/A'})`).join('\n')}
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
          {effectiveBackLabel}
        </button>

        <button onClick={copyToClipboard} className="btn-primary" style={{ padding: '8px 14px', fontSize: '13px' }}>
          {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
          {copied ? t.summary.copied : t.summary.copyMarkdown}
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
            {new Date().toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' })}
          </span>
        </div>

        {/* Editable Title Header */}
        {isEditingTitle ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveTitle();
                if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                  setEditedTitle(currentTitle);
                }
              }}
              autoFocus
              disabled={isSavingTitle}
              placeholder={t.summary.titlePlaceholder}
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                background: 'var(--input-bg)',
                border: '1.5px solid var(--accent-primary)',
                borderRadius: '12px',
                padding: '6px 14px',
                outline: 'none',
                flex: '1 1 300px',
                minWidth: '220px',
                boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.2)'
              }}
            />
            <button
              type="button"
              onClick={handleSaveTitle}
              disabled={isSavingTitle || !editedTitle.trim()}
              className="btn-primary"
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: isSavingTitle ? 'not-allowed' : 'pointer'
              }}
              title={t.summary.saveTitle}
            >
              <Check size={16} />
              <span>{isSavingTitle ? '…' : t.summary.saveTitle}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsEditingTitle(false);
                setEditedTitle(currentTitle);
              }}
              disabled={isSavingTitle}
              className="btn-secondary"
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                borderRadius: '10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
              title={t.summary.cancelEdit}
            >
              <X size={16} />
              <span>{t.summary.cancelEdit}</span>
            </button>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '14px',
            flexWrap: 'wrap'
          }}>
            <h1
              onClick={() => {
                setEditedTitle(currentTitle);
                setIsEditingTitle(true);
              }}
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '28px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.25,
                cursor: 'pointer'
              }}
              title={t.summary.editTitle}
            >
              {currentTitle || (language === 'zh' ? '未命名会议' : 'Untitled Meeting')}
            </h1>
            <button
              type="button"
              onClick={() => {
                setEditedTitle(currentTitle);
                setIsEditingTitle(true);
              }}
              style={{
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: '8px',
                padding: '5px 10px',
                cursor: 'pointer',
                color: 'var(--accent-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 600,
                transition: 'all 0.18s ease'
              }}
              title={t.summary.editTitle}
              aria-label={t.summary.editTitle}
            >
              <Pencil size={13} />
              <span>{t.summary.editTitle}</span>
            </button>
          </div>
        )}

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
            {t.summary.overview}
          </strong>
          {result.summary.overview || (language === 'zh' ? '会议已完成，行动项已归档。' : 'Meeting completed with action items recorded.')}
        </div>
      </div>

      {/* Two Column Grid: Key Points & Decisions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        {/* Key Points */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <FileText size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {t.summary.keyPoints}
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
              {t.summary.decisions}
            </h3>
          </div>
          {(!result.summary.decisions || result.summary.decisions.length === 0) ? (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              {t.summary.noDecisions}
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
            {t.summary.actionItems} ({actionItems.length})
          </h3>
        </div>

        {actionItems.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>{t.summary.noActionItems}</p>
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
