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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm animate-pulse space-y-3"
          >
            <div className="h-3 bg-slate-200 rounded w-1/2" />
            <div className="h-7 bg-slate-200 rounded w-3/4" />
            <div className="h-2 bg-slate-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
        Failed to load executive metrics: {error}
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
      title: 'Active Obligations',
      value: activeCount.toLocaleString(),
      subtitle: `${activeCount} monitored contracts`,
      tone: 'neutral',
    },
    {
      title: 'Upcoming Renewals',
      value: imminentRenewals.toLocaleString(),
      subtitle: 'Due within next 30 days',
      tone: imminentRenewals > 0 ? 'amber' : 'neutral',
    },
    {
      title: 'Urgent Action Items',
      value: urgentCount.toLocaleString(),
      subtitle: urgentCount > 0 ? 'Requires executive review' : 'All obligations clear',
      tone: urgentCount > 0 ? 'red' : 'green',
    },
    {
      title: 'Annual Committed Spend',
      value: `${currency === 'USD' ? '$' : currency + ' '}${committedSpend.toLocaleString(
        undefined,
        {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        },
      )}`,
      subtitle: 'Across all active vendors',
      tone: 'indigo',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm space-y-1 hover:border-slate-300 transition-colors"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {card.title}
          </div>
          <div
            className={`text-2xl font-extrabold tracking-tight ${
              card.tone === 'red'
                ? 'text-red-600'
                : card.tone === 'amber'
                  ? 'text-amber-600'
                  : card.tone === 'indigo'
                    ? 'text-indigo-600'
                    : card.tone === 'green'
                      ? 'text-emerald-600'
                      : 'text-slate-900'
            }`}
          >
            {card.value}
          </div>
          <div className="text-xs text-slate-500">{card.subtitle}</div>
        </div>
      ))}
    </div>
  );
};
