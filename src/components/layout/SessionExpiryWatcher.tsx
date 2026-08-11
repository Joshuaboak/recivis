/**
 * SessionExpiryWatcher — Detects expired sessions and returns to the login screen.
 *
 * Wraps window.fetch and watches for a 401 from our own API. The three second
 * delay is deliberate: it lets the in-flight screen settle before the app
 * navigates away, so the user sees what failed rather than a sudden redirect.
 *
 * Renders nothing. The "session expired" notice itself lives on the login
 * screen, keyed off `?expired=1`.
 */

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { LOGIN_PATH } from '@/lib/routes';

export default function SessionExpiryWatcher() {
  const { user, setUser } = useAppStore();
  const router = useRouter();
  const interceptorInstalled = useRef(false);

  // Global fetch interceptor — detect 401s and auto-logout
  useEffect(() => {
    if (interceptorInstalled.current || !user) return;
    interceptorInstalled.current = true;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      // Only intercept our own API calls, not external requests
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      if (response.status === 401 && url.startsWith('/api/')) {
        setTimeout(() => {
          setUser(null);
          router.replace(`${LOGIN_PATH}?expired=1`);
        }, 3000);
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
      interceptorInstalled.current = false;
    };
  }, [user, setUser, router]);

  return null;
}
