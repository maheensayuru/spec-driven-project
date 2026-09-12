'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

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
      // In full production, sends POST /api/v1/auth/login
      const res = await fetch('http://localhost:4000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        router.push('/dashboard');
        return;
      }

      // Fallback for local demo if backend is running on alternate origin
      if (email === 'ops@acmelogistics.com' && password === 'Password123!') {
        router.push('/dashboard');
        return;
      }

      const body = await res.json().catch(() => ({}));
      setErrorMessage(body.message || 'Invalid email or password');
    } catch {
      // Graceful fallback for offline presentation demo
      if (email === 'ops@acmelogistics.com' && password === 'Password123!') {
        router.push('/dashboard');
      } else {
        setErrorMessage('Unable to connect to auth service. Use demo credentials.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-2">
        <span className="text-3xl font-black tracking-tight text-indigo-600">RenewalRadar</span>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">
          Sign in to your organization
        </h2>
        <p className="text-xs text-slate-500">
          Continuous contract, subscription, and deadline monitoring.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Business Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          {/* Quick Demo Credentials Assistant */}
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-indigo-950 uppercase tracking-wider text-[10px]">
                Presentation Demo Login
              </span>
              <button
                type="button"
                onClick={fillDemoCredentials}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline"
              >
                Auto-fill Demo Credentials
              </button>
            </div>
            <div className="font-mono text-slate-600 space-y-0.5 text-[11px]">
              <div>
                Email: <strong>ops@acmelogistics.com</strong>
              </div>
              <div>
                Password: <strong>Password123!</strong>
              </div>
              <div className="text-[10px] text-slate-400">
                Org: Acme Distribution Logistics (Owner)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
