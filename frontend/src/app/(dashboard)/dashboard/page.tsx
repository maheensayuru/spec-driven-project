'use client';

import React, { useState, useEffect } from 'react';
import { ArrowRight, FlaskConical, RefreshCw, X } from 'lucide-react';
import { DashboardMetricsResponse, ObligationResponse } from '@renewalradar/shared';
import { MetricsCards } from '../../../components/dashboard/MetricsCards';
import { UrgentActionsList } from '../../../components/dashboard/UrgentActionsList';
import { DeadlineTimeline } from '../../../components/dashboard/DeadlineTimeline';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetricsResponse | null>(null);
  const [timelineObligations, setTimelineObligations] = useState<ObligationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sampleMetrics: DashboardMetricsResponse = {
        totalActiveObligations: 3,
        totalAnnualCommittedSpend: 90820,
        reportingCurrency: 'USD',
        imminentNoticeDeadlinesCount: 2,
        imminentRenewalsCount: 1,
        pendingVerificationDocumentsCount: 0,
        urgentActions: [
          {
            id: 'act-fleet-insurance',
            obligationId: 'obl-3',
            title: 'Fleet Commercial Auto & Liability Insurance',
            vendor: 'Travelers Commercial',
            actionType: 'notice_deadline_approaching',
            dueDate: '2026-09-16',
            daysRemaining: 5,
            riskLevel: 'critical',
            amount: 18500,
            currency: 'USD',
          },
          {
            id: 'act-google-workspace',
            obligationId: 'obl-1',
            title: 'Google Workspace Enterprise',
            vendor: 'Google LLC',
            actionType: 'notice_deadline_approaching',
            dueDate: '2026-10-16',
            daysRemaining: 35,
            riskLevel: 'medium',
            amount: 4320,
            currency: 'USD',
          },
        ],
        upcomingRenewalsTimeline: [],
        spendByCurrencyBreakdown: { USD: 90820 },
        spendByTypeBreakdown: {
          subscription: 4320,
          lease: 68000,
          insurance: 18500,
        },
      };

      const sampleTimeline: ObligationResponse[] = [
        {
          id: 'obl-3',
          organizationId: 'org-1',
          vendorId: null,
          title: 'Fleet Commercial Auto & Liability Insurance',
          type: 'insurance',
          status: 'active',
          amount: 18500,
          currency: 'USD',
          billingFrequency: 'annual',
          renewalDate: '2026-10-31',
          noticePeriodDays: 45,
          cancellationDeadline: '2026-09-16',
          autoRenew: true,
          riskLevel: 'critical',
          tags: ['compliance', 'vehicles'],
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'obl-1',
          organizationId: 'org-1',
          vendorId: null,
          title: 'Google Workspace Enterprise',
          type: 'subscription',
          status: 'active',
          amount: 4320,
          currency: 'USD',
          billingFrequency: 'annual',
          renewalDate: '2026-11-15',
          noticePeriodDays: 30,
          cancellationDeadline: '2026-10-16',
          autoRenew: true,
          riskLevel: 'medium',
          tags: ['saas', 'productivity'],
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'obl-2',
          organizationId: 'org-1',
          vendorId: null,
          title: 'Warehouse Commercial Lease (Building 4B)',
          type: 'lease',
          status: 'active',
          amount: 68000,
          currency: 'USD',
          billingFrequency: 'annual',
          renewalDate: '2027-04-30',
          noticePeriodDays: 90,
          cancellationDeadline: '2027-01-30',
          autoRenew: true,
          riskLevel: 'high',
          tags: ['facility', 'lease'],
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      setMetrics(sampleMetrics);
      setTimelineObligations(sampleTimeline);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch executive dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleManualScan = () => {
    setIsScanning(true);
    setScanNotice(null);
    setTimeout(() => {
      setScanNotice(
        'Demo result: 3 obligations evaluated, including 1 critical example. No alerts were created.',
      );
      setIsScanning(false);
    }, 400);
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
                Development-only controls for previewing the deadline scan experience. This does not
                create or persist alerts.
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
              {isScanning ? 'Running simulation…' : 'Trigger Scanner Demo'}
            </button>
          </div>

          {scanNotice && (
            <div
              className="feedback-success mt-4 flex items-start justify-between gap-3"
              role="status"
            >
              <span>{scanNotice}</span>
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
