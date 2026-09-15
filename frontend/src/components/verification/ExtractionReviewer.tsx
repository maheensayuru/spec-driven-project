'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  X,
  ExternalLink,
  FileText,
  FileQuestion,
  RefreshCw,
  Sparkles,
  Lock,
} from 'lucide-react';
import type {
  ExtractionStagingDetail,
  ExtractedFieldItem,
  ExtractableFieldName,
  ObligationType,
  BillingFrequency,
  ConfirmExtractionRequest,
} from '@renewalradar/shared';
import { confirmExtraction, rejectExtraction, ApiError } from '../../lib/api';
import { Dialog } from '../ui/Dialog';

export interface ExtractionReviewerProps {
  staging: ExtractionStagingDetail;
  readOnly?: boolean;
  onReset?: () => void;
}

const OBLIGATION_TYPES: { value: ObligationType; label: string }[] = [
  { value: 'contract', label: 'Contract' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'license', label: 'License' },
  { value: 'permit', label: 'Permit' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'vendor_agreement', label: 'Vendor Agreement' },
  { value: 'lease', label: 'Lease' },
  { value: 'other', label: 'Other' },
];

const BILLING_FREQUENCIES: { value: BillingFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'biennial', label: 'Biennial' },
  { value: 'one_time', label: 'One Time' },
];

