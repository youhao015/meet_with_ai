import React from 'react';
import { Mic, FolderClock, BarChart3 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

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
  const { t } = useLanguage();

  const tabs = [
    {
      id: 'studio' as NavTab,
      label: t.nav.studio,
      icon: Mic
    },
    {
      id: 'vault' as NavTab,
      label: t.nav.vault,
      icon: FolderClock
    },
    {
      id: 'insights' as NavTab,
      label: t.nav.insights,
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

          let tabTooltip: string = tab.label;
          if (isRecording && tab.id !== 'studio') {
            tabTooltip = t.nav.recLock;
          } else if (isSummarizing && tab.id !== 'studio') {
            tabTooltip = t.nav.summarizeLock;
          }

          return (
            <button
              key={tab.id}
              type="button"
              id={`nav-tab-${tab.id}`}
              data-tab={tab.id}
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
                transition: 'all 0.2s ease',
                pointerEvents: 'auto'
              }}
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <Icon
                  size={19}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  style={{
                    color: isActive ? 'var(--accent-primary)' : 'currentColor',
                    transition: 'all 0.2s ease',
                    filter: isActive ? 'drop-shadow(0 2px 8px var(--accent-primary-glow))' : 'none',
                    pointerEvents: 'none'
                  }}
                />
              </div>
              <span className="dock-label" style={{ pointerEvents: 'none' }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
