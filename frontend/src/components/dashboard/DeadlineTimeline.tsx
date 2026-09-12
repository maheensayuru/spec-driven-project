'use client';

import React from 'react';
import { ObligationResponse, RiskLevel } from '@renewalradar/shared';

export interface DeadlineTimelineProps {
  obligations?: ObligationResponse[];
  isLoading?: boolean;
}

interface GroupedMilestone {
  label: string;
  items: ObligationResponse[];
}

export const DeadlineTimeline: React.FC<DeadlineTimelineProps> = ({
  obligations = [],
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

  // Group obligations into Today, Next 7 Days, Next 30 Days, and Later
  const groupedTimeline = React.useMemo<GroupedMilestone[]>(() => {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const groups: Record<string, ObligationResponse[]> = {
      'Today / Imminent': [],
      'Next 7 Days': [],
      'Next 30 Days': [],
      Later: [],
    };

    for (const obl of obligations) {
      const deadline = new Date(obl.cancellationDeadline + 'T00:00:00Z');
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        groups['Today / Imminent']!.push(obl);
      } else if (diffDays <= 7) {
        groups['Next 7 Days']!.push(obl);
      } else if (diffDays <= 30) {
        groups['Next 30 Days']!.push(obl);
      } else {
        groups['Later']!.push(obl);
      }
    }

    return Object.entries(groups)
      .filter(([_, items]) => items.length > 0)
      .map(([label, items]) => ({ label, items }));
  }, [obligations]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Upcoming Deadline Timeline</h2>
          <p className="text-xs text-slate-500">
            Chronological agenda of renewal dates and notice windows
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : obligations.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl space-y-2 border border-dashed border-slate-200">
          <div className="text-2xl">📅</div>
          <p className="text-sm font-semibold text-slate-800">Timeline is clear</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No active obligations are currently recorded on the timeline.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedTimeline.map((group) => (
            <div key={group.label} className="space-y-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100">
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg bg-slate-50/25">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-white transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-slate-900">{item.title}</span>
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase border ${getRiskBadge(
                            item.riskLevel,
                          )}`}
                        >
                          {item.riskLevel}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center space-x-2">
                        <span className="capitalize">{item.type}</span>
                        <span>•</span>
                        <span>
                          Notice by:{' '}
                          <strong className="font-mono text-slate-700">
                            {item.cancellationDeadline}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Renewal: <span className="font-mono">{item.renewalDate}</span>
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900">
                        ${item.amount.toLocaleString()}
                      </span>
                      <span className="text-xs text-slate-400 block capitalize">
                        {item.billingFrequency}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
