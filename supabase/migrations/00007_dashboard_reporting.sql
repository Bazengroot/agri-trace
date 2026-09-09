-- Phase 7: Enterprise Dashboard & Reporting
-- Migration: 00007_dashboard_reporting.sql
--
-- This migration adds optimized views and functions for dashboard analytics and reporting

-- ═══════════════════════════════════════════════════════════════════════
-- DASHBOARD VIEWS
-- ═══════════════════════════════════════════════════════════════════════

-- View: Organization dashboard KPIs
CREATE OR REPLACE VIEW v_dashboard_kpis AS
SELECT 
  o.id as organization_id,
  o.name as organization_name,
  COUNT(DISTINCT f.id) FILTER (WHERE f.status = 'active') as total_farms,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('in_progress', 'scheduled')) as active_audits,
  COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') as completed_audits,
  AVG(a.overall_score) FILTER (WHERE a.status = 'completed' AND a.overall_score IS NOT NULL) as average_audit_score,
  COUNT(DISTINCT fi.id) FILTER (WHERE fi.severity = 'critical') as critical_findings,
  COUNT(DISTINCT fi.id) FILTER (WHERE fi.status IN ('open', 'assigned', 'in_progress')) as open_findings,
  COUNT(DISTINCT ca.id) FILTER (WHERE ca.due_date < NOW() AND ca.status != 'closed') as overdue_corrective_actions
FROM organizations o
LEFT JOIN farms f ON f.organization_id = o.id
LEFT JOIN audits a ON a.organization_id = o.id
LEFT JOIN findings fi ON fi.audit_id = a.id
LEFT JOIN corrective_actions ca ON ca.finding_id = fi.id
GROUP BY o.id, o.name;

-- View: Audit score trend by month
CREATE OR REPLACE VIEW v_audit_score_trend AS
SELECT 
  a.organization_id,
  DATE_TRUNC('month', a.completed_at) as month,
  AVG(a.overall_score) as average_score,
  COUNT(*) as audit_count,
  MIN(a.overall_score) as min_score,
  MAX(a.overall_score) as max_score
FROM audits a
WHERE a.status = 'completed' AND a.overall_score IS NOT NULL
GROUP BY a.organization_id, DATE_TRUNC('month', a.completed_at)
ORDER BY month DESC;

-- View: Farm performance ranking
CREATE OR REPLACE VIEW v_farm_rankings AS
SELECT 
  f.id as farm_id,
  f.farm_name,
  f.farm_code,
  f.organization_id,
  AVG(a.overall_score) FILTER (WHERE a.overall_score IS NOT NULL) as audit_score,
  COUNT(DISTINCT a.id) as total_audits,
  COUNT(DISTINCT fi.id) FILTER (WHERE fi.severity = 'critical') as critical_findings,
  COUNT(DISTINCT fi.id) as total_findings,
  COUNT(DISTINCT fi.id) FILTER (WHERE fi.status = 'closed') as closed_findings,
  CASE 
    WHEN COUNT(DISTINCT fi.id) > 0 
    THEN (COUNT(DISTINCT fi.id) FILTER (WHERE fi.status = 'closed')::numeric / COUNT(DISTINCT fi.id)) * 100
    ELSE NULL 
  END as compliance_rate,
  COUNT(DISTINCT fi.id) FILTER (WHERE fi.due_date < NOW() AND fi.status != 'closed') as overdue_findings,
  RANK() OVER (
    PARTITION BY f.organization_id 
    ORDER BY AVG(a.overall_score) FILTER (WHERE a.overall_score IS NOT NULL) DESC NULLS LAST
  ) as rank
FROM farms f
LEFT JOIN audits a ON a.farm_id = f.id AND a.status = 'completed'
LEFT JOIN findings fi ON fi.audit_id = a.id
WHERE f.status = 'active'
GROUP BY f.id, f.farm_name, f.farm_code, f.organization_id;

-- View: Category performance
CREATE OR REPLACE VIEW v_category_performance AS
SELECT 
  c.id as category_id,
  c.name as category_name,
  c.template_id,
  t.organization_id,
  AVG(ar.score) FILTER (WHERE ar.score IS NOT NULL) as average_score,
  COUNT(DISTINCT a.id) as total_audits,
  COUNT(ar.id) as total_responses,
  COUNT(ar.id) FILTER (WHERE ar.score >= 70) as compliant_responses,
  CASE 
    WHEN COUNT(ar.id) > 0 
    THEN (COUNT(ar.id) FILTER (WHERE ar.score >= 70)::numeric / COUNT(ar.id)) * 100
    ELSE NULL 
  END as compliance_rate
