# Developer Quickstart Guide: RenewalRadar

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)
**Date**: 2026-09-05
**Status**: Active

---

## 1. Prerequisites

Ensure the following tools are installed locally:
- **Node.js**: `v20.12.0+` (LTS)
- **pnpm** or **npm**: `v9.0.0+`
- **Docker & Docker Compose**: For local PostgreSQL, Redis, and MinIO
- **Git**: For version control

---

## 2. Infrastructure Spin-Up (Local Containers)

A standard `docker-compose.yml` provides the required backing services:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: renewalradar
      POSTGRES_PASSWORD: local_dev_password
      POSTGRES_DB: renewalradar_dev
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio_admin
      MINIO_ROOT_PASSWORD: minio_dev_password
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

Start services:
```bash
docker compose up -d
```

---

## 3. Environment Configuration

Copy the sample environment file:
```bash
cp .env.example .env
```

Ensure configuration matches local services:
```env
# Application & Port
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000
SESSION_SECRET=a_very_long_secure_random_key_for_cookie_sessions_32_bytes

# Database
DATABASE_URL=postgresql://renewalradar:local_dev_password@localhost:5432/renewalradar_dev

# Cache & Distributed Queue
REDIS_URL=redis://localhost:6379

# Object Storage (S3 / MinIO)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=renewalradar-documents
S3_ACCESS_KEY_ID=minio_admin
S3_SECRET_ACCESS_KEY=minio_dev_password
S3_FORCE_PATH_STYLE=true

# AI Extraction Provider
AI_PROVIDER=mock # or 'anthropic' | 'openai'
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# Email Dispatch
SMTP_HOST=localhost
SMTP_PORT=1025 # Mailpit / Mailhog for local inspection
```

---

## 4. Database Setup & Migrations

Run database migrations using Drizzle Kit:
```bash
cd backend
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm db:seed # Seeds demo SMB tenant, sample obligations, and test users
```

---

## 5. Running the Application

### 5.1 Run the Backend API Service
```bash
cd backend
pnpm dev
# API listening on http://localhost:4000
```

### 5.2 Run the Background Worker Process
The worker handles scheduled deadline scanning and asynchronous document extraction:
```bash
cd backend
pnpm worker:dev
# BullMQ worker listening on queues: 'deadline-scanner', 'document-ingestion'
```

### 5.3 Run the Web Application
```bash
cd frontend
pnpm install
pnpm dev
# Next.js web application listening on http://localhost:3000
```

---

## 6. Verification & Automated Test Suites

Run the complete test suite:
```bash
# Run unit tests (deterministic calculations, risk formulas, date boundary logic)
pnpm test:unit

# Run multi-tenant isolation and integration tests
pnpm test:integration

# Run API contract validation tests
pnpm test:contract

# Run end-to-end user journeys (User Story 1 through 5)
pnpm test:e2e
```
