'use client';

import React, { useMemo, useRef, useState } from 'react';
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
  readOnly?: boolean;
}

export const ObligationForm: React.FC<ObligationFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  readOnly = false,
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
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submissionLockRef = useRef(false);

  // Formula: renewal_date - notice_period_days. UTC keeps the date stable across time zones.
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

  const validate = (): Record<string, string> => {
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
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly || submissionLockRef.current || isLoading) return;

    setSubmitError(null);
    const validationErrors = validate();

    if (Object.keys(validationErrors).length > 0) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
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
        .map((tag) => tag.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
    };

    submissionLockRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      submissionLockRef.current = false;
      setSubmitting(false);
    }
  };

  const isSubmitting = isLoading || submitting;

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-6">
      {submitError && (
        <div role="alert" className="feedback-error rounded-md border border-red-200 bg-red-50 p-3">
          {submitError}
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-4">
        <legend className="section-heading">Basic information</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="obligation-title" className="field-label">
              Obligation title <span aria-hidden="true">*</span>
            </label>
            <input
              id="obligation-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Google Workspace Enterprise"
              required
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? 'obligation-title-error' : undefined}
              className="field"
            />
            {errors.title && (
              <p id="obligation-title-error" className="feedback-error mt-1">
                {errors.title}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="obligation-vendorName" className="field-label">
              Vendor / provider
            </label>
            <input
              id="obligation-vendorName"
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g. Google LLC"
              className="field"
            />
          </div>

          <div>
            <label htmlFor="obligation-type" className="field-label">
              Type <span aria-hidden="true">*</span>
            </label>
            <select
              id="obligation-type"
              value={type}
              onChange={(e) => setType(e.target.value as ObligationType)}
              required
              className="field"
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
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="space-y-4 border-t border-slate-200 pt-5">
        <legend className="section-heading">Financial details</legend>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="obligation-amount" className="field-label">
              Amount <span aria-hidden="true">*</span>
            </label>
            <input
              id="obligation-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={errors.amount ? 'obligation-amount-error' : undefined}
              className="field"
            />
            {errors.amount && (
              <p id="obligation-amount-error" className="feedback-error mt-1">
                {errors.amount}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="obligation-currency" className="field-label">
              Currency <span aria-hidden="true">*</span>
            </label>
            <select
              id="obligation-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              required
              className="field"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="CAD">CAD ($)</option>
              <option value="AUD">AUD ($)</option>
            </select>
          </div>

          <div>
            <label htmlFor="obligation-billingFrequency" className="field-label">
              Billing frequency <span aria-hidden="true">*</span>
            </label>
            <select
              id="obligation-billingFrequency"
              value={billingFrequency}
              onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
              required
              className="field"
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="biennial">Biennial (Every 2 years)</option>
              <option value="one_time">One Time</option>
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="space-y-4 border-t border-slate-200 pt-5">
        <legend className="section-heading">Dates &amp; notice</legend>
        <div className="mt-3 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <label htmlFor="obligation-startDate" className="field-label">
              Start date <span className="muted">(optional)</span>
            </label>
            <input
              id="obligation-startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-invalid={errors.startDate ? true : undefined}
              aria-describedby={errors.startDate ? 'obligation-startDate-error' : undefined}
              className="field min-w-0 max-w-full"
            />
            {errors.startDate && (
              <p id="obligation-startDate-error" className="feedback-error mt-1">
                {errors.startDate}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <label htmlFor="obligation-renewalDate" className="field-label">
              Renewal date <span aria-hidden="true">*</span>
            </label>
            <input
              id="obligation-renewalDate"
              type="date"
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
              required
              aria-invalid={errors.renewalDate ? true : undefined}
              aria-describedby={errors.renewalDate ? 'obligation-renewalDate-error' : undefined}
              className="field min-w-0 max-w-full"
            />
            {errors.renewalDate && (
              <p id="obligation-renewalDate-error" className="feedback-error mt-1">
                {errors.renewalDate}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <label htmlFor="obligation-expirationDate" className="field-label">
              Expiration date <span className="muted">(optional)</span>
            </label>
            <input
              id="obligation-expirationDate"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              aria-invalid={errors.expirationDate ? true : undefined}
              aria-describedby={
                errors.expirationDate ? 'obligation-expirationDate-error' : undefined
              }
              className="field min-w-0 max-w-full"
            />
            {errors.expirationDate && (
              <p id="obligation-expirationDate-error" className="feedback-error mt-1">
                {errors.expirationDate}
              </p>
            )}
          </div>

          <div className="min-w-0">
            <label htmlFor="obligation-noticePeriodDays" className="field-label">
              Notice period (days) <span aria-hidden="true">*</span>
            </label>
            <input
              id="obligation-noticePeriodDays"
              type="number"
              min="0"
              max="365"
              value={noticePeriodDays}
              onChange={(e) => setNoticePeriodDays(parseInt(e.target.value, 10) || 0)}
              required
              aria-invalid={errors.noticePeriodDays ? true : undefined}
              aria-describedby={
                errors.noticePeriodDays ? 'obligation-noticePeriodDays-error' : undefined
              }
              className="field"
            />
            {errors.noticePeriodDays && (
              <p id="obligation-noticePeriodDays-error" className="feedback-error mt-1">
                {errors.noticePeriodDays}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[#173e48]/20 bg-[#173e48]/[0.04] p-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#173e48]">
                Calculated cancellation deadline
              </p>
              <p className="mt-0.5 text-sm text-slate-700" aria-live="polite">
                {computedCancellationDeadline ? (
                  <>
                    Give notice by{' '}
                    <strong className="font-semibold text-slate-950">
                      {computedCancellationDeadline}
                    </strong>
                  </>
                ) : (
                  <span className="muted">Enter a renewal date and notice period</span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">
              {noticePeriodDays} days before renewal
            </span>
          </div>
        </div>
      </fieldset>

      <fieldset disabled={readOnly} className="space-y-4 border-t border-slate-200 pt-5">
        <legend className="section-heading">Renewal settings &amp; notes</legend>
        <div className="mt-3 flex items-start gap-2">
          <input
            id="obligation-autoRenew"
            type="checkbox"
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#173e48] focus:ring-[#173e48]"
          />
          <label htmlFor="obligation-autoRenew" className="text-sm text-slate-700">
            This obligation automatically renews unless notice is given
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="obligation-tags" className="field-label">
              Tags
            </label>
            <input
              id="obligation-tags"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. saas, sales, finance"
              aria-describedby="obligation-tags-hint"
              className="field"
            />
            <p id="obligation-tags-hint" className="muted mt-1 text-xs">
              Separate tags with commas.
            </p>
          </div>

          <div>
            <label htmlFor="obligation-notes" className="field-label">
              Notes
            </label>
            <textarea
              id="obligation-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Key clauses, account representative, contract number..."
              className="field resize-y"
            />
          </div>
        </div>
      </fieldset>

      <div className="form-actions flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="btn btn-secondary"
          >
            {readOnly ? 'Close' : 'Cancel'}
          </button>
        )}
        {!readOnly && (
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting ? 'Saving...' : initialData ? 'Update obligation' : 'Save obligation'}
          </button>
        )}
      </div>
    </form>
  );
};
