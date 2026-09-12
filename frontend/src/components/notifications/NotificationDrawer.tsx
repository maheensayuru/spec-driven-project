'use client';

import React, { useId, useState } from 'react';
import { Bell, Check, ExternalLink, FlaskConical } from 'lucide-react';
import { RiskLevel } from '@renewalradar/shared';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';

export interface AlertItem {
  id: string;
  obligationId: string;
  obligationTitle: string;
  milestone: string;
  triggerDate: string;
  priority: RiskLevel;
  acknowledgedAt?: string | null;
  createdAt: string;
}

export interface NotificationDrawerProps {
  initialAlerts?: AlertItem[];
  onTriggerScan?: () => Promise<void>;
}

const severityOrder: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  initialAlerts,
  onTriggerScan,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>(
    initialAlerts ?? [
      {
        id: 'alt-1',
        obligationId: 'obl-3',
        obligationTitle: 'Commercial Fleet Insurance',
        milestone: '7_day',
        triggerDate: '2026-09-18',
        priority: 'critical',
        acknowledgedAt: null,
        createdAt: '2026-09-05T07:00:00Z',
      },
      {
        id: 'alt-2',
        obligationId: 'obl-1',
        obligationTitle: 'Google Workspace Enterprise',
        milestone: '30_day',
        triggerDate: '2026-09-16',
        priority: 'high',
        acknowledgedAt: null,
        createdAt: '2026-09-05T07:00:00Z',
      },
    ],
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const unreadStatusId = useId();

  const unreadCount = alerts.filter((alert) => !alert.acknowledgedAt).length;
  const sortedAlerts = [...alerts].sort((left, right) => {
    const severityDifference = severityOrder[left.priority] - severityOrder[right.priority];
    if (severityDifference !== 0) return severityDifference;
    return Number(Boolean(left.acknowledgedAt)) - Number(Boolean(right.acknowledgedAt));
  });

  const handleAcknowledge = (alertId: string) => {
    setAlerts((previous) =>
      previous.map((alert) =>
        alert.id === alertId ? { ...alert, acknowledgedAt: new Date().toISOString() } : alert,
      ),
    );
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    setScanFeedback(null);
    try {
      if (onTriggerScan) {
        await onTriggerScan();
      }
      setScanFeedback({
        tone: 'success',
        message: 'Demo scan completed. This preview does not persist scanner results.',
      });
    } catch {
      setScanFeedback({
        tone: 'error',
        message: 'The demo scanner could not complete. Please try again.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#173e48] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#173e48] focus-visible:ring-offset-2"
        aria-label="Notifications"
        aria-describedby={unreadStatusId}
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-bold leading-4 text-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <span id={unreadStatusId} className="sr-only" role="status" aria-live="polite">
        {unreadCount === 0 ? 'No unread notifications' : `${unreadCount} unread notifications`}
      </span>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Notifications"
        description={
          unreadCount === 0
            ? 'No unread deadline alerts'
            : `${unreadCount} unread deadline ${unreadCount === 1 ? 'alert' : 'alerts'}`
        }
        variant="drawer"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-slate-200 px-4 py-2 sm:px-5" aria-label="Severity order">
            <p className="text-xs text-slate-500">
              Ordered by severity: Critical, High, Medium, Low
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {sortedAlerts.length === 0 ? (
              <div className="empty-state mx-4 my-6 sm:mx-5">
                <Bell aria-hidden="true" className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-3 font-semibold text-slate-900">No deadline alerts</p>
                <p className="mt-1 text-sm text-slate-500">
                  New milestone alerts will appear here when they are available.
                </p>
              </div>
            ) : (
              <ol className="divide-y divide-slate-200">
                {sortedAlerts.map((item) => {
                  const isUnread = !item.acknowledgedAt;
                  return (
                    <li
                      key={item.id}
                      className={`relative px-4 py-4 sm:px-5 ${isUnread ? 'bg-slate-50' : 'bg-white'}`}
                    >
                      {isUnread && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-4 left-0 top-4 w-0.5 bg-[#173e48]"
                        />
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone={item.priority}>{item.priority}</Badge>
                        <span
                          className={`text-xs font-semibold ${
                            isUnread ? 'text-[#173e48]' : 'text-slate-500'
                          }`}
                        >
                          {isUnread ? 'Unread' : 'Read'}
                        </span>
                      </div>

                      <a
                        href={`/obligations?inspect=${encodeURIComponent(item.obligationId)}`}
                        className="mt-3 inline-flex items-start gap-1.5 text-sm font-semibold text-slate-900 hover:text-[#173e48] hover:underline"
                        onClick={() => setIsOpen(false)}
                      >
                        <span>{item.obligationTitle}</span>
                        <ExternalLink aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      </a>

                      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                        <dt className="font-medium text-slate-500">Milestone</dt>
                        <dd className="text-slate-700">{item.milestone.replaceAll('_', ' ')}</dd>
                        <dt className="font-medium text-slate-500">Trigger date</dt>
                        <dd className="text-slate-700">
                          <time dateTime={item.triggerDate}>
                            {dateFormatter.format(new Date(item.triggerDate))}
                          </time>
                        </dd>
                        <dt className="font-medium text-slate-500">Alerted</dt>
                        <dd className="text-slate-700">
                          <time dateTime={item.createdAt}>
                            {dateTimeFormatter.format(new Date(item.createdAt))}
                          </time>
                        </dd>
                        {item.acknowledgedAt && (
                          <>
                            <dt className="font-medium text-slate-500">Acknowledged</dt>
                            <dd className="text-slate-700">
                              <time dateTime={item.acknowledgedAt}>
                                {dateTimeFormatter.format(new Date(item.acknowledgedAt))}
                              </time>
                            </dd>
                          </>
                        )}
                      </dl>

                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => handleAcknowledge(item.id)}
                          className="btn btn-secondary mt-4 w-full sm:w-auto"
                        >
                          <Check aria-hidden="true" className="h-4 w-4" />
                          Mark as read
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {process.env.NODE_ENV === 'development' && (
            <footer className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
              <div className="mb-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  <FlaskConical aria-hidden="true" className="h-4 w-4" />
                  Demo tools
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Runs the configured demo callback. Results shown here are not persisted.
                </p>
              </div>
              <button
                type="button"
                onClick={handleManualScan}
                disabled={isScanning}
                className="btn btn-secondary w-full"
              >
                {isScanning ? 'Running demo…' : 'Trigger Scanner Demo'}
              </button>
              {scanFeedback && (
                <div
                  className={`mt-3 ${
                    scanFeedback.tone === 'success' ? 'feedback-success' : 'feedback-error'
                  }`}
                  role={scanFeedback.tone === 'error' ? 'alert' : 'status'}
                >
                  {scanFeedback.message}
                </div>
              )}
            </footer>
          )}
        </div>
      </Dialog>
    </>
  );
};
