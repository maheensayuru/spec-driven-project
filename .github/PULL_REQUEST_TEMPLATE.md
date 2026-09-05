## Spec-Driven Development PR Checklist

### 1. Spec Reference
- **Spec Document**: `specs/features/<SPEC-ID>-<title>.md`
- **Spec Status**: [ ] Frozen / Approved [ ] Updating Existing Spec
- **PR Type**: [ ] Spec Definition (Phase 1/2) | [ ] Implementation & Tests (Phase 3/4)

### 2. Traceability Matrix
| Spec Acceptance Criteria ID | Covered in Test File | Status |
|-----------------------------|---------------------|--------|
| AC-1 | `tests/...` | [ ] Pass |
| AC-2 | `tests/...` | [ ] Pass |
| AC-3 | `tests/...` | [ ] Pass |

### 3. Changes Description
Concise summary of changes made to satisfy the specification.

### 4. Verification & Evidence
- [ ] Automated tests pass locally
- [ ] No regression across existing test suites
- [ ] No undocumented behavior or out-of-spec functionality introduced
