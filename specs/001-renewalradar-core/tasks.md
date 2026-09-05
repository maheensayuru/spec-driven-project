---
description: "Task list for RenewalRadar Core Platform implementation"
---

# Tasks: RenewalRadar Core Platform

**Input**: Design documents from `/specs/001-renewalradar-core/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository workspace configuration, build tooling, and shared contract definitions.

- [ ] T001 Initialize pnpm workspace layout with `backend/`, `frontend/`, and `shared/` directories in `package.json` and `pnpm-workspace.yaml`
- [ ] T002 [P] Configure root TypeScript project references in `tsconfig.base.json` and package-level `tsconfig.json` files
- [ ] T003 [P] Configure ESLint, Prettier, and lint-staged pre-commit hooks in `.eslintrc.js` and `.prettierrc`
- [ ] T004 [P] Establish shared Zod contracts package in `shared/contracts/` exporting schemas from `specs/001-renewalradar-core/contracts/`
- [ ] T005 Setup root `docker-compose.yml` for PostgreSQL 16, Redis 7, and MinIO per `quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core multi-tenant database infrastructure, session authentication, and background worker queue.

**⚠️ CRITICAL**: No user story implementation can begin until this phase is complete.

- [ ] T006 Configure Drizzle ORM client and database connection pool with strict tenant isolation helper in `backend/src/db/connection.ts`
- [ ] T007 [P] Implement Drizzle schema definitions for `organizations`, `users`, `organization_members`, and `audit_events` in `backend/src/db/schema/`
- [ ] T008 [P] Generate and run initial database migration in `backend/src/db/migrations/0001_initial_core.sql`
- [ ] T009 Implement Argon2id password hashing and secure HTTP-only encrypted session cookie manager in `backend/src/modules/auth/session.service.ts`
- [ ] T010 [P] Implement BullMQ connection manager and queue registry (`deadline-scanner`, `document-ingestion`) in `backend/src/queue/queue.config.ts`
- [ ] T011 [P] Implement S3-compatible client with presigned URL generator in `backend/src/modules/ingestion/storage.service.ts`
- [ ] T012 Configure Fastify HTTP server with global error handling, request logging, and Zod validator compiler in `backend/src/server.ts`

**Checkpoint**: Core foundation ready; user story implementation can now begin.

---

## Phase 3: User Story 1 - Obligation Lifecycle & Manual Management (Priority: P1) 🎯 MVP Core

**Goal**: Full CRUD and lifecycle state management for structured obligations with deterministic cancellation deadlines.

**Independent Test**: User creates an obligation manually, system verifies date constraints, computes cancellation deadline, and allows filtering/searching.

### Tests for User Story 1 (Write Tests FIRST, Verify Fails)
- [x] T013 [P] [US1] Unit test for deterministic cancellation deadline arithmetic ($D_{cancellation} = D_{renewal} - N_{notice}$) and leap year boundaries in `backend/tests/unit/obligations/deadline.test.ts`
- [x] T014 [P] [US1] Contract test for `POST /api/v1/obligations` and `GET /api/v1/obligations` in `backend/tests/contract/obligations.test.ts`
- [x] T015 [P] [US1] Integration test for obligation lifecycle transitions (`Draft` → `Active` → `Renewed` → `Archived`) in `backend/tests/integration/obligations/lifecycle.test.ts`

### Implementation for User Story 1
- [x] T016 [P] [US1] Create Drizzle schema for `obligations` and `vendors` in `backend/src/db/schema/obligations.ts` and `backend/src/db/schema/vendors.ts`
- [x] T017 [US1] Implement `ObligationRepository` enforcing tenant `organization_id` scoping on all queries in `backend/src/modules/obligations/obligation.repository.ts`
- [x] T018 [US1] Implement `ObligationService` with validation, deadline computation, and lifecycle transitions in `backend/src/modules/obligations/obligation.service.ts`
- [x] T019 [US1] Implement Fastify API routes for obligation CRUD and search filtering in `backend/src/modules/obligations/obligation.routes.ts`
- [x] T020 [P] [US1] Build responsive Obligation Form component with validation in `frontend/src/components/obligations/ObligationForm.tsx`
- [x] T021 [US1] Build Obligation List & Filter View with search, status chips, and risk badges in `frontend/src/app/(dashboard)/obligations/page.tsx`

