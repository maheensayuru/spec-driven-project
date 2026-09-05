# spec-driven-project

> A software project built strictly following **Spec-Driven Development (SDD)**.

## Overview

In this project, code is never written without an approved, frozen specification. Features follow a four-phase lifecycle ensuring complete traceability from requirement to implementation.

## Repository Structure

```text
spec-driven-project/
├── .github/
│   ├── PULL_REQUEST_TEMPLATE.md      # Enforces traceability checklist
│   └── workflows/
│       └── ci.yml                    # Automated spec & security checks
├── specs/
│   ├── 000-charter.md                # Project mission, goals, and principles
│   ├── 001-architecture.md           # Architecture, system layout, lifecycle
│   ├── contracts/                    # Schemas, interfaces, and API specs
│   └── features/                     # Feature-specific specs with test matrices
│       ├── template.md               # Standard template for new specs
│       └── 001-foundation-setup.md   # Initial frozen scaffold spec
├── src/                              # Production code
└── tests/                            # Automated test suite
```

## The 4-Phase SDD Workflow

1. **Phase 1: Spec Proposal (`specs/features/<SPEC-ID>-<title>.md`)**
   - Branch `spec/<feature-name>`
   - Fill out `specs/features/template.md` with problem statement, design, interface contracts, and acceptance criteria table.
2. **Phase 2: Review & Freeze**
   - Open PR for the specification document.
   - Team reviews and signs off on design decisions.
   - Status updated to `Frozen` and merged into `main`.
3. **Phase 3: Test Implementation (Red)**
   - Branch `feat/<feature-name>`.
   - Implement test cases in `tests/` directly validating each Acceptance Criteria ID (`AC-1`, `AC-2`, etc.).
   - Verify tests fail on missing implementation.
4. **Phase 4: Code Implementation (Green)**
   - Implement code in `src/` to satisfy the tests.
   - Verify all tests pass locally and in CI.
   - Submit PR with completed traceability checklist in the PR template.
