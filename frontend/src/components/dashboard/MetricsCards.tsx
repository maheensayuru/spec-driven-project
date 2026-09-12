'use client';

import React from 'react';
import { DashboardMetricsResponse } from '@renewalradar/shared';

export interface MetricsCardsProps {
  metrics?: DashboardMetricsResponse | null;
  isLoading?: boolean;
  error?: string | null;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  metrics,
  isLoading = false,
  error = null,
}) => {
  if (isLoading) {
    return (
      <div
        className="surface grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden lg:grid-cols-4 lg:divide-y-0"
        aria-label="Loading dashboard metrics"
        aria-busy="true"
      >
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="min-h-28 animate-pulse p-4 sm:p-5">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="mt-4 h-7 w-20 rounded bg-slate-200" />
            <div className="mt-3 h-2.5 w-full max-w-32 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="feedback-error" role="alert">
        Dashboard metrics could not be loaded: {error}
      </div>
    );
  }

  const activeCount = metrics?.totalActiveObligations ?? 0;
  const committedSpend = metrics?.totalAnnualCommittedSpend ?? 0;
  const imminentRenewals = metrics?.imminentRenewalsCount ?? 0;
  const urgentCount = metrics?.urgentActions.length ?? 0;
  const currency = metrics?.reportingCurrency ?? 'USD';

  const cards = [
    {
      title: 'Active obligations',
      value: activeCount.toLocaleString(),
      subtitle: 'Contracts monitored',
      valueClass: 'text-slate-950',
    },
    {
      title: 'Upcoming renewals',
      value: imminentRenewals.toLocaleString(),
      subtitle: 'Within the next 30 days',
      valueClass: imminentRenewals > 0 ? 'text-amber-700' : 'text-slate-950',
    },
    {
      title: 'Urgent actions',
      value: urgentCount.toLocaleString(),
      subtitle: urgentCount > 0 ? 'Need review now' : 'No action required',
      valueClass: urgentCount > 0 ? 'text-red-700' : 'text-emerald-700',
    },
    {
      title: 'Annual committed spend',
      value: `${currency === 'USD' ? '$' : `${currency} `}${committedSpend.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        },
      )}`,
      subtitle: `Active vendors · ${currency}`,
      valueClass: 'text-[#173e48]',
    },
  ];

  return (
    <dl className="surface grid grid-cols-2 divide-x divide-y divide-slate-200 overflow-hidden lg:grid-cols-4 lg:divide-y-0">
      {cards.map((card) => (
        <div key={card.title} className="min-w-0 p-4 sm:p-5">
          <dt className="min-h-8 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600 lg:min-h-0">
            {card.title}
          </dt>
          <dd
            className={`mt-2 truncate text-2xl font-bold tabular-nums tracking-tight sm:text-3xl ${card.valueClass}`}
          >
            {card.value}
          </dd>
          <dd className="mt-1 text-xs leading-5 text-slate-500">{card.subtitle}</dd>
        </div>
      ))}
    </dl>
  );
};
