-- Phase 6: Finding & Corrective Action Management
-- Migration: 00006_finding_capa_workflow.sql
--
-- This migration adds comprehensive CAPA (Corrective and Preventive Action) workflow support
-- with complete finding lifecycle management and corrective action tracking.

-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE FINDINGS TABLE
-- ═══════════════════════════════════════════════════════════════════════

-- Add workflow tracking fields to findings
ALTER TABLE findings
ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS due_date timestamptz,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS closed_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verification_comment text,
ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reopen_reason text;

-- Update finding status enum to include new statuses
ALTER TYPE finding_status ADD VALUE IF NOT EXISTS 'assigned';
ALTER TYPE finding_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE finding_status ADD VALUE IF NOT EXISTS 'overdue';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_findings_assigned_to ON findings(assigned_to);
CREATE INDEX IF NOT EXISTS idx_findings_due_date ON findings(due_date);
CREATE INDEX IF NOT EXISTS idx_findings_status_due ON findings(status, due_date);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
CREATE INDEX IF NOT EXISTS idx_findings_risk_level ON findings(risk_level);
CREATE INDEX IF NOT EXISTS idx_findings_category ON findings(category);
CREATE INDEX IF NOT EXISTS idx_findings_created_by ON findings(created_by);

-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE CORRECTIVE ACTIONS TABLE
-- ═══════════════════════════════════════════════════════════════════════

-- Add workflow tracking fields to corrective actions
ALTER TABLE corrective_actions
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
ADD COLUMN IF NOT EXISTS reopened_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS reopen_reason text;

