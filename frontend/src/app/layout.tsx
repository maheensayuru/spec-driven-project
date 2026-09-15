import './globals.css';
import React from 'react';
import { AppShell } from '../components/AppShell';
import { SessionProvider } from '../components/SessionProvider';

export const metadata = {
  title: 'RenewalRadar | Business Obligation & Contract Monitoring',
  description:
    'Continuous monitoring of subscriptions, contracts, licenses, and renewal deadlines.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SessionProvider>
          <AppShell>{children}</AppShell>
        </SessionProvider>
      </body>
    </html>
  );
}
