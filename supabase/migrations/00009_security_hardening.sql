-- Phase 9: Security Hardening
-- Migration: 00009_security_hardening.sql
--
-- This migration adds additional security measures and hardens the database

-- ═══════════════════════════════════════════════════════════════════════
-- ADDITIONAL RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════

-- Ensure audit_responses cannot be modified after audit finalization
CREATE POLICY "Audit responses: immutable after finalization"
  ON audit_responses
  FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = audit_responses.audit_id
        AND audits.finalized_at IS NOT NULL
    )
  );

CREATE POLICY "Audit responses: cannot delete after submission"
  ON audit_responses
  FOR DELETE
  USING (
    NOT EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = audit_responses.audit_id
        AND audits.status IN ('submitted', 'under_review', 'approved', 'closed')
    )
  );

-- Ensure findings cannot be modified after audit finalization
CREATE POLICY "Findings: immutable after finalization"
  ON findings
  FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = findings.audit_id
        AND audits.finalized_at IS NOT NULL
    )
  );

-- Ensure corrective actions cannot be modified after audit finalization
CREATE POLICY "Corrective actions: immutable after finalization"
  ON corrective_actions
  FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM findings f
      JOIN audits a ON a.id = f.audit_id
      WHERE f.id = corrective_actions.finding_id
        AND a.finalized_at IS NOT NULL
    )
  );

-- Ensure evidence cannot be modified after audit submission
CREATE POLICY "Evidence: immutable after submission"
  ON evidence
  FOR UPDATE
  USING (
    NOT EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = evidence.audit_id
        AND audits.status IN ('submitted', 'under_review', 'approved', 'closed')
    )
  );

CREATE POLICY "Evidence: cannot delete after submission"
  ON evidence
  FOR DELETE
  USING (
    NOT EXISTS (
      SELECT 1 FROM audits
      WHERE audits.id = evidence.audit_id
        AND audits.status IN ('submitted', 'under_review', 'approved', 'closed')
    )
  );

-- Ensure audit trail cannot be modified or deleted by users
CREATE POLICY "Audit trail: no updates allowed"
  ON audit_trail
  FOR UPDATE
  USING (false);

CREATE POLICY "Audit trail: no deletes allowed"
  ON audit_trail
  FOR DELETE
  USING (false);

