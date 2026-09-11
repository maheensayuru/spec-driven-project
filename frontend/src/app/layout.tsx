import './globals.css';
import React from 'react';
import { NotificationDrawer } from '../components/notifications/NotificationDrawer';

export const metadata = {
  title: 'RenewalRadar | Business Obligation & Contract Monitoring',
  description:
    'Continuous monitoring of subscriptions, contracts, licenses, and renewal deadlines.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased overflow-x-hidden">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
              <span className="text-base sm:text-xl font-black tracking-tight text-indigo-600">
                RenewalRadar
              </span>
              <span className="hidden sm:inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                B2B SaaS
              </span>
            </div>

            <nav className="flex items-center space-x-2 sm:space-x-4 shrink-0">
              <a
                href="/dashboard"
                className="text-xs sm:text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Dashboard
              </a>
              <a
                href="/obligations"
                className="text-xs sm:text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Obligations
              </a>
              <a
                href="/settings/team"
                className="text-xs sm:text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Team
              </a>
              <NotificationDrawer />
              <span className="hidden md:inline-flex text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                Acme Logistics
              </span>
              <a
                href="/login"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors pl-1"
                title="Sign In / Demo Login"
              >
                Sign In
              </a>
            </nav>
          </div>
        </header>

        <main className="overflow-x-hidden">{children}</main>
      </body>
    </html>
  );
}
