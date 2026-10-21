'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

function CallbackContent() {
  const searchParams = useSearchParams();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const handleCallback = async () => {
      const code = searchParams.get('code');
      const rawNext = searchParams.get('next') ?? '/workspace';
      // Ensure 'next' is a safe relative path starting with / and not // (prevent open redirects)
      const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/workspace';

      const handleSuccess = () => {
        window.location.replace(next);
      };

      const handleFailure = () => {
        if (next === '/reset-password') {
          window.location.replace('/reset-password?error=invalid_or_expired');
        } else {
          window.location.replace('/workspace');
        }
      };

      try {
        // 1. Check if session already exists (e.g. detectSessionInUrl already consumed the code)
        const { data: initialSessionData } = await supabase.auth.getSession();
        if (initialSessionData?.session) {
          handleSuccess();
          return;
        }

        // 2. Exchange code if available
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            handleSuccess();
            return;
          }
          console.warn('exchangeCodeForSession returned error:', error);
          // Check if session became available despite error (e.g. race condition)
          const { data: retrySessionData } = await supabase.auth.getSession();
          if (retrySessionData?.session) {
            handleSuccess();
            return;
          }
        }

        // Neither session exists nor code exchange succeeded
        handleFailure();
      } catch (err) {
        console.error('Auth callback handling error:', err);
        handleFailure();
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="min-h-[calc(100vh-73px)] flex items-center justify-center p-4">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        <p className="text-xs text-white/60 tracking-wider uppercase font-medium">Signing you in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[calc(100vh-73px)] flex items-center justify-center p-4">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="text-xs text-white/60 tracking-wider uppercase font-medium">Signing you in...</p>
          </div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
