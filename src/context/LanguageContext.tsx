import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'zh';

export const translations = {
  en: {
    // Navigation
    nav: {
      studio: 'Studio',
      vault: 'Vault',
      insights: 'Insights',
      settings: 'Settings',
      studioTitle: 'Live Studio',
      summaryTitle: 'Summary View',
      vaultTitle: 'Meeting Vault',
      vaultDetailsTitle: 'Meeting Details',
      insightsTitle: 'Insights & Analytics',
      settingsTitle: 'Settings & Diagnostics',
      recLock: 'Recording in progress. Please stop recording before switching tabs.',
      summarizeLock: 'AI is summarizing your meeting. Please wait until processing completes.'
    },

    // Header
    header: {
      newMeeting: 'Go to Home / New Meeting',
      rec: 'REC',
      switchThemeToDark: 'Switch to Dark Mode',
      switchThemeToLight: 'Switch to Light Mode',
      switchLanguageToZh: '切换为简体中文 (Switch to Chinese)',
      switchLanguageToEn: 'Switch to English (切换为英文)',
      guest: 'Guest',
      signOut: 'Sign Out'
    },

    // Studio / Recording Panel
    studio: {
      meetingTitle: 'Meeting Title',
      titlePlaceholder: 'e.g. Weekly Product Sync / write a title',
      duration: 'Duration',
      startMic: 'Start Mic Capture',
      startTab: 'Capture Tab / System Audio',
      stopRecording: 'Stop Recording',
      summarizeBtn: 'Generate AI Summary',
      summarizing: 'Generating Summary…',
      liveTranscript: 'Live Meeting Transcript',
      clearTranscript: 'Clear',
      transcribingChunk: 'Transcribing speech…',
      transcriptPlaceholder: 'Spoken dialogue or audio transcript will appear here in real time. You can also type or paste meeting notes directly…',
      speechErrorPrompt: 'Speech recognition error. Please check microphone permissions.',
      micPermissionPrompt: 'Click to start recording your microphone audio.',
      tabPermissionPrompt: 'Capture audio from Google Meet, Zoom, Teams, YouTube, or browser tabs.',
      tabHelpTitle: 'Screen / Tab Audio Setup',
      tabHelpTip: 'Tip: In the browser prompt, select "Chrome Tab" and make sure to toggle "Share tab audio" on for direct crystal-clear audio capture.',
      noTextToSummarize: 'Please record speech or type/paste meeting notes in the transcript box below before generating a summary.',
      pipelineInitializing: 'Initializing hybrid AI pipeline…',
      sourceMic: 'Microphone Stream',
      sourceTab: 'Tab / System Audio Stream',
      audioDetected: 'Audio Active',
      audioIdle: 'Idle'
    },

    // Summary View
    summary: {
      backToStudio: 'Back to Studio',
      backToVault: 'Back to Vault',
      headerTitle: 'Executive Meeting Summary',
      overview: 'Executive Overview',
      keyPoints: 'Key Discussion Points',
      decisions: 'Decisions Made',
      actionItems: 'Action Items & Deliverables',
      fullTranscript: 'Complete Audio Transcript',
      copyMarkdown: 'Copy Markdown',
      copied: 'Copied to clipboard!',
      exportMarkdown: 'Export .md',
      task: 'Task',
      assignee: 'Assignee',
      dueDate: 'Due Date',
      status: 'Status',
      completed: 'Completed',
      pending: 'Pending',
      inProgress: 'In Progress',
      addTask: 'Add Action Item',
      noDecisions: 'No explicit decisions recorded for this session.',
      noActionItems: 'No action items identified for this session.',
      noKeyPoints: 'No key points recorded.',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      tierLocal: 'Local WebGPU AI',
      tierCloud: 'Cloud Multi-Model',
      tierHeuristic: 'Heuristic Fallback'
    },

    // Meeting Vault (History)
    vault: {
      title: 'Meeting Vault',
      subtitle: 'Browse and search past meeting recordings, action items, and AI summaries',
      searchPlaceholder: 'Search meetings by title or transcript content…',
      totalMeetings: 'Total Meetings',
      filterAll: 'All Records',
      filterLive: 'Live Recorded',
      filterUpload: 'Uploaded Files',
      noMeetingsFound: 'No meetings found matching your criteria.',
      noMeetingsYet: 'No recorded meetings in your vault yet. Start a session in Live Studio!',
      deleteConfirm: 'Are you sure you want to delete this meeting? This action cannot be undone.',
      durationMin: 'min',
      durationSec: 'sec',
      viewSummary: 'View Summary',
      deleteMeeting: 'Delete Record'
    },

    // Insights & Analytics
    insights: {
      title: 'Insights & Analytics',
      subtitle: 'Real-time overview of meeting cadence, action item delivery, and AI performance',
      totalMeetings: 'Total Meetings',
      totalDuration: 'Total Meeting Time',
      actionItemsCount: 'Total Action Items',
      completionRate: 'Task Completion Rate',
      taskBreakdown: 'Task Status Breakdown',
      pending: 'Pending',
      inProgress: 'In Progress',
      completed: 'Completed',
      recentTasks: 'Recent Action Items',
      aiModelBreakdown: 'AI Inference Engines',
      noDataYet: 'No analytics data yet. Record meetings to see trends!'
    },

    // Settings View
    settings: {
      title: 'Settings & Diagnostics',
      subtitle: 'Configure appearance, language, manage WebGPU engines, and monitor PWA status',
      appearanceSection: 'Appearance & Theme',
      appearanceDesc: 'Choose between iOS Liquid Glass Dark mode or Apple Frost Light mode',
      darkTheme: 'Dark Obsidian',
      darkThemeDesc: 'Deep space liquid glass',
      lightTheme: 'Light Alabaster',
      lightThemeDesc: 'Apple frosted glass',
      languageSection: 'Display Language',
      languageDesc: 'Choose your preferred language for the interface and navigation',
      langEn: 'English',
      langEnDesc: 'International English',
      langZh: '简体中文',
      langZhDesc: 'Simplified Chinese interface',
      aiSection: 'Hardware Acceleration & AI',
      aiDesc: 'In-browser GPU inference details and fallback configuration',
      webgpuEngine: 'WebGPU Engine',
      localWeights: 'Local Model Weights',
      cloudFallback: 'Tier 2 Cloud Fallback',
      storageSection: 'Storage & PWA Status',
      storageDesc: 'Supabase synchronization and offline caching management',
      supabaseStatus: 'Supabase PostgreSQL & Storage',
      pwaStatus: 'PWA Service Worker',
      clearCache: 'Clear Cache',
      cacheCleared: 'Cache Cleared',
      recordingsSafe: 'Recordings remain stored in your private Supabase vault'
    },

    // Auth
    auth: {
      title: 'MeetWithAI',
      subtitle: 'Your private, on-device & cloud hybrid meeting intelligence suite',
      signInTab: 'Sign In',
      signUpTab: 'Create Account',
      emailLabel: 'Email Address',
      passwordLabel: 'Password',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: 'Enter your password',
      submitSignIn: 'Sign In',
      submitSignUp: 'Create Account',
      loadingSignIn: 'Signing In…',
      loadingSignUp: 'Registering…',
      demoLoginNotice: 'Secure email/password authentication backed by Supabase',
      restoringSession: 'Restoring session…'
    }
  },

  zh: {
    // Navigation
    nav: {
      studio: '录音台',
      vault: '档案库',
      insights: '数据分析',
      settings: '设置',
      studioTitle: '实时工作台',
      summaryTitle: '会议纪要',
      vaultTitle: '会议档案库',
      vaultDetailsTitle: '会议详情',
      insightsTitle: '数据分析洞察',
      settingsTitle: '设置与系统诊断',
      recLock: '录音进行中，请先停止录音再切换页面。',
      summarizeLock: 'AI正在生成会议纪要，请稍候。'
    },

    // Header
    header: {
      newMeeting: '返回首页 / 新建会议',
      rec: '录音中',
      switchThemeToDark: '切换为深色模式',
      switchThemeToLight: '切换为浅色模式',
      switchLanguageToZh: '切换为简体中文 (Switch to Chinese)',
      switchLanguageToEn: 'Switch to English (切换为英文)',
      guest: '访客',
      signOut: '退出登录'
    },

    // Studio / Recording Panel
    studio: {
      meetingTitle: '会议标题',
      titlePlaceholder: '例如：每周产品同步会 / 请输入标题',
      duration: '时长',
      startMic: '麦克风录制',
      startTab: '采集标签页 / 系统音频',
      stopRecording: '停止录音',
      summarizeBtn: '生成 AI 会议纪要',
      summarizing: '正在生成纪要…',
      liveTranscript: '实时会议对话转写',
      clearTranscript: '清空',
      transcribingChunk: '正在转写语音…',
      transcriptPlaceholder: '对话转写内容将在此实时呈现。您也可以直接在此键入或粘贴会议记录…',
      speechErrorPrompt: '语音识别出错，请检查麦克风权限。',
      micPermissionPrompt: '点击开始录制麦克风语音输入。',
      tabPermissionPrompt: '采集来自腾讯会议、飞书、Zoom、Google Meet 或浏览器标签页的音频。',
      tabHelpTitle: '屏幕 / 标签页音频采集说明',
      tabHelpTip: '提示：在浏览器弹出窗口中，选择“Chrome 标签页”并务必勾选“分享标签页音频”，以实现清晰纯净的内录音质。',
      noTextToSummarize: '请先录制语音或在下方转写框中输入/粘贴会议内容，然后再生成纪要。',
      pipelineInitializing: '正在初始化混合 AI 引擎…',
      sourceMic: '麦克风输入',
      sourceTab: '标签页 / 系统音频流',
      audioDetected: '检测到声音',
      audioIdle: '静音'
    },

    // Summary View
    summary: {
      backToStudio: '返回录音台',
      backToVault: '返回档案库',
      headerTitle: '智能会议纪要',
      overview: '核心概览',
      keyPoints: '主要讨论要点',
      decisions: '达成的决议',
      actionItems: '行动清单与待办任务',
      fullTranscript: '完整转写对话记录',
      copyMarkdown: '复制 Markdown',
      copied: '已复制到剪贴板！',
      exportMarkdown: '导出 .md',
      task: '任务',
      assignee: '负责人',
      dueDate: '截止日期',
      status: '状态',
      completed: '已完成',
      pending: '待处理',
      inProgress: '进行中',
      addTask: '添加行动项',
      noDecisions: '本次会议未记录明确决议。',
      noActionItems: '本次会议未识别到行动项。',
      noKeyPoints: '暂无讨论要点记录。',
      save: '保存',
      cancel: '取消',
      delete: '删除',
      tierLocal: '本地 WebGPU AI',
      tierCloud: '云端多模型引擎',
      tierHeuristic: '启发式备用规则'
    },

    // Meeting Vault (History)
    vault: {
      title: '会议档案库',
      subtitle: '浏览并检索过往会议记录、待办事项与 AI 纪要',
      searchPlaceholder: '通过标题或对话内容搜索会议…',
      totalMeetings: '会议总数',
      filterAll: '全部记录',
      filterLive: '实时录音',
      filterUpload: '上传文件',
      noMeetingsFound: '未找到符合条件的会议记录。',
      noMeetingsYet: '您的档案库中暂无会议记录。请前往实时工作台开始录制！',
      deleteConfirm: '确定要删除此会议记录吗？该操作不可撤销。',
      durationMin: '分',
      durationSec: '秒',
      viewSummary: '查看纪要',
      deleteMeeting: '删除记录'
    },

    // Insights & Analytics
    insights: {
      title: '数据分析洞察',
      subtitle: '实时掌握会议频次、行动项跟进进度及 AI 引擎运转指标',
      totalMeetings: '会议总数',
      totalDuration: '累计录音时长',
      actionItemsCount: '行动项总数',
      completionRate: '待办完成率',
      taskBreakdown: '任务状态分布',
      pending: '待处理',
      inProgress: '进行中',
      completed: '已完成',
      recentTasks: '近期行动清单',
      aiModelBreakdown: 'AI 推理引擎分布',
      noDataYet: '暂无分析数据。录制会议即可查看趋势！'
    },

    // Settings View
    settings: {
      title: '设置与系统诊断',
      subtitle: '配置外观界面、界面语言、管理 WebGPU 引擎并监控 PWA 离线状态',
      appearanceSection: '外观与主题',
      appearanceDesc: '在 iOS 流体深色玻璃与苹果清润白玉浅色模式之间切换',
      darkTheme: '深邃黑曜',
      darkThemeDesc: '深空流体玻璃暗色界面',
      lightTheme: '清润白玉',
      lightThemeDesc: '苹果极简磨砂浅色界面',
      languageSection: '界面语言',
      languageDesc: '选择应用界面的偏好显示语言',
      langEn: 'English',
      langEnDesc: '国际通用英文界面',
      langZh: '简体中文',
      langZhDesc: '简体中文语言界面',
      aiSection: '硬件加速与 AI 引擎',
      aiDesc: '浏览器端 GPU 本地推理状态与云端降级配置',
      webgpuEngine: 'WebGPU 引擎',
      localWeights: '本地模型权重',
      cloudFallback: '第二层云端备用引擎',
      storageSection: '存储与 PWA 状态',
      storageDesc: 'Supabase 云端数据库同步与离线存储管理',
      supabaseStatus: 'Supabase PostgreSQL 与对象存储',
      pwaStatus: 'PWA Service Worker',
      clearCache: '清理缓存',
      cacheCleared: '缓存已清除',
      recordingsSafe: '所有录音均安全保存在您的私有 Supabase 库中'
    },

    // Auth
    auth: {
      title: 'MeetWithAI',
      subtitle: '您的端侧与云端协同混合智能会议工作站',
      signInTab: '登录账号',
      signUpTab: '注册新账号',
      emailLabel: '电子邮箱',
      passwordLabel: '登录密码',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: '请输入密码',
      submitSignIn: '立即登录',
      submitSignUp: '创建账号',
      loadingSignIn: '正在登录…',
      loadingSignUp: '正在创建账号…',
      demoLoginNotice: '由 Supabase 强力驱动的安全邮箱身份认证',
      restoringSession: '正在恢复会话…'
    }
  }
} as const;

type DeepString<T> = {
  [K in keyof T]: T[K] extends object ? DeepString<T[K]> : string;
};

export type TranslationSchema = DeepString<typeof translations.en>;

const dictionary: Record<Language, TranslationSchema> = translations;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: TranslationSchema;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('meetwithai_language') as Language | null;
      if (saved === 'en' || saved === 'zh') return saved;
      // Check system language
      if (navigator.language && navigator.language.toLowerCase().startsWith('zh')) {
        return 'zh';
      }
    }
    return 'en';
  });

  useEffect(() => {
    localStorage.setItem('meetwithai_language', language);
    document.documentElement.setAttribute('lang', language === 'zh' ? 'zh-CN' : 'en');
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const toggleLanguage = () => {
    setLanguageState((prev) => (prev === 'en' ? 'zh' : 'en'));
  };

  const t = dictionary[language];

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
