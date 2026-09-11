'use client';

import React, { useState, useEffect } from 'react';
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

  // Load dashboard metrics and obligations
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
        'Scanner completed: 3 obligations analyzed. 1 critical alert confirmed. 0 duplicate alerts created.',
      );
      setIsScanning(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Executive Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Executive Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Live Monitoring Active
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Real-time awareness of upcoming contract renewal dates, cancellation notice windows,
              and exposed spend.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleManualScan}
              disabled={isScanning}
              className="inline-flex items-center px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
            >
              {isScanning ? 'Scanning Deadlines...' : '⚡ Trigger Scanner Demo'}
            </button>
            <a
              href="/obligations"
              className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              + Manage Obligations
            </a>
          </div>
        </div>

        {scanNotice && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-900 flex items-center justify-between">
            <span>✓ {scanNotice}</span>
            <button onClick={() => setScanNotice(null)} className="text-emerald-700 font-bold ml-4">
              ✕
            </button>
          </div>
        )}

        {/* Section 1: KPI Summary Cards */}
        <section className="space-y-2">
          <MetricsCards metrics={metrics} isLoading={isLoading} error={error} />
        </section>

        {/* Section 2: Split Grid: Urgent Actions & Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section>
            <UrgentActionsList items={metrics?.urgentActions} isLoading={isLoading} />
          </section>

          <section>
            <DeadlineTimeline obligations={timelineObligations} isLoading={isLoading} />
          </section>
        </div>
      </div>
    </div>
  );
}
