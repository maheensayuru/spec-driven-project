# Clarification Decisions: RenewalRadar Core Platform

**Feature**: [spec.md](./spec.md)
**Date**: 2026-09-05
**Status**: Clarified & Resolved

---

### Clarification 1: Notification Escalation Protocol
- **Question**: When an obligation enters a Critical notice window ($\le 7$ days to cancellation notice deadline) without user acknowledgment, how should notification escalation proceed?
- **Options**:
  - **Option A**: Notify internal assignee only via in-app + email daily until acknowledged.
  - **Option B (Recommended)**: Tiered escalation: Notify internal assignee immediately at $T-7$ days; if unacknowledged by $T-3$ days, escalate daily alerts to all Organization Admins and Owners.
  - **Option C**: Broadcast immediately to all Organization Admins and Owners on day 7.
- **Decision**: **Option B**.
- **Rationale**: Option B minimizes notification fatigue during routine operations while ensuring senior leadership is alerted before a high-value or binding renewal window closes unacknowledged.
- **Impact on Spec**: Added to FR-012 and Acceptance Scenarios under User Story 3.

---

### Clarification 2: AI Document Extraction Verification Gate & Confidence Thresholds
- **Question**: How should the system treat extracted fields with varying confidence scores during human verification?
- **Options**:
  - **Option A**: Require manual re-entry for any field with confidence $< 0.80$.
  - **Option B (Recommended)**: Pre-fill candidate fields in the verification UI; highlight any field with confidence $< 0.85$ in amber with an explicit "Review Needed" badge and side-by-side document snippet; enforce 100% human confirmation before activating.
  - **Option C**: Automatically activate fields with confidence $\ge 0.95$ and only queue low-confidence fields for human review.
- **Decision**: **Option B**.
- **Rationale**: Option C violates Constitution Principle III ("AI as Assisting Component, Never Unsupervised Authority"). Option A introduces excessive friction. Option B provides high efficiency while upholding non-negotiable human sign-off.
- **Impact on Spec**: Added to FR-016 and FR-017 and User Story 5.

---

### Clarification 3: Contract Change Detection & Price Escalation Thresholds
- **Question**: What threshold of variation between a previous obligation record and a newly uploaded document should trigger an automated "Contract Change Alert"?
- **Options**:
  - **Option A**: Any discrepancy in monetary amount ($> \$0.00$), any date shift, or any clause text change.
  - **Option B (Recommended)**: Any monetary increase $\ge 2\%$ or $\ge \$50$ annualized, any reduction in notice period (e.g. from 60 to 30 days), or any change to auto-renewal status.
  - **Option C**: Price increases $\ge 10\%$ only.
- **Decision**: **Option B**.
- **Rationale**: Option A creates spam from negligible rounding or sales tax fluctuations. Option C ignores dangerous subtle price increases and clause shortenings. Option B captures genuine financial and legal exposure.
- **Impact on Spec**: Added to FR-007, FR-011, and User Story 6.

---

### Clarification 4: Multi-Currency Spend Aggregation Strategy
- **Question**: How should multi-currency obligations be represented on the unified Executive Dashboard spend metrics?
- **Options**:
  - **Option A**: Force all obligations to be converted to USD at fixed historical rates.
  - **Option B (Recommended)**: Each Organization selects an account default reporting currency (e.g. USD, EUR, GBP). Dashboard displays total spend in default currency with daily published exchange rates and an explicit breakdown by original currency.
  - **Option C**: Display only obligations matching the organization's single currency; exclude foreign obligations from totals.
- **Decision**: **Option B**.
- **Rationale**: SMBs frequently contract with international SaaS vendors (e.g., Atlassian in USD, local suppliers in EUR or GBP). Option B provides holistic executive visibility without losing the native contract amount.
- **Impact on Spec**: Added to FR-006, FR-021, and Edge Cases.

---

## Coverage Summary & Status
| Taxonomy Category | Status | Notes |
|---|---|---|
| Functional Scope & Behavior | **Resolved** | Escalation paths, notification tiers, and verification gates confirmed. |
| Domain & Data Model | **Resolved** | Multi-currency fields, exchange rate tracking, and confidence scores defined. |
| Interaction & UX Flow | **Resolved** | Side-by-side extraction verification and amber badge criteria established. |
| Non-Functional Quality | **Resolved** | Idempotency keys, p95 latency targets, and zero-leakage RBAC rules set. |
| Edge Cases & Failure Handling | **Resolved** | Escalation unresponsiveness, currency fluctuations, and OCR errors addressed. |
| Constraints & Tradeoffs | **Resolved** | Human-in-the-loop mandated over automated ingestion activation. |
