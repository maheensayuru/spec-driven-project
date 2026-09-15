'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Bell, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { ObligationResponse, RiskLevel } from '@renewalradar/shared';
import { Badge } from '../ui/Badge';
import { Dialog } from '../ui/Dialog';
import { useSession } from '../SessionProvider';
import { ApiError, apiRequest } from '../../lib/api';
import { runNotificationScan } from '../../lib/scanner';

export interface AlertItem {
  id: string;
  obligationId: string;
  obligationTitle: string;
  obligationAvailable: boolean;
  milestone: string;
  triggerDate: string;
  priority: RiskLevel;
  acknowledgedAt?: string | null;
  createdAt: string;
}

interface NotificationRecord {
  id: string;
  obligationId: string;
  milestone: string;
  triggerDate: string;
  priority: RiskLevel;
  acknowledgedAt?: string | null;
  createdAt: string;
}

interface NotificationListResponse {
  items: NotificationRecord[];
  unreadCount: number;
  total: number;
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

export const NotificationDrawer: React.FC = () => {
  const { session } = useSession();
  const organizationId = session?.organizationId;
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loadedOrganizationId, setLoadedOrganizationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const alertsRequestId = useRef(0);
  const unreadStatusId = useId();
  const [isScanning, setIsScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ error: boolean; message: string } | null>(
    null,
  );

  const fetchAlerts = useCallback(async () => {
    if (!organizationId) return;

    const requestId = ++alertsRequestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiRequest<NotificationListResponse>('/notifications');
      const obligationIds = [...new Set(response.items.map((alert) => alert.obligationId))];
      const titleEntries = await Promise.all(
        obligationIds.map(async (obligationId) => {
          try {
            const obligation = await apiRequest<ObligationResponse>(
              `/obligations/${encodeURIComponent(obligationId)}`,
            );
            return [obligationId, { title: obligation.title, available: true }] as const;
          } catch (err: unknown) {
            if (err instanceof ApiError && err.status === 404) {
              return [obligationId, { title: 'Obligation unavailable', available: false }] as const;
            }
            throw err;
          }
        }),
      );
      const obligationTitles = new Map<string, { title: string; available: boolean }>(titleEntries);

      if (requestId === alertsRequestId.current) {
        setAlerts(
          response.items.map((alert) => {
            const obligation = obligationTitles.get(alert.obligationId);
            return {
              ...alert,
              obligationTitle: obligation?.title ?? 'Obligation unavailable',
              obligationAvailable: obligation?.available ?? false,
            };
          }),
        );
        setLoadedOrganizationId(organizationId);
      }
    } catch (err: unknown) {
      if (requestId === alertsRequestId.current) {
        setAlerts([]);
        setLoadedOrganizationId(organizationId);
        setError(err instanceof Error ? err.message : 'Notifications could not be loaded.');
      }
    } finally {
      if (requestId === alertsRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [organizationId]);

  useEffect(() => {
    alertsRequestId.current += 1;
    setAlerts([]);
    setLoadedOrganizationId(null);
    setError(null);
    setScanFeedback(null);

    if (organizationId) {
      void fetchAlerts();
    }

    return () => {
      alertsRequestId.current += 1;
    };
  }, [fetchAlerts, organizationId]);

  useEffect(() => {
    const handleNotificationsChanged = () => {
      void fetchAlerts();
    };
    window.addEventListener('renewalradar:notifications-changed', handleNotificationsChanged);
    return () => {
      window.removeEventListener('renewalradar:notifications-changed', handleNotificationsChanged);
    };
  }, [fetchAlerts]);

  const visibleAlerts = loadedOrganizationId === organizationId ? alerts : [];
  const unreadCount = visibleAlerts.filter((alert) => !alert.acknowledgedAt).length;
  const sortedAlerts = [...visibleAlerts].sort((left, right) => {
    const severityDifference = severityOrder[left.priority] - severityOrder[right.priority];
    if (severityDifference !== 0) return severityDifference;
    return Number(Boolean(left.acknowledgedAt)) - Number(Boolean(right.acknowledgedAt));
  });

  const handleOpen = () => {
    setIsOpen(true);
    void fetchAlerts();
  };

  const handleAcknowledge = async (alertId: string) => {
    setAcknowledgingId(alertId);
    setError(null);
    try {
      await apiRequest<{ success: true }>(
        `/notifications/${encodeURIComponent(alertId)}/acknowledge`,
        { method: 'POST' },
      );
      await fetchAlerts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'The alert could not be acknowledged.');
    } finally {
      setAcknowledgingId(null);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanFeedback(null);
    try {
      const result = await runNotificationScan();
      setScanFeedback({
        error: false,
        message: `Scan complete: ${result.scanned} obligations scanned, ${result.alertsCreated} alerts created.`,
      });
    } catch (failure: unknown) {
      setScanFeedback({
        error: true,
        message:
          failure instanceof Error ? failure.message : 'The deadline scanner could not complete.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
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

          {error && (
            <div
              className="feedback-error m-4 flex items-center justify-between gap-3"
              role="alert"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void fetchAlerts()}
                className="btn btn-secondary"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                Retry
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && sortedAlerts.length === 0 ? (
              <div
                className="space-y-3 p-4 sm:p-5"
                aria-label="Loading notifications"
                aria-busy="true"
              >
                {[1, 2, 3].map((item) => (
                  <div key={item} className="h-28 animate-pulse rounded-md bg-slate-100" />
                ))}
              </div>
            ) : error && sortedAlerts.length === 0 ? null : sortedAlerts.length === 0 ? (
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

                      {item.obligationAvailable ? (
                        <a
                          href={`/obligations?inspect=${encodeURIComponent(item.obligationId)}`}
                          className="mt-3 inline-flex items-start gap-1.5 text-sm font-semibold text-slate-900 hover:text-[#173e48] hover:underline"
                          onClick={() => setIsOpen(false)}
                        >
                          <span>{item.obligationTitle}</span>
                          <ExternalLink
                            aria-hidden="true"
                            className="mt-0.5 h-3.5 w-3.5 shrink-0"
                          />
                        </a>
                      ) : (
                        <p className="mt-3 text-sm font-semibold text-slate-500">
                          {item.obligationTitle}
                        </p>
                      )}

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
                          onClick={() => void handleAcknowledge(item.id)}
                          disabled={acknowledgingId === item.id}
                          className="btn btn-secondary mt-4 w-full sm:w-auto"
                        >
                          <Check aria-hidden="true" className="h-4 w-4" />
                          {acknowledgingId === item.id ? 'Marking as read…' : 'Mark as read'}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <section className="border-t border-slate-200 bg-slate-50 p-5" aria-label="Demo tools">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                Demo Tools
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Development-only scanner. Evaluates real obligations and saves alerts.
              </p>
              <button
                type="button"
                onClick={handleScan}
                disabled={isScanning}
                className="btn btn-secondary mt-3 w-full"
              >
                {isScanning ? 'Scanning deadlines…' : 'Trigger Scanner Demo'}
              </button>
              {scanFeedback && (
                <div
                  className={`${scanFeedback.error ? 'feedback-error' : 'feedback-success'} mt-3`}
                  role={scanFeedback.error ? 'alert' : 'status'}
                >
                  {scanFeedback.message}
                </div>
              )}
            </section>
          )}
        </div>
      </Dialog>
    </>
  );
};
