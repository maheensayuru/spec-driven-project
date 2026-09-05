# Project Charter: Spec-Driven Project

- **Status**: Active
- **Version**: 1.0.0
- **Lead**: Maheen Sayuru (@maheensayuru)

## 1. Mission & Vision
Build reliable, verified software using a strict **Spec-Driven Development (SDD)** workflow. Every production change must trace back directly to a frozen specification with deterministic, verifiable acceptance criteria.

## 2. Core Principles
1. **Spec First, Code Second**: No implementation PR is merged without an approved, frozen specification.
2. **Deterministic Acceptance Criteria**: Acceptance criteria must be phrased as clear Given/When/Then scenarios with observable boundaries.
3. **Traceability**: Every production code commit and test must reference its parent Spec ID.
4. **Zero Out-of-Spec Features**: Scope creep is strictly rejected during PR review. New ideas require a new or amended spec document.
5. **Continuous Verification**: Automated CI tests assert that implementations satisfy all acceptance criteria before merging.

## 3. In-Scope vs. Non-Goals
- **In-Scope**:
  - Clear architectural specifications and schema definitions.
  - Automated contract and unit tests matching acceptance criteria.
  - Modular implementation adhering strictly to defined interfaces.
- **Non-Goals**:
  - Speculative feature additions without written requirements.
  - Undocumented API surfaces or internal magic methods.
