# Implementation Plan: RenewalRadar Core Platform

**Branch**: `001-renewalradar-core` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-renewalradar-core/spec.md`

---

## 1. Summary

Build the production-grade foundation of **RenewalRadar**, a B2B SaaS platform that continuously monitors contracts, subscriptions, licenses, and permits for SMBs. The technical architecture implements a modular, type-safe full-stack application in TypeScript using PostgreSQL (with Drizzle ORM) for relational/document state, Redis + BullMQ for asynchronous background monitoring and document ingestion pipelines, S3-compatible object storage for secure document handling, and an explainable, deterministic risk evaluation engine coupled with human-verified AI extraction.

---

## 2. Technical Context

- **Language / Runtime**: TypeScript 5.5+ / Node.js 20+ LTS
- **Backend Framework**: Modular Fastify HTTP API service (high-performance, native schema validation with TypeBox/Zod)
- **Frontend Application**: React 18+ / Next.js (App Router, Tailwind CSS, Radix UI accessible primitives)
- **Database & Storage**:
  - Primary Database: PostgreSQL 16
  - Relational Mapping: Drizzle ORM
  - Cache & Distributed Queue: Redis 7+ (BullMQ 5+)
  - Document Store: S3-Compatible Object Storage (MinIO local, AWS S3 / Cloudflare R2 prod)
- **Testing**:
  - Unit & Integration: Vitest
  - API & Contract Tests: Supertest + Vitest
  - End-to-End Tests: Playwright
- **Target Platform**: Linux / Docker Containerized, cloud-agnostic deployment (e.g. AWS ECS, Render, Railway, or Fly.io)
- **Performance Goals**:
  - Dashboard initial aggregation: $< 350\text{ms}$ (p95) for tenants with 500 obligations
  - Deadline scanner: $< 60\text{s}$ per 10,000 scanned obligations
  - Document ingestion staging: $< 45\text{s}$ end-to-end for 5-page PDF
- **Security Constraints**:
  - Multi-tenant isolation at repository layer (zero cross-tenant leakage)
  - OWASP Top 10 compliance, Argon2id passwords, HTTP-only SameSite cookies
  - Presigned upload URLs with 5-minute expiry and binary magic byte validation
  - AI extraction text strictly delimited to prevent prompt injection

---

## 3. Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Constitution Principle | Status | Compliance Evidence in Architecture Plan |
|---|---|---|
| **I. Spec as Source of Truth** | **PASS** | Complete specification exists at `specs/001-renewalradar-core/spec.md`. Code changes will follow test-first tasks. |
| **II. Multi-Tenant Isolation** | **PASS** | Every database table includes `organization_id`. Repositories scope every query. RBAC middleware strictly enforces `Owner`, `Admin`, `Member`, `Viewer`. |
| **III. AI as Assisting Component** | **PASS** | Extraction pipeline writes to `extraction_stagings` with `status: pending_review`. Obligation activation requires explicit human sign-off via side-by-side UI. |
| **IV. Automation-First & Idempotency** | **PASS** | BullMQ scheduled jobs handle deadline scanning. Unique composite idempotency keys (`org:obligation:milestone:date`) prevent duplicate alerts. |
| **V. Deterministic Business Rules & TDD** | **PASS** | Cancellation deadline ($D_{cancellation} = D_{renewal} - N_{notice}$) and risk evaluation (Critical, High, Medium, Low) use 100% deterministic mathematical rules. Tests authored first. |
| **VI. Auditability & Provenance** | **PASS** | Immutable `audit_events` table captures actor, organization, entity ID, action, and before/after JSON diffs. Ingested obligations link to source document hash and bounding box. |

---

## 4. Project Structure

### Documentation Structure (`specs/001-renewalradar-core/`)
```text
specs/001-renewalradar-core/
├── spec.md              # Feature specification & requirements
├── checklists/
│   ├── requirements.md  # Spec quality checklist
│   └── quality.md       # Quality review & verification gates
├── clarifications.md    # Clarification decisions & rationale
├── research.md          # Technology stack research & decisions
├── plan.md              # This technical blueprint
├── data-model.md        # Database schema, entities & state transitions
├── contracts/           # API schemas & TypeScript interfaces
│   ├── auth.contract.ts
│   ├── obligations.contract.ts
│   ├── ingestion.contract.ts
│   └── dashboard.contract.ts
├── quickstart.md        # Developer setup guide
├── tasks.md             # Actionable, prioritized implementation tasks
└── analysis.md          # Cross-artifact alignment report
```

### Source Code Layout (Modular Web Application)
```text
spec-driven-project/
├── backend/
│   ├── src/
│   │   ├── config/             # Environment, secrets, and connection pools
│   │   ├── db/                 # Drizzle schema, migrations, connection
│   │   │   ├── schema/         # Modular table definitions (orgs, obligations, etc.)
│   │   │   └── migrations/
│   │   ├── modules/            # Decoupled domain modules
│   │   │   ├── auth/           # Registration, login, session, RBAC
│   │   │   ├── organizations/  # Tenants, invitations, members
│   │   │   ├── obligations/    # Obligation CRUD, lifecycle, risk engine
│   │   │   ├── ingestion/      # File validation, S3 upload, AI extraction
│   │   │   ├── monitoring/     # Scheduled deadline scanner, alert generator
│   │   │   ├── notifications/  # In-app alerts, transactional email dispatch
│   │   │   ├── dashboard/      # Executive aggregations and metrics
│   │   │   └── audit/          # Immutable event logger and audit queries
│   │   ├── queue/              # BullMQ queue definitions, worker processors
│   │   │   ├── deadline-scanner.worker.ts
│   │   │   └── document-extractor.worker.ts
│   │   ├── server.ts           # Fastify application bootstrap
│   │   └── index.ts
│   └── tests/
│       ├── unit/               # Deterministic rule & math tests
│       ├── integration/        # Tenant isolation & DB tests
│       └── contract/           # API endpoint contract tests
├── frontend/
│   ├── src/
│   │   ├── app/                # Next.js App Router pages
│   │   │   ├── (auth)/         # Login, Register, Invite routes
│   │   │   ├── (dashboard)/    # Dashboard, Obligations, Ingestion, Settings
│   │   │   └── layout.tsx
│   │   ├── components/         # Shared UI components (Radix + Tailwind)
│   │   │   ├── obligations/    # Obligation forms, status badges, risk chips
│   │   │   ├── verification/   # Side-by-side document & extraction reviewer
│   │   │   └── dashboard/      # Metrics cards, deadline timeline, agenda
│   │   ├── lib/                # API client, session hooks, formatters
│   │   └── types/              # Re-exported domain contracts
│   └── tests/
│       └── e2e/                # Playwright user journey tests
└── shared/
    └── contracts/              # Shared Zod schemas and TypeScript types
```

---

## 5. Complexity Tracking

| Architectural Choice | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Redis + BullMQ** | Required for scheduled cron deadline scanning, asynchronous AI extraction, and guaranteed retry idempotency. | Single-process `setInterval` or in-memory timers crash on server restart, cannot scale horizontally, and lack retry idempotency. |
| **Drizzle ORM over Prisma** | Generates explicit, lean SQL queries, supports PostgreSQL JSONB operators, and allows direct connection-level tenant isolation wrapping. | Prisma's heavy Rust query engine adds cold-start overhead, complicated migrations, and slower JSONB document diffing. |
| **Separate Staging Table (`extraction_stagings`)** | Guarantees provisional AI extraction cannot corrupt the active `obligations` table before human verification. | Adding a flag like `is_draft` directly on `obligations` risks leaky queries where unconfirmed obligations show up in executive spend totals. |
| **Zod Shared Contract Layer** | Single source of truth for request/response validation across Fastify backend and React frontend. | Hand-written TypeScript interfaces without runtime validation allow malformed payloads to bypass boundaries. |
