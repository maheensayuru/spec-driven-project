export type BillingFrequency = 'monthly' | 'quarterly' | 'annual' | 'biennial' | 'one_time';

export interface ObligationDatesInput {
  startDate?: string;
  renewalDate: string;
  expirationDate?: string;
}

/**
 * Validates that a string is a strictly valid YYYY-MM-DD calendar date.
 */
function parseAndValidateDate(dateStr: string, fieldName: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid ${fieldName} format (expected YYYY-MM-DD)`);
  }

  const year = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10) - 1; // 0-indexed
  const day = parseInt(match[3]!, 10);

  const date = new Date(Date.UTC(year, month, day));

  // Calendar validity check: year, month, day must round-trip exactly
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    throw new Error(
      `${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is not a valid calendar date`,
    );
  }

  return date;
}

/**
 * Validates relationship constraints between obligation dates:
 * startDate <= renewalDate <= expirationDate
 */
export function validateObligationDates(input: ObligationDatesInput): void {
  const renewalDate = parseAndValidateDate(input.renewalDate, 'renewal date');

  if (input.startDate) {
    const startDate = parseAndValidateDate(input.startDate, 'start date');
    if (startDate.getTime() > renewalDate.getTime()) {
      throw new Error('Start date cannot be after renewal date');
    }
  }

  if (input.expirationDate) {
    const expirationDate = parseAndValidateDate(input.expirationDate, 'expiration date');
    if (renewalDate.getTime() > expirationDate.getTime()) {
      throw new Error('Renewal date cannot be after expiration date');
    }
  }
}

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

  if (noticePeriodDays > 365) {
    throw new Error('Notice period days cannot exceed 365 days');
  }

  const renewalDate = parseAndValidateDate(renewalDateStr, 'renewal date');
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
  const currentDate = parseAndValidateDate(currentRenewalDateStr, 'renewal date');
  let year = currentDate.getUTCFullYear();
  let month = currentDate.getUTCMonth();
  const targetDay = currentDate.getUTCDate();

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

  while (month > 11) {
    year += 1;
    month -= 12;
  }

  // Calculate days in the resulting month
  const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const finalDay = Math.min(targetDay, lastDayOfMonth);

  const outYear = year;
  const outMonth = String(month + 1).padStart(2, '0');
  const outDay = String(finalDay).padStart(2, '0');

  return `${outYear}-${outMonth}-${outDay}`;
}
