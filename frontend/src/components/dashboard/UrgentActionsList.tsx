'use client';

import React from 'react';
import { UrgentActionItem, RiskLevel } from '@renewalradar/shared';

export interface UrgentActionsListProps {
  items?: UrgentActionItem[];
  isLoading?: boolean;
}

export const UrgentActionsList: React.FC<UrgentActionsListProps> = ({
  items = [],
  isLoading = false,
}) => {
  const getRiskBadge = (level: RiskLevel) => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'low':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const formatActionType = (type: string) => {
    switch (type) {
      case 'notice_deadline_approaching':
        return 'Cancellation Window Closing';
      case 'renewal_approaching':
        return 'Contract Renewal Approaching';
      case 'price_increase_detected':
        return 'Price Escalation Warning';
      case 'pending_verification':
        return 'Verification Required';
      default:
        return 'Action Required';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Urgent Actions Needed</h2>
          <p className="text-xs text-slate-500">
            Items requiring executive decision or cancellation notice
          </p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 bg-red-50 text-red-700 rounded-full border border-red-100">
          {items.length} {items.length === 1 ? 'Action' : 'Actions'}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl space-y-2 border border-dashed border-slate-200">
          <div className="text-2xl">🛡️</div>
          <p className="text-sm font-semibold text-slate-800">No urgent actions pending</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            All contracts and subscriptions are outside critical notice windows.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <div
              key={item.id}
              className="py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/50 transition-colors rounded-lg px-2"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getRiskBadge(
                      item.riskLevel,
                    )}`}
                  >
                    {item.riskLevel}
                  </span>
                  <span className="text-xs font-medium text-slate-600">
                    {formatActionType(item.actionType)}
                  </span>
                </div>

                <div className="text-sm font-semibold text-slate-900">
                  {item.title}
                  {item.vendor && (
                    <span className="text-xs text-slate-500 font-normal ml-1.5">
                      ({item.vendor})
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-500 flex items-center space-x-3">
                  <span>
                    Due: <strong className="font-mono text-slate-800">{item.dueDate}</strong>
                  </span>
                  <span>•</span>
                  <span
                    className={
                      item.daysRemaining <= 7 ? 'text-red-600 font-bold' : 'text-slate-600'
                    }
                  >
                    {item.daysRemaining < 0
                      ? `Overdue by ${Math.abs(item.daysRemaining)} days`
                      : item.daysRemaining === 0
                        ? 'Due today!'
                        : `${item.daysRemaining} days remaining`}
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-right hidden sm:block">
                  <span className="text-sm font-bold text-slate-900">
                    ${item.amount.toLocaleString()}
                  </span>
                  <span className="text-[11px] text-slate-400 block">{item.currency}</span>
                </div>

                <a
                  href="/obligations"
                  className="inline-flex items-center px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Inspect →
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
