# RenewalRadar: Live Presentation Demonstration Guide

This guide details the exact sequence, commands, and talking points for presenting the RenewalRadar P1 Minimum Viable Product (US1 through US4).

### Runtime integration update

`fix/runtime-integration` connects the redesigned frontend to real backend APIs. All dashboard metrics, obligation CRUD, search/filter, notifications, scanner, team members, and invitations now read from and write to PostgreSQL. Created obligations, alerts, and acknowledgments persist across API restarts. The PGlite fallback remains available when Docker is not running.

Use the development frontend (`npm run dev --workspace=frontend`) for presentations: demo credential autofill and Demo Tools are development-only and intentionally absent from production builds.

---

## 1. Prerequisites & Clean Startup

Ensure Node.js v20+ and npm v10+ are available.

### Terminal Setup

#### Terminal 1: Database & Cache Infrastructure (Optional Docker)

If Docker is installed on the presentation laptop:

```bash
cd C:\tmp\spec-driven-project
docker compose up -d
```

_(Note: If Docker is unavailable, RenewalRadar automatically runs embedded PostgreSQL 16 on disk via PGlite with zero external dependencies)._

#### Terminal 2: Start Backend API Service

```bash
cd C:\tmp\spec-driven-project
npm run dev --workspace=backend
```

_Healthcheck confirms readiness:_ `http://localhost:4000/health`

#### Terminal 3: Start Frontend Web Application

```bash
cd C:\tmp\spec-driven-project
npm run dev --workspace=frontend
```

_Frontend URL:_ `http://localhost:3000`

---

## 2. Demo Account & Login Procedure

1. Open your browser and navigate to `http://localhost:3000/login`.
2. Click **"Auto-fill Demo Credentials"** (or enter manually):
   - **Email**: `ops@acmelogistics.com`
   - **Password**: `Password123!`
   - **Organization**: Acme Distribution Logistics (Role: Owner)
3. Click **"Sign In"**. You are immediately redirected to `/dashboard`.

---

## 3. Demo Reset Command

If the database state becomes altered during practice, restore the exact canonical presentation state:

```bash
cd C:\tmp\spec-driven-project
npm run demo:reset
```

_Safeguard_: This script verifies `NODE_ENV !== 'production'` and resets only development data before re-seeding 6 diverse multi-category obligations.

---

## 4. Canonical Presentation Walkthrough (5-Minute Story)

### Step A: Executive Dashboard ("What do I need to know today?")

- **Route**: `http://localhost:3000/dashboard`
- **Talking Point**: _"Small and medium businesses manage dozens of vendor contracts, leases, and policies. Important deadlines get buried. RenewalRadar answers one central question every morning: What do I need to do today before money or compliance are lost?"_
- **Highlight**:
  - **Active Obligations**: seeded obligations from `npm run demo:reset`.
  - **Upcoming Renewals**: renewals within 30 days.
  - **Urgent Action Items**: items requiring executive attention.
  - **Annual Committed Spend**: normalized across all active vendors.

### Step B: Urgent Contract Inspection

- **Action**: In **Priority attention**, locate the fleet insurance item and its Critical badge.
- **Talking Point**: _"The priority list puts the decision date, vendor, commitment amount, and review action together."_
- **Action**: Click **Inspect** to open the matching obligation's edit dialog. The dashboard and obligation register read from the same PostgreSQL data.

### Step C: Manual Obligation Creation & Date Arithmetic

- **Route**: `http://localhost:3000/obligations`
- **Action**: Click **Add Obligation**.
- **Form Demonstration**:
  - Title: `Snowflake Data Cloud Warehouse`
  - Vendor: `Snowflake Inc.`
  - Type: `Subscription`
  - Billing Frequency: `Annual`
  - Amount: `24000`
  - Start Date: `2026-01-01`
  - Renewal Date: `2026-11-30`
  - Notice Period (Days): Type `60`.
