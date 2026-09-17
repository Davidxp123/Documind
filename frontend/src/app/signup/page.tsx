'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Sparkles, Mail, Lock, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') || '/workspace';

  const { user, loading: authLoading, signUpWithPassword, signInWithGoogle } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      router.push(redirectTo);
    }
  }, [user, authLoading, router, redirectTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await signUpWithPassword(email.trim(), password);
      if (error) {
        setError(error.message || 'Failed to create account.');
      } else {
        if (data?.session) {
          router.push(redirectTo);
        } else {
          setSuccessMessage('Account created! Please check your email to confirm your account or sign in.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during signup.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setError(error.message);
        setGoogleLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with Google.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-black/65 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Glow accent */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-400/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-purple-400 border border-purple-300/30 shadow-lg shadow-purple-500/20 mb-3">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading italic text-white tracking-wide">
          Create an Account
        </h1>
        <p className="text-xs sm:text-sm text-white/60 mt-1 font-light">
          Start building your personal AI-grounded document workspace
        </p>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
        className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/5 py-3 px-4 text-sm font-medium text-white hover:bg-white/10 transition-all shadow-sm disabled:opacity-50"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path
            fill="#EA4335"
            d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"
          />
          <path
            fill="#4285F4"
            d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
          />
          <path
            fill="#FBBC05"
            d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.8s.2-2.1.4-2.8L1.9 6.3C.7 8.7 0 10.3 0 12s.7 3.3 1.9 5.7l3.7-2.9z"
          />
          <path
            fill="#34A853"
            d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.3-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
          />
        </svg>
        <span>{googleLoading ? 'Connecting...' : 'Continue with Google'}</span>
      </button>

      <div className="relative my-5 flex items-center justify-center">
        <div className="w-full border-t border-white/10" />
        <span className="absolute bg-[#0d0d12] px-3 text-[11px] uppercase tracking-wider text-white/40">
          or with email
        </span>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 mb-1 font-medium">
            Email Address
          </label>
          <div className="relative">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:bg-white/10 focus:outline-none transition-all"
            />
            <Mail className="absolute left-3.5 top-3 w-4 h-4 text-white/40" />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 mb-1 font-medium">
            Password
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:bg-white/10 focus:outline-none transition-all"
            />
            <Lock className="absolute left-3.5 top-3 w-4 h-4 text-white/40" />
          </div>
        </div>

        <div>
          <label className="block text-xs uppercase tracking-wider text-white/60 mb-1 font-medium">
            Confirm Password
          </label>
          <div className="relative">
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:bg-white/10 focus:outline-none transition-all"
            />
            <Lock className="absolute left-3.5 top-3 w-4 h-4 text-white/40" />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full rounded-full liquid-glass-strong py-3 px-4 text-sm font-medium text-white hover:bg-white/15 transition-all shadow-lg flex items-center justify-center gap-2 mt-3 disabled:opacity-50"
        >
          <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      {/* Footer Toggle */}
      <div className="mt-6 text-center text-xs text-white/60">
        <p>
          Already have an account?{' '}
          <Link
            href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
            className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <main className="min-h-[calc(100vh-73px)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <Suspense fallback={<div className="text-white/60 text-xs flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-purple-400" /> Loading...</div>}>
        <SignupForm />
      </Suspense>
    </main>
  );
}
