# Architecture & Governance: Spec-Driven Project

- **Status**: Active
- **Version**: 1.0.0
- **Document ID**: SPEC-ARCH-001

## 1. System Overview & Boundaries
The project is organized into decoupled layers:
- `specs/`: Source of truth for system contracts, feature definitions, and acceptance criteria.
- `specs/contracts/`: Machine-readable schemas (OpenAPI, JSON Schema, Proto, TypeScript definitions).
- `src/`: Production code satisfying frozen specifications.
- `tests/`: Automated unit, integration, and contract tests directly validating acceptance criteria.

## 2. Directory Layout
```text
spec-driven-project/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── workflows/
│       └── ci.yml
├── specs/
│   ├── 000-charter.md
│   ├── 001-architecture.md
│   ├── contracts/
│   └── features/
│       ├── template.md
│       └── 001-foundation-setup.md
├── src/
└── tests/
```

## 3. The 4-Phase SDD Lifecycle
```
[Phase 1: Spec Draft] ──> [Phase 2: Review & Freeze] ──> [Phase 3: Test Contract] ──> [Phase 4: Implementation]
   (specs/features/)              (PR to main)                 (tests/ Red)               (src/ Green)
```

1. **Phase 1 (Draft)**:
   Author creates `specs/features/<SPEC-ID>-<title>.md` from `template.md`. Defines context, technical design, interface contracts, and acceptance criteria (AC-1, AC-2, etc.).
2. **Phase 2 (Review & Freeze)**:
   Spec PR is reviewed for completeness, edge cases, and feasibility. Once approved, the status is updated to `Frozen` and merged into `main`.
3. **Phase 3 (Contract & Test Formulation - RED)**:
   Branch `feat/<title>`. Create automated test cases corresponding 1:1 with AC IDs. Run tests to confirm failure against missing implementation.
4. **Phase 4 (Implementation - GREEN)**:
   Implement production code in `src/`. Run tests until all pass. PR is submitted referencing the frozen Spec ID.
