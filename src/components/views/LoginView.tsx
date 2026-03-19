'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, AlertCircle, Loader2, ArrowLeft, Check, KeyRound } from 'lucide-react';
import { useAppStore } from '@/lib/store';

type View = 'login' | 'forgot' | 'reset';

export default function LoginView() {
  const { setUser } = useAppStore();
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Check URL for reset token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset');
    if (token) {
      setResetToken(token);
      setView('reset');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        return;
      }

      setUser(data.user);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      setSuccess(data.message);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Reset failed');
        return;
      }

      setSuccess(data.message);
      setTimeout(() => {
        setView('login');
        setSuccess('');
        setNewPassword('');
        setConfirmPassword('');
      }, 2000);
    } catch {
      setError('Unable to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-csa-deep flex items-center justify-center relative overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#0077B7" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-csa-accent via-csa-purple to-transparent origin-left"
      />
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-l from-csa-accent via-csa-purple to-transparent origin-right"
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
          className="text-center mb-10"
        >
          <img src="/logo.svg" alt="Civil Survey Applications" className="w-20 h-20 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-text-primary tracking-tight mb-1">
            Civil Survey Applications
          </h1>
          <p className="text-lg font-semibold text-csa-accent mb-1">
            Reseller Portal
          </p>
          <p className="text-xs text-text-muted">
            Invoice, licence, and account management
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-csa-dark border-4 border-border p-8 rounded-2xl"
        >
          {/* === LOGIN VIEW === */}
          {view === 'login' && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <Shield size={18} className="text-csa-accent" />
                <h2 className="text-lg font-bold text-text-primary">Sign In</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoFocus
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-csa-accent transition-colors rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-csa-accent transition-colors rounded-xl"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="flex items-start gap-2 px-3 py-2 bg-error/10 border-l-4 border-error rounded-r-xl"
                  >
                    <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-error">{error}</p>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim() || !password}
                  className="w-full flex items-center justify-center gap-2 bg-csa-accent text-white px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-csa-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-xl"
                >
                  {loading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      Sign In
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>

              <button
                onClick={() => { setView('forgot'); setError(''); setSuccess(''); }}
                className="w-full text-center text-xs text-text-muted hover:text-csa-accent mt-4 transition-colors cursor-pointer"
              >
                Forgot your password?
              </button>
            </>
          )}

          {/* === FORGOT PASSWORD VIEW === */}
          {view === 'forgot' && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <KeyRound size={18} className="text-csa-accent" />
                <h2 className="text-lg font-bold text-text-primary">Reset Password</h2>
              </div>

              <p className="text-sm text-text-secondary mb-4">
                Enter your email and we'll send you a link to reset your password.
              </p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoFocus
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-csa-accent transition-colors rounded-xl"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2 px-3 py-2 bg-error/10 border-l-4 border-error rounded-r-xl"
                  >
                    <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-error">{error}</p>
                  </motion.div>
                )}

                {success && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2 px-3 py-2 bg-success/10 border-l-4 border-success rounded-r-xl"
                  >
                    <Check size={16} className="text-success flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-success">{success}</p>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-csa-accent text-white px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-csa-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-xl"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Send Reset Link'}
                </button>
              </form>

              <button
                onClick={() => { setView('login'); setError(''); setSuccess(''); }}
                className="w-full flex items-center justify-center gap-1 text-xs text-text-muted hover:text-csa-accent mt-4 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                Back to Sign In
              </button>
            </>
          )}

          {/* === RESET PASSWORD VIEW === */}
          {view === 'reset' && (
            <>
              <div className="flex items-center gap-2 mb-6">
                <KeyRound size={18} className="text-csa-accent" />
                <h2 className="text-lg font-bold text-text-primary">Set New Password</h2>
              </div>

              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoFocus
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-csa-accent transition-colors rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Enter password again"
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-3 text-sm text-text-primary placeholder-text-muted outline-none focus:border-csa-accent transition-colors rounded-xl"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2 px-3 py-2 bg-error/10 border-l-4 border-error rounded-r-xl"
                  >
                    <AlertCircle size={16} className="text-error flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-error">{error}</p>
                  </motion.div>
                )}

                {success && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-2 px-3 py-2 bg-success/10 border-l-4 border-success rounded-r-xl"
                  >
                    <Check size={16} className="text-success flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-success">{success}</p>
                  </motion.div>
                )}

                <button
                  type="submit"
                  disabled={loading || !newPassword || !confirmPassword}
                  className="w-full flex items-center justify-center gap-2 bg-csa-accent text-white px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-csa-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed rounded-xl"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Reset Password'}
                </button>
              </form>

              <button
                onClick={() => { setView('login'); setError(''); setSuccess(''); }}
                className="w-full flex items-center justify-center gap-1 text-xs text-text-muted hover:text-csa-accent mt-4 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                Back to Sign In
              </button>
            </>
          )}
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-[11px] text-text-muted mt-6"
        >
          Civil Survey Applications Pty Ltd &copy; {new Date().getFullYear()}
        </motion.p>
      </motion.div>
    </div>
  );
}
