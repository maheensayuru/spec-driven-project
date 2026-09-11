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
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xl font-black tracking-tight text-indigo-600">
                RenewalRadar
              </span>
              <span className="px-2 py-0.5 text-xs font-semibold rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                B2B SaaS
              </span>
            </div>

            <nav className="flex items-center space-x-5">
              <a
                href="/dashboard"
                className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Dashboard
              </a>
              <a
                href="/obligations"
                className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Obligations
              </a>
              <a
                href="/settings/team"
                className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Team & Roles
              </a>
              <span className="text-xs text-slate-300">|</span>
              <NotificationDrawer />
              <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">
                Acme Logistics (Demo)
              </span>
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
