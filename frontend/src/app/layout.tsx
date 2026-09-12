import './globals.css';
import React from 'react';
import { AppShell } from '../components/AppShell';

export const metadata = {
  title: 'RenewalRadar | Business Obligation & Contract Monitoring',
  description:
    'Continuous monitoring of subscriptions, contracts, licenses, and renewal deadlines.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
