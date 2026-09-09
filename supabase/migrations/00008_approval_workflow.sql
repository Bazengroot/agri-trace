-- Phase 8: Approval Workflow, Notifications & Audit Trail
-- Migration: 00008_approval_workflow.sql

-- ═══════════════════════════════════════════════════════════════════════
-- AUDIT TRAIL TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit trail
CREATE INDEX IF NOT EXISTS idx_audit_trail_audit_id ON audit_trail(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user_id ON audit_trail(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_action ON audit_trail(action);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity_type ON audit_trail(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity_id ON audit_trail(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_audit_created ON audit_trail(audit_id, created_at DESC);

-- Enable RLS
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit trail
CREATE POLICY "Users can view audit trail for their organization"
  ON audit_trail FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM audits a
      JOIN profiles p ON p.organization_id = a.organization_id
      WHERE a.id = audit_trail.audit_id
        AND p.id = auth.uid()
    )
  );

CREATE POLICY "System can insert audit trail"
  ON audit_trail FOR INSERT
  WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE AUDITS TABLE FOR APPROVAL WORKFLOW
-- ═══════════════════════════════════════════════════════════════════════

-- Add approval workflow fields
ALTER TABLE audits ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS review_comments TEXT;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES profiles(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE audits ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES profiles(id);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;

-- Add new audit status values
ALTER TYPE audit_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE audit_status ADD VALUE IF NOT EXISTS 'returned';
ALTER TYPE audit_status ADD VALUE IF NOT EXISTS 'approved';

-- Indexes for approval workflow
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_audits_submitted_at ON audits(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_reviewed_at ON audits(reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_finalized_at ON audits(finalized_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE NOTIFICATIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════

-- Add priority field
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

-- Add new notification types
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'audit_revised';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ca_submitted';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ca_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ca_verified';

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- ═══════════════════════════════════════════════════════════════════════
-- VIEWS FOR APPROVAL WORKFLOW
-- ═══════════════════════════════════════════════════════════════════════

-- View: Audits pending review
CREATE OR REPLACE VIEW v_audits_pending_review AS
SELECT 
  a.*,
  f.farm_name,
  f.farm_code,
  p.full_name as auditor_name,
  p.email as auditor_email,
  COUNT(DISTINCT fi.id) as findings_count,
  COUNT(DISTINCT CASE WHEN fi.severity = 'critical' THEN fi.id END) as critical_findings
FROM audits a
JOIN farms f ON f.id = a.farm_id
LEFT JOIN profiles p ON p.id = a.auditor_id
LEFT JOIN findings fi ON fi.audit_id = a.id
WHERE a.status = 'submitted'
GROUP BY a.id, f.id, p.id;

-- View: Audits returned for revision
CREATE OR REPLACE VIEW v_audits_returned AS
SELECT 
  a.*,
  f.farm_name,
  f.farm_code,
  p.full_name as auditor_name,
  p.email as auditor_email,
  pr.full_name as reviewer_name,
  a.review_comments,
  a.revision_count
FROM audits a
JOIN farms f ON f.id = a.farm_id
LEFT JOIN profiles p ON p.id = a.auditor_id
LEFT JOIN profiles pr ON pr.id = a.reviewed_by
WHERE a.status = 'returned';

-- View: Audit approval history
CREATE OR REPLACE VIEW v_audit_approval_history AS
SELECT 
  at.*,
  p.full_name as user_name,
  p.email as user_email,
  p.role as user_role
FROM audit_trail at
LEFT JOIN profiles p ON p.id = at.user_id
WHERE at.action IN ('submit_for_review', 'approve', 'return', 'revise', 'finalize', 'close')
ORDER BY at.created_at ASC;

-- ═══════════════════════════════════════════════════════════════════════
-- FUNCTIONS FOR APPROVAL WORKFLOW
-- ═══════════════════════════════════════════════════════════════════════

-- Function: Check if audit can be modified
CREATE OR REPLACE FUNCTION can_modify_audit(p_audit_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status audit_status;
  v_finalized_at TIMESTAMPTZ;
BEGIN
  SELECT status, finalized_at INTO v_status, v_finalized_at
  FROM audits
  WHERE id = p_audit_id;
  
  -- Cannot modify if finalized
  IF v_finalized_at IS NOT NULL THEN
    RETURN false;
  END IF;
  
  -- Can only modify if in draft, scheduled, assigned, in_progress, or returned status
  RETURN v_status IN ('draft', 'scheduled', 'assigned', 'in_progress', 'returned');
END;
$$;

-- Function: Get approval timeline for an audit
CREATE OR REPLACE FUNCTION get_audit_approval_timeline(p_audit_id UUID)
RETURNS TABLE (
  action TEXT,
  user_name TEXT,
  user_email TEXT,
  timestamp TIMESTAMPTZ,
  comments TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    at.action,
    p.full_name,
    p.email,
    at.created_at,
    COALESCE(at.new_value->>'comments', at.new_value->>'reason', '') as comments
  FROM audit_trail at
  LEFT JOIN profiles p ON p.id = at.user_id
  WHERE at.audit_id = p_audit_id
    AND at.action IN ('submit_for_review', 'approve', 'return', 'revise', 'finalize', 'close')
  ORDER BY at.created_at ASC;
END;
$$;

-- Function: Get notification summary for user
CREATE OR REPLACE FUNCTION get_notification_summary(p_user_id UUID)
RETURNS TABLE (
  total_notifications BIGINT,
  unread_notifications BIGINT,
  urgent_notifications BIGINT,
  high_priority_notifications BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE is_read = false) as unread_notifications,
    COUNT(*) FILTER (WHERE priority = 'urgent' AND is_read = false) as urgent_notifications,
    COUNT(*) FILTER (WHERE priority = 'high' AND is_read = false) as high_priority_notifications
  FROM notifications
  WHERE user_id = p_user_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION can_modify_audit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_approval_timeline(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_summary(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- TRIGGERS FOR AUTOMATIC AUDIT TRAIL LOGGING
-- ═══════════════════════════════════════════════════════════════════════

-- Function to log audit status changes
CREATE OR REPLACE FUNCTION log_audit_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO audit_trail (
      audit_id,
      user_id,
      action,
      entity_type,
      entity_id,
      old_value,
      new_value,
      created_at
    ) VALUES (
      NEW.id,
      auth.uid(),
      CASE 
        WHEN NEW.status = 'submitted' THEN 'submit_for_review'
        WHEN NEW.status = 'approved' THEN 'approve'
        WHEN NEW.status = 'returned' THEN 'return'
        WHEN NEW.status = 'closed' THEN 'close'
        ELSE 'status_change'
      END,
      'audit',
      NEW.id::TEXT,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_log_audit_status_change ON audits;
CREATE TRIGGER trigger_log_audit_status_change
  AFTER UPDATE ON audits
  FOR EACH ROW
  EXECUTE FUNCTION log_audit_status_change();

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON TABLE audit_trail IS 'Comprehensive audit trail for all audit-related activities';
COMMENT ON COLUMN audit_trail.action IS 'Action performed (e.g., submit_for_review, approve, return, revise, finalize, close)';
COMMENT ON COLUMN audit_trail.entity_type IS 'Type of entity (audit, finding, corrective_action, evidence, response)';
COMMENT ON COLUMN audit_trail.old_value IS 'Previous state as JSON';
COMMENT ON COLUMN audit_trail.new_value IS 'New state as JSON';

COMMENT ON COLUMN audits.submitted_at IS 'When audit was submitted for review';
COMMENT ON COLUMN audits.submitted_by IS 'Who submitted the audit';
COMMENT ON COLUMN audits.reviewed_at IS 'When audit was reviewed';
COMMENT ON COLUMN audits.reviewed_by IS 'Who reviewed the audit';
COMMENT ON COLUMN audits.review_comments IS 'Comments from reviewer';
COMMENT ON COLUMN audits.finalized_at IS 'When audit was finalized (immutable)';
COMMENT ON COLUMN audits.finalized_by IS 'Who finalized the audit';
COMMENT ON COLUMN audits.closed_at IS 'When audit was closed';
COMMENT ON COLUMN audits.closed_by IS 'Who closed the audit';
COMMENT ON COLUMN audits.revision_count IS 'Number of times audit was revised';

COMMENT ON COLUMN notifications.priority IS 'Notification priority (low, medium, high, urgent)';
COMMENT ON COLUMN notifications.read_at IS 'When notification was marked as read';

COMMENT ON VIEW v_audits_pending_review IS 'Audits submitted and waiting for review';
COMMENT ON VIEW v_audits_returned IS 'Audits returned for revision';
COMMENT ON VIEW v_audit_approval_history IS 'Complete approval history for audits';

COMMENT ON FUNCTION can_modify_audit(UUID) IS 'Check if audit can be modified based on status and finalization';
COMMENT ON FUNCTION get_audit_approval_timeline(UUID) IS 'Get complete approval timeline for an audit';
COMMENT ON FUNCTION get_notification_summary(UUID) IS 'Get notification summary for a user';
