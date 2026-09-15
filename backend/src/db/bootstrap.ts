export const BOOTSTRAP_SQL = `

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  default_currency CHAR(3) NOT NULL DEFAULT 'USD',
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique ON organization_members(organization_id, user_id);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  website VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendors_org_name ON vendors(organization_id, name);

CREATE TABLE IF NOT EXISTS obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  billing_frequency VARCHAR(50) NOT NULL,
  start_date DATE,
  renewal_date DATE NOT NULL,
  expiration_date DATE,
  notice_period_days INTEGER NOT NULL DEFAULT 30,
  cancellation_deadline DATE NOT NULL,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  internal_owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_obligations_org_status ON obligations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_obligations_cancellation ON obligations(organization_id, cancellation_deadline);
CREATE INDEX IF NOT EXISTS idx_obligations_renewal ON obligations(organization_id, renewal_date);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invitations_org_email ON organization_invitations(organization_id, email);

CREATE TABLE IF NOT EXISTS obligation_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  obligation_id UUID NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  milestone VARCHAR(50) NOT NULL,
  trigger_date DATE NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  idempotency_key VARCHAR(255) NOT NULL UNIQUE,
  in_app_delivered BOOLEAN NOT NULL DEFAULT false,
  email_delivered BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_idempotency_key ON obligation_alerts(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_alerts_org_trigger ON obligation_alerts(organization_id, trigger_date);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  obligation_id UUID REFERENCES obligations(id) ON DELETE SET NULL,
  original_filename VARCHAR(255) NOT NULL,
  sanitized_filename VARCHAR(255) NOT NULL,
  declared_mime_type VARCHAR(100) NOT NULL,
  detected_mime_type VARCHAR(100),
  file_size_bytes BIGINT NOT NULL,
  file_hash_sha256 CHAR(64),
  storage_path VARCHAR(512) NOT NULL,
  processing_status VARCHAR(50) NOT NULL DEFAULT 'upload_pending',
  security_status VARCHAR(50) NOT NULL DEFAULT 'scan_pending',
  failure_reason TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extraction_started_at TIMESTAMPTZ,
  extraction_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS security_status VARCHAR(50) NOT NULL DEFAULT 'scan_pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sanitized_filename VARCHAR(255);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS declared_mime_type VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS detected_mime_type VARCHAR(100);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_completed_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_documents_org_processing_status ON documents(organization_id, processing_status);
CREATE INDEX IF NOT EXISTS idx_documents_org_security_status ON documents(organization_id, security_status);
CREATE INDEX IF NOT EXISTS idx_documents_org_created_at ON documents(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_obligation_id ON documents(obligation_id);
CREATE TABLE IF NOT EXISTS extraction_stagings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_review',
  overall_confidence REAL NOT NULL DEFAULT 0.0,
  extracted_fields JSONB NOT NULL,
  provider VARCHAR(50),
  provider_model VARCHAR(255),
  provider_metadata JSONB,
  failure_reason TEXT,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_stagings_document_id ON extraction_stagings(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_stagings_org_status ON extraction_stagings(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_extraction_stagings_org_created_at ON extraction_stagings(organization_id, created_at);

CREATE TABLE IF NOT EXISTS contract_change_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  obligation_id UUID NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  previous_state JSONB NOT NULL,
  new_state JSONB NOT NULL,
  price_delta NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  price_percent_change NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  tier VARCHAR(50) NOT NULL DEFAULT 'free',
  max_obligations INTEGER NOT NULL DEFAULT 10,
  monthly_ai_extractions INTEGER NOT NULL DEFAULT 0,
  current_ai_extractions_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  before_state JSONB,
  after_state JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(organization_id, created_at DESC);
`;
