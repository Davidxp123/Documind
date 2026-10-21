'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Sparkles, Lock, ArrowRight, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === 'invalid_or_expired'
      ? 'The password reset link is invalid or has expired. Please request a new one.'
      : null
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

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
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
      } else {
        setSuccessMessage('Password has been successfully updated! Redirecting...');
        setTimeout(() => {
          router.push('/workspace');
        }, 1500);
      }
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-[28px] border border-white/15 bg-black/65 backdrop-blur-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
      {/* Glow accent */}
      <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-600/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-400/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-purple-400 border border-purple-300/30 shadow-lg shadow-purple-500/20 mb-3">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-heading italic text-white tracking-wide">
          Set New Password
        </h1>
        <p className="text-xs sm:text-sm text-white/60 mt-1 font-light">
          Enter your new password below to update your account
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

      {errorParam === 'invalid_or_expired' ? (
        <div className="text-center mt-6">
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 rounded-full liquid-glass-strong py-3 px-6 text-sm font-medium text-white hover:bg-white/15 transition-all shadow-lg"
          >
            <span>Back to Sign In</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-white/60 mb-1.5 font-medium">
              New Password
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
            <label className="block text-xs uppercase tracking-wider text-white/60 mb-1.5 font-medium">
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:bg-white/10 focus:outline-none transition-all"
              />
              <Lock className="absolute left-3.5 top-3 w-4 h-4 text-white/40" />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full liquid-glass-strong py-3 px-4 text-sm font-medium text-white hover:bg-white/15 transition-all shadow-lg flex items-center justify-center gap-2 mt-3 disabled:opacity-50"
          >
            <span>{loading ? 'Updating Password...' : 'Update Password'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-white/60">
        <Link
          href="/login"
          className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
        >
          ← Back to Sign In
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-[calc(100vh-73px)] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="text-white/60 text-xs flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-purple-400" /> Loading...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