**Checkpoint**: User Story 1 functional and independently testable.

---

## Phase 4: User Story 2 - Multi-Tenant Organization & RBAC (Priority: P1)

**Goal**: Tenant isolation, company provisioning, member invitations, and role-based permissions (Owner, Admin, Member, Viewer).

**Independent Test**: Admin invites Viewer; Viewer reads obligations but is blocked (403) from mutations; cross-tenant query returns 404.

### Tests for User Story 2 (Write Tests FIRST, Verify Fails)
- [ ] T022 [P] [US2] Unit test for RBAC permission matrix across Owner, Admin, Member, and Viewer in `backend/tests/unit/auth/rbac.test.ts`
- [ ] T023 [P] [US2] Security integration test asserting complete cross-tenant isolation and 404 response on foreign tenant IDs in `backend/tests/integration/auth/tenant-isolation.test.ts`
- [ ] T024 [P] [US2] Contract test for invitation dispatch and acceptance in `backend/tests/contract/invitations.test.ts`

### Implementation for User Story 2
- [ ] T025 [US2] Implement RBAC authorization middleware in `backend/src/modules/auth/rbac.middleware.ts`
- [ ] T026 [US2] Implement Organization and Member services (invitations, role updates, member removal) in `backend/src/modules/organizations/organization.service.ts`
- [ ] T027 [US2] Implement Organization API routes in `backend/src/modules/organizations/organization.routes.ts`
- [ ] T028 [P] [US2] Build Team Management & Invite Modal in `frontend/src/components/organizations/TeamSettings.tsx`

**Checkpoint**: User Stories 1 and 2 fully functional with verified tenant isolation.

---

## Phase 5: User Story 3 - Continuous Deadline Monitoring & Alerts (Priority: P1)

**Goal**: Asynchronous background scanner detecting upcoming renewal/notice deadlines and generating idempotent notifications.

**Independent Test**: Seed obligation with notice deadline in 14 days; trigger scanner; assert alert generated; re-run scanner; assert zero duplicates.

### Tests for User Story 3 (Write Tests FIRST, Verify Fails)
- [ ] T029 [P] [US3] Unit test for monitoring scanner window matching (90, 60, 30, 14, 7, 1 day) in `backend/tests/unit/monitoring/scanner-matcher.test.ts`
- [ ] T030 [P] [US3] Unit test for deterministic Risk Level calculation formula in `backend/tests/unit/monitoring/risk-engine.test.ts`
- [ ] T031 [P] [US3] Integration test for alert generation idempotency under repeated executions in `backend/tests/integration/monitoring/alert-idempotency.test.ts`

### Implementation for User Story 3
- [ ] T032 [P] [US3] Create Drizzle schema for `obligation_alerts` with unique idempotency constraint in `backend/src/db/schema/alerts.ts`
- [ ] T033 [US3] Implement `RiskEvaluationService` (Critical, High, Medium, Low scoring) in `backend/src/modules/monitoring/risk.service.ts`
- [ ] T034 [US3] Implement `DeadlineScannerService` querying active obligations against milestone windows in `backend/src/modules/monitoring/scanner.service.ts`
- [ ] T035 [US3] Implement BullMQ repeatable worker job `deadline-scanner.worker.ts` running on daily cron schedule in `backend/src/queue/workers/deadline-scanner.worker.ts`
- [ ] T036 [US3] Implement In-App and Email notification dispatcher with escalation logic in `backend/src/modules/notifications/notification.service.ts`
- [ ] T037 [P] [US3] Build In-App Notification Bell and Alert Feed in `frontend/src/components/notifications/NotificationDrawer.tsx`

**Checkpoint**: Automated proactive deadline monitoring operates independently.

---

## Phase 6: User Story 4 - Actionable Executive Dashboard & Timeline (Priority: P1)

**Goal**: Daily executive dashboard answering "What do I need to know or do today?" with upcoming renewals, urgent alerts, and spend totals.

**Independent Test**: Load dashboard endpoint; verify response returns aggregated committed spend, imminent deadlines, and urgent action list in $< 350\text{ms}$.

### Tests for User Story 4 (Write Tests FIRST, Verify Fails)
- [ ] T038 [P] [US4] Integration test for dashboard aggregation metrics and multi-currency spend conversion in `backend/tests/integration/dashboard/metrics.test.ts`
- [ ] T039 [P] [US4] Performance benchmark test asserting p95 response time $< 350\text{ms}$ with 500 obligations in `backend/tests/performance/dashboard-latency.test.ts`