- **Highlight**: In the **Calculated cancellation deadline** preview, changing Notice period from 30 to 60 shifts the date from `2026-10-31` to `2026-10-01`.
- **Action**: Click **Save obligation**. The obligation is persisted to PostgreSQL and appears in the searchable register. **View & edit** on smaller screens or **Edit** on desktop reopens it.
- **Search Demo**: Type `Snowflake` in the search bar. The table filters instantly against the real backend.

### Step D: Autonomous Monitoring & Idempotency

- **Talking Point**: _"RenewalRadar's deadline scanner runs automatically. This demo control triggers it manually to show real-time alert creation."_
- **Action**: In the dashboard's **Demo Tools** area, click **Trigger Scanner Demo**.
- **Highlight**: The scanner evaluates real obligations and creates persisted alerts. Running it again produces zero duplicates (idempotency).
- Open the notification bell. The drawer displays real alerts in Critical / High / Medium / Low order, with milestone and trigger-date metadata.
- Click **Mark as read** to acknowledge an alert. The acknowledgment persists in PostgreSQL and reduces the unread badge.
- A separate **Demo tools** area inside the drawer also provides **Trigger Scanner Demo**.

### Step E: Multi-Tenant RBAC & Team Governance

- **Route**: `http://localhost:3000/settings/team` (click **Team & Roles** in the sidebar or mobile navigation)
- **Talking Point**: _"RenewalRadar is built with multi-tenant zero trust by construction. Every query is partitioned by organization ID, and role-based access control governs all actions."_
- **Highlight**:
  - Point out the 4 defined roles: **Owner**, **Admin**, **Member**, **Viewer**.
  - Point out the current members: Sarah Jenkins (Owner), Dave Miller (Admin), Alex Chen (Member).
- **Action**: Click **Invite member**. Enter `intern@acmelogistics.com` and select **Viewer**.
- **Action**: Click **Send invitation**. The invitation is created in PostgreSQL with a 7-day expiry. The entry appears under **Pending invitations**, not active members.
- **Talking Point**: _"The role guide explains the access model. Invitations are single-use tokens that expire after 7 days. Accepting one creates a real user account with the assigned role."_

### Step F: Return to Dashboard

- **Route**: Click **Dashboard** in the sidebar or mobile navigation.
- **Talking Point**: _"The redesigned workspace brings upcoming decisions and deadlines into one readable view."_

---

## 5. Troubleshooting & Emergency Recovery Playbook

Keep these Windows-friendly commands handy during presentation setup:

### Scenario 1: Port 3000 or 4000 is already in use

Find and terminate any stale process:

```cmd
netstat -ano | findstr :3000
netstat -ano | findstr :4000
taskkill /F /PID <PID_NUMBER>
```

### Scenario 2: Backend crashes or becomes unresponsive

Restart backend in Terminal 2:

```bash
cd C:\tmp\spec-driven-project
npm run dev --workspace=backend
```

### Scenario 3: Frontend needs fresh build / restart

Restart frontend in Terminal 3:

```bash
cd C:\tmp\spec-driven-project
npm run dev --workspace=frontend
```

### Scenario 4: Database records become corrupted during practice

Run the safe development reset:

```bash
cd C:\tmp\spec-driven-project
npm run demo:reset
```

### Scenario 5: Manual Deadline Scanner execution from terminal

If the browser button is not preferred, run the scanner directly via CLI:

```bash
cd C:\tmp\spec-driven-project\backend
npx tsx src/queue/workers/deadline-scanner.worker.ts
```

---

## 6. Known MVP Limitations (Honest Disclosure for Judges/Audience)

- **AI Document Extraction (US5)**: Currently in specification stage; v1 uses manual entry and simulated staging.
- **Contract Change Detection (US6)**: Underlying diff service is built and tested; UI visualizer will be completed in Milestone 3.
- **Payment Gateway (US7)**: Plan quotas (Free/Business/Pro) are strictly enforced in backend middleware; Stripe checkout integration is planned for commercial release.
- **External Email Deliveries**: Currently routing through development logging transport to prevent third-party dependency failures during the presentation.
