import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Sparkles, LogOut, ChevronDown, User, Radio } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

interface IOSHeaderProps {
  title: string;
  isRecording?: boolean;
  recordingSeconds?: number;
  onNewMeeting?: () => void;
}

export const IOSHeader: React.FC<IOSHeaderProps> = ({
  title,
  isRecording = false,
  onNewMeeting
}) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayName = user?.user_metadata?.full_name
    || user?.user_metadata?.name
    || user?.email?.split('@')[0]
    || 'Guest';

  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const todayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(new Date());

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 900,
      background: 'var(--glass-surface)',
      backdropFilter: 'blur(30px) saturate(190%)',
      WebkitBackdropFilter: 'blur(30px) saturate(190%)',
      borderBottom: '1px solid var(--glass-border)',
      padding: '10px 20px',
      transition: 'background 0.3s ease, border-color 0.3s ease'
    }}>
      <div style={{
        maxWidth: '1080px',
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
      }}>
        {/* Left: Brand Identity */}
        <div
          onClick={onNewMeeting}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: onNewMeeting ? 'pointer' : 'default',
            userSelect: 'none'
          }}
          title={onNewMeeting ? 'Go to Home / New Meeting' : undefined}
        >
          <div
            className="shimmering-robot-container"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.22) 100%)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              boxShadow: '0 4px 18px var(--accent-primary-glow)',
              flexShrink: 0
            }}
          >
            <img
              src="/robot-icon.png"
              alt="MeetWithAI Shimmering Robot"
              className="shimmering-robot-img"
              style={{
                width: '31px',
                height: '31px',
                objectFit: 'contain'
              }}
            />
            <div className="robot-shimmer-sweep" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '17px',
                fontWeight: 700,
                letterSpacing: '-0.3px',
                color: 'var(--text-primary)'
              }}>
                MeetWith<span className="gradient-text">AI</span>
              </span>
            </div>
            <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 500 }}>
              {todayStr} · {title}
            </span>
          </div>
        </div>

        {/* Center: iOS Dynamic Island */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {isRecording ? (
            <div className="dynamic-island" style={{ borderColor: 'rgba(244, 63, 94, 0.4)' }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#f43f5e',
                animation: 'pulse 1s infinite'
              }} />
              <span style={{ color: '#f43f5e', fontWeight: 700, letterSpacing: '0.4px' }}>
                REC
              </span>
              <Radio size={14} color="#f43f5e" />
            </div>
          ) : null}
        </div>

        {/* Right: Theme Toggle & Profile Menu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* iOS Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="btn-secondary"
            style={{
              width: '36px',
              height: '36px',
              padding: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle Theme"
          >
            {theme === 'dark' ? (
              <Sun size={16} color="#fbbf24" style={{ transition: 'transform 0.3s ease' }} />
            ) : (
              <Moon size={16} color="var(--accent-primary)" style={{ transition: 'transform 0.3s ease' }} />
            )}
          </button>

          {/* User Profile Menu */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '4px 8px',
                borderRadius: '20px',
                cursor: 'pointer'
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#fff'
                }}>
                  {initials || <User size={12} />}
                </div>
              )}
              <span style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                maxWidth: '80px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {displayName}
              </span>
              <ChevronDown
                size={13}
                color="var(--text-muted)"
                style={{
                  transform: menuOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.2s ease'
                }}
              />
            </button>

            {menuOpen && (
              <div
                className="glass-panel"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  minWidth: '220px',
                  padding: '6px',
                  boxShadow: 'var(--glass-shadow-float)',
                  zIndex: 1000
                }}
              >
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--glass-border)' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{displayName}</p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-rose)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
