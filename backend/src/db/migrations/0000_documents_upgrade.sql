CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  obligation_id UUID REFERENCES obligations(id) ON DELETE SET NULL,
  original_filename VARCHAR(255),
  sanitized_filename VARCHAR(255),
  declared_mime_type VARCHAR(100),
  detected_mime_type VARCHAR(100),
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  file_hash_sha256 CHAR(64),
  storage_path VARCHAR(512) NOT NULL DEFAULT '',
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
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255);
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sanitized_filename VARCHAR(255);
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS declared_mime_type VARCHAR(100);
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS detected_mime_type VARCHAR(100);
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS security_status VARCHAR(50) NOT NULL DEFAULT 'scan_pending';
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS failure_reason TEXT;
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_started_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_completed_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
--> statement-breakpoint
ALTER TABLE documents ALTER COLUMN file_hash_sha256 DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE documents ALTER COLUMN processing_status SET DEFAULT 'upload_pending';
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'filename') THEN
    UPDATE documents SET original_filename = filename WHERE original_filename IS NULL;
    UPDATE documents SET sanitized_filename = filename WHERE sanitized_filename IS NULL;
    ALTER TABLE documents DROP COLUMN filename;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'mime_type') THEN
    UPDATE documents SET declared_mime_type = mime_type WHERE declared_mime_type IS NULL;
    ALTER TABLE documents DROP COLUMN mime_type;
  END IF;
END $$;
--> statement-breakpoint
UPDATE documents SET original_filename = 'unnamed_document' WHERE original_filename IS NULL;
--> statement-breakpoint
ALTER TABLE documents ALTER COLUMN original_filename SET NOT NULL;
--> statement-breakpoint
UPDATE documents SET sanitized_filename = 'unnamed_document' WHERE sanitized_filename IS NULL;
--> statement-breakpoint
ALTER TABLE documents ALTER COLUMN sanitized_filename SET NOT NULL;
--> statement-breakpoint
UPDATE documents SET declared_mime_type = 'application/pdf' WHERE declared_mime_type IS NULL;
--> statement-breakpoint
ALTER TABLE documents ALTER COLUMN declared_mime_type SET NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_org_processing_status ON documents(organization_id, processing_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_org_security_status ON documents(organization_id, security_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_org_created_at ON documents(organization_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_documents_obligation_id ON documents(obligation_id);
--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE extraction_stagings ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
--> statement-breakpoint
ALTER TABLE extraction_stagings ADD COLUMN IF NOT EXISTS provider_model VARCHAR(255);
--> statement-breakpoint
ALTER TABLE extraction_stagings ADD COLUMN IF NOT EXISTS provider_metadata JSONB;
--> statement-breakpoint
ALTER TABLE extraction_stagings ADD COLUMN IF NOT EXISTS failure_reason TEXT;
--> statement-breakpoint
ALTER TABLE extraction_stagings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_stagings_document_id ON extraction_stagings(document_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_extraction_stagings_org_status ON extraction_stagings(organization_id, status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_extraction_stagings_org_created_at ON extraction_stagings(organization_id, created_at);
