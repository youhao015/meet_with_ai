import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Clock,
  Check,
  Trash2,
  Plus,
  ListTodo,
  CheckSquare,
  AlertCircle
} from 'lucide-react';
import {
  fetchMeetings,
  fetchAllActionItems,
  createActionItem,
  deleteActionItem,
  updateActionItemStatus,
  type MeetingRecord,
  type ActionItemRecord
} from '../services/supabase';

interface UIActionItem {
  id: string;
  task: string;
  assignee?: string;
  completed: boolean;
  meetingTitle?: string;
  createdAt?: string;
}

export const AnalyticsWidgets: React.FC = () => {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [tasks, setTasks] = useState<UIActionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form input state
  const [newTaskText, setNewTaskText] = useState('');
  const [newAssignee, setNewAssignee] = useState('');

  useEffect(() => {
    let ignore = false;
    Promise.all([fetchMeetings(), fetchAllActionItems()])
      .then(([meetingsData, dbActionItems]) => {
        if (ignore) return;

        setMeetings(meetingsData || []);

        // Only load real action items from action_items table
        const formattedItems: UIActionItem[] = (dbActionItems || []).map((item: ActionItemRecord) => ({
          id: item.id,
          task: item.task,
          assignee: item.assignee && item.assignee !== 'Unassigned' ? item.assignee : undefined,
          completed: item.status === 'completed',
          createdAt: item.created_at
        }));

        setTasks(formattedItems);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('Failed to load real analytics:', err);
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Toggle action item completion in real database
  const toggleTask = async (task: UIActionItem) => {
    const nextCompleted = !task.completed;
    const nextStatus = nextCompleted ? 'completed' : 'pending';

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: nextCompleted } : t))
    );

    // If item is saved in action_items table, persist to Supabase
    if (!task.id.startsWith('meeting-')) {
      await updateActionItemStatus(task.id, nextStatus);
    }
  };

  // Add real action item into Supabase
  const handleAddTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTaskText.trim() || isSubmitting) return;

    const taskText = newTaskText.trim();
    const assigneeVal = newAssignee.trim() || undefined;

    setIsSubmitting(true);
    try {
      const saved = await createActionItem(taskText, assigneeVal);

      const newItem: UIActionItem = {
        id: saved?.id || `local-${Date.now()}`,
        task: taskText,
        assignee: assigneeVal,
        completed: false,
        createdAt: new Date().toISOString()
      };

      setTasks((prev) => [newItem, ...prev]);
      setNewTaskText('');
      setNewAssignee('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete real action item from Supabase
  const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    // Optimistic delete
    setTasks((prev) => prev.filter((t) => t.id !== id));

    // Delete in Supabase if persisted
    if (!id.startsWith('meeting-')) {
      await deleteActionItem(id);
    }
  };

  // ── Calculate Real Analytics from PostgreSQL ─────────────────────────────
  // Helper to reliably compute meeting duration in minutes (with fallback for notes sessions without audio)
  const getMeetingMinutes = (m: MeetingRecord): number => {
    if (m.duration_seconds && m.duration_seconds > 0) {
      return Math.max(1, Math.round(m.duration_seconds / 60));
    }
    const wordCount = (m.transcript || '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 0) {
      return Math.max(1, Math.round(wordCount / 130));
    }
    return 1;
  };

  const isSameCalendarDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const totalMinutes = meetings.reduce((acc, m) => acc + getMeetingMinutes(m), 0);
  const avgMinutes = meetings.length > 0 ? Math.round(totalMinutes / meetings.length) : 0;

  const completedCount = tasks.filter((t) => t.completed).length;
  const pendingCount = tasks.length - completedCount;
  const completionPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Real 7-Day breakdown grouped by actual calendar dates
  const past7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weeklyActivity = past7Days.map((d) => {
    const dayMeetings = meetings.filter((m) => {
      const meetDate = new Date(m.date || m.created_at);
      return isSameCalendarDay(meetDate, d);
    });

    const dayMinutes = dayMeetings.reduce((acc, m) => acc + getMeetingMinutes(m), 0);

    return {
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      minutes: dayMinutes,
      count: dayMeetings.length
    };
  });

  const maxRecordedMinutes = Math.max(...weeklyActivity.map((d) => d.minutes), 5);

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="ios-large-title" style={{ marginBottom: '6px' }}>
          Insights &amp; Analytics
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)' }}>
          Overview of your meeting activity and deliverable tracking
        </p>
      </div>

      {/* Real Metric Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {/* Metric 1: Real Sessions */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Vault Sessions
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Clock size={16} color="var(--accent-primary)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : meetings.length}
          </div>
          <span style={{ fontSize: '11.5px', color: meetings.length > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)', fontWeight: 600 }}>
            {meetings.length === 1 ? '1 recorded meeting' : `${meetings.length} recorded meetings`}
          </span>
        </div>

        {/* Metric 2: Real Duration */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Recorded Time
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(6, 182, 212, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <TrendingUp size={16} color="var(--accent-cyan)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : totalMinutes} <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-muted)' }}>min</span>
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            Average: {avgMinutes}m / session
          </span>
        </div>

        {/* Metric 3: Real Action Items */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Action Items
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(139, 92, 246, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ListTodo size={16} color="var(--accent-purple)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : tasks.length} <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-muted)' }}>total</span>
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--accent-purple)', fontWeight: 600 }}>
            {pendingCount} pending completion
          </span>
        </div>

        {/* Metric 4: Real Completion Rate */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Completion Rate
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckSquare size={16} color="var(--accent-emerald)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : `${completionPercent}%`}
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--accent-emerald)', fontWeight: 600 }}>
            {completedCount} of {tasks.length} resolved
          </span>
        </div>
      </div>

      {/* Middle Row: Real Weekly Activity Chart + Real Action Items Widget */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '20px',
        marginBottom: '24px'
      }}>
        {/* Real Weekly Activity Chart from Database */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Weekly Meeting Volume
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Minutes recorded per day across your calendar
              </p>
            </div>
            <span className="badge badge-source" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
              7-Day Activity
            </span>
          </div>

          {/* Interactive Shimmering Bar Chart */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            height: '200px',
            paddingTop: '20px',
            paddingBottom: '6px',
            borderBottom: '1px solid var(--glass-border)'
          }}>
            {weeklyActivity.map((item, idx) => {
              const heightPercent = item.minutes > 0
                ? Math.max((item.minutes / maxRecordedMinutes) * 100, 16)
                : 4;
              const isHovered = hoveredDay === idx;

              return (
                <div
                  key={item.day + idx}
                  onMouseEnter={() => setHoveredDay(idx)}
                  onMouseLeave={() => setHoveredDay(null)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    flex: 1,
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  {/* Tooltip on Hover with Real Counts */}
                  {isHovered && (
                    <div style={{
                      position: 'absolute',
                      top: '-46px',
                      background: 'var(--island-bg)',
                      border: '1px solid var(--glass-border)',
                      padding: '5px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      boxShadow: 'var(--glass-shadow-float)',
                      whiteSpace: 'nowrap',
                      zIndex: 30,
                      pointerEvents: 'none'
                    }}>
                      {item.dateStr}: {item.minutes}m ({item.count} session{item.count !== 1 ? 's' : ''})
                    </div>
                  )}

                  {/* Value badge pill on top of bar track */}
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '6px',
                    background: item.minutes > 0 ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                    color: item.minutes > 0 ? 'var(--accent-primary)' : 'var(--text-muted)',
                    transition: 'all 0.2s ease'
                  }}>
                    {item.minutes > 0 ? `${item.minutes}m` : '0m'}
                  </span>

                  {/* Equalizer track column */}
                  <div style={{
                    width: '32px',
                    height: '130px',
                    borderRadius: '10px',
                    background: 'var(--glass-surface-subtle)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    padding: '3px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: isHovered ? '0 0 0 1px var(--accent-primary)' : 'none',
                    transition: 'all 0.2s ease'
                  }}>
                    {/* The Shimmering Volume Bar */}
                    <div
                      className={item.minutes > 0 ? 'shimmer-bar-active' : ''}
                      style={{
                        width: '100%',
                        height: `${heightPercent}%`,
                        borderRadius: '6px',
                        background: item.minutes > 0
                          ? (isHovered
                              ? 'linear-gradient(180deg, #06b6d4 0%, #6366f1 60%, #a855f7 100%)'
                              : 'linear-gradient(180deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)')
                          : 'var(--glass-border)',
                        borderTop: item.minutes > 0 ? '1px solid rgba(255, 255, 255, 0.7)' : 'none',
                        transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease'
                      }}
                    />
                  </div>

                  {/* Day label */}
                  <span style={{
                    fontSize: '11.5px',
                    fontWeight: isHovered ? 700 : 500,
                    color: isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                    transition: 'color 0.2s ease'
                  }}>
                    {item.day}
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '12px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            <span>Total 7-day volume: {weeklyActivity.reduce((acc, d) => acc + d.minutes, 0)} min ({weeklyActivity.reduce((acc, d) => acc + d.count, 0)} session{weeklyActivity.reduce((acc, d) => acc + d.count, 0) !== 1 ? 's' : ''})</span>
          </div>
        </div>

        {/* Real Action Items Widget with Database Sync */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Action Items &amp; Deliverables
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Track, add, and manage your follow-up tasks
              </p>
            </div>

            {/* Radial Completion Meter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ position: 'relative', width: '42px', height: '42px' }}>
                <svg width="42" height="42" viewBox="0 0 42 42">
                  <circle
                    cx="21"
                    cy="21"
                    r="17"
                    fill="none"
                    stroke="var(--glass-border)"
                    strokeWidth="3.5"
                  />
                  <circle
                    cx="21"
                    cy="21"
                    r="17"
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="3.5"
                    strokeDasharray={106.8}
                    strokeDashoffset={106.8 - (106.8 * completionPercent) / 100}
                    strokeLinecap="round"
                    transform="rotate(-90 21 21)"
                    style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                  />
                </svg>
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: 'var(--text-primary)'
                }}>
                  {completionPercent}%
                </div>
              </div>
            </div>
          </div>

          {/* Add New Action Item Form (Inserts into Supabase) */}
          <form
            onSubmit={handleAddTask}
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '16px',
              flexWrap: 'wrap'
            }}
          >
            <input
              type="text"
              value={newTaskText}
              onChange={(e) => setNewTaskText(e.target.value)}
              placeholder="Add new action item..."
              disabled={isSubmitting}
              style={{
                flex: '1 1 200px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '10px',
                padding: '8px 12px',
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            />
            <input
              type="text"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
              placeholder="Assignee (opt)"
              disabled={isSubmitting}
              style={{
                width: '105px',
                background: 'var(--input-bg)',
                border: '1px solid var(--input-border)',
                borderRadius: '10px',
                padding: '8px 10px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            />
            <button
              type="submit"
              disabled={!newTaskText.trim() || isSubmitting}
              className="btn-primary"
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                borderRadius: '10px',
                opacity: newTaskText.trim() && !isSubmitting ? 1 : 0.5,
                cursor: newTaskText.trim() && !isSubmitting ? 'pointer' : 'not-allowed'
              }}
            >
              <Plus size={14} />
              {isSubmitting ? 'Saving…' : 'Add'}
            </button>
          </form>

          {/* Action Items List with Toggle and Delete */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '260px',
            overflowY: 'auto',
            paddingRight: '4px'
          }}>
            {isLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Querying database…
              </div>
            ) : tasks.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '30px 10px',
                color: 'var(--text-muted)',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={20} color="var(--text-muted)" style={{ opacity: 0.6 }} />
                <span>No action items found in your database. Add your first deliverable above.</span>
              </div>
            ) : (
              tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => toggleTask(task)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '9px 12px',
                    borderRadius: '12px',
                    background: task.completed ? 'rgba(16, 185, 129, 0.08)' : 'var(--glass-surface-subtle)',
                    border: `1px solid ${task.completed ? 'rgba(16, 185, 129, 0.25)' : 'var(--glass-border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* Completion Checkmark */}
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '6px',
                    background: task.completed ? 'var(--accent-emerald)' : 'transparent',
                    border: `1.5px solid ${task.completed ? 'var(--accent-emerald)' : 'var(--text-muted)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 0.18s ease'
                  }}>
                    {task.completed && <Check size={12} color="#ffffff" strokeWidth={3} />}
                  </div>

                  {/* Task Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '12.5px',
                      fontWeight: 500,
                      color: task.completed ? 'var(--text-muted)' : 'var(--text-primary)',
                      textDecoration: task.completed ? 'line-through' : 'none',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {task.task}
                    </p>
                  </div>

                  {/* Optional Assignee */}
                  {task.assignee && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 7px',
                      borderRadius: '8px',
                      background: 'var(--glass-border)',
                      color: 'var(--text-secondary)',
                      flexShrink: 0
                    }}>
                      {task.assignee}
                    </span>
                  )}

                  {/* Delete Task Button */}
                  <button
                    onClick={(e) => handleDeleteTask(e, task.id)}
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: 'transparent',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'color 0.15s ease'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-rose)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    title="Delete action item from database"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
