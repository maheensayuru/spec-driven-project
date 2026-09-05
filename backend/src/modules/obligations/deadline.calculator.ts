export type BillingFrequency = 'monthly' | 'quarterly' | 'annual' | 'biennial' | 'one_time';

/**
 * Calculates the cancellation deadline: D_cancellation = D_renewal - N_notice.
 * Uses UTC date arithmetic to avoid daylight savings / timezone drift.
 */
export function calculateCancellationDeadline(
  renewalDateStr: string,
  noticePeriodDays: number,
): string {
  if (noticePeriodDays < 0) {
    throw new Error('Notice period days must be non-negative');
  }

  const [yearStr, monthStr, dayStr] = renewalDateStr.split('-');
  const year = parseInt(yearStr ?? '0', 10);
  const month = parseInt(monthStr ?? '1', 10) - 1; // 0-indexed
  const day = parseInt(dayStr ?? '1', 10);

  // Use UTC
  const renewalDate = new Date(Date.UTC(year, month, day));
  const deadlineMs = renewalDate.getTime() - noticePeriodDays * 24 * 60 * 60 * 1000;
  const deadlineDate = new Date(deadlineMs);

  const outYear = deadlineDate.getUTCFullYear();
  const outMonth = String(deadlineDate.getUTCMonth() + 1).padStart(2, '0');
  const outDay = String(deadlineDate.getUTCDate()).padStart(2, '0');

  return `${outYear}-${outMonth}-${outDay}`;
}

/**
 * Calculates the subsequent renewal date given an active renewal date and billing frequency.
 * Normalizes month-end overflows (e.g. Jan 31 + 1 month = Feb 28 in non-leap year).
 */
export function calculateNextRenewalDate(
  currentRenewalDateStr: string,
  frequency: BillingFrequency,
): string {
  const [yearStr, monthStr, dayStr] = currentRenewalDateStr.split('-');
  let year = parseInt(yearStr ?? '0', 10);
  let month = parseInt(monthStr ?? '1', 10) - 1; // 0-indexed
  const targetDay = parseInt(dayStr ?? '1', 10);

  switch (frequency) {
    case 'monthly':
      month += 1;
      break;
    case 'quarterly':
      month += 3;
      break;
    case 'annual':
      year += 1;
      break;
    case 'biennial':
      year += 2;
      break;
    case 'one_time':
      return currentRenewalDateStr;
  }

  // Adjust year if month exceeded 11
  while (month > 11) {
    year += 1;
    month -= 12;
  }

  // Calculate days in the resulting month
  // Day 0 of next month gives the last day of target month
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const finalDay = Math.min(targetDay, lastDayOfMonth);

  const outYear = year;
  const outMonth = String(month + 1).padStart(2, '0');
  const outDay = String(finalDay).padStart(2, '0');

  return `${outYear}-${outMonth}-${outDay}`;
}
