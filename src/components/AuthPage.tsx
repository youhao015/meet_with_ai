import { useState } from 'react';
import { Mail, Lock, User, Eye, EyeOff, Sparkles, ArrowRight, RefreshCw, Moon, Sun } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, sendPasswordReset } from '../services/auth';
import { useTheme } from '../context/ThemeContext';

type AuthMode = 'login' | 'signup' | 'reset';

export function AuthPage() {
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signInWithEmail(email, password);
        if (error) setError(error);
      } else if (mode === 'signup') {
        if (!fullName.trim()) { setError('Please enter your full name.'); setIsLoading(false); return; }
        if (password.length < 8) { setError('Password must be at least 8 characters.'); setIsLoading(false); return; }
        const { error, session } = await signUpWithEmail(email, password, fullName.trim());
        if (error) {
          if (error.toLowerCase().includes('rate limit')) {
            setError('Supabase email rate limit exceeded (default limit is 3-4 emails/hour). To fix this permanently, disable "Confirm email" under Authentication > Providers > Email in your Supabase dashboard.');
          } else {
            setError(error);
          }
        } else if (!session) {
          setSuccess('Account created! Check your email to confirm, then sign in.');
          setMode('login');
        }
      } else if (mode === 'reset') {
        const { error } = await sendPasswordReset(email);
        if (error) setError(error);
        else setSuccess('Password reset email sent — check your inbox.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: 'var(--bg-dark)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        className="btn-secondary"
        style={{
          position: 'absolute', top: '20px', right: '20px', zIndex: 1,
          width: '40px', height: '40px', padding: 0, borderRadius: '50%'
        }}
      >
        {theme === 'dark' ? <Sun size={17} color="var(--accent-amber)" /> : <Moon size={17} color="var(--accent-primary)" />}
      </button>
      {/* Background orbs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-5%', right: '-5%', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)' }} />
      </div>

      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px' }}>
        <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 24px rgba(99,102,241,0.45)' }}>
          <Sparkles size={24} color="#ffffff" />
        </div>
        <div>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
            MeetWith<span className="gradient-text">AI</span>
          </span>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Meet with AI, enrich your mind
          </p>
        </div>
      </div>

      {/* Card */}
      <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '36px 32px' }}>
        {/* Card Header */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            {mode === 'login'
              ? 'Sign in to access your meeting vault and AI studio.'
              : mode === 'signup'
              ? 'Meet with AI, enrich your mind.'
              : 'Enter your email and we\'ll send a reset link.'}
          </p>
        </div>



        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  style={inputStyle}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={inputStyle}
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
                  required
                  style={{ ...inputStyle, paddingRight: '44px' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Forgot password link */}
          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginTop: '-6px' }}>
              <button type="button" onClick={() => { setMode('reset'); reset(); }} style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: '13px', cursor: 'pointer' }}>
                Forgot password?
              </button>
            </div>
          )}

          {/* Error / Success */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', fontSize: '13px', color: '#fca5a5' }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '13px', color: '#6ee7b7' }}>
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary"
            style={{ width: '100%', padding: '12px', fontSize: '15px', marginTop: '4px', justifyContent: 'center' }}
          >
            {isLoading
              ? <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
              : mode === 'login'
              ? <><ArrowRight size={16} /> Sign In</>
              : mode === 'signup'
              ? <><Sparkles size={16} /> Create Account</>
              : <><Mail size={16} /> Send Reset Link</>}
          </button>
        </form>

        {/* Mode switcher */}
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)' }}>
          {mode === 'login' ? (
            <>Don't have an account?{' '}
              <button onClick={() => { setMode('signup'); reset(); }} style={{ background: 'none', border: 'none', color: '#a5b4fc', fontWeight: 600, cursor: 'pointer' }}>
                Sign up free
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setMode('login'); reset(); }} style={{ background: 'none', border: 'none', color: '#a5b4fc', fontWeight: 600, cursor: 'pointer' }}>
                ← Back to Sign In
              </button>
            </>
          )}
        </div>
      </div>

      <p style={{ marginTop: '24px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  paddingLeft: '40px',
  paddingRight: '14px',
  paddingTop: '11px',
  paddingBottom: '11px',
  background: 'var(--input-bg)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s'
};