FROM audit_categories c
JOIN audit_templates t ON t.id = c.template_id
JOIN audit_questions q ON q.category_id = c.id
LEFT JOIN audit_responses ar ON ar.question_id = q.id
LEFT JOIN audits a ON a.id = ar.audit_id AND a.status = 'completed'
GROUP BY c.id, c.name, c.template_id, t.organization_id;

-- View: Heatmap data (Farm × Category)
CREATE OR REPLACE VIEW v_heatmap_data AS
SELECT 
  f.id as farm_id,
  f.farm_name,
  f.organization_id,
  c.id as category_id,
  c.name as category_name,
  AVG(ar.score) FILTER (WHERE ar.score IS NOT NULL) as score,
  CASE 
    WHEN AVG(ar.score) FILTER (WHERE ar.score IS NOT NULL) >= 90 THEN 'low'
    WHEN AVG(ar.score) FILTER (WHERE ar.score IS NOT NULL) >= 75 THEN 'medium'
    WHEN AVG(ar.score) FILTER (WHERE ar.score IS NOT NULL) >= 60 THEN 'high'
    ELSE 'critical'
  END as risk_level
FROM farms f
CROSS JOIN audit_categories c
JOIN audit_templates t ON t.id = c.template_id AND t.organization_id = f.organization_id
JOIN audit_questions q ON q.category_id = c.id
LEFT JOIN audit_responses ar ON ar.question_id = q.id
LEFT JOIN audits a ON a.id = ar.audit_id AND a.farm_id = f.id AND a.status = 'completed'
WHERE f.status = 'active'
GROUP BY f.id, f.farm_name, f.organization_id, c.id, c.name;

-- View: Finding trend by month
CREATE OR REPLACE VIEW v_finding_trend AS
SELECT 
  a.organization_id,
  DATE_TRUNC('month', fi.created_at) as month,
  COUNT(*) as finding_count,
  COUNT(*) FILTER (WHERE fi.severity = 'critical') as critical_count,
  COUNT(*) FILTER (WHERE fi.severity = 'major') as major_count,
  COUNT(*) FILTER (WHERE fi.severity = 'minor') as minor_count,
  COUNT(*) FILTER (WHERE fi.severity = 'observation') as observation_count
FROM findings fi
JOIN audits a ON a.id = fi.audit_id
GROUP BY a.organization_id, DATE_TRUNC('month', fi.created_at)
ORDER BY month DESC;

-- View: Corrective action closure trend
CREATE OR REPLACE VIEW v_ca_closure_trend AS
SELECT 
  a.organization_id,
  DATE_TRUNC('month', ca.completed_at) as month,
  COUNT(*) as closure_count,
  AVG(EXTRACT(EPOCH FROM (ca.completed_at - ca.created_at)) / 86400) as avg_completion_days
FROM corrective_actions ca
JOIN findings fi ON fi.id = ca.finding_id
JOIN audits a ON a.id = fi.audit_id
WHERE ca.status = 'closed' AND ca.completed_at IS NOT NULL
GROUP BY a.organization_id, DATE_TRUNC('month', ca.completed_at)
ORDER BY month DESC;

