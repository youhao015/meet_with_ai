import React from 'react';
import { Mic, FolderClock, BarChart3 } from 'lucide-react';

export type NavTab = 'studio' | 'vault' | 'insights';

interface BottomNavBarProps {
  activeTab: NavTab;
  onChangeTab: (tab: NavTab) => void;
  isRecording?: boolean;
  isSummarizing?: boolean;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onChangeTab,
  isRecording = false,
  isSummarizing = false
}) => {
  const tabs = [
    {
      id: 'studio' as NavTab,
      label: 'Studio',
      icon: Mic
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
    }
  ];

  return (
    <nav className="ios-dock-container" aria-label="Bottom Navigation Bar">
      <div className="ios-dock">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isLocked = (isRecording || isSummarizing) && tab.id !== 'studio';

          let tabTooltip = tab.label;
          if (isRecording && tab.id !== 'studio') {
            tabTooltip = 'Recording in progress. Please stop recording before switching tabs.';
          } else if (isSummarizing && tab.id !== 'studio') {
            tabTooltip = 'AI is summarizing your meeting. Please wait until processing completes.';
          }

          return (
            <button
              key={tab.id}
              onClick={() => {
                if (isLocked) return;
                onChangeTab(tab.id);
              }}
              disabled={isLocked}
              className={`ios-dock-tab ${isActive ? 'active' : ''}`}
              role="tab"
              aria-selected={isActive}
              aria-label={tab.label}
              title={tabTooltip}
              style={{
                opacity: isLocked ? 0.38 : 1,
                cursor: isLocked ? 'not-allowed' : 'pointer',
                filter: isLocked ? 'grayscale(0.6)' : 'none',
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
              </div>
              <span className="dock-label">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
