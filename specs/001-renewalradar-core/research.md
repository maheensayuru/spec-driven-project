# Architecture Research & Decisions: RenewalRadar

**Feature**: [spec.md](./spec.md)
**Date**: 2026-09-05
**Status**: Decided & Validated

---

## 1. Technology Stack Evaluation

### 1.1 Language & Ecosystem
- **Options Evaluated**:
  1. *Python 3.12 (FastAPI + Celery + SQLAlchemy)*
  2. *TypeScript / Node.js 20 LTS (Fastify / Next.js + BullMQ + Drizzle ORM)*
  3. *Go 1.22 (Gin + River queue + GORM)*
- **Decision**: **TypeScript / Node.js 20+ LTS**.
- **Rationale**:
  - Full-stack end-to-end type safety: contracts defined in Zod/TypeScript are shared verbatim across API endpoints, background worker jobs, and UI forms, eliminating impedance mismatches.
  - Document parsing and streaming: excellent ecosystem for PDF manipulation (pdf-lib, pdf2json) and multimodal AI SDKs (Anthropic, OpenAI).
  - Background automation ergonomics: BullMQ is a gold-standard distributed queue for Redis with built-in cron scheduling, parent/child job dependencies, idempotency deduplication keys, and delayed retries.
  - Development velocity for SMB SaaS: enables rapid UI and API iteration without sacrificing strict type discipline.

### 1.2 Database & Multi-Tenancy Architecture
- **Options Evaluated**:
  1. *MongoDB / Document Store*
  2. *PostgreSQL 16 with Drizzle ORM*
  3. *PostgreSQL 16 with Prisma ORM*
- **Decision**: **PostgreSQL 16 with Drizzle ORM**.
- **Rationale**:
  - Relational Integrity: Obligations, organizations, vendors, and audit logs have strict relational references that require foreign key constraints and transactional consistency.
  - Semi-Structured Flexibility: Extracted candidate fields, bounding boxes, and version diffs fit cleanly into PostgreSQL `jsonb` columns with GIN indexing.
  - Tenant Isolation: Every query explicitly filters on `organization_id`. Drizzle provides lightweight query construction with zero runtime overhead, explicit schema definitions, and seamless migration generation.
  - Multi-tenancy enforcement: Database connection pool wrapped with tenant-scoping repository helpers preventing accidental cross-tenant queries.

### 1.3 Asynchronous Queue & Scheduled Automation
- **Options Evaluated**:
  1. *Database Polling (cron on Postgres)*
  2. *Redis + BullMQ*
  3. *AWS SQS / EventBridge*
- **Decision**: **Redis + BullMQ**.
- **Rationale**:
  - Constitution Principle IV mandates automation-first asynchrony and strict idempotency.
  - BullMQ natively provides:
    - Repeatable cron jobs (daily 02:00 UTC deadline scanner).
    - Unique `jobId` deduplication (idempotency key: `scan:org_id:date`).
    - Distributed locking to prevent concurrent scanning conflicts.
    - Dead-letter queues (DLQ) and configurable exponential backoff with jitter.
    - Redis is accessible locally via Docker/native process for developer ergonomics and cloud-agnostic deployment.

### 1.4 Document Storage & Malicious File Defense
- **Decision**: **S3-Compatible Object Storage (MinIO for local development; AWS S3 / Cloudflare R2 for production)**.
- **Security Invariants**:
  - Files never stored on local web server disk.
  - Ingestion pipeline validates binary magic bytes (PDF `%PDF-`, PNG `\x89PNG`, etc.) to block MIME spoofing.
  - Presigned upload URLs with 5-minute expiration, 25MB file size limits, and `Content-Disposition: attachment`.
  - Object keys partitioned strictly by tenant: `documents/{organization_id}/{document_id}/{filename}`.

### 1.5 AI Document Extraction & Human-in-the-Loop Pipeline
- **Decision**: **Provider-Agnostic LLM/VLM Extraction Interface with Zod Output Parsing**.
- **Security & Extraction Pipeline**:
  1. `Document Ingestion`: Extract text layers and render page images (for scanned documents).
  2. `Sandboxed Prompting`: Document text isolated in structured tags (`<document_content>...</document_content>`) with system instructions strictly forbidding prompt execution.
  3. `Structured Extraction`: AI returns typed JSON with confidence scores ($0.00 - 1.00$) and page/snippet references.
  4. `Staging State`: Results stored in `extraction_stagings` table (`status: pending_review`).
  5. `Human Verification Interface`: Side-by-side UI displaying document viewer on left, pre-filled editable form on right. Amber alert badges for confidence $< 0.85$.
  6. `Commit Transaction`: User clicks "Confirm & Create". Only then does an `Obligation` enter `Active` status.

### 1.6 Authentication & Session Security
- **Decision**: **Argon2id password hashing + HTTP-only, SameSite=Lax, secure encrypted session cookies**.
- **Rationale**:
  - Cookie sessions prevent XSS token theft inherent to `localStorage` JWTs.
  - Sessions stored in Redis/Postgres enabling instantaneous server-side revocation on password change or member removal.
  - Strict RBAC middleware evaluates tenant permissions on every request.

---

## 2. Technical Risk & Mitigation Matrix

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| **Cross-Tenant Data Leak** | P0 Critical | Tenant ID scoping enforced at database repository boundary; comprehensive automated integration tests verifying rejection of cross-tenant IDs. |
| **Notification Spam / Duplicate Alerts** | High | Composite idempotency key (`org_id:obligation_id:milestone:date`) stored in `obligation_alerts` with a unique database constraint. |
| **Hallucinated Contract Terms** | High | Constitution Principle III: AI extraction is strictly provisional; zero obligations activate without explicit human confirmation. |
| **Worker Queue Starvation on Large PDFs** | Medium | Ingestion workers run on separate BullMQ queue from high-priority deadline monitoring workers with strict concurrency limits and timeouts. |
| **Silent Vendor Price Escalation** | Medium | Automated contract change analyzer computes percentage delta on re-uploaded obligations and raises visual warnings for increases $\ge 2\%$. |
