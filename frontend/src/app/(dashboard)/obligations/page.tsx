'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ObligationResponse, CreateObligationRequest } from '@renewalradar/shared';
import { ObligationForm } from '../../../components/obligations/ObligationForm';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { Search, Plus, Files, ArrowUpRight } from 'lucide-react';

export default function ObligationsPage() {
  const [obligations, setObligations] = useState<ObligationResponse[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [editingObligation, setEditingObligation] = useState<ObligationResponse | undefined>(
    undefined,
  );

  // Sample initial data loading
  useEffect(() => {
    async function loadObligations() {
      setIsLoading(true);
      setError(null);
      try {
        // In real app: const res = await fetch('/api/v1/obligations'); const data = await res.json();
        // Here we simulate loaded tenant obligations
        const sampleData: ObligationResponse[] = [
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
            tags: ['productivity', 'saas'],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'obl-2',
            organizationId: 'org-1',
            vendorId: null,
            title: 'Commercial Property Lease - Suite 400',
            type: 'lease',
            status: 'active',
            amount: 54000,
            currency: 'USD',
            billingFrequency: 'annual',
            renewalDate: '2027-04-30',
            noticePeriodDays: 90,
            cancellationDeadline: '2027-01-30',
            autoRenew: true,
            riskLevel: 'high',
            tags: ['facility'],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'obl-3',
            organizationId: 'org-1',
            vendorId: null,
            title: 'Commercial Fleet Insurance',
            type: 'insurance',
            status: 'active',
            amount: 18500,
            currency: 'USD',
            billingFrequency: 'annual',
            renewalDate: '2026-09-25',
            noticePeriodDays: 30,
            cancellationDeadline: '2026-08-26', // Overdue notice window
            autoRenew: true,
            riskLevel: 'critical',
            tags: ['insurance', 'compliance'],
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
        setObligations(sampleData);
        const inspectedId = new URLSearchParams(window.location.search).get('inspect');
        const inspected = sampleData.find((item) => item.id === inspectedId);
        if (inspected) {
          setEditingObligation(inspected);
          setIsFormOpen(true);
        } else if (new URLSearchParams(window.location.search).get('new') === 'true') {
          setIsFormOpen(true);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load obligations');
      } finally {
        setIsLoading(false);
      }
    }

    loadObligations();
  }, []);

  const filteredObligations = useMemo(() => {
    return obligations.filter((obl) => {
      const matchesSearch =
        searchQuery === '' ||
        obl.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obl.vendorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        obl.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType = selectedType === 'all' || obl.type === selectedType;
      const matchesStatus = selectedStatus === 'all' || obl.status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [obligations, searchQuery, selectedType, selectedStatus]);

  const handleCreateOrUpdate = async (data: CreateObligationRequest) => {
    if (editingObligation) {
      // Update existing
      setObligations((prev) =>
        prev.map((o) =>
          o.id === editingObligation.id
            ? {
                ...o,
                ...data,
                updatedAt: new Date().toISOString(),
                version: o.version + 1,
              }
            : o,
        ),
      );
    } else {
      // Create new
      const newObligation: ObligationResponse = {
        id: `obl-${Date.now()}`,
        organizationId: 'org-1',
        vendorId: null,
        title: data.title,
        type: data.type,
        status: 'active',
        amount: data.amount,
        currency: data.currency,
        billingFrequency: data.billingFrequency,
        startDate: data.startDate,
        renewalDate: data.renewalDate,
        expirationDate: data.expirationDate,
        noticePeriodDays: data.noticePeriodDays,
        cancellationDeadline: '2026-10-01', // computed by backend
        autoRenew: data.autoRenew,
        riskLevel: 'low',
        tags: data.tags,
        notes: data.notes,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setObligations((prev) => [newObligation, ...prev]);
    }

    setIsFormOpen(false);
    setEditingObligation(undefined);
  };

  const handleDelete = (id: string) => {
    if (
      typeof window !== 'undefined' &&
      window.confirm('Are you sure you want to archive and remove this obligation?')
    ) {
      setObligations((prev) => prev.filter((o) => o.id !== id));
    }
  };

  const hasFilters = !!searchQuery || selectedType !== 'all' || selectedStatus !== 'all';
  const clearFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedStatus('all');
  };
  const openCreate = () => {
    setEditingObligation(undefined);
    setIsFormOpen(true);
  };
  const openEdit = (item: ObligationResponse) => {
    setEditingObligation(item);
    setIsFormOpen(true);
  };
  const closeForm = () => {
    setIsFormOpen(false);
    setEditingObligation(undefined);
  };
  const money = (item: ObligationResponse) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: item.currency,
      maximumFractionDigits: 2,
    }).format(item.amount);
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(value))
      : 'Not set';

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[.14em] text-slate-500">
            Obligation register
          </p>
          <h1 className="page-title">Obligations</h1>
          <p className="page-description">
            Every commitment. Every deadline. One place to stay in control.
          </p>
        </div>
        <button onClick={openCreate} className="btn btn-primary shrink-0">
          <Plus size={16} aria-hidden="true" />
          Add Obligation
        </button>
      </div>

      <Dialog
        open={isFormOpen}
        onClose={closeForm}
        title={editingObligation ? 'Edit Obligation' : 'Add Obligation'}
        description="Record the agreement and the dates you need to act on."
      >
        <ObligationForm
          key={editingObligation?.id ?? 'new'}
          initialData={editingObligation}
          onSubmit={handleCreateOrUpdate}
          onCancel={closeForm}
        />
      </Dialog>

      <div className="surface overflow-hidden">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 border-b border-slate-200 p-4">
          <div className="relative flex-1">
            <Search size={17} aria-hidden="true" className="absolute left-3 top-3 text-slate-400" />
            <input
              type="search"
              aria-label="Search obligations"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title, vendor or tag…"
              className="field !pl-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select
              aria-label="Filter by type"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="field sm:!w-auto"
            >
              <option value="all">All types</option>
              {[
                'subscription',
                'contract',
                'license',
                'permit',
                'insurance',
                'warranty',
                'vendor_agreement',
                'lease',
                'other',
              ].map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ').replace(/^\w/, (s) => s.toUpperCase())}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="field sm:!w-auto"
            >
              <option value="all">All statuses</option>
              {['active', 'under_review', 'renewed', 'archived'].map((status) => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').replace(/^\w/, (s) => s.toUpperCase())}
                </option>
              ))}
            </select>
            {hasFilters && (
              <button onClick={clearFilters} className="btn btn-ghost col-span-2">
                Reset filters
              </button>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center gap-2 px-4 py-3 border-b border-slate-100 text-xs text-slate-500">
          <span role="status">
            {isLoading
              ? 'Loading register…'
              : `${filteredObligations.length} of ${obligations.length} obligations`}
          </span>
          <span className="hidden sm:inline">Amounts shown per billing period</span>
        </div>
        {isLoading ? (
          <div className="empty-state" role="status">
            <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#173e48]" />
            Loading obligations…
          </div>
        ) : error ? (
          <div className="m-5 feedback-error" role="alert">
            <p>{error}</p>
            <button className="btn btn-secondary mt-3" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        ) : filteredObligations.length === 0 ? (
          <div className="empty-state">
            <Files size={28} className="mx-auto mb-4 text-slate-400" aria-hidden="true" />
            <h2 className="section-heading">
              {hasFilters ? 'No matching obligations' : 'No obligations yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6">
              {hasFilters
                ? 'Try a different search or clear your filters to see the full register.'
                : 'Start with a contract, subscription, or policy. Keep its next deadline in view.'}
            </p>
            <button
              onClick={hasFilters ? clearFilters : openCreate}
              className="btn btn-secondary mt-5"
            >
              {hasFilters ? 'Reset filters' : 'Add Obligation'}
            </button>
          </div>
        ) : (
          <>
            <div className="hidden xl:block overflow-x-auto">
              <table className="data-table text-[13px]">
                <caption className="sr-only">
                  Obligation register with cancellation deadlines, renewals, financial amounts and
                  actions
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Obligation / Vendor</th>
                    <th scope="col">Notice deadline</th>
                    <th scope="col">Renewal</th>
                    <th scope="col" className="!text-right">
                      Amount
                    </th>
                    <th scope="col">Risk / Status</th>
                    <th scope="col" className="!text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredObligations.map((item) => (
                    <tr key={item.id}>
                      <td className="max-w-[270px]">
                        <button
                          onClick={() => openEdit(item)}
                          className="text-left font-medium text-slate-900 hover:underline underline-offset-4"
                        >
                          {item.title}
                        </button>
                        {item.vendorName && (
                          <p className="mt-1 text-xs text-slate-500">{item.vendorName}</p>
                        )}
                        <p className="mt-1 text-xs text-slate-500 capitalize">
                          {item.type.replace('_', ' ')}
                        </p>
                      </td>
                      <td className="whitespace-nowrap">
                        <p
                          className={`tabular-nums ${item.riskLevel === 'critical' ? 'text-red-800 font-medium' : 'text-slate-700'}`}
                        >
                          {date(item.cancellationDeadline)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.noticePeriodDays} days’ notice
                        </p>
                      </td>
                      <td className="tabular-nums whitespace-nowrap text-slate-600">
                        {date(item.renewalDate)}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <p className="font-medium tabular-nums">{money(item)}</p>
                        <p className="mt-1 text-xs text-slate-500 capitalize">
                          {item.billingFrequency.replace('_', ' ')}
                        </p>
                      </td>
                      <td>
                        <div className="flex flex-col items-start gap-1.5">
                          <Badge tone={item.riskLevel}>{item.riskLevel}</Badge>
                          <span className="text-xs text-slate-500 capitalize">
                            {item.status.replace('_', ' ')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col items-end">
                          <button
                            onClick={() => openEdit(item)}
                            className="btn btn-ghost !min-h-9 !px-2"
                            aria-label={`Edit ${item.title}`}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="btn btn-ghost !min-h-9 !px-2 !text-red-700"
                            aria-label={`Delete ${item.title}`}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="xl:hidden divide-y divide-slate-200">
              {filteredObligations.map((item) => (
                <article key={item.id} className="p-4 sm:p-5">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-left text-sm font-medium leading-6 text-slate-900 hover:underline"
                      >
                        {item.title}
                      </button>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.vendorName || item.type.replace('_', ' ')}
                      </p>
                    </div>
                    <Badge tone={item.riskLevel}>{item.riskLevel}</Badge>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">Notice deadline</dt>
                      <dd
                        className={`mt-1.5 tabular-nums font-medium ${item.riskLevel === 'critical' ? 'text-red-800' : ''}`}
                      >
                        {date(item.cancellationDeadline)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Renewal date</dt>
                      <dd className="mt-1.5 tabular-nums">{date(item.renewalDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 capitalize">
                        {item.billingFrequency.replace('_', ' ')} amount
                      </dt>
                      <dd className="mt-1.5 font-medium tabular-nums">{money(item)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Status</dt>
                      <dd className="mt-1.5 capitalize">{item.status.replace('_', ' ')}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 flex justify-between items-center">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="btn btn-ghost !text-red-700 !px-0"
                      aria-label={`Delete ${item.title}`}
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => openEdit(item)}
                      className="btn btn-secondary"
                      aria-label={`Edit ${item.title}`}
                    >
                      View & edit
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
