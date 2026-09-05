export interface ExistingContractSnapshot {
  amount: number;
  currency: string;
  billingFrequency: string;
  noticePeriodDays: number;
  autoRenew: boolean;
}

export interface IncomingContractTerms {
  amount: number;
  currency: string;
  billingFrequency: string;
  noticePeriodDays: number;
  autoRenew: boolean;
}

export interface ContractDiffResult {
  hasSignificantChanges: boolean;
  priceDelta: number;
  pricePercentChange: number;
  noticePeriodDelta: number;
  autoRenewChanged: boolean;
  warnings: string[];
  suggestedStatus: 'active' | 'under_review';
}

export class ContractChangeService {
  /**
   * Evaluates contract variation between existing record and newly ingested amendment.
   * Enforces Clarification 3 thresholds:
   * - Price increase >= 2% or >= $50
   * - Notice period reduction
   * - Auto-renewal clause alteration
   */
  static evaluateDiff(
    previous: ExistingContractSnapshot,
    incoming: IncomingContractTerms,
  ): ContractDiffResult {
    const warnings: string[] = [];
    let hasSignificantChanges = false;

    // 1. Price Evaluation
    const priceDelta = Math.round((incoming.amount - previous.amount) * 100) / 100;
    const pricePercentChange =
      previous.amount > 0
        ? Math.round(((incoming.amount - previous.amount) / previous.amount) * 1000) / 10
        : 0;

    if (priceDelta >= 50 || (pricePercentChange >= 2.0 && priceDelta > 0)) {
      hasSignificantChanges = true;
      warnings.push(
        `Price increase detected: +$${priceDelta} (+${pricePercentChange.toFixed(1)}%)`,
      );
    }

    // 2. Notice Period Evaluation (Reduction is a legal/cancellation risk)
    const noticePeriodDelta = incoming.noticePeriodDays - previous.noticePeriodDays;
    if (noticePeriodDelta < 0) {
      hasSignificantChanges = true;
      warnings.push(
        `Notice period reduced by ${Math.abs(noticePeriodDelta)} days (from ${previous.noticePeriodDays} to ${incoming.noticePeriodDays})`,
      );
    }

    // 3. Auto-Renewal Evaluation
    const autoRenewChanged = incoming.autoRenew !== previous.autoRenew;
    if (autoRenewChanged) {
      hasSignificantChanges = true;
      warnings.push(
        `Auto-renewal status changed from ${previous.autoRenew} to ${incoming.autoRenew}`,
      );
    }

    return {
      hasSignificantChanges,
      priceDelta,
      pricePercentChange,
      noticePeriodDelta,
      autoRenewChanged,
      warnings,
      suggestedStatus: hasSignificantChanges ? 'under_review' : 'active',
    };
  }
}
