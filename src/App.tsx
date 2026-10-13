import { useState } from 'react';
import { IOSHeader } from './components/IOSHeader';
import { BottomNavBar, type NavTab } from './components/BottomNavBar';
import { AudioCapturePanel } from './components/AudioCapturePanel';
import { MeetingSummaryView } from './components/MeetingSummaryView';
import { MeetingHistory } from './components/MeetingHistory';
import { AnalyticsWidgets } from './components/AnalyticsWidgets';
import { AuthPage } from './components/AuthPage';
import { useAuth } from './context/AuthContext';
import type { SummarizeResult } from './services/summarizer';
import type { MeetingRecord } from './services/supabase';

function AppShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('studio');
  const [currentSummaryResult, setCurrentSummaryResult] = useState<SummarizeResult | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [currentTranscript, setCurrentTranscript] = useState<string>('');
  const [vaultMeeting, setVaultMeeting] = useState<MeetingRecord | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);

  const handleSummaryGenerated = (
    result: SummarizeResult,
    title: string,
    transcript: string
  ) => {
    setCurrentSummaryResult(result);
    setCurrentTitle(title);
    setCurrentTranscript(transcript);
  };

  const handleSelectHistoryMeeting = (meeting: MeetingRecord) => {
    setVaultMeeting(meeting);
  };

  const handleNewMeeting = () => {
    setCurrentSummaryResult(null);
    setVaultMeeting(null);
    setCurrentTitle('');
    setCurrentTranscript('');
    setActiveTab('studio');
  };

  const getHeaderTitle = () => {
    switch (activeTab) {
      case 'studio':
        return currentSummaryResult ? 'Summary View' : 'Live Studio';
      case 'vault':
        return vaultMeeting ? 'Meeting Details' : 'Meeting Vault';
      case 'insights':
        return 'Insights & Analytics';
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
                result={currentSummaryResult}
                title={currentTitle}
                transcript={currentTranscript}
                onBack={() => setCurrentSummaryResult(null)}
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
              backLabel="Back to Vault"
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
          setActiveTab(tab);
          // When switching to studio, clear any old summary so the Live Studio recorder is shown
          if (tab === 'studio') {
            setCurrentSummaryResult(null);
          }
          // When navigating away from vault, clear any opened vault meeting
          if (tab !== 'vault') {
            setVaultMeeting(null);
          }
        }}
      />
    </div>
  );
}

export function App() {
  const { user, isLoading } = useAuth();

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
            Restoring session…
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
