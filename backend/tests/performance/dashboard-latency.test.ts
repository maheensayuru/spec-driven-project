import { describe, it, expect } from 'vitest';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service.js';
import {
  TenantContext,
  TenantObligationsContext,
  TenantAuditContext,
} from '../../src/db/connection.js';
import { Obligation } from '../../src/db/schema/obligations.js';

describe('Dashboard Latency & Aggregation Performance Benchmark (Task T039 & SC-006)', () => {
  const orgId = 'perf-org-1111-2222-3333-444444444444';
  const DATASET_SIZE = 500;
  const ITERATIONS = 20;

  // Generate 500 realistic deterministic obligations
  const dataset: Obligation[] = Array.from({ length: DATASET_SIZE }, (_, i) => {
    const types = ['contract', 'subscription', 'license', 'insurance', 'lease'] as const;
    const freqs = ['monthly', 'annual', 'quarterly'] as const;
    const type = types[i % types.length]!;
    const frequency = freqs[i % freqs.length]!;
    const daysOffset = (i % 365) + 1;

    // Deterministic dates
    const renewalDate = new Date(Date.UTC(2026, 8, 5) + daysOffset * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]!;
    const cancellationDeadline = new Date(
      Date.UTC(2026, 8, 5) + Math.max(1, daysOffset - 30) * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .split('T')[0]!;

    return {
      id: `obl-perf-${i}`,
      organizationId: orgId,
      vendorId: null,
      title: `Vendor Agreement #${i} - ${type}`,
      type,
      status: 'active',
      amount: String((100 + ((i * 37) % 10000)).toFixed(2)),
      currency: 'USD',
      billingFrequency: frequency,
      startDate: '2025-01-01',
      renewalDate,
      expirationDate: null,
      noticePeriodDays: 30,
      cancellationDeadline,
      autoRenew: i % 2 === 0,
      riskLevel: i % 10 === 0 ? 'critical' : i % 5 === 0 ? 'high' : 'low',
      internalOwnerId: i % 3 === 0 ? `owner-${i % 10}` : null,
      tags: ['perf', type],
      notes: null,
      version: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  const tenant: TenantContext = {
    organizationId: orgId,
    obligations: {
      async findById() {
        return null;
      },
      async list(limit = 1000, offset = 0) {
        return dataset.slice(offset, offset + limit);
      },
      async create() {
        throw new Error();
      },
      async update() {
        return null;
      },
      async softDelete() {
        return null;
      },
    },
    audit: {
      async record() {
        return {
          id: 'mock-audit',
          organizationId: orgId,
          actorId: null,
          entityType: 'test',
          entityId: 'test',
          action: 'test',
          beforeState: null,
          afterState: null,
          ipAddress: null,
          userAgent: null,
          createdAt: new Date(),
        };
      },
    },
  };

  it('aggregates 500 active obligations with p95 latency under 350 ms', async () => {
    // Warm-up run
    await DashboardService.aggregateDashboard(tenant, 'USD');

    const latencies: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      const metrics = await DashboardService.aggregateDashboard(tenant, 'USD');
      const elapsed = performance.now() - start;

      latencies.push(elapsed);

      // Verify calculation integrity
      expect(metrics.totalActiveObligations).toBe(500);
      expect(metrics.totalAnnualCommittedSpend).toBeGreaterThan(0);
      expect(metrics.urgentActions.length).toBeGreaterThan(0);
    }

    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(ITERATIONS * 0.5)]!;
    const p95 = latencies[Math.floor(ITERATIONS * 0.95)]!;

    console.log(
      `\n--- Dashboard Performance Benchmark (Dataset: ${DATASET_SIZE}, Iterations: ${ITERATIONS}) ---`,
    );
    console.log(`  Min:  ${latencies[0]!.toFixed(2)} ms`);
    console.log(`  p50:  ${p50.toFixed(2)} ms`);
    console.log(`  p95:  ${p95.toFixed(2)} ms`);
    console.log(`  Max:  ${latencies[latencies.length - 1]!.toFixed(2)} ms`);
    console.log(`  SLA Target: < 350.00 ms (Result: ${p95 < 350 ? 'PASS' : 'FAIL'})\n`);

    expect(p95).toBeLessThan(350);
  });
});