-- Update CA status enum to include 'assigned'
ALTER TYPE ca_status ADD VALUE IF NOT EXISTS 'assigned';

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_corrective_actions_finding ON corrective_actions(finding_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status ON corrective_actions(status);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_verification ON corrective_actions(verification_status);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_responsible ON corrective_actions(responsible_person);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_due_date ON corrective_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status_due ON corrective_actions(status, due_date);

-- ═══════════════════════════════════════════════════════════════════════
-- CREATE VIEWS FOR DASHBOARD METRICS
-- ═══════════════════════════════════════════════════════════════════════

-- View: Finding metrics by organization
CREATE OR REPLACE VIEW v_finding_metrics AS
SELECT 
  a.organization_id,
  COUNT(*) FILTER (WHERE f.status = 'open') as open_findings,
  COUNT(*) FILTER (WHERE f.severity = 'critical') as critical_findings,
  COUNT(*) FILTER (WHERE f.severity = 'major') as major_findings,
  COUNT(*) FILTER (WHERE f.status IN ('open', 'assigned', 'in_progress') AND f.due_date < NOW()) as overdue_findings,
  COUNT(*) FILTER (WHERE f.status = 'closed') as closed_findings,
  AVG(
    EXTRACT(EPOCH FROM (f.closed_at - f.created_at)) / 86400
  ) FILTER (WHERE f.status = 'closed') as avg_closure_days
FROM findings f
JOIN audits a ON a.id = f.audit_id
GROUP BY a.organization_id;

-- View: Overdue findings with details
CREATE OR REPLACE VIEW v_overdue_findings AS
SELECT 
  f.*,
  a.audit_number,
  a.farm_id,
  fa.farm_name,
  fa.organization_id,
  p.full_name as assigned_to_name,
  p.email as assigned_to_email,
  EXTRACT(DAY FROM NOW() - f.due_date) as days_overdue
FROM findings f
JOIN audits a ON a.id = f.audit_id
JOIN farms fa ON fa.id = a.farm_id
LEFT JOIN profiles p ON p.id = f.assigned_to
WHERE f.status IN ('open', 'assigned', 'in_progress')
  AND f.due_date < NOW();

-- View: Corrective action metrics
CREATE OR REPLACE VIEW v_corrective_action_metrics AS
SELECT 
  fa.organization_id,
  COUNT(*) FILTER (WHERE ca.status IN ('open', 'assigned')) as open_cas,
  COUNT(*) FILTER (WHERE ca.status = 'in_progress') as in_progress_cas,
  COUNT(*) FILTER (WHERE ca.status = 'submitted_for_verification') as submitted_cas,
  COUNT(*) FILTER (WHERE ca.status = 'closed') as closed_cas,
  COUNT(*) FILTER (WHERE ca.status != 'closed' AND ca.due_date < NOW()) as overdue_cas,
  AVG(
    EXTRACT(EPOCH FROM (ca.completed_at - ca.created_at)) / 86400
  ) FILTER (WHERE ca.status = 'closed') as avg_completion_days
FROM corrective_actions ca
JOIN findings f ON f.id = ca.finding_id
JOIN audits a ON a.id = f.audit_id
JOIN farms fa ON fa.id = a.farm_id
GROUP BY fa.organization_id;

-- ═══════════════════════════════════════════════════════════════════════
-- CREATE FUNCTIONS FOR FINDING MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════

-- Function: Calculate finding closure time
CREATE OR REPLACE FUNCTION calculate_finding_closure_time(finding_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created_at timestamptz;
  v_closed_at timestamptz;
BEGIN
  SELECT created_at, closed_at INTO v_created_at, v_closed_at
  FROM findings
  WHERE id = finding_id;
  
  IF v_closed_at IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN EXTRACT(EPOCH FROM (v_closed_at - v_created_at)) / 86400;
END;
$$;

-- Function: Calculate CA completion time
CREATE OR REPLACE FUNCTION calculate_ca_completion_time(ca_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_created_at timestamptz;
  v_completed_at timestamptz;
BEGIN
  SELECT created_at, completed_at INTO v_created_at, v_completed_at
  FROM corrective_actions
  WHERE id = ca_id;
  
  IF v_completed_at IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN EXTRACT(EPOCH FROM (v_completed_at - v_created_at)) / 86400;
END;
$$;

-- Function: Get findings due this week
CREATE OR REPLACE FUNCTION get_findings_due_this_week(org_id uuid DEFAULT NULL)
RETURNS TABLE (
  finding_id uuid,
  finding_number text,
  title text,
  severity finding_status,
  due_date timestamptz,
  days_until_due numeric,
  assigned_to_name text,
  farm_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    f.id,
    f.finding_number,
    f.title,
    f.severity::finding_status,
    f.due_date,
    EXTRACT(DAY FROM f.due_date - NOW()),
    p.full_name,
    fa.farm_name
  FROM findings f
  JOIN audits a ON a.id = f.audit_id
  JOIN farms fa ON fa.id = a.farm_id
  LEFT JOIN profiles p ON p.id = f.assigned_to
  WHERE f.status IN ('open', 'assigned', 'in_progress')
    AND f.due_date >= NOW()
    AND f.due_date <= NOW() + INTERVAL '7 days'
    AND (org_id IS NULL OR fa.organization_id = org_id)
  ORDER BY f.due_date ASC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION calculate_finding_closure_time(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_ca_completion_time(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_findings_due_this_week(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- UPDATE RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- Ensure findings are scoped to organization
DROP POLICY IF EXISTS "Findings: org members can read" ON findings;
CREATE POLICY "Findings: org members can read"
ON findings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM audits a
    JOIN profiles p ON p.organization_id = a.organization_id
    WHERE a.id = findings.audit_id
      AND p.id = (select auth.uid())
      AND p.status = 'active'
  )
);

-- Ensure corrective actions are scoped to organization
DROP POLICY IF EXISTS "Corrective actions: org members can read" ON corrective_actions;
CREATE POLICY "Corrective actions: org members can read"
ON corrective_actions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM findings f
    JOIN audits a ON a.id = f.audit_id
    JOIN profiles p ON p.organization_id = a.organization_id
    WHERE f.id = corrective_actions.finding_id
      AND p.id = (select auth.uid())
      AND p.status = 'active'
  )
);

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN findings.assigned_to IS 'User assigned to resolve the finding';
COMMENT ON COLUMN findings.due_date IS 'Target date for finding resolution';
COMMENT ON COLUMN findings.started_at IS 'When work on the finding began';
COMMENT ON COLUMN findings.submitted_at IS 'When finding was submitted for verification';
COMMENT ON COLUMN findings.closed_at IS 'When finding was closed/verified';
COMMENT ON COLUMN findings.verified_by IS 'User who verified the finding';
COMMENT ON COLUMN findings.verified_at IS 'When finding was verified';
COMMENT ON COLUMN findings.verification_comment IS 'Comments from verification';
COMMENT ON COLUMN findings.reopened_at IS 'When finding was reopened';
COMMENT ON COLUMN findings.reopened_by IS 'User who reopened the finding';
COMMENT ON COLUMN findings.reopen_reason IS 'Reason for reopening';

COMMENT ON COLUMN corrective_actions.started_at IS 'When work on the CA began';
COMMENT ON COLUMN corrective_actions.submitted_at IS 'When CA was submitted for verification';
COMMENT ON COLUMN corrective_actions.reopened_at IS 'When CA was reopened';
COMMENT ON COLUMN corrective_actions.reopened_by IS 'User who reopened the CA';
COMMENT ON COLUMN corrective_actions.reopen_reason IS 'Reason for reopening';

COMMENT ON VIEW v_finding_metrics IS 'Finding metrics aggregated by organization';
COMMENT ON VIEW v_overdue_findings IS 'All overdue findings with details';
COMMENT ON VIEW v_corrective_action_metrics IS 'Corrective action metrics aggregated by organization';

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