-- ═══════════════════════════════════════════════════════════════════════
-- SECURITY FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Function to check if user can access a specific audit
CREATE OR REPLACE FUNCTION can_access_audit(p_audit_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_audit_org UUID;
  v_user_org UUID;
  v_auditor_id UUID;
  v_farm_manager UUID;
BEGIN
  -- Get audit details
  SELECT organization_id, auditor_id INTO v_audit_org, v_auditor_id
  FROM audits
  WHERE id = p_audit_id;
  
  -- Get user's organization
  SELECT organization_id INTO v_user_org
  FROM profiles
  WHERE id = p_user_id;
  
  -- Check if user is in the same organization
  IF v_audit_org != v_user_org THEN
    RETURN false;
  END IF;
  
  -- Check if user is the assigned auditor
  IF v_auditor_id = p_user_id THEN
    RETURN true;
  END IF;
  
  -- Check if user is farm manager for the audit's farm
  SELECT manager_id INTO v_farm_manager
  FROM farms
  WHERE id = (SELECT farm_id FROM audits WHERE id = p_audit_id);
  
  IF v_farm_manager = p_user_id THEN
    RETURN true;
  END IF;
  
  -- Check if user is admin
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND role IN ('super_admin', 'audit_admin')
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to check if user can access a specific farm
CREATE OR REPLACE FUNCTION can_access_farm(p_farm_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_farm_org UUID;
  v_user_org UUID;
  v_farm_manager UUID;
BEGIN
  -- Get farm details
  SELECT organization_id, manager_id INTO v_farm_org, v_farm_manager
  FROM farms
  WHERE id = p_farm_id;
  
  -- Get user's organization
  SELECT organization_id INTO v_user_org
  FROM profiles
  WHERE id = p_user_id;
  
  -- Check if user is in the same organization
  IF v_farm_org != v_user_org THEN
    RETURN false;
  END IF;
  
  -- Check if user is the farm manager
  IF v_farm_manager = p_user_id THEN
    RETURN true;
  END IF;
  
  -- Check if user is admin
  IF EXISTS (
    SELECT 1 FROM profiles
    WHERE id = p_user_id
      AND role IN ('super_admin', 'audit_admin')
  ) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to check if audit is finalized
CREATE OR REPLACE FUNCTION is_audit_finalized(p_audit_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM audits
    WHERE id = p_audit_id
      AND finalized_at IS NOT NULL
  );
END;
$$;

-- Function to check if audit is submitted
CREATE OR REPLACE FUNCTION is_audit_submitted(p_audit_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM audits
    WHERE id = p_audit_id
      AND status IN ('submitted', 'under_review', 'approved', 'closed')
  );
END;
$$;

-- Function to get user's accessible farm IDs
CREATE OR REPLACE FUNCTION get_accessible_farm_ids(p_user_id UUID)
RETURNS TABLE (farm_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_role TEXT;
  v_user_org UUID;
BEGIN
  -- Get user details
  SELECT role, organization_id INTO v_user_role, v_user_org
  FROM profiles
  WHERE id = p_user_id;
  
  -- Admins can access all farms in their organization
  IF v_user_role IN ('super_admin', 'audit_admin') THEN
    RETURN QUERY
    SELECT f.id FROM farms f
    WHERE f.organization_id = v_user_org;
    RETURN;
  END IF;
  
  -- Auditors can access farms they have audits for
  IF v_user_role = 'auditor' THEN
    RETURN QUERY
    SELECT DISTINCT a.farm_id
    FROM audits a
    WHERE a.auditor_id = p_user_id;
    RETURN;
  END IF;
  
  -- Farm managers can only access their assigned farm
  IF v_user_role = 'farm_manager' THEN
    RETURN QUERY
    SELECT f.id FROM farms f
    WHERE f.manager_id = p_user_id;
    RETURN;
  END IF;
  
  -- Supervisors can access farms they are assigned to
  IF v_user_role = 'supervisor' THEN
    RETURN QUERY
    SELECT f.id FROM farms f
    WHERE f.supervisor_id = p_user_id;
    RETURN;
  END IF;
  
  -- Viewers have no farm access
  RETURN;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION can_access_audit(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION can_access_farm(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_audit_finalized(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_audit_submitted(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_accessible_farm_ids(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ADDITIONAL INDEXES FOR SECURITY QUERIES
-- ═══════════════════════════════════════════════════════════════════════

-- Index for fast audit access checks
CREATE INDEX IF NOT EXISTS idx_audits_auditor_finalized ON audits(auditor_id, finalized_at);
CREATE INDEX IF NOT EXISTS idx_audits_farm_finalized ON audits(farm_id, finalized_at);
CREATE INDEX IF NOT EXISTS idx_audits_status_finalized ON audits(status, finalized_at);

-- Index for fast farm access checks
CREATE INDEX IF NOT EXISTS idx_farms_manager_org ON farms(manager_id, organization_id);
CREATE INDEX IF NOT EXISTS idx_farms_supervisor_org ON farms(supervisor_id, organization_id);

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION can_access_audit(UUID, UUID) IS 'Check if user can access a specific audit based on organization, assignment, and role';
COMMENT ON FUNCTION can_access_farm(UUID, UUID) IS 'Check if user can access a specific farm based on organization, assignment, and role';
COMMENT ON FUNCTION is_audit_finalized(UUID) IS 'Check if audit has been finalized (immutable)';
COMMENT ON FUNCTION is_audit_submitted(UUID) IS 'Check if audit has been submitted (evidence immutable)';
COMMENT ON FUNCTION get_accessible_farm_ids(UUID) IS 'Get all farm IDs accessible to a user based on their role';

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
