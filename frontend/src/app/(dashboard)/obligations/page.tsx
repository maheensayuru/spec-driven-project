'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  CreateObligationRequest,
  ObligationResponse,
  ObligationStatus,
  ObligationType,
  RiskLevel,
} from '@renewalradar/shared';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ObligationForm } from '../../../components/obligations/ObligationForm';
import { useSession } from '../../../components/SessionProvider';
import { apiRequest } from '../../../lib/api';
import { Badge } from '../../../components/ui/Badge';
import { Dialog } from '../../../components/ui/Dialog';
import { Search, Plus, Files, ArrowUpRight } from 'lucide-react';

const PAGE_SIZE = 20;
const OBLIGATION_TYPES: ObligationType[] = [
  'subscription',
  'contract',
  'license',
  'permit',
  'insurance',
  'warranty',
  'vendor_agreement',
  'lease',
  'other',
];
const OBLIGATION_STATUSES: ObligationStatus[] = [
  'draft',
  'active',
  'under_review',
  'notice_given',
  'renewed',
  'expired',
  'terminated',
  'archived',
];
const RISK_LEVELS: RiskLevel[] = ['critical', 'high', 'medium', 'low'];

interface ObligationListResponse {
  items: ObligationResponse[];
  page: number;
  limit: number;
}

function LoadingPage() {
  return (
    <div className="empty-state" role="status">
      <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#173e48]" />
      Loading obligations…
    </div>
  );
}

export default function ObligationsPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <ObligationsContent />
    </Suspense>
  );
}

