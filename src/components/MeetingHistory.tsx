import React, { useState, useEffect } from 'react';
import {
  Search,
  ArrowRight,
  Database,
  RefreshCw,
  Trash2,
  Play,
  Pause
} from 'lucide-react';
import { fetchMeetings, deleteMeeting, type MeetingRecord } from '../services/supabase';

interface MeetingHistoryProps {
  onSelectMeeting: (meeting: MeetingRecord) => void;
}

export const MeetingHistory: React.FC<MeetingHistoryProps> = ({ onSelectMeeting }) => {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const refreshMeetings = async () => {
    setIsLoading(true);
    try {
      const data = await fetchMeetings();
      setMeetings(data);
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
          setMeetings(data);
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
    if (!confirm(`Delete "${meeting.title}"? This cannot be undone.`)) return;

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
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="page-container">
      {/* Search & Header */}
      <div className="glass-panel" style={{ padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
              Meeting Vault
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
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
                placeholder="Search meetings & summaries..."
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
          <p>Querying Supabase database…</p>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Database size={36} color="#6366f1" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.8 }} />
          <h3 style={{ fontSize: '17px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            {searchQuery ? 'No Matching Meetings' : 'No Saved Meetings Yet'}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
            {searchQuery
              ? `No meetings match "${searchQuery}". Try a different search term.`
              : 'Start a recording in the Studio to save your first meeting here.'}
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
                      {new Date(item.date || item.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                  </div>

                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '5px' }}>
                    {item.title}
                  </h4>
                  <p style={{
                    fontSize: '13px', color: 'var(--text-secondary)',
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                  }}>
                    {item.summary?.overview || item.transcript?.slice(0, 200) || 'No summary available.'}
                  </p>
                </div>

                {/* Right side stats + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <div>{formatSeconds(item.duration_seconds || 0)}</div>
                    <div style={{ color: 'var(--accent-primary)' }}>
                      {item.summary?.action_items?.length || 0} tasks
                    </div>
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