### Implementation for User Story 4
- [ ] T040 [US4] Implement `DashboardService` with optimized SQL aggregation queries in `backend/src/modules/dashboard/dashboard.service.ts`
- [ ] T041 [US4] Implement Dashboard API route `GET /api/v1/dashboard` in `backend/src/modules/dashboard/dashboard.routes.ts`
- [ ] T042 [P] [US4] Build Dashboard Executive KPI summary cards in `frontend/src/components/dashboard/MetricsCards.tsx`
- [ ] T043 [P] [US4] Build "Urgent Actions Needed" priority widget in `frontend/src/components/dashboard/UrgentActionsList.tsx`
- [ ] T044 [US4] Build Interactive Deadline Timeline & Agenda View in `frontend/src/components/dashboard/DeadlineTimeline.tsx`

**Checkpoint**: All P1 User Stories (US1–US4) complete; core MVP is demonstrable.

---

## Phase 7: User Story 5 - Document Ingestion, AI Extraction & Human Verification (Priority: P2)

**Goal**: Secure document upload, sandboxed AI extraction, and interactive side-by-side human verification interface.

**Independent Test**: Upload test PDF; worker stages extraction with confidence scores; user edits amount in verification UI and confirms; obligation is created with active status.

### Tests for User Story 5 (Write Tests FIRST, Verify Fails)
- [ ] T045 [P] [US5] Unit test for file magic-bytes MIME validator and sanitization in `backend/tests/unit/ingestion/mime-validation.test.ts`
- [ ] T046 [P] [US5] Unit test for prompt injection defense and sandbox tag containment in `backend/tests/unit/ingestion/prompt-sanitizer.test.ts`
- [ ] T047 [P] [US5] Integration test for extraction staging state machine (`pending_review` → `confirmed`) in `backend/tests/integration/ingestion/verification-workflow.test.ts`

### Implementation for User Story 5
- [ ] T048 [P] [US5] Create Drizzle schemas for `documents` and `extraction_stagings` in `backend/src/db/schema/documents.ts`
- [ ] T049 [US5] Implement document upload presigning with size and MIME validation in `backend/src/modules/ingestion/ingestion.service.ts`
- [ ] T050 [US5] Implement AI extraction worker with pluggable LLM interface (Claude/OpenAI) in `backend/src/queue/workers/document-extractor.worker.ts`
- [ ] T051 [US5] Implement Human Confirmation & Verification API route in `backend/src/modules/ingestion/verification.routes.ts`
- [ ] T052 [P] [US5] Build Drag-and-Drop Document Upload Zone with progress tracking in `frontend/src/components/ingestion/DocumentDropzone.tsx`
- [ ] T053 [US5] Build Interactive Side-by-Side Document & Verification Reviewer with amber confidence badges in `frontend/src/components/verification/ExtractionReviewer.tsx`

**Checkpoint**: Document ingestion and human-verified extraction fully operational.

---

## Phase 8: User Story 6 - Contract Versioning & Change Detection (Priority: P2)

**Goal**: Compare uploaded contract amendments against existing obligations and flag price escalations or reduced notice windows.

**Independent Test**: Re-upload document with 15% price increase; system detects diff and flags `Under_Review` warning.

### Tests for User Story 6 (Write Tests FIRST, Verify Fails)
- [ ] T054 [P] [US6] Unit test for contract change diff algorithm (price $\ge 2\%$, notice reduction, auto-renew shift) in `backend/tests/unit/obligations/change-detector.test.ts`
- [ ] T055 [P] [US6] Integration test for contract amendment linking and alert generation in `backend/tests/integration/obligations/contract-amendment.test.ts`

### Implementation for User Story 6
- [ ] T056 [P] [US6] Create Drizzle schema for `contract_change_diffs` in `backend/src/db/schema/changes.ts`
- [ ] T057 [US6] Implement `ContractChangeService` evaluating field deltas in `backend/src/modules/obligations/change-detector.service.ts`
- [ ] T058 [US6] Integrate change detection into verification confirmation pipeline in `backend/src/modules/ingestion/verification.service.ts`
- [ ] T059 [P] [US6] Build Contract Version Diff Visualizer component in `frontend/src/components/obligations/ContractDiffViewer.tsx`

