'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ObligationResponse,
  ObligationType,
  ObligationStatus,
  CreateObligationRequest,
} from '@renewalradar/shared';
import { ObligationForm } from '../../../components/obligations/ObligationForm';

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

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Business Obligations
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Continuously monitor recurring vendor contracts, subscriptions, and renewal deadlines.
            </p>
          </div>

          <button
            onClick={() => {
              setEditingObligation(undefined);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
          >
            + Add Obligation
          </button>
        </div>

        {/* Modal / Inline Form */}
        {isFormOpen && (
          <div className="mb-6">
            <ObligationForm
              initialData={editingObligation}
              onSubmit={handleCreateOrUpdate}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingObligation(undefined);
              }}
            />
          </div>
        )}

        {/* Filters & Search Control Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="w-full md:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search obligations, vendors, tags..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700"
            >
              <option value="all">All Types</option>
              <option value="subscription">Subscription</option>
              <option value="contract">Contract</option>
              <option value="lease">Lease</option>
              <option value="insurance">Insurance</option>
              <option value="license">License</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-700"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="under_review">Under Review</option>
              <option value="renewed">Renewed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        {/* States & Content */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3" />
            Loading obligations...
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-center">
            {error}
          </div>
        ) : filteredObligations.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 space-y-3">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              📄
            </div>
            <h3 className="text-lg font-bold text-slate-900">No obligations found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              {searchQuery || selectedType !== 'all' || selectedStatus !== 'all'
                ? 'Try adjusting your search or filters.'
                : 'Get started by tracking your first vendor contract or software subscription.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Title & Vendor</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Annual / Frequency</th>
                    <th className="py-3 px-4">Notice Deadline</th>
                    <th className="py-3 px-4">Renewal Date</th>
                    <th className="py-3 px-4">Risk Level</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredObligations.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{item.title}</div>
                        {item.vendorName && (
                          <div className="text-xs text-slate-500">{item.vendorName}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600">{item.type}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-900">
                          ${item.amount.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-500 block capitalize">
                          {item.billingFrequency}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">
                          {item.cancellationDeadline}
                        </span>
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {item.noticePeriodDays}d notice
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">
                        {item.renewalDate}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                            item.riskLevel === 'critical'
                              ? 'bg-red-100 text-red-700'
                              : item.riskLevel === 'high'
                                ? 'bg-orange-100 text-orange-700'
                                : item.riskLevel === 'medium'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {item.riskLevel}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 capitalize">
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingObligation(item);
                            setIsFormOpen(true);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-900 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-xs text-red-600 hover:text-red-900 font-medium"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
