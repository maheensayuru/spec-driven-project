'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { UserRole } from '@renewalradar/shared';
import { apiRequest, ApiError } from '../lib/api';

export interface RuntimeSession {
  userId: string;
  organizationId: string;
  role: UserRole;
  email: string;
  createdAt: number;
}

interface SessionState {
  session: RuntimeSession | null;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = pathname === '/login' || pathname === '/invite/accept';
  const [session, setSession] = useState<RuntimeSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSession(null);
    setError(null);
    if (isPublic) {
      setIsLoading(false);
      return () => controller.abort();
    }
    setIsLoading(true);
    apiRequest<{ session: RuntimeSession }>('/auth/me', { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setSession(result.session);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) {
          router.replace('/login');
        } else {
          setError(failure instanceof Error ? failure.message : 'Unable to verify your session.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [isPublic, attempt, router]);

  return (
    <SessionContext.Provider
      value={{ session, isLoading, error, retry: () => setAttempt((value) => value + 1) }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const state = useContext(SessionContext);
  if (!state) throw new Error('useSession must be used within SessionProvider');
  return state;
}
