'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, FlaskConical, RefreshCw, X } from 'lucide-react';
import { DashboardMetricsResponse, ObligationResponse } from '@renewalradar/shared';
import { MetricsCards } from '../../../components/dashboard/MetricsCards';
import { UrgentActionsList } from '../../../components/dashboard/UrgentActionsList';
import { DeadlineTimeline } from '../../../components/dashboard/DeadlineTimeline';
import { useSession } from '../../../components/SessionProvider';
import { apiRequest } from '../../../lib/api';
import { runNotificationScan } from '../../../lib/scanner';

interface ObligationListResponse {
  items: ObligationResponse[];
}

const fetchAllObligations = async (): Promise<ObligationResponse[]> => {
  const obligations: ObligationResponse[] = [];
  const limit = 100;

  for (let page = 1; ; page += 1) {
    const response = await apiRequest<ObligationListResponse>(
      `/obligations?page=${page}&limit=${limit}`,
    );
    obligations.push(...response.items);
    if (response.items.length < limit) return obligations;
  }
};

export default function DashboardPage() {
  const { session } = useSession();
  const organizationId = session?.organizationId;
  const activeOrganizationId = useRef(organizationId);
  activeOrganizationId.current = organizationId;
  const [metrics, setMetrics] = useState<DashboardMetricsResponse | null>(null);
  const [timelineObligations, setTimelineObligations] = useState<ObligationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<{
    tone: 'success' | 'error';
    message: string;
  } | null>(null);
  const dashboardRequestId = useRef(0);

  const fetchDashboardData = useCallback(async () => {
    if (!organizationId || activeOrganizationId.current !== organizationId) return;

    const requestId = ++dashboardRequestId.current;
    setIsLoading(true);
    setError(null);

    try {
      const [response, obligations] = await Promise.all([
        apiRequest<DashboardMetricsResponse>('/dashboard'),
        fetchAllObligations(),
      ]);
      if (requestId === dashboardRequestId.current) {
        setMetrics(response);
        setTimelineObligations(obligations);
      }
    } catch (err: unknown) {
      if (requestId === dashboardRequestId.current) {
        setMetrics(null);
        setTimelineObligations([]);
        setError(err instanceof Error ? err.message : 'Failed to fetch executive dashboard');
      }
    } finally {
      if (requestId === dashboardRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [organizationId]);

  useEffect(() => {
    setMetrics(null);
    setTimelineObligations([]);
    setScanNotice(null);
    void fetchDashboardData();

    return () => {
      dashboardRequestId.current += 1;
    };
  }, [fetchDashboardData]);

  const handleManualScan = async () => {
    setIsScanning(true);
    setScanNotice(null);
    const scanOrganizationId = organizationId;

    try {
      const result = await runNotificationScan();
      if (activeOrganizationId.current !== scanOrganizationId) return;
      setScanNotice({
        tone: 'success',
        message: `Scan complete: ${result.scanned} ${
          result.scanned === 1 ? 'obligation' : 'obligations'
        } scanned, ${result.alertsCreated} ${
          result.alertsCreated === 1 ? 'alert' : 'alerts'
        } created.`,
      });
      await fetchDashboardData();
    } catch (err: unknown) {
      if (activeOrganizationId.current === scanOrganizationId) {
        setScanNotice({
          tone: 'error',
          message: err instanceof Error ? err.message : 'The deadline scanner could not complete.',
        });
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-description">
            Review obligations that need attention and plan around upcoming notice deadlines.
          </p>
        </div>
        <a href="/obligations" className="btn btn-primary">
          Manage obligations
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </a>
      </header>

      <section aria-label="Portfolio overview">
        {error ? (
          <div
            className="feedback-error flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <div>
              <p className="font-semibold">Dashboard data could not be loaded</p>
              <p className="mt-0.5 text-sm">{error}</p>
            </div>
            <button
              type="button"
              onClick={fetchDashboardData}
              className="btn btn-secondary shrink-0"
            >
              <RefreshCw aria-hidden="true" className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : (
          <MetricsCards metrics={metrics} isLoading={isLoading} />
        )}
      </section>

      {!error && (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.85fr)]">
          <section aria-label="Priority actions">
            <UrgentActionsList items={metrics?.urgentActions} isLoading={isLoading} />
          </section>
          <section aria-label="Upcoming deadlines">
            <DeadlineTimeline obligations={timelineObligations} isLoading={isLoading} />
          </section>
        </div>
      )}

      {process.env.NODE_ENV !== 'production' && (
        <section className="surface border-dashed p-4 sm:p-5" aria-labelledby="demo-tools-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <FlaskConical aria-hidden="true" className="h-4 w-4 text-slate-500" />
                <h2 id="demo-tools-title" className="section-heading">
                  Demo Tools
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Run the persisted deadline scanner and refresh dashboard and notification data.
              </p>
            </div>
            <button
              type="button"
              onClick={handleManualScan}
              disabled={isScanning}
              className="btn btn-secondary shrink-0"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`}
              />
              {isScanning ? 'Running scanner…' : 'Trigger Scanner Demo'}
            </button>
          </div>

          {scanNotice && (
            <div
              className={`mt-4 flex items-start justify-between gap-3 ${
                scanNotice.tone === 'success' ? 'feedback-success' : 'feedback-error'
              }`}
              role={scanNotice.tone === 'error' ? 'alert' : 'status'}
            >
              <span>{scanNotice.message}</span>
              <button
                type="button"
                onClick={() => setScanNotice(null)}
                aria-label="Dismiss demo scan result"
                className="btn btn-ghost -mr-2 -mt-1 shrink-0 p-1.5"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
