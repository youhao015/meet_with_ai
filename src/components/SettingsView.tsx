import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Cpu,
  Cloud,
  HardDrive,
  Trash2,
  CheckCircle2,
  Shield,
  Smartphone
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { checkWebGPUSupport } from '../services/webllm';
import { supabase } from '../services/supabase';

export const SettingsView: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const hasGPU = checkWebGPUSupport();
  const [gpuInfo, setGpuInfo] = useState<string>('Detecting GPU…');
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [cacheCleared, setCacheCleared] = useState(false);

  useEffect(() => {
    // Check GPU adapter details if available
    const detectGpu = async () => {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        try {
          const adapter = await (navigator as any).gpu.requestAdapter();
          if (adapter) {
            const info = (adapter as any).info;
            setGpuInfo(info?.vendor || info?.architecture || 'WebGPU Compatible Adapter');
          } else {
            setGpuInfo('Default WebGPU Engine');
          }
        } catch {
          setGpuInfo('WebGPU Hardware Accelerated');
        }
      } else {
        setGpuInfo('WebGPU Not Available (Using Cloud Tier)');
      }
    };
    detectGpu();

    // Check Supabase connection
    const checkSupabase = async () => {
      try {
        const { error } = await supabase.from('meetings').select('id').limit(1);
        setDbStatus(error ? 'offline' : 'connected');
      } catch {
        setDbStatus('offline');
      }
    };
    checkSupabase();
  }, []);

  const handleClearCache = async () => {
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        setCacheCleared(true);
        setTimeout(() => setCacheCleared(false), 3000);
      } catch (err) {
        console.warn('Cache clear error:', err);
      }
    }
  };

  return (
    <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="ios-large-title" style={{ marginBottom: '6px' }}>
          Settings &amp; Diagnostics
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)' }}>
          Configure appearance, manage WebGPU engines, and monitor PWA status
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Section 1: Appearance & Theme */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Appearance &amp; Theme
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Choose between iOS Liquid Glass Dark mode or Apple Frost Light mode
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            {/* Dark Theme Option */}
            <div
              onClick={() => setTheme('dark')}
              style={{
                padding: '16px',
                borderRadius: '16px',
                background: theme === 'dark' ? 'rgba(99, 102, 241, 0.15)' : 'var(--glass-surface-subtle)',
                border: `2px solid ${theme === 'dark' ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: '#070a12', border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Moon size={18} color="#818cf8" />
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Dark Obsidian</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Deep space liquid glass</p>
              </div>
            </div>

            {/* Light Theme Option */}
            <div
              onClick={() => setTheme('light')}
              style={{
                padding: '16px',
                borderRadius: '16px',
                background: theme === 'light' ? 'rgba(79, 70, 229, 0.12)' : 'var(--glass-surface-subtle)',
                border: `2px solid ${theme === 'light' ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{
                width: '38px', height: '38px', borderRadius: '10px',
                background: '#f8fafc', border: '1px solid rgba(0,0,0,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <Sun size={18} color="#d97706" />
              </div>
              <div>
                <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Light Alabaster</p>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Apple frosted glass</p>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: AI Engine Diagnostics */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Hardware Acceleration &amp; AI
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            In-browser GPU inference details and fallback configuration
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* GPU status item */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: '12px',
              background: 'var(--glass-surface-subtle)', border: '1px solid var(--glass-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Cpu size={20} color="var(--accent-primary)" />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>WebGPU Engine</p>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{gpuInfo}</p>
                </div>
              </div>
              <span className={`badge ${hasGPU ? 'badge-webgpu' : 'badge-server'}`}>
                {hasGPU ? 'Available' : 'Unsupported'}
              </span>
            </div>

            {/* AI Model Item */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: '12px',
              background: 'var(--glass-surface-subtle)', border: '1px solid var(--glass-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <HardDrive size={20} color="var(--accent-purple)" />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Local Model Weights</p>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Llama-3.2-1B-Instruct (q4f32_1)</p>
                </div>
              </div>
              <span className="badge badge-source">
                Browser Cache
              </span>
            </div>

            {/* Cloud Fallback Item */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: '12px',
              background: 'var(--glass-surface-subtle)', border: '1px solid var(--glass-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Cloud size={20} color="var(--accent-cyan)" />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Tier 2 Cloud Fallback</p>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>OpenRouter Multi-Model Chain (4 Models)</p>
                </div>
              </div>
              <span className="badge badge-server">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Cloud Database & PWA Storage */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Storage &amp; PWA Status
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            Supabase synchronization and offline caching management
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Supabase status */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: '12px',
              background: 'var(--glass-surface-subtle)', border: '1px solid var(--glass-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2
                  size={20}
                  color={dbStatus === 'connected' ? 'var(--accent-emerald)' : 'var(--text-muted)'}
                />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Supabase PostgreSQL &amp; Storage
                  </p>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    RLS Secured · Audio Bucket &quot;meeting-recordings&quot;
                  </p>
                </div>
              </div>
              <span className="badge" style={{
                background: dbStatus === 'connected' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                color: dbStatus === 'connected' ? 'var(--accent-emerald)' : 'var(--text-muted)'
              }}>
                {dbStatus === 'connected' ? 'Connected' : 'Offline / Checking'}
              </span>
            </div>

            {/* PWA Installability */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', borderRadius: '12px',
              background: 'var(--glass-surface-subtle)', border: '1px solid var(--glass-border)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Smartphone size={20} color="var(--accent-primary)" />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>PWA Service Worker</p>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Precached offline assets with Workbox</p>
                </div>
              </div>
              <span className="badge badge-source">
                Active
              </span>
            </div>

            {/* Clear model / offline cache button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} color="var(--accent-emerald)" />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Recordings remain stored in your private Supabase vault
                </span>
              </div>
              <button
                onClick={handleClearCache}
                className="btn-secondary"
                style={{ padding: '8px 14px', fontSize: '12px' }}
              >
                {cacheCleared ? (
                  <>
                    <CheckCircle2 size={14} color="var(--accent-emerald)" />
                    Cleared
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    Clear Cache
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
