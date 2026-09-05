import React, { useState, useMemo } from 'react';
import {
  CreateObligationRequest,
  ObligationType,
  BillingFrequency,
  ObligationResponse,
} from '@renewalradar/shared';

export interface ObligationFormProps {
  initialData?: ObligationResponse;
  onSubmit: (data: CreateObligationRequest) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const ObligationForm: React.FC<ObligationFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
}) => {
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [type, setType] = useState<ObligationType>(initialData?.type ?? 'subscription');
  const [vendorName, setVendorName] = useState(initialData?.vendorName ?? '');
  const [amount, setAmount] = useState<string>(initialData ? String(initialData.amount) : '');
  const [currency, setCurrency] = useState(initialData?.currency ?? 'USD');
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>(
    initialData?.billingFrequency ?? 'annual',
  );
  const [startDate, setStartDate] = useState(initialData?.startDate ?? '');
  const [renewalDate, setRenewalDate] = useState(initialData?.renewalDate ?? '');
  const [expirationDate, setExpirationDate] = useState(initialData?.expirationDate ?? '');
  const [noticePeriodDays, setNoticePeriodDays] = useState<number>(
    initialData?.noticePeriodDays ?? 30,
  );
  const [autoRenew, setAutoRenew] = useState(initialData?.autoRenew ?? true);
  const [tags, setTags] = useState<string>(initialData?.tags?.join(', ') ?? '');
  const [notes, setNotes] = useState(initialData?.notes ?? '');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Live calculation of cancellation deadline (Formula: renewal_date - notice_period_days)
  const computedCancellationDeadline = useMemo<string | null>(() => {
    if (!renewalDate) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(renewalDate);
    if (!match) return null;

    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10) - 1;
    const day = parseInt(match[3]!, 10);

    const renewal = new Date(Date.UTC(year, month, day));
    if (isNaN(renewal.getTime())) return null;

    const days = Math.max(0, noticePeriodDays || 0);
    const deadline = new Date(renewal.getTime() - days * 24 * 60 * 60 * 1000);

    const outY = deadline.getUTCFullYear();
    const outM = String(deadline.getUTCMonth() + 1).padStart(2, '0');
    const outD = String(deadline.getUTCDate()).padStart(2, '0');

    return `${outY}-${outM}-${outD}`;
  }, [renewalDate, noticePeriodDays]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    } else if (title.trim().length < 2) {
      newErrors.title = 'Title must be at least 2 characters';
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      newErrors.amount = 'Valid positive amount is required';
    }

    if (!renewalDate) {
      newErrors.renewalDate = 'Renewal date is required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) {
      newErrors.renewalDate = 'Renewal date must be YYYY-MM-DD';
    }

    if (noticePeriodDays < 0 || noticePeriodDays > 365) {
      newErrors.noticePeriodDays = 'Notice period must be between 0 and 365 days';
    }

    if (startDate && renewalDate && startDate > renewalDate) {
      newErrors.startDate = 'Start date cannot be after renewal date';
    }

    if (renewalDate && expirationDate && renewalDate > expirationDate) {
      newErrors.expirationDate = 'Expiration date cannot be before renewal date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) {
      return;
    }

    const payload: CreateObligationRequest = {
      title: title.trim(),
      type,
      status: initialData?.status ?? 'active',
      vendorName: vendorName.trim() || undefined,
      amount: parseFloat(amount),
      currency,
      billingFrequency,
      startDate: startDate || undefined,
      renewalDate,
      expirationDate: expirationDate || undefined,
      noticePeriodDays,
      autoRenew,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    };

    try {
      await onSubmit(payload);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 max-w-4xl mx-auto space-y-6"
    >
      <div className="border-b border-slate-100 pb-4">
        <h2 className="text-xl font-bold text-slate-900">
          {initialData ? 'Edit Obligation' : 'Add New Business Obligation'}
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Record vendor agreements, subscriptions, or policies for continuous monitoring.
        </p>
      </div>

      {submitError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Obligation Title *
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Google Workspace Enterprise"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              errors.title
                ? 'border-red-500 focus:ring-red-200'
                : 'border-slate-300 focus:ring-indigo-100 focus:border-indigo-600'
            }`}
          />
          {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Vendor / Provider</label>
          <input
            type="text"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="e.g. Google LLC"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type *</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ObligationType)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          >
            <option value="subscription">Subscription</option>
            <option value="contract">Contract</option>
            <option value="license">License</option>
            <option value="permit">Permit</option>
            <option value="insurance">Insurance</option>
            <option value="warranty">Warranty</option>
            <option value="vendor_agreement">Vendor Agreement</option>
            <option value="lease">Lease</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Billing Frequency *
          </label>
          <select
            value={billingFrequency}
            onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
            <option value="biennial">Biennial (Every 2 years)</option>
            <option value="one_time">One Time</option>
          </select>
        </div>
      </div>

      {/* Financials */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 ${
              errors.amount
                ? 'border-red-500 focus:ring-red-200'
                : 'border-slate-300 focus:ring-indigo-100 focus:border-indigo-600'
            }`}
          />
          {errors.amount && <p className="text-xs text-red-600 mt-1">{errors.amount}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Currency *</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
          >
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GBP">GBP (£)</option>
            <option value="CAD">CAD ($)</option>
            <option value="AUD">AUD ($)</option>
          </select>
        </div>
      </div>

      {/* Key Dates & Live Calculated Cancellation Notice */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">Renewal Deadlines & Notice Windows</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Start Date (Optional)
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
            {errors.startDate && <p className="text-xs text-red-600 mt-1">{errors.startDate}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Renewal Date *</label>
            <input
              type="date"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm bg-white ${
                errors.renewalDate ? 'border-red-500' : 'border-slate-300'
              }`}
            />
            {errors.renewalDate && (
              <p className="text-xs text-red-600 mt-1">{errors.renewalDate}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Notice Period (Days) *
            </label>
            <input
              type="number"
              min="0"
              max="365"
              value={noticePeriodDays}
              onChange={(e) => setNoticePeriodDays(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
            />
            {errors.noticePeriodDays && (
              <p className="text-xs text-red-600 mt-1">{errors.noticePeriodDays}</p>
            )}
          </div>
        </div>

        {/* Highlighted Live Calculated Cancellation Window */}
        <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Calculated Cancellation Deadline
            </span>
            <p className="text-sm font-medium text-indigo-950 mt-0.5">
              {computedCancellationDeadline ? (
                <>
                  Must give notice by <strong>{computedCancellationDeadline}</strong>
                </>
              ) : (
                <span className="text-slate-500 italic">Enter renewal date and notice period</span>
              )}
            </p>
          </div>
          <span className="text-xs text-indigo-600 font-mono">
            {noticePeriodDays} days before renewal
          </span>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          <input
            type="checkbox"
            id="autoRenew"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
          />
          <label htmlFor="autoRenew" className="text-sm text-slate-700">
            This obligation automatically renews unless notice is given
          </label>
        </div>
      </div>

      {/* Tags & Notes */}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Tags (comma-separated)
          </label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="e.g. saas, sales, finance"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key clauses, account representative, contract number..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="px-6 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
        >
          {isLoading ? 'Saving...' : initialData ? 'Update Obligation' : 'Save & Track Obligation'}
        </button>
      </div>
    </form>
  );
};
