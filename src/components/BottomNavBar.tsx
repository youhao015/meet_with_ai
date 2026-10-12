import React from 'react';
import { Mic, FolderClock, BarChart3, Settings2 } from 'lucide-react';

export type NavTab = 'studio' | 'vault' | 'insights' | 'settings';

interface BottomNavBarProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  isRecording?: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onChangeTab,
  isRecording = false
}) => {
  const tabs = [
    {
      id: 'studio' as NavTab,
      label: 'Studio',
      icon: Mic,
      badge: isRecording ? 'REC' : undefined
    },
    {
      id: 'vault' as NavTab,
      label: 'Vault',
      icon: FolderClock
    },
    {
      id: 'insights' as NavTab,
      label: 'Insights',
      icon: BarChart3
    },
    {
      id: 'settings' as NavTab,
      label: 'Settings',
      icon: Settings2
    }
  ];

  return (
    <nav className="ios-dock-container" aria-label="Bottom Navigation Bar">
      <div className="ios-dock">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isDisabled = isRecording && tab.id !== 'studio';

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (isDisabled) return;
                onChangeTab(tab.id);
              }}
              disabled={isDisabled}
              className={`ios-dock-tab ${isActive ? 'active' : ''}`}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              title={isDisabled ? 'Recording in progress. Please stop recording before switching tabs.' : tab.label}
              style={{
                opacity: isDisabled ? 0.38 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                filter: isDisabled ? 'grayscale(0.6)' : 'none',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon
                  size={19}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  style={{
                    color: isActive ? 'var(--accent-primary)' : 'currentColor',
                    transition: 'all 0.2s ease',
                    filter: isActive ? 'drop-shadow(0 2px 8px var(--accent-primary-glow))' : 'none'
                  }}
                />
                {tab.badge && (
                  <span style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-10px',
                    background: '#f43f5e',
                    color: '#ffffff',
                    fontSize: '8px',
                    fontWeight: 800,
                    padding: '1px 4px',
                    borderRadius: '6px',
                    animation: 'pulse 1.2s infinite',
                    letterSpacing: '0.4px'
                  }}>
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="dock-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