**Checkpoint**: P2 features (US5–US6) complete and verified.

---

## Phase 9: User Story 7 - Subscription Tiers & Entitlements (Priority: P3)

**Goal**: Enforce Free, Business, and Pro plan limits on obligation counts and AI extraction allowances.

**Independent Test**: Organization on Free plan with 10 obligations is blocked from creating an 11th obligation with a structured upgrade prompt.

### Tests for User Story 7 (Write Tests FIRST, Verify Fails)
- [ ] T060 [P] [US7] Unit test for entitlement quota calculation and tier boundary evaluation in `backend/tests/unit/entitlements/quota-engine.test.ts`
- [ ] T061 [P] [US7] Contract test for quota exceeded 402/403 response with upgrade details in `backend/tests/contract/entitlements.test.ts`

### Implementation for User Story 7
- [ ] T062 [P] [US7] Create Drizzle schema for `subscription_entitlements` and `usage_meters` in `backend/src/db/schema/entitlements.ts`
- [ ] T063 [US7] Implement `EntitlementGuardMiddleware` intercepting mutative requests in `backend/src/modules/entitlements/entitlement.middleware.ts`
- [ ] T064 [P] [US7] Build Plan & Usage Settings page with upgrade banners in `frontend/src/app/(dashboard)/settings/billing/page.tsx`

---

## Phase 10: User Story 8 - Immutable Audit Logging & Governance (Priority: P3)

**Goal**: Record tamper-resistant audit events for every state mutation with actor attribution and state diffs.

**Independent Test**: Perform an obligation status transition; query audit log; verify immutable event record exists.

### Tests for User Story 8 (Write Tests FIRST, Verify Fails)
- [ ] T065 [P] [US8] Integration test verifying atomic audit event emission on obligation mutation in `backend/tests/integration/audit/audit-logger.test.ts`
- [ ] T066 [P] [US8] Security test verifying audit log endpoints are strictly read-only in `backend/tests/security/audit-immutability.test.ts`

### Implementation for User Story 8
- [ ] T067 [US8] Implement `AuditLoggingService` with asynchronous batch writing in `backend/src/modules/audit/audit.service.ts`
- [ ] T068 [US8] Implement Audit Trail API routes with date/actor filtering in `backend/src/modules/audit/audit.routes.ts`
- [ ] T069 [P] [US8] Build Audit Trail viewer and CSV export component in `frontend/src/app/(dashboard)/settings/audit/page.tsx`

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Security hardening, end-to-end integration tests, and documentation.

- [ ] T070 [P] Conduct automated OWASP security audit (SQL injection, XSS, CSRF, rate limiting) in `backend/tests/security/owasp-scan.test.ts`
- [ ] T071 Run full Playwright End-to-End test suite covering onboarding through verified extraction in `frontend/tests/e2e/core-journey.spec.ts`
- [ ] T072 [P] Validate developer quickstart instructions against fresh Docker containers per `quickstart.md`
- [ ] T073 Update root documentation and finalize deployment manifests in `docs/` and `deploy/`

---

## Dependencies & Execution Sequence

```
[Phase 1: Setup] ──> [Phase 2: Foundational] ──┬──> [Phase 3: US1 - Obligations] ──┐
                                              ├──> [Phase 4: US2 - RBAC & Orgs] ───┼──> [Phase 6: US4 - Dashboard]
                                              └──> [Phase 5: US3 - Monitoring]  ───┘               │
                                                                                                   ▼
                                              ┌──> [Phase 7: US5 - Ingestion]   ───────────────────┤
                                              ├──> [Phase 8: US6 - Change Det]  ───────────────────┼──> [Phase 11: Polish]
                                              ├──> [Phase 9: US7 - Entitlements] ──────────────────┤
                                              └──> [Phase 10: US8 - Audit Log]  ───────────────────┘
```

1. **Foundational Gate**: Phase 1 & 2 MUST be complete before any user story can begin.
2. **P1 Milestone (MVP Core)**: User Stories 1, 2, 3, and 4 deliver a complete, testable, standalone product.
3. **P2 Milestone (AI & Changes)**: User Stories 5 and 6 layer on document ingestion and change detection.
4. **P3 Milestone (Monetization & Compliance)**: User Stories 7 and 8 complete commercial operations and enterprise auditability.