function ObligationsContent() {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [obligations, setObligations] = useState<ObligationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | ObligationType>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | ObligationStatus>('all');
  const [selectedRisk, setSelectedRisk] = useState<'all' | RiskLevel>('all');
  const [upcomingDays, setUpcomingDays] = useState<'all' | '30' | '60' | '90'>('all');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingObligation, setEditingObligation] = useState<ObligationResponse | undefined>();
  const [isInspectLoading, setIsInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectRetryKey, setInspectRetryKey] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const listRequestRef = useRef(0);
  const inspectRequestRef = useRef(0);

  const role = session!.role;
  const canCreate = role !== 'viewer';
  const canUpdate = role !== 'viewer';
  const canDelete = role === 'owner' || role === 'admin';
  const queryString = searchParams.toString();
  const inspectedId = searchParams.get('inspect');
  const wantsNew = searchParams.get('new') === 'true';

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++listRequestRef.current;

    async function loadObligations() {
      setIsLoading(true);
      setError(null);
      const query = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) query.set('search', debouncedSearch);
      if (selectedType !== 'all') query.set('type', selectedType);
      if (selectedStatus !== 'all') query.set('status', selectedStatus);
      if (selectedRisk !== 'all') query.set('riskLevel', selectedRisk);
      if (upcomingDays !== 'all') query.set('upcomingDays', upcomingDays);

      try {
        const response = await apiRequest<ObligationListResponse>(
          `/obligations?${query.toString()}`,
          { signal: controller.signal },
        );
        if (requestId !== listRequestRef.current) return;
        if (response.items.length === 0 && page > 1) {
          setPage((current) => Math.max(1, current - 1));
          return;
        }
        setObligations(response.items);
      } catch (err: unknown) {
        if (controller.signal.aborted || requestId !== listRequestRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load obligations');
      } finally {
        if (!controller.signal.aborted && requestId === listRequestRef.current) {
          setIsLoading(false);
        }
      }
    }

    void loadObligations();
    return () => controller.abort();
  }, [debouncedSearch, page, reloadKey, selectedRisk, selectedStatus, selectedType, upcomingDays]);

  useEffect(() => {
    if (wantsNew && canCreate) {
      ++inspectRequestRef.current;
      setEditingObligation(undefined);
      setInspectError(null);
      setIsInspectLoading(false);
      setIsFormOpen(true);
      return;
    }
    if (!inspectedId) {
      ++inspectRequestRef.current;
      setIsFormOpen(false);
      setEditingObligation(undefined);
      setInspectError(null);
      setIsInspectLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = ++inspectRequestRef.current;
    setEditingObligation(undefined);
    setInspectError(null);
    setIsInspectLoading(true);
    setIsFormOpen(true);

    apiRequest<ObligationResponse>(`/obligations/${encodeURIComponent(inspectedId)}`, {
      signal: controller.signal,
    })
      .then((obligation) => {
        if (requestId === inspectRequestRef.current) setEditingObligation(obligation);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || requestId !== inspectRequestRef.current) return;
        setInspectError(err instanceof Error ? err.message : 'Failed to load obligation');
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === inspectRequestRef.current) {
          setIsInspectLoading(false);
        }
      });

    return () => controller.abort();
  }, [canCreate, inspectRetryKey, inspectedId, queryString, wantsNew]);

  const setDialogQuery = useCallback(
    (kind?: 'inspect' | 'new', id?: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('inspect');
      next.delete('new');
      if (kind === 'inspect' && id) next.set('inspect', id);
      if (kind === 'new') next.set('new', 'true');
      const suffix = next.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const refreshList = () => setReloadKey((current) => current + 1);

  const handleCreateOrUpdate = async (data: CreateObligationRequest) => {
    setIsSaving(true);
    setMutationError(null);
    try {
      if (editingObligation) {
        await apiRequest<ObligationResponse>(
          `/obligations/${encodeURIComponent(editingObligation.id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          },
        );
      } else {
        await apiRequest<ObligationResponse>('/obligations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      }
      setDialogQuery();
      if (!editingObligation && page !== 1) setPage(1);
      else refreshList();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: ObligationResponse) => {
    if (!window.confirm(`Archive and remove “${item.title}”?`)) return;
    setDeletingId(item.id);
    setMutationError(null);
    try {
      await apiRequest<void>(`/obligations/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      if (editingObligation?.id === item.id) setDialogQuery();
      refreshList();
    } catch (err: unknown) {
      setMutationError(err instanceof Error ? err.message : 'Failed to delete obligation');
    } finally {
      setDeletingId(null);
    }
  };

  const hasFilters =
    !!searchQuery ||
    selectedType !== 'all' ||
    selectedStatus !== 'all' ||
    selectedRisk !== 'all' ||
    upcomingDays !== 'all';
  const clearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedType('all');
    setSelectedStatus('all');
    setSelectedRisk('all');
    setUpcomingDays('all');
    setPage(1);
  };
  const openCreate = () => {
    if (canCreate) setDialogQuery('new');
  };
  const openEdit = (item: ObligationResponse) => setDialogQuery('inspect', item.id);
  const closeForm = () => setDialogQuery();
  const money = (item: ObligationResponse) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: item.currency,
      maximumFractionDigits: 2,
    }).format(Number(item.amount));
  const date = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`))
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
        {canCreate && (
          <button onClick={openCreate} className="btn btn-primary shrink-0">
            <Plus size={16} aria-hidden="true" />
            Add Obligation
          </button>
        )}
      </div>

      <Dialog
        open={isFormOpen}
        onClose={closeForm}
        title={
          editingObligation ? (canUpdate ? 'Edit Obligation' : 'View Obligation') : 'Add Obligation'
        }
        description="Record the agreement and the dates you need to act on."
      >
        {isInspectLoading ? (
          <LoadingPage />
        ) : inspectError ? (
          <div className="feedback-error" role="alert">
            <p>{inspectError}</p>
            <button
              type="button"
              className="btn btn-secondary mt-3"
              onClick={() => setInspectRetryKey((current) => current + 1)}
            >
              Try again
            </button>
          </div>
        ) : editingObligation || (wantsNew && canCreate) ? (
          <ObligationForm
            key={editingObligation ? `${editingObligation.id}-${editingObligation.version}` : 'new'}
            initialData={editingObligation}
            onSubmit={handleCreateOrUpdate}
            onCancel={closeForm}
            isLoading={isSaving}
            readOnly={!!editingObligation && !canUpdate}
          />
        ) : null}
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
              placeholder="Search titles…"
              className="field !pl-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select
              aria-label="Filter by type"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value as 'all' | ObligationType);
                setPage(1);
              }}
              className="field sm:!w-auto"
            >
              <option value="all">All types</option>
              {OBLIGATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ').replace(/^\w/, (s) => s.toUpperCase())}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by status"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as 'all' | ObligationStatus);
                setPage(1);
              }}
              className="field sm:!w-auto"
            >
              <option value="all">All statuses</option>
              {OBLIGATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace('_', ' ').replace(/^\w/, (s) => s.toUpperCase())}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by risk"
              value={selectedRisk}
              onChange={(e) => {
                setSelectedRisk(e.target.value as 'all' | RiskLevel);
                setPage(1);
              }}
              className="field sm:!w-auto"
            >
              <option value="all">All risk levels</option>
              {RISK_LEVELS.map((risk) => (
                <option key={risk} value={risk}>
                  {risk.replace(/^\w/, (letter) => letter.toUpperCase())}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by upcoming deadline"
              value={upcomingDays}
              onChange={(e) => {
                setUpcomingDays(e.target.value as 'all' | '30' | '60' | '90');
                setPage(1);
              }}
              className="field sm:!w-auto"
            >
              <option value="all">Any deadline</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
              <option value="90">Next 90 days</option>
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
              : `${obligations.length} obligation${obligations.length === 1 ? '' : 's'} on page ${page}`}
          </span>
          <span className="hidden sm:inline">Amounts shown per billing period</span>
        </div>
        {mutationError && (
          <div className="m-5 feedback-error" role="alert">
            {mutationError}
          </div>
        )}
        {isLoading ? (
          <div className="empty-state" role="status">
            <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#173e48]" />
            Loading obligations…
          </div>
        ) : error ? (
          <div className="m-5 feedback-error" role="alert">
            <p>{error}</p>
            <button className="btn btn-secondary mt-3" onClick={refreshList}>
              Try again
            </button>
          </div>
        ) : obligations.length === 0 ? (
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
            {(hasFilters || canCreate) && (
              <button
                onClick={hasFilters ? clearFilters : openCreate}
                className="btn btn-secondary mt-5"
              >
                {hasFilters ? 'Reset filters' : 'Add Obligation'}
              </button>
            )}
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
                  {obligations.map((item) => (
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
                            aria-label={`${canUpdate ? 'Edit' : 'View'} ${item.title}`}
                          >
                            {canUpdate ? 'Edit' : 'View'}
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => void handleDelete(item)}
                              disabled={deletingId === item.id}
                              className="btn btn-ghost !min-h-9 !px-2 !text-red-700"
                              aria-label={`Delete ${item.title}`}
                            >
                              {deletingId === item.id ? 'Deleting…' : 'Delete'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="xl:hidden divide-y divide-slate-200">
              {obligations.map((item) => (
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
                  <div
                    className={`mt-4 flex items-center ${canDelete ? 'justify-between' : 'justify-end'}`}
                  >
                    {canDelete && (
                      <button
                        onClick={() => void handleDelete(item)}
                        disabled={deletingId === item.id}
                        className="btn btn-ghost !text-red-700 !px-0"
                        aria-label={`Delete ${item.title}`}
                      >
                        {deletingId === item.id ? 'Deleting…' : 'Delete'}
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(item)}
                      className="btn btn-secondary"
                      aria-label={`${canUpdate ? 'Edit' : 'View'} ${item.title}`}
                    >
                      {canUpdate ? 'View & edit' : 'View details'}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <nav
              className="flex items-center justify-between gap-3 border-t border-slate-200 px-4 py-3"
              aria-label="Obligation pages"
            >
              <button
                type="button"
                className="btn btn-secondary"
                disabled={page === 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span className="text-sm tabular-nums text-slate-600">Page {page}</span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={obligations.length < PAGE_SIZE || isLoading}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </nav>
          </>
        )}
      </div>
    </div>
  );
}
