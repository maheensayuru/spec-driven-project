'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Files, Users, Radar, ArrowUpRight, Building2 } from 'lucide-react';
import { NotificationDrawer } from './notifications/NotificationDrawer';
import { useSession } from './SessionProvider';
import { apiRequest } from '../lib/api';

const navigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/obligations', label: 'Obligations', icon: Files },
  { href: '/settings/team', label: 'Team & Roles', icon: Users },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isLoading, error, retry } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
      router.replace('/login');
    } catch (failure: unknown) {
      setSignOutError(failure instanceof Error ? failure.message : 'Unable to sign out.');
    } finally {
      setSigningOut(false);
    }
  };
  if (pathname === '/login' || pathname === '/invite/accept')
    return <main id="main-content">{children}</main>;
  if (isLoading)
    return (
      <main className="empty-state" role="status">
        Verifying your workspace session…
      </main>
    );
  if (error)
    return (
      <main className="mx-auto mt-16 max-w-lg p-5">
        <div className="feedback-error" role="alert">
          {error}
        </div>
        <button className="btn btn-secondary mt-4" onClick={retry}>
          Try again
        </button>
      </main>
    );
  if (!session) return null;
  const current = navigation.find((item) => pathname.startsWith(item.href));
  return (
    <div className="min-h-screen lg:pl-[216px]">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[216px] flex-col border-r border-slate-200 bg-[#f0f3f4] px-4 py-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 px-2 text-[17px] font-semibold tracking-tight text-[#173e48]"
        >
          <Radar size={24} strokeWidth={1.8} aria-hidden="true" />
          RenewalRadar
        </Link>
        <div className="mt-9 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
          Workspace
        </div>
        <nav aria-label="Main navigation" className="mt-3 space-y-1">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={current?.href === href ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors ${current?.href === href ? 'bg-white text-[#173e48] shadow-xs ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-200 pt-4 px-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white border border-slate-200 text-slate-600">
              <Building2 size={16} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium">Organization workspace</p>
              <p className="text-[11px] text-slate-500 mt-0.5 capitalize">{session.role} access</p>
            </div>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-4 flex w-full items-center justify-between py-2 text-xs text-slate-600 hover:text-slate-900"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <header className="border-b border-slate-200 bg-white">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-7 lg:px-9">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-[#173e48] lg:hidden"
          >
            <Radar size={23} aria-hidden="true" />
            RenewalRadar
          </Link>
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500">
            Workspace<span className="text-slate-300">/</span>
            <span className="text-slate-800">{current?.label ?? 'Overview'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className="hidden sm:block max-w-64 truncate text-xs text-slate-500"
              title={session.email}
            >
              {session.email}
            </span>
            <NotificationDrawer />
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
              title={`Sign out ${session.email}`}
              className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600"
            >
              {session.email.slice(0, 2).toUpperCase()}
            </button>
          </div>
        </div>
        <nav
          aria-label="Mobile navigation"
          className="grid grid-cols-3 gap-1 border-t border-slate-100 px-3 lg:hidden"
        >
          {navigation.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={current?.href === href ? 'page' : undefined}
              className={`border-b-2 py-3 text-center text-xs font-medium ${current?.href === href ? 'border-[#173e48] text-[#173e48]' : 'border-transparent text-slate-600'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 sm:py-8 lg:px-9 lg:py-9"
      >
        {signOutError && (
          <div className="feedback-error mb-4" role="alert">
            {signOutError}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