export function ExtractionReviewer({
  staging,
  readOnly = false,
  onReset,
}: ExtractionReviewerProps) {
  const router = useRouter();

  // Helper to retrieve initial extracted values
  const getField = (name: ExtractableFieldName): ExtractedFieldItem | undefined => {
    return staging.fields.find((f) => f.fieldName === name);
  };

  const titleField = getField('title');
  const typeField = getField('type');
  const vendorField = getField('vendorName');
  const amountField = getField('amount');
  const currencyField = getField('currency');
  const frequencyField = getField('billingFrequency');
  const renewalDateField = getField('renewalDate');
  const expirationDateField = getField('expirationDate');
  const noticeField = getField('noticePeriodDays');
  const autoRenewField = getField('autoRenew');
  const clausesField = getField('importantClauses');

  // Candidate fields state
  const [title, setTitle] = useState(
    titleField?.extractedValue != null
      ? String(titleField.extractedValue)
      : staging.filename.replace(/\.[^/.]+$/, ''),
  );
  const [type, setType] = useState<ObligationType>(
    (typeField?.extractedValue as ObligationType) || 'contract',
  );
  const [vendorName, setVendorName] = useState(
    vendorField?.extractedValue != null ? String(vendorField.extractedValue) : '',
  );
  const [amount, setAmount] = useState(
    amountField?.extractedValue != null ? String(amountField.extractedValue) : '0',
  );
  const [currency, setCurrency] = useState(
    currencyField?.extractedValue != null
      ? String(currencyField.extractedValue).toUpperCase()
      : 'USD',
  );
  const [billingFrequency, setBillingFrequency] = useState<BillingFrequency>(
    (frequencyField?.extractedValue as BillingFrequency) || 'annual',
  );
  const [renewalDate, setRenewalDate] = useState(
    renewalDateField?.extractedValue != null ? String(renewalDateField.extractedValue) : '',
  );
  const [expirationDate, setExpirationDate] = useState(
    expirationDateField?.extractedValue != null ? String(expirationDateField.extractedValue) : '',
  );
  const [noticePeriodDays, setNoticePeriodDays] = useState(
    typeof noticeField?.extractedValue === 'number' ? Number(noticeField.extractedValue) : 30,
  );
  const [autoRenew, setAutoRenew] = useState(
    typeof autoRenewField?.extractedValue === 'boolean'
      ? Boolean(autoRenewField.extractedValue)
      : true,
  );
  const [notes, setNotes] = useState(
    clausesField?.extractedValue != null ? String(clausesField.extractedValue) : '',
  );

  // Validation & UI states
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  // Reject modal state
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [hasRejected, setHasRejected] = useState(staging.status === 'rejected');

  // Preview failure state fallback
  const [previewError, setPreviewError] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!title.trim() || title.trim().length < 2) {
      errors.title = 'Title must be at least 2 characters';
    } else if (title.trim().length > 255) {
      errors.title = 'Title must be 255 characters or fewer';
    }

    if (!vendorName.trim()) {
      errors.vendorName = 'Vendor name is required';
    } else if (vendorName.trim().length > 255) {
      errors.vendorName = 'Vendor name must be 255 characters or fewer';
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      errors.amount = 'Amount must be a non-negative number';
    }

    if (!currency.trim() || currency.trim().length !== 3) {
      errors.currency = 'Currency must be a 3-letter code (e.g. USD)';
    }

    if (!renewalDate || !/^\d{4}-\d{2}-\d{2}$/.test(renewalDate)) {
      errors.renewalDate = 'Valid renewal date (YYYY-MM-DD) is required';
    }

    if (expirationDate && !/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      errors.expirationDate = 'Expiration date must be in YYYY-MM-DD format';
    }

    if (isNaN(noticePeriodDays) || noticePeriodDays < 0 || noticePeriodDays > 365) {
      errors.noticePeriodDays = 'Notice period must be between 0 and 365 days';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!validate()) return;

    setIsConfirming(true);
    setConfirmError(null);

    const payload: ConfirmExtractionRequest = {
      stagingId: staging.stagingId,
      confirmedData: {
        title: title.trim(),
        type,
        vendorName: vendorName.trim(),
        amount: Math.max(0, parseFloat(amount)),
        currency: currency.trim().toUpperCase(),
        billingFrequency,
        renewalDate: renewalDate.trim(),
        expirationDate: expirationDate.trim() ? expirationDate.trim() : undefined,
        noticePeriodDays: Math.max(0, Math.min(365, Math.floor(noticePeriodDays))),
        autoRenew,
        notes: notes.trim() ? notes.trim() : undefined,
      },
    };

    try {
      const obligation = await confirmExtraction(payload);
      router.push(`/obligations?inspect=${encodeURIComponent(obligation.id)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Confirmation failed. Please try again.';
      setConfirmError(msg);
      setIsConfirming(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!rejectReason.trim()) {
      setRejectError('Please provide a reason for rejecting this extraction.');
      return;
    }

    setIsRejecting(true);
    setRejectError(null);

    try {
      await rejectExtraction(staging.stagingId, rejectReason.trim());
      setIsRejectDialogOpen(false);
      setHasRejected(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Rejection failed. Please try again.';
      setRejectError(msg);
      setIsRejecting(false);
    }
  };

  const renderConfidenceBadge = (fieldItem?: ExtractedFieldItem) => {
    if (!fieldItem || typeof fieldItem.confidence !== 'number') return null;
    const conf = fieldItem.confidence;
    const isLow = conf < 0.85;
    const percentage = Math.round(conf * 100);

    return (
      <span
        title={
          isLow
            ? 'Confidence below 85% — please verify against document'
            : 'High confidence extraction'
        }
        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
          isLow
            ? 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-400/20'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}
      >
        {isLow && <AlertTriangle size={11} className="text-amber-700" aria-hidden="true" />}
        {percentage}% confidence
      </span>
    );
  };

  const renderProvenance = (fieldItem?: ExtractedFieldItem) => {
    if (!fieldItem || (!fieldItem.sourceSnippet && !fieldItem.sourcePage)) return null;

    return (
      <div className="mt-1.5 rounded border-l-2 border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
        <span className="font-medium text-slate-700">
          {fieldItem.sourcePage ? `Page ${fieldItem.sourcePage}` : 'Source snippet'}:
        </span>{' '}
        <span className="italic">&ldquo;{fieldItem.sourceSnippet}&rdquo;</span>
      </div>
    );
  };

  const isTiff =
    staging.mimeType === 'image/tiff' ||
    staging.filename.toLowerCase().endsWith('.tiff') ||
    staging.filename.toLowerCase().endsWith('.tif');

  return (
    <div className="space-y-6">
      {/* Provisional Data Notice Banner */}
      <div
        className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-amber-900"
        role="region"
        aria-label="Provisional AI extraction warning"
      >
        <Sparkles size={20} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
        <div className="text-xs sm:text-sm leading-relaxed">
          <span className="font-semibold">Provisional AI Extraction:</span> Contract details and
          candidate dates were automatically extracted from{' '}
          <span className="font-medium">{staging.filename}</span> (overall confidence:{' '}
          {Math.round(staging.overallConfidence * 100)}%). AI-extracted content may contain
          inaccuracies. Please verify all candidate fields—especially those with amber
          low-confidence warnings—against the document preview before confirming.
        </div>
      </div>

      {hasRejected && (
        <div className="surface border-amber-200 bg-amber-50 p-4 text-amber-900 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <X size={18} className="text-amber-700" aria-hidden="true" />
            <span className="text-sm font-medium">This document extraction was rejected.</span>
          </div>
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="btn btn-secondary !min-h-[32px] text-xs"
            >
              Upload another document
            </button>
          )}
        </div>
      )}

      {/* Main Review Layout: Desktop Side-by-Side, Mobile/Tablet Stacked */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Document Preview Panel */}
        <section
          aria-label="Document preview"
          className="surface flex flex-col h-[520px] sm:h-[640px] lg:h-[780px] overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
            <div className="flex items-center gap-2 min-w-0">
              <FileText size={16} className="text-slate-500 shrink-0" aria-hidden="true" />
              <span
                className="text-xs font-semibold text-slate-800 truncate"
                title={staging.filename}
              >
                {staging.filename}
              </span>
            </div>
            <a
              href={staging.documentPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#173e48] hover:underline shrink-0"
              title="Open document in a new tab"
            >
              <span>Open in new tab</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>

          <div className="flex-1 bg-slate-100/60 p-2 overflow-auto flex items-center justify-center">
            {previewError ? (
              <div className="empty-state p-6 text-center max-w-sm">
                <FileQuestion
                  size={36}
                  className="mx-auto text-slate-400 mb-2"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium text-slate-700">Preview unavailable</p>
                <p className="text-xs text-slate-500 mt-1">
                  The document preview could not be displayed inline or the temporary link expired.
                </p>
                <a
                  href={staging.documentPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary mt-3 !min-h-[32px] text-xs"
                >
                  Download / View file
                </a>
              </div>
            ) : isTiff ? (
              <div className="empty-state p-6 text-center max-w-sm">
                <FileText size={40} className="mx-auto text-slate-400 mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-800">
                  TIFF Preview Unavailable Inline
                </p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Web browsers cannot render TIFF images directly. You can open or download the file
                  to inspect the document pages in your system viewer.
                </p>
                <a
                  href={staging.documentPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary mt-4 !min-h-[36px] text-xs"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  Open TIFF document
                </a>
              </div>
            ) : staging.mimeType === 'application/pdf' ? (
              <iframe
                src={staging.documentPreviewUrl}
                title={`Preview of ${staging.filename}`}
                sandbox="allow-scripts"
                className="h-full w-full rounded bg-white border border-slate-200"
                onError={() => setPreviewError(true)}
              />
            ) : (
              <img
                src={staging.documentPreviewUrl}
                alt={`Preview of ${staging.filename}`}
                className="max-h-full max-w-full rounded object-contain bg-white shadow-xs"
                onError={() => setPreviewError(true)}
              />
            )}
          </div>
        </section>

        {/* Candidate Fields Form */}
        <section aria-label="Candidate obligation fields" className="surface p-5 sm:p-6">
          <div className="border-b border-slate-200 pb-4 mb-5">
            <h2 className="section-heading text-lg text-slate-900">
              Extracted Obligation Candidate
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Review and adjust the extracted values below. Confirming creates an active tracking
              obligation.
            </p>
          </div>

          {confirmError && (
            <div className="feedback-error mb-5" role="alert">
              <div className="flex items-start justify-between gap-2">
                <span>{confirmError}</span>
                <button
                  type="button"
                  onClick={() => setConfirmError(null)}
                  className="text-red-700 hover:text-red-900"
                  aria-label="Dismiss error"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleConfirm} noValidate className="space-y-4">
            {/* Title */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="field-title" className="field-label !mb-0">
                  Obligation Title <span className="text-red-600">*</span>
                </label>
                {renderConfidenceBadge(titleField)}
              </div>
              <input
                id="field-title"
                type="text"
                disabled={readOnly || isConfirming || hasRejected}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={Boolean(fieldErrors.title)}
                className={`field ${
                  titleField && titleField.confidence < 0.85
                    ? 'border-amber-300 focus:border-amber-500'
                    : ''
                }`}
                placeholder="e.g. Acme Cloud Subscription"
              />
              {fieldErrors.title && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.title}</p>
              )}
              {renderProvenance(titleField)}
            </div>

            {/* Type & Vendor Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Type */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-type" className="field-label !mb-0">
                    Type <span className="text-red-600">*</span>
                  </label>
                  {renderConfidenceBadge(typeField)}
                </div>
                <select
                  id="field-type"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={type}
                  onChange={(e) => setType(e.target.value as ObligationType)}
                  className={`field ${
                    typeField && typeField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                >
                  {OBLIGATION_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {renderProvenance(typeField)}
              </div>

              {/* Vendor Name */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-vendor" className="field-label !mb-0">
                    Vendor / Counterparty <span className="text-red-600">*</span>
                  </label>
                  {renderConfidenceBadge(vendorField)}
                </div>
                <input
                  id="field-vendor"
                  type="text"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.vendorName)}
                  className={`field ${
                    vendorField && vendorField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                  placeholder="e.g. Vendor Inc."
                />
                {fieldErrors.vendorName && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.vendorName}</p>
                )}
                {renderProvenance(vendorField)}
              </div>
            </div>

            {/* Amount, Currency & Frequency Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Amount */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-amount" className="field-label !mb-0">
                    Amount <span className="text-red-600">*</span>
                  </label>
                  {renderConfidenceBadge(amountField)}
                </div>
                <input
                  id="field-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.amount)}
                  className={`field ${
                    amountField && amountField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                  placeholder="0.00"
                />
                {fieldErrors.amount && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.amount}</p>
                )}
                {renderProvenance(amountField)}
              </div>

              {/* Currency */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-currency" className="field-label !mb-0">
                    Currency <span className="text-red-600">*</span>
                  </label>
                  {renderConfidenceBadge(currencyField)}
                </div>
                <input
                  id="field-currency"
                  type="text"
                  maxLength={3}
                  disabled={readOnly || isConfirming || hasRejected}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  aria-invalid={Boolean(fieldErrors.currency)}
                  className={`field uppercase ${
                    currencyField && currencyField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                  placeholder="USD"
                />
                {fieldErrors.currency && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.currency}</p>
                )}
                {renderProvenance(currencyField)}
              </div>

              {/* Billing Frequency */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-frequency" className="field-label !mb-0">
                    Frequency <span className="text-red-600">*</span>
                  </label>
                  {renderConfidenceBadge(frequencyField)}
                </div>
                <select
                  id="field-frequency"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={billingFrequency}
                  onChange={(e) => setBillingFrequency(e.target.value as BillingFrequency)}
                  className={`field ${
                    frequencyField && frequencyField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                >
                  {BILLING_FREQUENCIES.map((freq) => (
                    <option key={freq.value} value={freq.value}>
                      {freq.label}
                    </option>
                  ))}
                </select>
                {renderProvenance(frequencyField)}
              </div>
            </div>

            {/* Renewal Date & Expiration Date Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Renewal Date */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-renewal-date" className="field-label !mb-0">
                    Renewal Date <span className="text-red-600">*</span>
                  </label>
                  {renderConfidenceBadge(renewalDateField)}
                </div>
                <input
                  id="field-renewal-date"
                  type="date"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={renewalDate}
                  onChange={(e) => setRenewalDate(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.renewalDate)}
                  className={`field ${
                    renewalDateField && renewalDateField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                />
                {fieldErrors.renewalDate && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.renewalDate}</p>
                )}
                {renderProvenance(renewalDateField)}
              </div>

              {/* Expiration Date */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-expiration-date" className="field-label !mb-0">
                    Expiration Date
                  </label>
                  {renderConfidenceBadge(expirationDateField)}
                </div>
                <input
                  id="field-expiration-date"
                  type="date"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.expirationDate)}
                  className={`field ${
                    expirationDateField && expirationDateField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                />
                {fieldErrors.expirationDate && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.expirationDate}</p>
                )}
                {renderProvenance(expirationDateField)}
              </div>
            </div>

            {/* Notice Period & Auto-renew */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
              {/* Notice Period Days */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="field-notice" className="field-label !mb-0">
                    Notice Period (Days)
                  </label>
                  {renderConfidenceBadge(noticeField)}
                </div>
                <input
                  id="field-notice"
                  type="number"
                  min="0"
                  max="365"
                  disabled={readOnly || isConfirming || hasRejected}
                  value={noticePeriodDays}
                  onChange={(e) => setNoticePeriodDays(parseInt(e.target.value, 10) || 0)}
                  aria-invalid={Boolean(fieldErrors.noticePeriodDays)}
                  className={`field ${
                    noticeField && noticeField.confidence < 0.85
                      ? 'border-amber-300 focus:border-amber-500'
                      : ''
                  }`}
                />
                {fieldErrors.noticePeriodDays && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.noticePeriodDays}</p>
                )}
                {renderProvenance(noticeField)}
              </div>

              {/* Auto-renew checkbox */}
              <div className="pt-2 sm:pt-6">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={readOnly || isConfirming || hasRejected}
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#173e48] focus:ring-[#237b94]"
                  />
                  <span className="text-sm font-medium text-slate-800">
                    Auto-renews automatically
                  </span>
                </label>
                {renderProvenance(autoRenewField)}
              </div>
            </div>

            {/* Notes / Clauses */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="field-notes" className="field-label !mb-0">
                  Notes & Key Clauses
                </label>
                {renderConfidenceBadge(clausesField)}
              </div>
              <textarea
                id="field-notes"
                rows={3}
                disabled={readOnly || isConfirming || hasRejected}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="field"
                placeholder="Important terms, cancellation policies, or SLA commitments…"
              />
              {renderProvenance(clausesField)}
            </div>

            {/* Actions Bar */}
            <div className="pt-4 border-t border-slate-200">
              {readOnly ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-200">
                  <Lock size={14} aria-hidden="true" />
                  <span>
                    Viewer accounts have read-only access. Only workspace members or admins can
                    confirm or reject candidate extractions.
                  </span>
                </div>
              ) : hasRejected ? (
                <p className="text-xs text-slate-500">
                  This candidate has been rejected and cannot be confirmed.
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setIsRejectDialogOpen(true)}
                    disabled={isConfirming || isRejecting}
                    className="btn btn-danger !min-h-[40px] text-xs"
                  >
                    <X size={15} aria-hidden="true" />
                    Reject extraction
                  </button>

                  <div className="flex items-center gap-2.5">
                    {onReset && (
                      <button
                        type="button"
                        onClick={onReset}
                        disabled={isConfirming}
                        className="btn btn-ghost !min-h-[40px] text-xs"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isConfirming || isRejecting}
                      className="btn btn-primary !min-h-[40px] text-xs"
                    >
                      {isConfirming ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                          Confirming…
                        </>
                      ) : (
                        <>
                          <Check size={15} aria-hidden="true" />
                          Confirm obligation
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </form>
        </section>
      </div>

      {/* Reject Confirmation Dialog */}
      <Dialog
        open={isRejectDialogOpen}
        onClose={() => {
          if (!isRejecting) setIsRejectDialogOpen(false);
        }}
        title="Reject Document Extraction"
        description="Provide a reason for rejecting this document extraction. This will archive the staging record without creating an active obligation."
      >
        <form onSubmit={handleReject} className="space-y-4">
          {rejectError && (
            <div className="feedback-error" role="alert">
              {rejectError}
            </div>
          )}

          <div>
            <label htmlFor="reject-reason" className="field-label">
              Reason for rejection <span className="text-red-600">*</span>
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              required
              disabled={isRejecting}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="field"
              placeholder="e.g. Uploaded file is a marketing flyer, not a binding contract…"
              maxLength={1000}
            />
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>Required for audit trail</span>
              <span>{rejectReason.length}/1000</span>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              disabled={isRejecting}
              onClick={() => setIsRejectDialogOpen(false)}
              className="btn btn-secondary !min-h-[36px] text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRejecting || !rejectReason.trim()}
              className="btn btn-danger !min-h-[36px] text-xs"
            >
              {isRejecting ? 'Rejecting…' : 'Confirm rejection'}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
