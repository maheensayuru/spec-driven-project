# RenewalRadar: Live Presentation Demonstration Guide

This guide details the exact sequence, commands, and talking points for presenting the RenewalRadar P1 Minimum Viable Product (US1 through US4).

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
npm run start --workspace=frontend
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
  - **Active Obligations**: 3 monitored contracts.
  - **Upcoming Renewals**: 1 renewal within 30 days.
  - **Urgent Action Items**: 2 items requiring executive attention.
  - **Annual Committed Spend**: $90,820 normalized across all active vendors.

### Step B: Urgent Contract Inspection

- **Action**: In the **"Urgent Actions Needed"** section, locate **Fleet Commercial Auto & Liability Insurance**.
- **Talking Point**: _"Notice the red Critical chip. This state-mandated fleet policy has a 45-day cancellation notice requirement. Our deterministic calculation engine determined that the cancellation deadline is September 16: exactly 5 days away. Missing this window commits the company to another full year."_
- **Action**: Click **"Inspect →"** to transition smoothly to the obligations list.

### Step C: Manual Obligation Creation & Date Arithmetic

- **Route**: `http://localhost:3000/obligations`
- **Action**: Click **"+ Add Obligation"**.
- **Form Demonstration**:
  - Title: `Snowflake Data Cloud Warehouse`
  - Vendor: `Snowflake Inc.`
  - Type: `Subscription`
  - Billing Frequency: `Annual`
  - Amount: `24000`
  - Start Date: `2026-01-01`
  - Renewal Date: `2026-11-30`
  - Notice Period (Days): Type `60`.
- **Highlight**: Look at the purple highlight box. As you change Notice Period from 30 to 60, the **Calculated Cancellation Deadline** dynamically shifts from `2026-10-31` to `2026-10-01`.
- **Action**: Click **"Save & Track Obligation"**. The obligation immediately appears in the searchable table.
- **Search Demo**: Type `Snowflake` in the search bar. The table filters instantly.

### Step D: Autonomous Monitoring & Idempotency

- **Talking Point**: _"RenewalRadar does not depend on users remembering to log in every morning. It runs an autonomous daily background scanner."_
- **Action**: Click the **"⚡ Trigger Scanner Demo"** button in the header (or open the Notification Bell and click "Scan Now").
- **Highlight**:
  - A confirmation banner appears: _"Scanner completed: 3 obligations analyzed. 1 critical alert confirmed. 0 duplicate alerts created."_
  - The notification bell updates with an unread badge (`2`).
  - Open the **Notification Drawer**: Point out the Critical severity alert and the milestone indicator (`7_day`).
  - Click **"⚡ Trigger Scanner Demo"** a second time.
  - Point out that **0 duplicate alerts** were created. Explain that every alert is protected by an immutable composite idempotency key (`org_id:obligation_id:milestone:date`).

### Step E: Multi-Tenant RBAC & Team Governance

- **Route**: `http://localhost:3000/settings/team` (click "Team & Roles" in top nav)
- **Talking Point**: _"RenewalRadar is built with multi-tenant zero trust by construction. Every query is partitioned by organization ID, and role-based access control governs all actions."_
- **Highlight**:
  - Point out the 4 defined roles: **Owner**, **Admin**, **Member**, **Viewer**.
  - Point out the current members: Sarah Jenkins (Owner), Dave Miller (Admin), Alex Chen (Member).
- **Action**: Click **"+ Invite Member"**. Enter `intern@acmelogistics.com` and select role **"Viewer (Read-only)"**.
- **Action**: Click **"Send Invitation"**. Point out the generated single-use token expiring in 7 days.
- **Talking Point**: _"Viewers can inspect obligations and dashboards, but our test suite verifies that any mutative POST, PATCH, or DELETE request from a Viewer is rejected with 403 Forbidden. Furthermore, cross-tenant lookups return 404 to prevent resource enumeration."_

### Step F: Return to Dashboard

- **Route**: Click **"Dashboard"** in the top navigation bar.
- **Talking Point**: _"The dashboard reflects the updated state, showing that RenewalRadar maintains continuous operational oversight over all corporate commitments."_

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
npm run start --workspace=frontend
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