-- ═══════════════════════════════════════════════════════════════════════
-- REPORTING FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Function: Get complete audit report data
CREATE OR REPLACE FUNCTION get_audit_report_data(p_audit_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_report jsonb;
  v_audit record;
  v_farm record;
  v_auditor record;
  v_findings jsonb;
  v_corrective_actions jsonb;
  v_evidence jsonb;
BEGIN
  -- Get audit details
  SELECT * INTO v_audit FROM audits WHERE id = p_audit_id;
  
  IF v_audit IS NULL THEN
    RAISE EXCEPTION 'Audit not found';
  END IF;
  
  -- Get farm details
  SELECT * INTO v_farm FROM farms WHERE id = v_audit.farm_id;
  
  -- Get auditor details
  IF v_audit.auditor_id IS NOT NULL THEN
    SELECT * INTO v_auditor FROM profiles WHERE id = v_audit.auditor_id;
  END IF;
  
  -- Get findings
  SELECT jsonb_agg(jsonb_build_object(
    'id', f.id,
    'finding_number', f.finding_number,
    'category', f.category,
    'title', f.title,
    'description', f.description,
    'severity', f.severity,
    'risk_level', f.risk_level,
    'status', f.status,
    'root_cause', f.root_cause,
    'recommendation', f.recommendation
  )) INTO v_findings
  FROM findings f
  WHERE f.audit_id = p_audit_id
  ORDER BY 
    CASE f.severity 
      WHEN 'critical' THEN 1 
      WHEN 'major' THEN 2 
      WHEN 'minor' THEN 3 
      ELSE 4 
    END;
  
  -- Get corrective actions
  SELECT jsonb_agg(jsonb_build_object(
    'id', ca.id,
    'finding_id', ca.finding_id,
    'action', ca.action,
    'responsible_person', ca.responsible_person,
    'due_date', ca.due_date,
    'status', ca.status,
    'verification_status', ca.verification_status
  )) INTO v_corrective_actions
  FROM corrective_actions ca
  WHERE ca.finding_id IN (SELECT id FROM findings WHERE audit_id = p_audit_id);
  
  -- Get evidence summary
  SELECT jsonb_build_object(
    'total_count', COUNT(*),
    'by_type', jsonb_object_agg(file_type, count)
  ) INTO v_evidence
  FROM (
    SELECT file_type, COUNT(*) as count
    FROM evidence
    WHERE audit_id = p_audit_id
    GROUP BY file_type
  ) sub;
  
  -- Build report JSON
  v_report := jsonb_build_object(
    'audit', row_to_json(v_audit),
    'farm', row_to_json(v_farm),
    'auditor', CASE WHEN v_auditor IS NOT NULL THEN row_to_json(v_auditor) ELSE NULL END,
    'findings', COALESCE(v_findings, '[]'::jsonb),
    'corrective_actions', COALESCE(v_corrective_actions, '[]'::jsonb),
    'evidence', v_evidence
  );
  
  RETURN v_report;
END;
$$;

-- Function: Get organization dashboard summary
CREATE OR REPLACE FUNCTION get_organization_dashboard_summary(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_summary jsonb;
BEGIN
  SELECT jsonb_build_object(
    'kpis', (SELECT row_to_json(kpis.*) FROM v_dashboard_kpis kpis WHERE organization_id = p_organization_id),
    'score_trend', (SELECT jsonb_agg(row_to_json(t.*)) FROM v_audit_score_trend t WHERE organization_id = p_organization_id ORDER BY month DESC LIMIT 12),
    'farm_rankings', (SELECT jsonb_agg(row_to_json(r.*)) FROM v_farm_rankings r WHERE organization_id = p_organization_id ORDER BY rank LIMIT 10),
    'category_performance', (SELECT jsonb_agg(row_to_json(c.*)) FROM v_category_performance c WHERE organization_id = p_organization_id ORDER BY average_score ASC NULLS LAST),
    'finding_trend', (SELECT jsonb_agg(row_to_json(t.*)) FROM v_finding_trend t WHERE organization_id = p_organization_id ORDER BY month DESC LIMIT 12),
    'ca_closure_trend', (SELECT jsonb_agg(row_to_json(t.*)) FROM v_ca_closure_trend t WHERE organization_id = p_organization_id ORDER BY month DESC LIMIT 12)
  ) INTO v_summary;
  
  RETURN v_summary;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_audit_report_data(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_organization_dashboard_summary(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- PERFORMANCE INDEXES
-- ═══════════════════════════════════════════════════════════════════════

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_audits_org_completed ON audits(organization_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audits_farm_completed ON audits(farm_id, status, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_findings_audit_severity ON findings(audit_id, severity);
CREATE INDEX IF NOT EXISTS idx_findings_status_due ON findings(status, due_date);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_finding ON corrective_actions(finding_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_status_due ON corrective_actions(status, due_date);
CREATE INDEX IF NOT EXISTS idx_audit_responses_question ON audit_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_audit_responses_audit ON audit_responses(audit_id);

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON VIEW v_dashboard_kpis IS 'Organization-level KPIs for dashboard';
COMMENT ON VIEW v_audit_score_trend IS 'Monthly audit score trends by organization';
COMMENT ON VIEW v_farm_rankings IS 'Farm performance rankings with scores and compliance rates';
COMMENT ON VIEW v_category_performance IS 'Category-level performance metrics';
COMMENT ON VIEW v_heatmap_data IS 'Farm × Category heatmap data for visualization';
COMMENT ON VIEW v_finding_trend IS 'Monthly finding trends by severity';
COMMENT ON VIEW v_ca_closure_trend IS 'Monthly corrective action closure trends';

COMMENT ON FUNCTION get_audit_report_data(uuid) IS 'Generate complete audit report data as JSON';
COMMENT ON FUNCTION get_organization_dashboard_summary(uuid) IS 'Generate organization dashboard summary as JSON';

-- ═══════════════════════════════════════════════════════════════════════
-- END OF MIGRATION
-- ═══════════════════════════════════════════════════════════════════════
