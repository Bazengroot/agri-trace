-- Storage Policies for Audit Evidence
-- Migration: 00005_storage_policies.sql

-- ═══════════════════════════════════════════════════════════════════════
-- CREATE STORAGE BUCKET
-- ═══════════════════════════════════════════════════════════════════════

-- Create audit-evidence bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audit-evidence',
  'audit-evidence',
  false, -- Private bucket
  20971520, -- 20 MB file size limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
-- STORAGE POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- Policy: Users can upload evidence to audits they are assigned to
CREATE POLICY "Users can upload evidence to assigned audits"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'audit-evidence'
  AND (
    -- Check if user is the auditor assigned to this audit
    EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id::text = (storage.foldername(name))[2]
        AND audits.auditor_id = auth.uid()
    )
    -- Or user is admin
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'audit_admin')
    )
  )
);

-- Policy: Users can view evidence from their organization's audits
CREATE POLICY "Users can view evidence from their organization"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'audit-evidence'
  AND (
    -- User is in the same organization as the audit
    EXISTS (
      SELECT 1 FROM audits
      JOIN profiles ON profiles.organization_id = audits.organization_id
      WHERE audits.id::text = (storage.foldername(name))[2]
        AND profiles.id = auth.uid()
    )
    -- Or user is admin
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'audit_admin')
    )
  )
);

-- Policy: Users can update their own evidence (before audit submission)
CREATE POLICY "Users can update their own evidence"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'audit-evidence'
  AND (
    -- User uploaded this evidence
    EXISTS (
      SELECT 1 FROM evidence
      WHERE evidence.file_path = name
        AND evidence.uploaded_by = auth.uid()
        -- And audit is not finalized
        AND EXISTS (
          SELECT 1 FROM audits
          WHERE audits.id = evidence.audit_id
            AND audits.status NOT IN ('submitted', 'under_review', 'approved', 'closed')
        )
    )
    -- Or user is admin
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'audit_admin')
    )
  )
);

-- Policy: Users can delete their own evidence (before audit submission)
CREATE POLICY "Users can delete their own evidence"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'audit-evidence'
  AND (
    -- User uploaded this evidence
    EXISTS (
      SELECT 1 FROM evidence
      WHERE evidence.file_path = name
        AND evidence.uploaded_by = auth.uid()
        -- And audit is not finalized
        AND EXISTS (
          SELECT 1 FROM audits
          WHERE audits.id = evidence.audit_id
            AND audits.status NOT IN ('submitted', 'under_review', 'approved', 'closed')
        )
    )
    -- Or user is admin
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'audit_admin')
    )
  )
);

-- ═══════════════════════════════════════════════════════════════════════
-- HELPER FUNCTION: Get storage folder structure
-- ═══════════════════════════════════════════════════════════════════════

-- Function to extract folder structure from storage path
CREATE OR REPLACE FUNCTION storage.get_evidence_folders(path text)
RETURNS TABLE (
  organization_id uuid,
  farm_id uuid,
  audit_id uuid
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(path, '/');
  
  IF array_length(parts, 1) >= 3 THEN
    organization_id := parts[1]::uuid;
    farm_id := parts[2]::uuid;
    audit_id := parts[3]::uuid;
    RETURN NEXT;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION storage.get_evidence_folders(text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════════════

-- Index on evidence table for faster lookups
CREATE INDEX IF NOT EXISTS idx_evidence_audit_id ON evidence(audit_id);
CREATE INDEX IF NOT EXISTS idx_evidence_question_id ON evidence(question_id);
CREATE INDEX IF NOT EXISTS idx_evidence_finding_id ON evidence(finding_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_at ON evidence(uploaded_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-cleanup orphaned evidence files
-- ═══════════════════════════════════════════════════════════════════════

-- Function to cleanup evidence when audit is deleted
CREATE OR REPLACE FUNCTION cleanup_evidence_on_audit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Delete evidence records for this audit
  DELETE FROM evidence WHERE audit_id = OLD.id;
  
  -- Note: Actual file deletion from storage should be handled by a separate
  -- cleanup job or manually, as we can't delete from storage in a trigger
  -- without proper error handling
  
  RETURN OLD;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_cleanup_evidence_on_audit_delete ON audits;
CREATE TRIGGER trigger_cleanup_evidence_on_audit_delete
  BEFORE DELETE ON audits
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_evidence_on_audit_delete();

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION storage.get_evidence_folders(text) IS 
'Extracts organization_id, farm_id, and audit_id from a storage path';

COMMENT ON FUNCTION cleanup_evidence_on_audit_delete() IS 
'Automatically cleans up evidence records when an audit is deleted';

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
