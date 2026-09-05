import './globals.css';
import React from 'react';

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

            <nav className="flex items-center space-x-4">
              <a
                href="/obligations"
                className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                Obligations
              </a>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs font-medium text-slate-500">Acme Logistics (Demo)</span>
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
