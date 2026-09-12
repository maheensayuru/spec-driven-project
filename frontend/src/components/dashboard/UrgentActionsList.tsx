'use client';

import React from 'react';
import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react';
import { UrgentActionItem } from '@renewalradar/shared';
import { Badge } from '../ui/Badge';

export interface UrgentActionsListProps {
  items?: UrgentActionItem[];
  isLoading?: boolean;
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export const UrgentActionsList: React.FC<UrgentActionsListProps> = ({
  items = [],
  isLoading = false,
}) => {
  const formatActionType = (type: string) => {
    switch (type) {
      case 'notice_deadline_approaching':
        return 'Cancellation notice window is closing';
      case 'renewal_approaching':
        return 'Contract renewal is approaching';
      case 'price_increase_detected':
        return 'A price increase needs review';
      case 'pending_verification':
        return 'Contract details need verification';
      default:
        return 'This obligation needs review';
    }
  };

  const formatDeadline = (daysRemaining: number) => {
    if (daysRemaining < 0) {
      return `${Math.abs(daysRemaining)} ${Math.abs(daysRemaining) === 1 ? 'day' : 'days'} overdue`;
    }
    if (daysRemaining === 0) return 'Due today';
    return `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`;
  };

  return (
    <div className="surface h-full overflow-hidden border-t-4 border-t-red-700">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-red-50/40 px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-red-700" />
            <h2 className="section-heading">Priority attention</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Deadlines that may require a decision or cancellation notice.
          </p>
        </div>
        <Badge tone={items.length > 0 ? 'critical' : 'neutral'}>
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </Badge>
      </div>

      {isLoading ? (
        <div
          className="space-y-3 p-4 sm:p-5"
          aria-label="Loading priority actions"
          aria-busy="true"
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-md bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state m-4 sm:m-5">
          <p className="text-sm font-semibold text-slate-800">No urgent actions</p>
          <p className="mt-1 text-sm text-slate-500">
            No monitored obligations are currently inside an urgent action window.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-slate-200">
          {items.map((item) => (
            <li key={item.id} className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.riskLevel}>{item.riskLevel}</Badge>
                    <span className="text-xs font-medium text-slate-600">
                      {formatActionType(item.actionType)}
                    </span>
                  </div>

                  <h3 className="mt-2 text-sm font-semibold leading-5 text-slate-950">
                    {item.title}
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Vendor:{' '}
                    <span className="font-medium text-slate-800">
                      {item.vendor || 'Not recorded'}
                    </span>
                  </p>

                  <div className="mt-3 flex items-start gap-2 text-sm">
                    <CalendarClock
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"
                    />
                    <div>
                      <span className="text-slate-600">Action deadline </span>
                      <time className="font-semibold text-slate-900" dateTime={item.dueDate}>
                        {dateFormatter.format(new Date(`${item.dueDate}T00:00:00Z`))}
                      </time>
                      <span
                        className={`inline-block whitespace-nowrap font-semibold sm:ml-2 ${
                          item.daysRemaining <= 7 ? 'text-red-700' : 'text-amber-700'
                        }`}
                      >
                        {formatDeadline(item.daysRemaining)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-end justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="text-left sm:text-right">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Commitment
                    </p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-slate-950">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: item.currency,
                        maximumFractionDigits: 0,
                      }).format(item.amount)}
                    </p>
                  </div>
                  <a
                    href={`/obligations?inspect=${encodeURIComponent(item.obligationId)}`}
                    aria-label={`Inspect ${item.title} obligation`}
                    className="btn btn-secondary shrink-0"
                  >
                    Inspect
                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};
