import React, { useState, useEffect } from 'react';
import {
  Search,
  ArrowRight,
  Database,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Pencil,
  Check,
  X
} from 'lucide-react';
import { fetchMeetings, deleteMeeting, updateMeetingTitle, type MeetingRecord } from '../services/supabase';
import { useLanguage } from '../context/LanguageContext';

interface MeetingHistoryProps {
  onSelectMeeting: (meeting: MeetingRecord) => void;
}

export const MeetingHistory: React.FC<MeetingHistoryProps> = ({ onSelectMeeting }) => {
  const { t, language } = useLanguage();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  const mergeLocalStorage = (list: MeetingRecord[]): MeetingRecord[] => {
    return list.map((m) => {
      try {
        const cached = localStorage.getItem(`meetwithai_action_items_${m.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0 && m.summary) {
            const dbItems = m.summary.action_items || [];
            const mergedItems = dbItems.map((dbItem) => {
              const match = parsed.find(
                (p: { task?: string; status?: string }) => p.task?.trim().toLowerCase() === dbItem.task?.trim().toLowerCase()
              );
              if (match) {
                return {
                  ...dbItem,
                  status: (match.status === 'completed' || dbItem.status === 'completed') ? 'completed' : match.status || 'pending'
                };
              }
              return dbItem;
            });

            return {
              ...m,
              summary: {
                ...m.summary,
                action_items: mergedItems.length > 0 ? mergedItems : parsed
              }
            };
          }
        }
      } catch {}
      return m;
    });
  };

  const refreshMeetings = async () => {
    setIsLoading(true);
    try {
      const data = await fetchMeetings();
      setMeetings(mergeLocalStorage(data));
    } catch (e) {
      console.warn('Error loading history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchMeetings()
      .then((data) => {
        if (!ignore) {
          setMeetings(mergeLocalStorage(data));
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (!ignore) {
          console.warn('Error loading history:', e);
          setIsLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  const handleDelete = async (e: React.MouseEvent, meeting: MeetingRecord) => {
    e.stopPropagation(); // Don't open the meeting
    if (!confirm(language === 'zh' ? `确定要删除“${meeting.title}”吗？此操作无法撤销。` : `Delete "${meeting.title}"? This cannot be undone.`)) return;

    setDeletingId(meeting.id);
    try {
      const ok = await deleteMeeting(meeting.id, meeting.audio_url);
      if (ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveTitle = async (e: React.MouseEvent | React.KeyboardEvent, meetingId: string) => {
    e.stopPropagation();
    const trimmed = editingTitleValue.trim();
    if (!trimmed) {
      setEditingTitleId(null);
      return;
    }

    setIsSavingTitle(true);
    try {
      const ok = await updateMeetingTitle(meetingId, trimmed);
      if (ok) {
        setMeetings((prev) =>
          prev.map((m) => (m.id === meetingId ? { ...m, title: trimmed } : m))
        );
      }
    } catch (err) {
      console.warn('Could not save meeting title:', err);
    } finally {
      setIsSavingTitle(false);
      setEditingTitleId(null);
    }
  };

  const filteredMeetings = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.summary?.overview || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.transcript || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSeconds = (sec: number) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}${t.vault.durationMin} ${s}${t.vault.durationSec}` : `${s}${t.vault.durationSec}`;
  };

  return (
    <div className="page-container">
      {/* Search & Header */}
      <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
              {t.vault.title}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {meetings.length} {language === 'zh' ? '场会议记录' : `meeting${meetings.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          <div className="vault-controls">
            {/* Search box */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              padding: '8px 12px', borderRadius: '12px'
            }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                id="vault-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.vault.searchPlaceholder}
                aria-label="Search meetings and summaries"
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: '13px', width: '220px'
                }}
              />
            </div>

            {/* Refresh button */}
            <button
              id="btn-refresh-vault"
              onClick={refreshMeetings}
              className="btn-secondary"
              style={{ padding: '8px 12px' }}
              title="Refresh from Supabase"
              aria-label="Refresh meeting vault"
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Meeting Cards List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px', display: 'block' }} />
          <p>{language === 'zh' ? '正在查询 Supabase 数据库…' : 'Querying Supabase database…'}</p>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Database size={36} color="#6366f1" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.8 }} />
          <h3 style={{ fontSize: '17px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            {searchQuery ? (language === 'zh' ? '未找到匹配的会议' : 'No Matching Meetings') : (language === 'zh' ? '档案库暂无会议' : 'No Saved Meetings Yet')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
            {searchQuery
              ? (language === 'zh' ? `未找到与“${searchQuery}”相关的会议，请尝试其他关键词。` : `No meetings match "${searchQuery}". Try a different search term.`)
              : t.vault.noMeetingsYet}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredMeetings.map((item) => (
            <div
              key={item.id}
              className="glass-panel"
              style={{
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              {/* Top Row: metadata + action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div
                  style={{ flex: 1, minWidth: '260px', cursor: 'pointer' }}
                  onClick={() => onSelectMeeting(item)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(item.date || item.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' })}
                    </span>
                  </div>

                  {editingTitleId === item.id ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitleValue}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle(e, item.id);
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditingTitleId(null);
                          }
                        }}
                        autoFocus
                        disabled={isSavingTitle}
                        style={{
                          fontSize: '15px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          background: 'var(--input-bg)',
                          border: '1.5px solid var(--accent-primary)',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          outline: 'none',
                          flex: 1,
                          maxWidth: '320px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveTitle(e, item.id)}
                        disabled={isSavingTitle}
                        className="btn-primary"
                        style={{ padding: '6px 10px', borderRadius: '7px' }}
                        title={t.summary.saveTitle}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(null);
                        }}
                        disabled={isSavingTitle}
                        className="btn-secondary"
                        style={{ padding: '6px 10px', borderRadius: '7px' }}
                        title={t.summary.cancelEdit}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {item.title}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(item.id);
                          setEditingTitleValue(item.title);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '3px 6px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title={t.summary.editTitle}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p style={{
                    fontSize: '13px', color: 'var(--text-secondary)',
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                  }}>
                    {item.summary?.overview || item.transcript?.slice(0, 200) || (language === 'zh' ? '暂无纪要概览' : 'No summary available.')}
                  </p>
                </div>

                {/* Right side stats + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <div>{formatSeconds(item.duration_seconds || 0)}</div>
                    {(() => {
                      const uncheckedCount = (item.summary?.action_items || []).filter(
                        (t) => t.status !== 'completed'
                      ).length;
                      return (
                        <div style={{ color: uncheckedCount === 0 ? 'var(--text-muted)' : 'var(--accent-primary)' }}>
                          {uncheckedCount} {language === 'zh' ? '项待办' : (uncheckedCount === 1 ? 'task' : 'tasks')}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Open button */}
                  <button
                    onClick={() => onSelectMeeting(item)}
                    style={{
                      width: '34px', height: '34px', borderRadius: '10px',
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid var(--glass-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent-primary)', cursor: 'pointer', flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                    title="View full summary"
                  >
                    <ArrowRight size={16} />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, item)}
                    disabled={deletingId === item.id}
                    style={{
                      width: '34px', height: '34px', borderRadius: '10px',
                      background: 'rgba(244, 63, 94, 0.1)',
                      border: '1px solid rgba(244,63,94,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent-rose)', cursor: deletingId === item.id ? 'not-allowed' : 'pointer',
                      flexShrink: 0, transition: 'all 0.15s ease',
                      opacity: deletingId === item.id ? 0.5 : 1
                    }}
                    title="Delete this meeting"
                  >
                    {deletingId === item.id
                      ? <RefreshCw size={14} className="spin" />
                      : <Trash2 size={14} />
                    }
                  </button>
                </div>
              </div>

              {/* Audio Playback Row (only if recording was saved) */}
              {item.audio_url && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px',
                  background: 'var(--glass-surface-subtle)',
                  borderRadius: '12px',
                  border: '1px solid var(--glass-border)'
                }}>
                  {playingId === item.id ? (
                    <Pause size={14} color="#a5b4fc" />
                  ) : (
                    <Play size={14} color="#a5b4fc" />
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    Recording:
                  </span>
                  <audio
                    src={item.audio_url}
                    controls
                    onPlay={() => setPlayingId(item.id)}
                    onPause={() => setPlayingId(null)}
                    onEnded={() => setPlayingId(null)}
                    style={{ height: '28px', flex: 1, outline: 'none', minWidth: 0 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
