'use client';

import React from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { ObligationResponse } from '@renewalradar/shared';
import { Badge } from '../ui/Badge';

export interface DeadlineTimelineProps {
  obligations?: ObligationResponse[];
  isLoading?: boolean;
}

interface GroupedMilestone {
  label: string;
  items: ObligationResponse[];
}

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone: 'UTC' });
const fullDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const formatDateParts = (value: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  return {
    month: monthFormatter.format(date),
    day: dayFormatter.format(date),
    full: fullDateFormatter.format(date),
  };
};

export const DeadlineTimeline: React.FC<DeadlineTimelineProps> = ({
  obligations = [],
  isLoading = false,
}) => {
  const groupedTimeline = React.useMemo<GroupedMilestone[]>(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const groups: Record<string, ObligationResponse[]> = {
      Today: [],
      'Next 7 days': [],
      'Next 30 days': [],
      Later: [],
    };

    for (const obligation of obligations) {
      const deadline = new Date(`${obligation.cancellationDeadline}T00:00:00Z`);
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        groups.Today!.push(obligation);
      } else if (diffDays <= 7) {
        groups['Next 7 days']!.push(obligation);
      } else if (diffDays <= 30) {
        groups['Next 30 days']!.push(obligation);
      } else {
        groups.Later!.push(obligation);
      }
    }

    return Object.entries(groups)
      .filter(([, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }, [obligations]);

  return (
    <div className="surface h-full overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="h-4 w-4 text-[#173e48]" />
          <h2 className="section-heading">Deadline timeline</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Cancellation notice dates, grouped by time remaining.
        </p>
      </div>

      {isLoading ? (
        <div
          className="space-y-4 p-4 sm:p-5"
          aria-label="Loading deadline timeline"
          aria-busy="true"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="h-14 w-14 animate-pulse rounded-md bg-slate-100" />
              <div className="h-14 flex-1 animate-pulse rounded-md bg-slate-100" />
            </div>
          ))}
        </div>
      ) : obligations.length === 0 ? (
        <div className="empty-state m-4 sm:m-5">
          <p className="text-sm font-semibold text-slate-800">No deadlines scheduled</p>
          <p className="mt-1 text-sm text-slate-500">
            Active obligations with notice deadlines will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6 p-4 sm:p-5">
          {groupedTimeline.map((group) => (
            <section
              key={group.label}
              aria-labelledby={`timeline-${group.label.replaceAll(' ', '-').toLowerCase()}`}
            >
              <div className="mb-3 flex items-center gap-3">
                <h3
                  id={`timeline-${group.label.replaceAll(' ', '-').toLowerCase()}`}
                  className="text-xs font-bold uppercase tracking-[0.08em] text-slate-700"
                >
                  {group.label}
                </h3>
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-xs tabular-nums text-slate-500">{group.items.length}</span>
              </div>

              <ol className="space-y-1">
                {group.items.map((item) => {
                  const deadline = formatDateParts(item.cancellationDeadline);
                  const renewal = formatDateParts(item.renewalDate);

                  return (
                    <li key={item.id} className="group grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3">
                      <time
                        dateTime={item.cancellationDeadline}
                        aria-label={`Notice deadline ${deadline.full}`}
                        className="relative flex h-14 flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-center"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {deadline.month}
                        </span>
                        <span className="text-lg font-bold leading-5 tabular-nums text-slate-900">
                          {deadline.day}
                        </span>
                      </time>

                      <div className="min-w-0 border-b border-slate-100 pb-4 group-last:border-b-0 group-last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h4 className="min-w-0 text-sm font-semibold leading-5 text-slate-900">
                            {item.title}
                          </h4>
                          <Badge tone={item.riskLevel}>{item.riskLevel}</Badge>
                        </div>
                        <p className="mt-1 text-[13px] text-slate-600">
                          <span className="capitalize">{item.type}</span>
                          <span aria-hidden="true"> · </span>
                          Notice deadline{' '}
                          <span className="font-medium text-slate-700">{deadline.full}</span>
                        </p>
                        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
                          <span className="text-slate-500">
                            Renews <time dateTime={item.renewalDate}>{renewal.full}</time>
                          </span>
                          <span className="font-semibold tabular-nums text-slate-800">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: item.currency,
                              maximumFractionDigits: 0,
                            }).format(item.amount)}
                            <span className="ml-1 font-normal capitalize text-slate-500">
                              {item.billingFrequency}
                            </span>
                          </span>
                          <a
                            href={`/obligations?inspect=${encodeURIComponent(item.id)}`}
                            aria-label={`Inspect ${item.title} obligation`}
                            className="inline-flex min-h-11 items-center gap-1 font-semibold text-[#173e48] hover:underline"
                          >
                            Inspect
                            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
