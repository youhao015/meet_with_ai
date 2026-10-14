import { useState } from 'react';
import { IOSHeader } from './components/IOSHeader';
import { BottomNavBar, type NavTab } from './components/BottomNavBar';
import { AudioCapturePanel } from './components/AudioCapturePanel';
import { MeetingSummaryView } from './components/MeetingSummaryView';
import { MeetingHistory } from './components/MeetingHistory';
import { AnalyticsWidgets } from './components/AnalyticsWidgets';
import { AuthPage } from './components/AuthPage';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import type { SummarizeResult } from './services/summarizer';
import type { MeetingRecord } from './services/supabase';

function AppShell() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<NavTab>('studio');
  const [currentSummaryResult, setCurrentSummaryResult] = useState<SummarizeResult | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [vaultMeeting, setVaultMeeting] = useState<MeetingRecord | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

  const handleSummaryGenerated = (
    result: SummarizeResult,
    title: string,
    transcript: string,
    meetingId?: string
  ) => {
    setCurrentSummaryResult(result);
    setCurrentTitle(title);
    setCurrentTranscript(transcript);
    if (meetingId) setCurrentMeetingId(meetingId);
  };

  const handleSelectHistoryMeeting = (meeting: MeetingRecord) => {
    // If cached in localStorage, merge it for instant consistency
    try {
      const cached = localStorage.getItem(`meetwithai_action_items_${meeting.id}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0 && meeting.summary) {
          const dbItems = meeting.summary.action_items || [];
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

          meeting = {
            ...meeting,
            summary: {
              ...meeting.summary,
              action_items: mergedItems.length > 0 ? mergedItems : parsed
            }
          };
        }
      }
    } catch {}
    setVaultMeeting(meeting);
  };

  const handleNewMeeting = () => {
    setCurrentSummaryResult(null);
    setCurrentMeetingId(null);
    setVaultMeeting(null);
    setCurrentTitle('');
    setCurrentTranscript('');
    setActiveTab('studio');
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'studio':
        return currentSummaryResult ? t.nav.summaryTitle : t.nav.studioTitle;
      case 'vault':
        return vaultMeeting ? t.nav.vaultDetailsTitle : t.nav.vaultTitle;
      case 'insights':
        return t.nav.insightsTitle;
      default:
        return 'MeetWithAI';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', position: 'relative' }}>
      <IOSHeader
        title={getHeaderTitle()}
        isRecording={isRecording}
        onNewMeeting={handleNewMeeting}
      />

      {/* Main Content Area with Bottom Dock Safe Padding */}
      <main style={{ flex: 1, paddingBottom: '96px', width: '100%' }}>
        {activeTab === 'studio' && (
          <>
            {currentSummaryResult ? (
              <MeetingSummaryView
                key={`studio-${currentMeetingId || 'active'}`}
                meetingId={currentMeetingId || undefined}
                result={currentSummaryResult}
                title={currentTitle}
                transcript={currentTranscript}
                onBack={() => setCurrentSummaryResult(null)}
                onMeetingUpdated={(updatedSummary) => {
                  setCurrentSummaryResult((prev) => prev ? { ...prev, summary: updatedSummary } : null);
                }}
                onTitleUpdated={(newTitle) => {
                  setCurrentTitle(newTitle);
                }}
              />
            ) : (
              <AudioCapturePanel
                onSummaryGenerated={handleSummaryGenerated}
                onRecordingStateChange={setIsRecording}
                onSummarizingStateChange={setIsSummarizing}
              />
            )}
          </>
        )}

        {activeTab === 'vault' && (
          vaultMeeting ? (
            <MeetingSummaryView
              key={`vault-${vaultMeeting.id}`}
              meetingId={vaultMeeting.id}
              result={{
                summary: {
                  overview: vaultMeeting.summary?.overview || '',
                  key_points: vaultMeeting.summary?.key_points || [],
                  decisions: vaultMeeting.summary?.decisions || [],
                  action_items: vaultMeeting.summary?.action_items || []
                },
                tierUsed: vaultMeeting.source === 'live' ? 'local-webgpu' : 'cloud'
              }}
              title={vaultMeeting.title}
              transcript={vaultMeeting.transcript}
              onBack={() => setVaultMeeting(null)}
              backLabel={t.summary.backToVault}
              onMeetingUpdated={(updatedSummary) => {
                setVaultMeeting((prev) => prev ? { ...prev, summary: updatedSummary } : null);
              }}
              onTitleUpdated={(newTitle) => {
                setVaultMeeting((prev) => prev ? { ...prev, title: newTitle } : null);
              }}
            />
          ) : (
            <MeetingHistory onSelectMeeting={handleSelectHistoryMeeting} />
          )
        )}

        {activeTab === 'insights' && (
          <AnalyticsWidgets />
        )}

      </main>

      {/* iOS Floating Bottom Glass Dock */}
      <BottomNavBar
        activeTab={activeTab}
        isRecording={isRecording}
        isSummarizing={isSummarizing}
        onChangeTab={(tab) => {
          if ((isRecording || isSummarizing) && tab !== 'studio') {
            return;
          }
          if (tab === 'studio') {
            // Unconditionally clear summaries and vault state so Live Studio recorder is guaranteed to show
            setCurrentSummaryResult(null);
            setCurrentMeetingId(null);
            setVaultMeeting(null);
            setCurrentTitle('');
            setCurrentTranscript('');
            setIsRecording(false);
            setIsSummarizing(false);
          } else if (tab === 'vault') {
            // If already in vault and user clicks Vault again, return to meeting history list
            if (activeTab === 'vault' && vaultMeeting) {
              setVaultMeeting(null);
            }
          } else {
            // Leaving vault for another tab
            setVaultMeeting(null);
          }
          setActiveTab(tab);
        }}
      />
    </div>
  );
}

export function App() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)',
            animation: 'pulse 1.5s ease-in-out infinite',
            boxShadow: '0 8px 30px var(--accent-primary-glow)'
          }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500 }}>
            {t.auth.restoringSession}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <AppShell />;
}

export default App;
