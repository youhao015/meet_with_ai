import { Cpu, Zap, Cloud, Sparkles, LogOut, ChevronDown, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { checkWebGPUSupport } from '../services/webllm';
import { useAuth } from '../context/AuthContext';

interface HeaderProps {
  onNewMeeting: () => void;
  activeTab: 'recorder' | 'history';
  setActiveTab: (tab: 'recorder' | 'history') => void;
}

export function Header({ onNewMeeting, activeTab, setActiveTab }: HeaderProps) {
  const hasGPU = checkWebGPUSupport();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
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

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 28px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(7, 10, 18, 0.9)',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          className="shimmering-robot-container"
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.22) 0%, rgba(168, 85, 247, 0.22) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.16)',
            boxShadow: '0 4px 18px rgba(99, 102, 241, 0.45)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '19px', fontWeight: 700, letterSpacing: '-0.4px', color: '#ffffff' }}>
              MeetWith<span className="gradient-text">AI</span>
            </span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1 }}>
            WebGPU · Live Recording · AI Summary
          </p>
        </div>
      </div>

      {/* Center Tabs */}
      <nav style={{
        display: 'flex', alignItems: 'center', gap: '4px',
        background: 'rgba(15, 23, 42, 0.7)',
        padding: '4px', borderRadius: '12px',
        border: '1px solid var(--border-subtle)'
      }}>
        {(['recorder', 'history'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '7px 18px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              border: activeTab === tab ? '1px solid rgba(99,102,241,0.5)' : '1px solid transparent',
              background: activeTab === tab ? 'rgba(99,102,241,0.2)' : 'transparent',
              color: activeTab === tab ? '#ffffff' : 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {tab === 'recorder' ? 'Live Studio' : 'Meeting Vault'}
          </button>
        ))}
      </nav>

      {/* Right Side: GPU badge + User menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {hasGPU ? (
          <div className="badge badge-webgpu" title="Local WebGPU inference active — zero-cost, 100% private">
            <Cpu size={13} />
            <span>WebGPU Ready</span>
          </div>
        ) : (
          <div className="badge badge-server" title="Cloud AI fallback via OpenRouter free tier">
            <Cloud size={13} />
            <span>Cloud Fallback</span>
          </div>
        )}

        <button
          onClick={onNewMeeting}
          className="btn-primary"
          style={{ padding: '8px 14px', fontSize: '13px' }}
        >
          <Zap size={14} />
          New
        </button>

        {/* User Avatar + Dropdown */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 10px',
              background: 'rgba(30,41,59,0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              cursor: 'pointer',
              color: '#ffffff',
              transition: 'background 0.2s'
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} style={{ width: '26px', height: '26px', borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: 700, color: '#fff'
              }}>
                {initials || <User size={13} />}
              </div>
            )}
            <span style={{ fontSize: '13px', fontWeight: 500, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </span>
            <ChevronDown size={14} color="var(--text-muted)" style={{ transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: '200px',
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              overflow: 'hidden',
              zIndex: 100
            }}>
              {/* Profile info */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff', marginBottom: '2px' }}>{displayName}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</p>
              </div>
              {/* Logout */}
              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 16px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#fca5a5', fontSize: '13px',
                  transition: 'background 0.15s'
                }}
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
