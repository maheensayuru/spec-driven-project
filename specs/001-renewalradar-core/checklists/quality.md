# Quality Review Checklist: RenewalRadar Core Platform

**Purpose**: Reviewer-owned quality validation artifact verifying architecture compliance, tenant security, deterministic logic, and testing gates.
**Created**: 2026-09-05
**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)
**Status**: Ready for Implementation Gate

---

## 1. Architectural Integrity & Constitution Compliance

- [x] **CHK-001 (Spec as Single Source of Truth)**: All proposed endpoints, database tables, and worker jobs in `plan.md` and `data-model.md` map 1:1 to functional requirements (FR-001 through FR-025).
- [x] **CHK-002 (Modular Monolith Boundaries)**: Domain modules (Auth, Obligations, Ingestion, Monitoring, Notifications, Dashboard) remain strictly decoupled through shared contracts without circular dependencies.
- [x] **CHK-003 (Worker Isolation)**: BullMQ worker processors run independently from the Fastify HTTP request cycle, ensuring long-running PDF extraction cannot block incoming API requests.

---

## 2. Multi-Tenant Security & Data Isolation

- [x] **CHK-004 (Tenant Query Scoping)**: Database repository layer explicitly requires `organization_id` on all CRUD queries, preventing multi-tenant data leaks by construction.
- [x] **CHK-005 (Cross-Tenant Enumeration Prevention)**: Attempting to read an obligation or document belonging to another organization returns HTTP 404 (Not Found) rather than 403, preventing resource enumeration.
- [x] **CHK-006 (Role-Based Authorization Enforcement)**: Explicit permission matrix enforced across Owner, Admin, Member, and Viewer. Viewer access strictly rejects mutative requests.
- [x] **CHK-007 (Object Storage Partitioning)**: S3 object storage keys are strictly partitioned as `documents/{organization_id}/{document_id}/{filename}` with presigned upload URLs expiring in $\le 5$ minutes.

---

## 3. Human-in-the-Loop AI & Document Security

- [x] **CHK-008 (Provisional Extraction Isolation)**: AI extraction results are written exclusively to `extraction_stagings` (`status: pending_review`) and never inserted directly into active `obligations`.
- [x] **CHK-009 (Mandatory Human Sign-Off)**: Spec and contracts mandate human confirmation with full provenance link before any extracted obligation enters `active` status.
- [x] **CHK-010 (Visual Amber Confidence Gate)**: Extracted fields with confidence $< 0.85$ are flagged with amber review badges in the UI for mandatory reviewer validation.
- [x] **CHK-011 (Prompt Injection & Malicious File Defense)**: Uploaded files validated against binary magic bytes; extraction prompts strictly isolate document content in sandbox tags to block adversarial prompt injection.

---

## 4. Automation Idempotency & Deterministic Business Logic

- [x] **CHK-012 (Alert Idempotency Guarantee)**: Notification scanner enforces unique database constraint on `obligation_alerts(idempotency_key)` preventing duplicate notifications during job restarts or retries.
- [x] **CHK-013 (Deterministic Date Arithmetic)**: Cancellation deadline ($D_{cancellation} = D_{renewal} - N_{notice}$) and risk evaluation levels (Critical, High, Medium, Low) rely entirely on deterministic, testable logic independent of AI inferences.
- [x] **CHK-014 (Tiered Escalation Delivery)**: Critical notice alerts escalate from assigned owner to Organization Admins and Owner if unacknowledged at $T-3$ days.

---

## 5. Test Strategy & Traceability Verification

- [x] **CHK-015 (Test-First Workflow Enforced)**: Tasks list explicit automated test creation tasks (RED) before every implementation task (GREEN).
- [x] **CHK-016 (Independent Story Testability)**: Each User Story (US1 through US8) has an isolated acceptance test suite verifying end-to-end functionality without cross-story coupling.
- [x] **CHK-017 (Measurable SLA Validation)**: Test suites include performance benchmarks asserting $< 350\text{ms}$ dashboard query latency (p95) and $< 60\text{s}$ monitoring scan time.
