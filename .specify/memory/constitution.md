<!--
Sync Impact Report:
- Version change: 0.0.0 (Uninitialized template) → 1.0.0 (Initial Ratification)
- Ratification Date: 2026-09-05
- Principles defined:
  1. Specification as Source of Truth (Non-Negotiable)
  2. Multi-Tenant Isolation & Zero Trust by Construction
  3. AI as Assisting Component, Never Unsupervised Authority
  4. Automation-First Asynchrony, Idempotency, and Resilience
  5. Deterministic Business Rules & Test-First Verification (Red-Green-Refactor)
  6. Comprehensive Auditability & Data Provenance
- Security Standards: OWASP Top 10, strict RBAC, encrypted document handling, prompt injection defense
- Architecture: Modular, observable, decoupled background worker domain
-->

# RenewalRadar Project Constitution

## Core Principles

### I. Specification as Single Source of Truth (NON-NEGOTIABLE)
The specification is the ultimate source of truth for RenewalRadar. No production code, database migration, or external API surface shall be implemented without an approved, frozen specification with unambiguous, deterministic acceptance criteria. When business requirements evolve, the specification and downstream plans/tasks MUST be amended and reviewed first before code changes are made. Code contradicting the specification is considered defective by definition.

### II. Multi-Tenant Isolation & Zero Trust by Construction
Tenant isolation is non-negotiable across every database query, background worker task, cache key, document bucket, and API route.
- Every tenant query MUST scope explicitly to `organization_id` or equivalent tenant partition.
- Cross-tenant data leakage is a critical P0 security failure.
- Role-Based Access Control (RBAC) with Owner, Admin, Member, and Viewer roles must be evaluated on every endpoint; no implicit or arbitrary permissions are permitted.

### III. AI as Assisting Component, Never Unsupervised Authority
Artificial Intelligence models are advisory extraction and analysis engines, not authoritative system actors.
- Extracted obligations, dates, financial amounts, and contract terms MUST remain in an unconfirmed/provisional state until explicitly reviewed and confirmed by an authorized user.
- Confidence scores, source page references, and extraction snippets MUST be captured to enable human verification.
- An AI response alone shall NEVER trigger irreversible financial, legal, or deletion events.

### IV. Automation-First Asynchrony, Idempotency, and Resilience
RenewalRadar is an active monitoring system, not a passive dashboard dependent on manual login.
- Deadline detection, notification generation, document ingestion, and change evaluation MUST execute via scheduled and asynchronous background jobs.
- Every background worker job MUST be strictly idempotent: executing the same job multiple times must never produce duplicate notifications, redundant billing events, or corrupted state.
- Exponential backoff, jitter, dead-letter queues, and deterministic retry policies must govern all asynchronous pipelines.

### V. Deterministic Business Rules & Test-First Verification
Critical business calculations (e.g. deadline windows, cancellation notices, risk scores, prorated obligations, tier entitlement limits) MUST be 100% deterministic, explainable, and independent of LLM inferences.
- Test-Driven Development (TDD) is enforced: automated test cases matching spec acceptance criteria (Given/When/Then) must be authored and verified failing before implementation begins.
- Fast unit and integration tests must validate all boundary conditions, leap years, timezone shifts, and currency formats.

### VI. Comprehensive Auditability & Data Provenance
Every state mutation, user action, and background execution must leave an immutable audit trail.
- System must record actor ID, organization ID, action type, timestamp, IP/user-agent, affected entities, and before/after delta payloads.
- Provenance for document extraction must link directly from the confirmed obligation field to the source document hash and bounding snippet.

## Security & Compliance Standards

1. **Authentication & Session Security**:
   - Secure cookie or token-based authentication with cryptographically signed sessions, rotation, and revocation.
   - Passwords hashed with argon2id or bcrypt with appropriate cost factors.
   - Rate limiting on authentication, document upload, and public endpoints.
2. **Document Ingestion Security**:
   - Uploaded files must be validated against strict MIME-type allowlists and magic bytes (not file extensions).
   - Antivirus / malicious payload screening and strict isolation of document processing workers.
   - Defensive prompt engineering and content sandboxing to neutralize prompt injection from adversarial contracts or invoices.
3. **Secrets & Privacy Management**:
   - No secrets, tokens, or encryption keys in source control or client artifacts.
   - Sensitive tenant data encrypted at rest (AES-256) and in transit (TLS 1.3).
   - Strict tenant-scoped soft-deletion and hard-deletion workflows honoring data privacy obligations.

## Architectural Boundaries & Simplicity

1. **Modular Architecture**:
   - A clean modular monolith architecture with clear, decoupled domain boundaries (Auth, Organizations, Obligations, Ingestion, Monitoring, Notifications, Billing, Audit).
   - Unnecessary microservices are strictly prohibited for MVP; background workers share the domain model but run in isolated processes.
2. **Technology Decision Governance**:
   - Technology choices must prioritize maintainability, operational reliability, developer ergonomics, strong type safety, and robust ecosystem support for document processing and background task scheduling.
3. **Database & Schema Invariants**:
   - Relational integrity, foreign key constraints, and check constraints enforced at the database tier.
   - Every table must have a primary key, `created_at`, `updated_at`, and `organization_id` (where tenant-scoped).

## Development Workflow & Quality Gates

1. **The 9-Stage Spec Kit Lifecycle**:
   `Constitution → Specify → Clarify → Plan → Checklist → Tasks → Analyze → Implement → Converge`
2. **Quality Gates**:
   - **Spec Gate**: Zero unexplained placeholders, complete acceptance scenarios, testable requirements, boundary edge cases documented.
   - **Clarify Gate**: Critical trade-offs resolved with options, implications, and explicit choices.
   - **Plan Gate**: Full technical context, schema definitions, API contracts, constitution compliance check.
   - **Tasks Gate**: Phased, prioritized (P1/P2/P3), independently testable user stories with explicit test tasks.
   - **Analyze Gate**: Complete cross-artifact consistency between spec, plan, tasks, and constitution before code implementation begins.

## Governance

This Constitution supersedes all competing informal practices, conventions, or ad-hoc technical decisions. Any proposed amendment to this constitution requires:
1. Formal documentation of rationale and architectural impact.
2. Incremental semantic version bump:
   - **MAJOR**: Incompatible principle redefinition or removal.
   - **MINOR**: Addition of new principles, architectural standards, or compliance sections.
   - **PATCH**: Clarifications, non-semantic wording refinements.
3. Review and approval by project leadership.

**Version**: 1.0.0 | **Ratified**: 2026-09-05 | **Last Amended**: 2026-09-05
