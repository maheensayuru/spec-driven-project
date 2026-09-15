'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radar, ArrowRight, CalendarClock, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillDemoCredentials = () => {
    setEmail('ops@acmelogistics.com');
    setPassword('Password123!');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.replace('/dashboard');
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to connect to the sign-in service.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-[#173e48] p-12 xl:p-16 text-white">
        <div className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <Radar size={28} aria-hidden="true" />
          RenewalRadar
        </div>
        <div className="max-w-md">
          <p className="text-xs uppercase tracking-[.18em] text-[#b8d2d6]">
            Renewals. Deadlines. Under control.
          </p>
          <h1 className="mt-5 text-[44px] leading-[1.16] font-medium tracking-tight">
            Know what needs attention.
            <br />
            <span className="text-[#b8d2d6]">Before it costs you.</span>
          </h1>
          <p className="mt-6 text-base leading-7 text-[#c6d9dc]">
            One workspace for your contracts, subscriptions, and business obligations. Keep the next
            decision in view.
          </p>
          <div className="mt-10 space-y-5 border-t border-white/20 pt-7 text-sm text-[#d9e6e8]">
            <p className="flex gap-3 items-center">
              <CalendarClock size={19} aria-hidden="true" />
              Clear cancellation and renewal windows
            </p>
            <p className="flex gap-3 items-center">
              <ShieldCheck size={19} aria-hidden="true" />
              Organization-based access and team roles
            </p>
          </div>
        </div>
        <p className="text-xs text-[#b8d2d6]">Business obligation monitoring</p>
      </section>
      <section className="flex min-h-screen flex-col justify-center px-6 py-10 sm:px-12 bg-white">
        <div className="w-full max-w-[380px] mx-auto">
          <div className="mb-12 flex lg:hidden items-center gap-2 text-lg font-semibold text-[#173e48]">
            <Radar size={26} aria-hidden="true" />
            RenewalRadar
          </div>
          <p className="text-xs font-medium uppercase tracking-[.14em] text-slate-500">
            Your workspace
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Welcome back
          </h2>
          <p className="mt-3 mb-8 text-sm leading-6 text-slate-600">
            Sign in to stay ahead of your next deadline.
          </p>
          {errorMessage && (
            <div role="alert" id="login-error" className="feedback-error mb-5">
              {errorMessage}
            </div>
          )}
          <form
            onSubmit={handleLogin}
            className="space-y-5"
            aria-describedby={errorMessage ? 'login-error' : undefined}
          >
            <div>
              <label htmlFor="email" className="field-label">
                Business email
              </label>
              <input
                id="email"
                name="email"
                autoComplete="username"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="field"
              />
            </div>
            <div>
              <label htmlFor="password" className="field-label">
                Password
              </label>
              <input
                id="password"
                name="password"
                autoComplete="current-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="field"
              />
            </div>
            <button type="submit" disabled={isLoading} className="btn btn-primary w-full !mt-7">
              {isLoading ? 'Authenticating...' : 'Sign In'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </form>
          {process.env.NODE_ENV !== 'production' && (
            <div className="mt-8 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700">
                Demo workspace{' '}
                <span className="font-normal text-slate-500">/ Development only</span>
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Explore the presentation with the Acme Logistics account.
              </p>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="btn btn-secondary mt-3 w-full"
              >
                Auto-fill Demo Credentials
              </button>
              <p className="mt-3 text-center text-xs text-slate-500 break-all">
                ops@acmelogistics.com
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
